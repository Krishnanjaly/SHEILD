import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";

const GUARDIAN_LOGS_KEY = "GUARDIAN_EVENT_LOGS";

export interface GuardianLogEntry {
  id: string;
  eventType: string;
  riskLevel: "LOW" | "HIGH";
  timestamp: number;
  explanation: string;
  explanations: string[];
  triggerSource: "MOTION" | "VOLUME" | "KEYWORD";
}

export const GuardianLogService = {
  async getLogs(): Promise<GuardianLogEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(GUARDIAN_LOGS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.log("Failed to read guardian logs:", error);
      return [];
    }
  },

  async addLog(
    entry: Omit<GuardianLogEntry, "id" | "timestamp" | "explanation"> & {
      timestamp?: number;
      explanation?: string;
    }
  ) {
    const logs = await this.getLogs();
    const nextEntry: GuardianLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: entry.timestamp ?? Date.now(),
      explanation: entry.explanation ?? entry.explanations[0] ?? "AI event detected",
      ...entry,
    };

    const nextLogs = [nextEntry, ...logs].slice(0, 50);
    await AsyncStorage.setItem(GUARDIAN_LOGS_KEY, JSON.stringify(nextLogs));
    DeviceEventEmitter.emit("GUARDIAN_LOGS_UPDATED", nextLogs);
    return nextEntry;
  },

  async clearLogs() {
    await AsyncStorage.removeItem(GUARDIAN_LOGS_KEY);
    DeviceEventEmitter.emit("GUARDIAN_LOGS_UPDATED", []);
  },
};
