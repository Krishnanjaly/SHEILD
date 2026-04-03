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

const DEFAULT_THRESHOLD = 60;
const MAX_ACCELERATION = 40;
const MAX_ROTATION = 18;
const SHAKE_REFERENCE_DURATION_MS = 4000;
const SPIKE_ACCELERATION_THRESHOLD = 21;

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
};
