import { AudioAnalysisService } from "./AudioAnalysisService";
import {
  MotionAnalysisService,
  MotionTriggerType,
} from "./MotionAnalysisService";
import { RiskEngine } from "./RiskEngine";

export interface MotionSample {
  timestamp: number;
  accelerationMagnitude: number;
  rotationMagnitude: number;
}

export interface MotionAnalysisInput {
  samples: MotionSample[];
  triggerType: MotionTriggerType;
}

export interface RiskAnalysisResult {
  score: number;
  threshold: number;
  riskLevel: "LOW" | "HIGH";
  triggers: string[];
  summary: string;
  metrics: {
    peakAcceleration: number;
    peakRotation: number;
    shakingDurationMs: number;
    suddenSpikeCount: number;
    averageAcceleration: number;
  };
}

export interface EmotionAnalysisInput {
  label: string;
  score: number;
}

export interface CombinedRiskAnalysisInput {
  samples: MotionSample[];
  triggerType: MotionTriggerType;
  emotions?: EmotionAnalysisInput[];
  transcriptCandidates?: string[];
  lowRiskKeywords?: string[];
  highRiskKeywords?: string[];
}

export interface CombinedRiskAnalysisResult extends RiskAnalysisResult {
  motionScore: number;
  emotionScore: number;
  finalScore: number;
  dominantEmotion: string;
  usedMotionFallback: boolean;
  explanations: string[];
  eventType: string;
  matchedKeyword: string | null;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const RiskAnalysisService = {
  getThreshold(configuredThreshold?: number) {
    return clamp(configuredThreshold ?? 60, 1, 100);
  },

  analyzeMotion(
    input: MotionAnalysisInput,
    configuredThreshold?: number
  ): RiskAnalysisResult {
    const threshold = this.getThreshold(configuredThreshold);
    const motionResult = MotionAnalysisService.analyze(
      input.samples,
      input.triggerType
    );
    const score = motionResult.motionScore;
    const riskLevel: "LOW" | "HIGH" = score >= threshold ? "HIGH" : "LOW";
    const samples = input.samples.slice(-24);
    const shakingDurationMs =
      samples.length > 1
        ? samples[samples.length - 1].timestamp - samples[0].timestamp
        : 0;

    return {
      score,
      threshold,
      riskLevel,
      triggers: motionResult.triggers,
      summary:
        riskLevel === "HIGH"
          ? "HIGH RISK DETECTED"
          : "LOW RISK DETECTED",
      metrics: {
        peakAcceleration: motionResult.metrics.peakAcceleration,
        peakRotation: motionResult.metrics.peakRotation,
        shakingDurationMs,
        suddenSpikeCount: motionResult.metrics.repeatedSpikeCount,
        averageAcceleration: motionResult.metrics.averageAcceleration,
      },
    };
  },

  mapEmotionToRisk(label: string, confidence: number) {
    return AudioAnalysisService.mapEmotionToScore(label, confidence);
  },

  analyzeCombined(
    input: CombinedRiskAnalysisInput,
    configuredThreshold?: number
  ): CombinedRiskAnalysisResult {
    const threshold = this.getThreshold(configuredThreshold);
    const emotions = (input.emotions ?? []).slice().sort((a, b) => b.score - a.score);
    const dominantEmotion = emotions[0]?.label?.trim().toLowerCase() || "neutral";
    const emotionConfidence = emotions[0]?.score ?? 0;
    const motionAnalysis = this.analyzeMotion(input, configuredThreshold);
    const riskResult = RiskEngine.analyze(
      {
        samples: input.samples,
        triggerType: input.triggerType,
        triggerSource: "MOTION",
        emotions,
        emotionScore:
          emotions.length > 0
            ? this.mapEmotionToRisk(dominantEmotion, emotionConfidence)
            : null,
        transcriptCandidates: input.transcriptCandidates,
        lowRiskKeywords: input.lowRiskKeywords,
        highRiskKeywords: input.highRiskKeywords,
      },
      threshold
    );
    const usedMotionFallback = riskResult.usedAudioFallback;
    const motionScore = riskResult.motionScore;
    const emotionScore = riskResult.emotionScore ?? motionScore;
    const finalScore = riskResult.finalScore;
    const riskLevel: "LOW" | "HIGH" = riskResult.riskLevel;
    const triggers = riskResult.usedAudioFallback
      ? Array.from(new Set([...riskResult.triggers, "Audio emotion unavailable"]))
      : riskResult.triggers;

    return {
      ...motionAnalysis,
      score: finalScore,
      riskLevel,
      summary: riskLevel === "HIGH" ? "HIGH RISK DETECTED" : "LOW RISK DETECTED",
      triggers,
      motionScore,
      emotionScore,
      finalScore,
      dominantEmotion,
      usedMotionFallback,
      explanations: riskResult.explanations,
      eventType: riskResult.eventType,
      matchedKeyword: riskResult.matchedKeyword,
    };
  },

  getVoiceAlertMessage(
    riskLevel: "LOW" | "HIGH",
    reason?: string | null
  ) {
    const normalizedReason = reason?.trim();

    if (riskLevel === "HIGH") {
      return normalizedReason
        ? `High risk detected. ${normalizedReason}. Starting emergency recording`
        : "High risk detected. Starting emergency recording";
    }

    return normalizedReason
      ? `Low risk detected. ${normalizedReason}`
      : "Low risk detected";
  },
};
