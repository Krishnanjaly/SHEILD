import { findMatchedKeyword, normalizeSpeechText } from "./keywordMatcher";
import {
  MotionAnalysisService,
  MotionSample,
  MotionTriggerType,
} from "./MotionAnalysisService";

export type RiskLevel = "LOW" | "HIGH";
export type AnalysisTriggerSource = "MOTION" | "VOLUME" | "KEYWORD";

export interface RiskEngineInput {
  samples: MotionSample[];
  triggerType?: MotionTriggerType;
  triggerSource: AnalysisTriggerSource;
  emotions?: Array<{ label: string; score: number }>;
  emotionScore?: number | null;
  transcriptCandidates?: string[];
  lowRiskKeywords?: string[];
  highRiskKeywords?: string[];
}

export interface RiskEngineResult {
  motionScore: number;
  emotionScore: number | null;
  keywordScore: number;
  finalScore: number;
  riskLevel: RiskLevel;
  triggers: string[];
  explanations: string[];
  eventType: string;
  matchedKeyword: string | null;
  matchedKeywordType: "LOW" | "HIGH" | null;
  usedAudioFallback: boolean;
  motionMetrics: ReturnType<typeof MotionAnalysisService.analyze>["metrics"];
}

const DEFAULT_THRESHOLD = 60;
const DEBOUNCE_WINDOW_MS = 12000;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

class RiskEngineService {
  private lastRunBySource = new Map<string, number>();

  shouldRun(source: AnalysisTriggerSource, debounceMs: number = DEBOUNCE_WINDOW_MS) {
    const now = Date.now();
    const previousRunAt = this.lastRunBySource.get(source) ?? 0;
    if (now - previousRunAt < debounceMs) {
      return false;
    }

    this.lastRunBySource.set(source, now);
    return true;
  }

  resetDebounce(source?: AnalysisTriggerSource) {
    if (source) {
      this.lastRunBySource.delete(source);
      return;
    }

    this.lastRunBySource.clear();
  }

  private resolveKeywordScore(input: RiskEngineInput) {
    const transcriptCandidates = (input.transcriptCandidates ?? [])
      .map(normalizeSpeechText)
      .filter(Boolean);
    const matchedHighKeyword = findMatchedKeyword(
      transcriptCandidates,
      input.highRiskKeywords ?? []
    );

    if (matchedHighKeyword) {
      return {
        keywordScore: 40,
        matchedKeyword: matchedHighKeyword,
        matchedKeywordType: "HIGH" as const,
        trigger: `High-risk keyword detected: ${matchedHighKeyword}`,
      };
    }

    const matchedLowKeyword = findMatchedKeyword(
      transcriptCandidates,
      input.lowRiskKeywords ?? []
    );

    if (matchedLowKeyword) {
      return {
        keywordScore: 20,
        matchedKeyword: matchedLowKeyword,
        matchedKeywordType: "LOW" as const,
        trigger: `Low-risk keyword detected: ${matchedLowKeyword}`,
      };
    }

    return {
      keywordScore: 0,
      matchedKeyword: null,
      matchedKeywordType: null,
      trigger: null,
    };
  }

  analyze(input: RiskEngineInput, threshold: number = DEFAULT_THRESHOLD): RiskEngineResult {
    const motion = MotionAnalysisService.analyze(
      input.samples,
      input.triggerType ?? "JERK"
    );
    const keyword = this.resolveKeywordScore(input);

    let emotionScore = input.emotionScore ?? null;
    if (emotionScore === null && (input.emotions?.length ?? 0) > 0) {
      const dominantEmotion = [...(input.emotions ?? [])].sort(
        (left, right) => right.score - left.score
      )[0];
      emotionScore = clamp(Math.round(dominantEmotion.score * 100), 0, 100);
    }

    const usedAudioFallback = emotionScore === null;
    const weightedMotion = 0.4 * motion.motionScore;
    const weightedEmotion =
      usedAudioFallback || emotionScore === null ? 0 : 0.4 * emotionScore;
    const weightedKeyword = 0.2 * keyword.keywordScore;

    const finalScore = usedAudioFallback
      ? clamp(
          Math.round((weightedMotion + weightedKeyword) / 0.6),
          0,
          100
        )
      : clamp(
          Math.round(weightedMotion + weightedEmotion + weightedKeyword),
          0,
          100
        );

    const riskLevel: RiskLevel = finalScore >= threshold ? "HIGH" : "LOW";
    const triggers = [...motion.triggers];
    const explanations: string[] = [];

    if (keyword.trigger) {
      triggers.push(keyword.trigger);
      explanations.push(
        keyword.matchedKeywordType === "HIGH"
          ? `High-risk keyword detected: ${keyword.matchedKeyword}`
          : `Low-risk keyword detected: ${keyword.matchedKeyword}`
      );
    }

    if (!usedAudioFallback && input.emotions && input.emotions.length > 0) {
      triggers.push(`Detected emotion: ${input.emotions[0].label}`);
    }

    if (motion.metrics.suddenFallDetected) {
      explanations.push("Sudden fall detected");
    }
    if (motion.metrics.abnormalShakingDetected) {
      explanations.push("High shaking intensity");
    }
    if (!motion.metrics.suddenFallDetected && !motion.metrics.abnormalShakingDetected) {
      explanations.push("Mild movement detected");
    }
    if (motion.metrics.inactivityDetected && motion.metrics.suddenFallDetected) {
      explanations.push("Impact followed by inactivity");
    }

    if (usedAudioFallback) {
      explanations.push("Audio analysis unavailable, motion-only fallback used");
    } else if ((input.emotions?.length ?? 0) > 0) {
      const dominantEmotion = input.emotions![0].label.toLowerCase();
      if (dominantEmotion.includes("fear") || dominantEmotion.includes("angry")) {
        explanations.push("Fear/angry voice detected");
      } else {
        explanations.push("No distress voice detected");
      }
    } else {
      explanations.push("No distress voice detected");
    }

    const eventType =
      motion.metrics.suddenFallDetected
        ? "Sudden Fall"
        : motion.metrics.abnormalShakingDetected
          ? "Abnormal Shaking"
          : keyword.matchedKeyword
            ? "Keyword Trigger"
            : "Abnormal Activity";

    return {
      motionScore: motion.motionScore,
      emotionScore,
      keywordScore: keyword.keywordScore,
      finalScore,
      riskLevel,
      triggers: Array.from(new Set(triggers)),
      explanations: Array.from(new Set(explanations)),
      eventType,
      matchedKeyword: keyword.matchedKeyword,
      matchedKeywordType: keyword.matchedKeywordType,
      usedAudioFallback,
      motionMetrics: motion.metrics,
    };
  }
}

export const RiskEngine = new RiskEngineService();
