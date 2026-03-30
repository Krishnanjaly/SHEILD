import { DeviceEventEmitter } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { aiRiskEngine, RiskAnalysis } from "../utils/AiRiskEngine";
import { GuardianStateService } from "./GuardianStateService";
import { classifyAbnormalMovement } from "./abnormalMovementClassifier";

export const backgroundMonitoringTask = async (_data: any) => {
  const isLoggedIn = await AsyncStorage.getItem("isLoggedIn");
  const userId = await AsyncStorage.getItem("userId");
  if (isLoggedIn !== "true" || !userId) {
    return;
  }

  await aiRiskEngine.startMonitoring();

  try {
    const analysis = await aiRiskEngine.performRiskAnalysis();
    const assessment = classifyAbnormalMovement(analysis);
    const classifiedAnalysis: RiskAnalysis = {
      ...analysis,
      riskLevel: assessment.classification === "NONE" ? analysis.riskLevel : assessment.classification,
    };

    await GuardianStateService.saveAnalysis(
      classifiedAnalysis,
      classifiedAnalysis.riskLevel === "NONE" ? "PASSIVE" : undefined
    );

    if (assessment.classification === "NONE") {
      return;
    }

    console.log(
      `[BackgroundTask] ${assessment.classification} abnormal movement detected`
    );
    await AsyncStorage.setItem(
      "pendingEmergency",
      JSON.stringify(classifiedAnalysis)
    );
    DeviceEventEmitter.emit("AI_RISK_DETECTED", classifiedAnalysis);
  } catch (error) {
    console.error("Error in background analysis task:", error);
  }
};
