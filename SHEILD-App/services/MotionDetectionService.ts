import { Accelerometer, Gyroscope } from "expo-sensors";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { MotionSample } from "./RiskAnalysisService";

export interface MotionDetectionEvent {
  triggerType: "FALL" | "SHAKE" | "JERK";
  samples: MotionSample[];
  timestamp: number;
  description: string;
}

type MotionListener = (event: MotionDetectionEvent) => void;

const SAMPLE_WINDOW = 24;
const DEBOUNCE_MS = 30000;
const ACCELERATION_FALL_THRESHOLD = 23;
const ACCELERATION_JERK_THRESHOLD = 15;
const ROTATION_SHAKE_THRESHOLD = 8.5;
const SHAKE_MIN_COUNT = 5;
const SHAKE_DETECTION_ENABLED_KEY = "SHAKE_DETECTION_ENABLED";

class MotionDetectionServiceImpl {
  private accelerometerData: { x: number; y: number; z: number } | null = null;
  private gyroscopeData: { x: number; y: number; z: number } | null = null;
  private accelerometerSubscription: { remove: () => void } | null = null;
  private gyroscopeSubscription: { remove: () => void } | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private listeners = new Set<MotionListener>();
  private samples: MotionSample[] = [];
  private isRunning = false;
  private lastTriggerAt = 0;
  private shakeDetectionEnabled = true;

  private buildMagnitude(vector: { x: number; y: number; z: number } | null) {
    if (!vector) return 0;
    return Math.sqrt(
      vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
    );
  }

  private pushSample() {
    const timestamp = Date.now();
    const sample: MotionSample = {
      timestamp,
      accelerationMagnitude: this.buildMagnitude(this.accelerometerData),
      rotationMagnitude: this.buildMagnitude(this.gyroscopeData),
    };

    this.samples = [...this.samples.slice(-(SAMPLE_WINDOW - 1)), sample];
    this.detectAbnormalMotion();
  }

  private emit(event: MotionDetectionEvent) {
    this.lastTriggerAt = event.timestamp;
    this.listeners.forEach((listener) => listener(event));
  }

  private detectAbnormalMotion() {
    if (this.samples.length < 6) {
      return;
    }

    const now = Date.now();
    if (now - this.lastTriggerAt < DEBOUNCE_MS) {
      return;
    }

    const recentSamples = this.samples.slice(-12);
    const peakAcceleration = recentSamples.reduce(
      (max, sample) => Math.max(max, sample.accelerationMagnitude),
      0
    );
    const shakeCount = recentSamples.filter(
      (sample) => sample.rotationMagnitude >= ROTATION_SHAKE_THRESHOLD
    ).length;
    const jerkCount = recentSamples.filter(
      (sample) => sample.accelerationMagnitude >= ACCELERATION_JERK_THRESHOLD
    ).length;

    if (peakAcceleration >= ACCELERATION_FALL_THRESHOLD) {
      this.emit({
        triggerType: "FALL",
        samples: recentSamples,
        timestamp: now,
        description: "Sudden phone fall detected",
      });
      return;
    }

    if (this.shakeDetectionEnabled && shakeCount >= SHAKE_MIN_COUNT) {
      this.emit({
        triggerType: "SHAKE",
        samples: recentSamples,
        timestamp: now,
        description: "Continuous abnormal shaking detected",
      });
      return;
    }

    if (jerkCount >= 3) {
      this.emit({
        triggerType: "JERK",
        samples: recentSamples,
        timestamp: now,
        description: "Repeated sudden jerks detected",
      });
    }
  }

  private async shouldMonitor() {
    const [isLoggedIn, sensorsEnabled] = await Promise.all([
      AsyncStorage.getItem("isLoggedIn"),
      AsyncStorage.getItem("SENSORS_ENABLED"),
    ]);

    return isLoggedIn === "true" && sensorsEnabled !== "false";
  }

  private async refreshSettings() {
    const shakeEnabled = await AsyncStorage.getItem(SHAKE_DETECTION_ENABLED_KEY);
    this.shakeDetectionEnabled = shakeEnabled !== "false";
  }

  private handleAppStateChange = async (nextState: AppStateStatus) => {
    if (nextState !== "active") {
      this.stop();
      return;
    }

    if (await this.shouldMonitor()) {
      this.start().catch(console.error);
    }
  };

  async start() {
    if (this.isRunning || !(await this.shouldMonitor())) {
      return;
    }

    await this.refreshSettings();
    this.isRunning = true;
    Accelerometer.setUpdateInterval(250);
    Gyroscope.setUpdateInterval(200);

    this.accelerometerSubscription = Accelerometer.addListener((data) => {
      this.accelerometerData = data;
      this.pushSample();
    });

    this.gyroscopeSubscription = Gyroscope.addListener((data) => {
      this.gyroscopeData = data;
    });

    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener(
        "change",
        this.handleAppStateChange
      );
    }
  }

  stop() {
    this.isRunning = false;
    this.accelerometerSubscription?.remove();
    this.gyroscopeSubscription?.remove();
    this.accelerometerSubscription = null;
    this.gyroscopeSubscription = null;
  }

  subscribe(listener: MotionListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getRecentSamples(limit: number = 24) {
    return this.samples.slice(-limit);
  }

  isActive() {
    return this.isRunning;
  }
}

export const MotionDetectionService = new MotionDetectionServiceImpl();
