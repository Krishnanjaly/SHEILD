import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { aiRiskEngine, RiskAnalysis } from "../utils/AiRiskEngine";
import { GuardianServiceManager } from "./GuardianServiceManager";

const GUARDIAN_STATE_KEY = "GUARDIAN_LAST_ANALYSIS";
const GUARDIAN_MONITORING_KEY = "GUARDIAN_MONITORING_STATUS";
const GUARDIAN_ENABLED_KEY = "GUARDIAN_ENABLED";
const SENSORS_ENABLED_KEY = "SENSORS_ENABLED";
const LOCATION_ENABLED_KEY = "LOCATION_ENABLED";
const MIC_ENABLED_KEY = "MIC_ENABLED";

export type GuardianMonitoringStatus = "OFF" | "PASSIVE" | "ACTIVE" | "EMERGENCY";

export interface GuardianSnapshot {
  analysis: RiskAnalysis;
  monitoringStatus: GuardianMonitoringStatus;
  updatedAt: number;
}

const DEFAULT_ANALYSIS: RiskAnalysis = {
  riskLevel: "NONE",
  confidence: 0,
  triggers: [],
  sensorData: {
    accelerometer: null,
    gyroscope: null,
    light: 100,
    microphoneLevel: 0,
    timestamp: Date.now(),
  },
};

const DEFAULT_SNAPSHOT: GuardianSnapshot = {
  analysis: DEFAULT_ANALYSIS,
  monitoringStatus: "OFF",
  updatedAt: Date.now(),
};

const normalizeStatusFromAnalysis = (
  analysis: RiskAnalysis,
  fallback: GuardianMonitoringStatus = "PASSIVE"
): GuardianMonitoringStatus => {
  if (analysis.riskLevel === "HIGH") return "EMERGENCY";
  if (analysis.riskLevel === "LOW") return "ACTIVE";
  return fallback;
};

export const GuardianStateService = {
  async getSnapshot(): Promise<GuardianSnapshot> {
    try {
      const rawSnapshot = await AsyncStorage.getItem(GUARDIAN_STATE_KEY);
      const rawStatus = await AsyncStorage.getItem(GUARDIAN_MONITORING_KEY);
      const monitoringStatus = (rawStatus as GuardianMonitoringStatus) || "OFF";

      if (!rawSnapshot) {
        return { ...DEFAULT_SNAPSHOT, monitoringStatus };
      }

      const parsed = JSON.parse(rawSnapshot) as GuardianSnapshot;
      return {
        analysis: parsed.analysis || DEFAULT_ANALYSIS,
        monitoringStatus: parsed.monitoringStatus || monitoringStatus,
        updatedAt: parsed.updatedAt || Date.now(),
      };
    } catch (error) {
      console.log("Error reading guardian snapshot:", error);
      return DEFAULT_SNAPSHOT;
    }
  },

  async saveMonitoringStatus(monitoringStatus: GuardianMonitoringStatus) {
    const snapshot = await this.getSnapshot();
    const nextSnapshot: GuardianSnapshot = {
      ...snapshot,
      monitoringStatus,
      updatedAt: Date.now(),
    };

    await AsyncStorage.multiSet([
      [GUARDIAN_MONITORING_KEY, monitoringStatus],
      [GUARDIAN_STATE_KEY, JSON.stringify(nextSnapshot)],
    ]);

    DeviceEventEmitter.emit("GUARDIAN_SNAPSHOT_UPDATED", nextSnapshot);
    return nextSnapshot;
  },

  async saveAnalysis(
    analysis: RiskAnalysis,
    monitoringStatus?: GuardianMonitoringStatus
  ) {
    const snapshot = await this.getSnapshot();
    const nextStatus =
      monitoringStatus ||
      normalizeStatusFromAnalysis(
        analysis,
        snapshot.monitoringStatus === "OFF" ? "PASSIVE" : snapshot.monitoringStatus
      );

    const nextSnapshot: GuardianSnapshot = {
      analysis,
      monitoringStatus: nextStatus,
      updatedAt: Date.now(),
    };

    await AsyncStorage.setItem(GUARDIAN_STATE_KEY, JSON.stringify(nextSnapshot));
    await AsyncStorage.setItem(GUARDIAN_MONITORING_KEY, nextStatus);
    DeviceEventEmitter.emit("GUARDIAN_SNAPSHOT_UPDATED", nextSnapshot);

    return nextSnapshot;
  },

  async ensureBackgroundGuardianForLoggedInUser() {
    const [isLoggedIn, userId] = await Promise.all([
      AsyncStorage.getItem("isLoggedIn"),
      AsyncStorage.getItem("userId"),
    ]);

    if (isLoggedIn !== "true" || !userId) {
      return false;
    }

    const settings = await AsyncStorage.multiGet([
      GUARDIAN_ENABLED_KEY,
      SENSORS_ENABLED_KEY,
      LOCATION_ENABLED_KEY,
      MIC_ENABLED_KEY,
    ]);

    const current = Object.fromEntries(settings);

    const writes: [string, string][] = [];
    if (current[GUARDIAN_ENABLED_KEY] !== "true") writes.push([GUARDIAN_ENABLED_KEY, "true"]);
    if (current[SENSORS_ENABLED_KEY] !== "true") writes.push([SENSORS_ENABLED_KEY, "true"]);
    if (current[LOCATION_ENABLED_KEY] === null) writes.push([LOCATION_ENABLED_KEY, "true"]);
    if (current[MIC_ENABLED_KEY] === null) writes.push([MIC_ENABLED_KEY, "true"]);

    if (writes.length) {
      await AsyncStorage.multiSet(writes);
    }

    await GuardianServiceManager.start();
    await aiRiskEngine.startMonitoring();
    await this.saveMonitoringStatus(
      aiRiskEngine.isAnalysisActive() ? "ACTIVE" : "PASSIVE"
    );

    return true;
  },

  async disableGuardianState() {
    await GuardianServiceManager.stop();
    await aiRiskEngine.stopMonitoring();
    await AsyncStorage.multiSet([
      [GUARDIAN_ENABLED_KEY, "false"],
      [SENSORS_ENABLED_KEY, "false"],
    ]);
    await this.saveMonitoringStatus("OFF");
  },

  async resetSnapshot() {
    await AsyncStorage.multiRemove([GUARDIAN_STATE_KEY, GUARDIAN_MONITORING_KEY]);
    DeviceEventEmitter.emit("GUARDIAN_SNAPSHOT_UPDATED", DEFAULT_SNAPSHOT);
  },
};
