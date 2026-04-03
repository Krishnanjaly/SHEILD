export interface MotionSample {
  timestamp: number;
  accelerationMagnitude: number;
  rotationMagnitude: number;
}

export interface MotionAnalysisInput {
  samples: MotionSample[];
  triggerType: "FALL" | "SHAKE" | "JERK";
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
  triggerType: "FALL" | "SHAKE" | "JERK";
  emotions?: EmotionAnalysisInput[];
}

export interface CombinedRiskAnalysisResult extends RiskAnalysisResult {
  motionScore: number;
  emotionScore: number;
  finalScore: number;
  dominantEmotion: string;
  usedMotionFallback: boolean;
}

const DEFAULT_THRESHOLD = 60;
const MAX_ACCELERATION = 40;
const MAX_ROTATION = 18;
const SHAKE_REFERENCE_DURATION_MS = 4000;
const SPIKE_ACCELERATION_THRESHOLD = 21;
const DEFAULT_EMOTION_WEIGHT = 45;

const EMOTION_WEIGHTS: Record<string, number> = {
  angry: 95,
  anger: 95,
  fear: 100,
  fearful: 100,
  frustrated: 82,
  frustration: 82,
  sad: 68,
  sadness: 68,
  disgust: 78,
  surprise: 62,
  excited: 55,
  happy: 42,
  happiness: 42,
  calm: 24,
  neutral: 18,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalize = (value: number, max: number) =>
  clamp((value / max) * 100, 0, 100);

export const RiskAnalysisService = {
  getThreshold(configuredThreshold?: number) {
    return clamp(configuredThreshold ?? DEFAULT_THRESHOLD, 1, 100);
  },

  analyzeMotion(
    input: MotionAnalysisInput,
    configuredThreshold?: number
  ): RiskAnalysisResult {
    const threshold = this.getThreshold(configuredThreshold);
    const samples = input.samples.slice(-24);

    const peakAcceleration = samples.reduce(
      (max, sample) => Math.max(max, sample.accelerationMagnitude),
      0
    );
    const peakRotation = samples.reduce(
      (max, sample) => Math.max(max, sample.rotationMagnitude),
      0
    );
    const suddenSpikeCount = samples.filter(
      (sample) => sample.accelerationMagnitude >= SPIKE_ACCELERATION_THRESHOLD
    ).length;
    const averageAcceleration =
      samples.reduce((sum, sample) => sum + sample.accelerationMagnitude, 0) /
      Math.max(samples.length, 1);

    const shakingDurationMs =
      samples.length > 1
        ? samples[samples.length - 1].timestamp - samples[0].timestamp
        : 0;

    const accelerationScore = normalize(peakAcceleration, MAX_ACCELERATION);
    const rotationScore = normalize(peakRotation, MAX_ROTATION);
    const durationScore = normalize(
      shakingDurationMs,
      SHAKE_REFERENCE_DURATION_MS
    );
    const spikeScore = normalize(suddenSpikeCount, 4);

    let score =
      accelerationScore * 0.35 +
      rotationScore * 0.25 +
      durationScore * 0.2 +
      spikeScore * 0.2;

    if (input.triggerType === "FALL") {
      score += 10;
    } else if (input.triggerType === "SHAKE") {
      score += 6;
    } else if (input.triggerType === "JERK") {
      score += 4;
    }

    score = clamp(Math.round(score), 0, 100);

    const triggers: string[] = [];
    if (peakAcceleration >= 24) triggers.push("Sudden phone fall");
    if (peakAcceleration >= 16 && peakAcceleration < 24) triggers.push("Strong acceleration spike");
    if (peakRotation >= 10) triggers.push("Continuous abnormal shaking");
    if (shakingDurationMs >= 1800) triggers.push("Extended unstable movement");
    if (suddenSpikeCount >= 2) triggers.push("Multiple sudden jerks");

    if (triggers.length === 0) {
      triggers.push(
        input.triggerType === "FALL"
          ? "Possible fall pattern"
          : input.triggerType === "SHAKE"
            ? "Possible shake pattern"
            : "Possible abrupt motion pattern"
      );
    }

    const riskLevel: "LOW" | "HIGH" = score >= threshold ? "HIGH" : "LOW";

    return {
      score,
      threshold,
      riskLevel,
      triggers,
      summary:
        riskLevel === "HIGH"
          ? "HIGH RISK DETECTED"
          : "LOW RISK DETECTED",
      metrics: {
        peakAcceleration,
        peakRotation,
        shakingDurationMs,
        suddenSpikeCount,
        averageAcceleration,
      },
    };
  },

  mapEmotionToRisk(label: string, confidence: number) {
    const normalizedLabel = label.trim().toLowerCase();
    const baseWeight = EMOTION_WEIGHTS[normalizedLabel] ?? DEFAULT_EMOTION_WEIGHT;
    return clamp(Math.round(baseWeight * clamp(confidence, 0, 1)), 0, 100);
  },

  analyzeCombined(
    input: CombinedRiskAnalysisInput,
    configuredThreshold?: number
  ): CombinedRiskAnalysisResult {
    const motionAnalysis = this.analyzeMotion(input, configuredThreshold);
    const threshold = this.getThreshold(configuredThreshold);
    const emotions = (input.emotions ?? []).slice().sort((a, b) => b.score - a.score);
    const dominantEmotion = emotions[0]?.label?.trim().toLowerCase() || "neutral";
    const emotionConfidence = emotions[0]?.score ?? 0;
    const usedMotionFallback = emotions.length === 0;
    const motionScore = motionAnalysis.score;
    const emotionScore = usedMotionFallback
      ? motionScore
      : this.mapEmotionToRisk(dominantEmotion, emotionConfidence);

    const finalScore = usedMotionFallback
      ? motionScore
      : clamp(
          Math.round(motionScore * 0.55 + emotionScore * 0.45),
          0,
          100
        );

    const riskLevel: "LOW" | "HIGH" = finalScore >= threshold ? "HIGH" : "LOW";
    const emotionTrigger = usedMotionFallback
      ? "Audio emotion unavailable"
      : `Detected emotion: ${dominantEmotion}`;
    const triggers = Array.from(new Set([...motionAnalysis.triggers, emotionTrigger]));

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
    };
  },
};
