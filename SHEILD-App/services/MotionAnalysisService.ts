export type MotionTriggerType = "FALL" | "SHAKE" | "JERK";

export interface MotionSample {
  timestamp: number;
  accelerationMagnitude: number;
  rotationMagnitude: number;
}

export interface MotionAnalysisMetrics {
  peakAcceleration: number;
  averageAcceleration: number;
  peakRotation: number;
  averageRotation: number;
  movementIntensity: number;
  motionVariance: number;
  changeFrequency: number;
  shakeFrequency: number;
  durationMs: number;
  repeatedSpikeCount: number;
  suddenFallDetected: boolean;
  abnormalShakingDetected: boolean;
  strongMovementDetected: boolean;
  inactivityDetected: boolean;
}

export interface MotionAnalysisResult {
  motionScore: number;
  triggers: string[];
  metrics: MotionAnalysisMetrics;
}

const GRAVITY_BASELINE = 1;
const MAX_INTENSITY_EXCESS = 3.2;
const MAX_ROTATION_REFERENCE = 8;
const MAX_CHANGE_FREQUENCY = 0.75;
const ACCELERATION_SPIKE_THRESHOLD = 2.35;
const FALL_FREEFALL_THRESHOLD = 0.45;
const ROTATION_SHAKE_THRESHOLD = 3.2;
const CHANGE_DELTA_THRESHOLD = 0.65;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalize = (value: number, max: number) =>
  clamp((value / Math.max(max, 0.0001)) * 100, 0, 100);

const average = (values: number[]) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const variance = (values: number[]) => {
  if (values.length === 0) return 0;
  const mean = average(values);
  return (
    values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) /
    values.length
  );
};

export const MotionAnalysisService = {
  analyze(
    samples: MotionSample[],
    triggerType: MotionTriggerType = "JERK"
  ): MotionAnalysisResult {
    const recentSamples = samples.slice(-24);
    if (recentSamples.length === 0) {
      return {
        motionScore: 0,
        triggers: ["Insufficient motion data"],
        metrics: {
          peakAcceleration: 0,
          averageAcceleration: 0,
          peakRotation: 0,
          averageRotation: 0,
          movementIntensity: 0,
          motionVariance: 0,
          changeFrequency: 0,
          shakeFrequency: 0,
          durationMs: 0,
          repeatedSpikeCount: 0,
          suddenFallDetected: false,
          abnormalShakingDetected: false,
          strongMovementDetected: false,
          inactivityDetected: false,
        },
      };
    }

    const accelerations = recentSamples.map(
      (sample) => sample.accelerationMagnitude
    );
    const rotations = recentSamples.map((sample) => sample.rotationMagnitude);
    const accelerationExcess = accelerations.map((value) =>
      Math.max(0, value - GRAVITY_BASELINE)
    );

    let repeatedSpikeCount = 0;
    let majorChanges = 0;
    let freeFallMoments = 0;

    for (let index = 0; index < recentSamples.length; index += 1) {
      const currentAcceleration = accelerations[index];
      if (currentAcceleration >= ACCELERATION_SPIKE_THRESHOLD) {
        repeatedSpikeCount += 1;
      }

      if (currentAcceleration <= FALL_FREEFALL_THRESHOLD) {
        freeFallMoments += 1;
      }

      if (index === 0) {
        continue;
      }

      const previousAcceleration = accelerations[index - 1];
      const previousRotation = rotations[index - 1];
      const accelerationDelta = Math.abs(
        currentAcceleration - previousAcceleration
      );
      const rotationDelta = Math.abs(rotations[index] - previousRotation);

      if (
        accelerationDelta >= CHANGE_DELTA_THRESHOLD ||
        rotationDelta >= CHANGE_DELTA_THRESHOLD
      ) {
        majorChanges += 1;
      }
    }

    const peakAcceleration = Math.max(...accelerations);
    const averageAcceleration = average(accelerations);
    const peakRotation = Math.max(...rotations);
    const averageRotation = average(rotations);
    const movementIntensity = average(accelerationExcess);
    const motionVariance = variance(accelerations);
    const changeFrequency =
      recentSamples.length > 1 ? majorChanges / (recentSamples.length - 1) : 0;
    const durationMs =
      recentSamples.length > 1
        ? recentSamples[recentSamples.length - 1].timestamp -
          recentSamples[0].timestamp
        : 0;
    const shakeFrequency =
      durationMs > 0 ? (repeatedSpikeCount / durationMs) * 1000 : 0;
    const trailingSamples = recentSamples.slice(-4);
    const inactivityDetected =
      trailingSamples.length >= 3 &&
      trailingSamples.every(
        (sample) => sample.accelerationMagnitude <= 1.15 && sample.rotationMagnitude <= 1.1
      );

    const suddenFallDetected =
      triggerType === "FALL" ||
      (freeFallMoments >= 1 &&
        peakAcceleration >= 2.6 &&
        repeatedSpikeCount >= 1 &&
        inactivityDetected);

    const abnormalShakingDetected =
      triggerType === "SHAKE" ||
      rotations.filter((value) => value >= ROTATION_SHAKE_THRESHOLD).length >= 4 ||
      (changeFrequency >= 0.38 && repeatedSpikeCount >= 2);

    const strongMovementDetected =
      peakAcceleration >= 2 ||
      movementIntensity >= 1.15 ||
      triggerType === "JERK";

    const intensityScore = normalize(
      Math.max(peakAcceleration - GRAVITY_BASELINE, movementIntensity),
      MAX_INTENSITY_EXCESS
    );
    const rotationScore = normalize(
      Math.max(peakRotation, averageRotation * 1.35),
      MAX_ROTATION_REFERENCE
    );
    const frequencyScore = normalize(changeFrequency, MAX_CHANGE_FREQUENCY);
    const repeatedSpikeScore = normalize(repeatedSpikeCount, 5);

    let motionScore =
      intensityScore * 0.4 +
      rotationScore * 0.2 +
      frequencyScore * 0.2 +
      repeatedSpikeScore * 0.2;

    if (suddenFallDetected) {
      motionScore += 18;
    }
    if (abnormalShakingDetected) {
      motionScore += 14;
    }
    if (strongMovementDetected) {
      motionScore += 8;
    }

    motionScore = clamp(Math.round(motionScore), 0, 100);

    const triggers: string[] = [];
    if (suddenFallDetected) {
      triggers.push("Sudden fall detected");
    }
    if (abnormalShakingDetected) {
      triggers.push("Abnormal shaking detected");
    }
    if (strongMovementDetected) {
      triggers.push("Strong movement intensity detected");
    }
    if (repeatedSpikeCount >= 2) {
      triggers.push("Repeated acceleration spikes detected");
    }
    if (inactivityDetected && suddenFallDetected) {
      triggers.push("Impact followed by inactivity detected");
    }
    if (triggers.length === 0) {
      triggers.push("Abnormal motion detected");
    }

    return {
      motionScore,
      triggers,
      metrics: {
        peakAcceleration,
        averageAcceleration,
        peakRotation,
        averageRotation,
        movementIntensity,
        motionVariance,
        changeFrequency,
        shakeFrequency,
        durationMs,
        repeatedSpikeCount,
        suddenFallDetected,
        abnormalShakingDetected,
        strongMovementDetected,
        inactivityDetected,
      },
    };
  },
};
