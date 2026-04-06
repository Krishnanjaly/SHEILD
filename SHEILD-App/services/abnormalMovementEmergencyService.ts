import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityService } from "./ActivityService";
import { EmergencyService } from "./EmergencyService";
import { AbnormalMovementAssessment } from "./abnormalMovementClassifier";

const DUPLICATE_WINDOW_MS = 45000;

type MovementResponseResult = {
  duplicate: boolean;
  emergencyId: number | null;
  locationUrl: string;
};

const recentDetections = new Map<string, number>();

function markDetection(key: string) {
  recentDetections.set(key, Date.now());
}

function isDuplicateDetection(key: string) {
  const lastSeen = recentDetections.get(key);
  if (!lastSeen) {
    return false;
  }

  return Date.now() - lastSeen < DUPLICATE_WINDOW_MS;
}

async function resolveAlertContext(
  locationResolver?: () => Promise<string>
) {
  const userId = await AsyncStorage.getItem("userId");

  const locationUrl = locationResolver ? await locationResolver() : "Location unavailable";
  return { userId, locationUrl };
}

export const abnormalMovementEmergencyService = {
  async handleLowRiskDetection(
    assessment: AbnormalMovementAssessment,
    locationResolver?: () => Promise<string>
  ): Promise<MovementResponseResult> {
    if (isDuplicateDetection(assessment.dedupeKey)) {
      return { duplicate: true, emergencyId: null, locationUrl: "Location unavailable" };
    }

    markDetection(assessment.dedupeKey);

    const { userId, locationUrl } = await resolveAlertContext(locationResolver);

    let emergencyId: number | null = null;
    if (userId) {
      const startRes = await EmergencyService.startEmergency(
        userId,
        `LOW RISK ABNORMAL MOVEMENT: ${assessment.triggers.join(", ") || "Movement anomaly"}`,
        locationUrl
      );
      if (startRes?.success) {
        emergencyId = startRes.emergency_id;
        if (emergencyId !== null) {
          await EmergencyService.logAlert(emergencyId, "sms");
        }
      }
    }

    await ActivityService.logActivity(
      `ABNORMAL_MOVEMENT_LOW:${assessment.triggers.join(", ") || "Movement anomaly"}`,
      emergencyId
    );

    if (userId) {
      await EmergencyService.sendTrustedContactAlerts({
        userId,
        locationUrl,
        keyword: assessment.message,
        riskLevel: "LOW",
        emergencyId,
      });
    }

    return { duplicate: false, emergencyId, locationUrl };
  },

  async handleHighRiskDetection(
    assessment: AbnormalMovementAssessment,
    locationResolver?: () => Promise<string>
  ): Promise<MovementResponseResult> {
    if (isDuplicateDetection(assessment.dedupeKey)) {
      return { duplicate: true, emergencyId: null, locationUrl: "Location unavailable" };
    }

    markDetection(assessment.dedupeKey);

    const { userId, locationUrl } = await resolveAlertContext(locationResolver);

    let emergencyId: number | null = null;
    if (userId) {
      const startRes = await EmergencyService.startEmergency(
        userId,
        `HIGH RISK ABNORMAL MOVEMENT: ${assessment.triggers.join(", ") || "Movement anomaly"}`,
        locationUrl
      );
      if (startRes?.success) {
        emergencyId = startRes.emergency_id;
        if (emergencyId !== null) {
          await EmergencyService.logAlert(emergencyId, "sms");
        }
      }
    }

    await ActivityService.logActivity(
      `ABNORMAL_MOVEMENT_HIGH:${assessment.triggers.join(", ") || "Movement anomaly"}`,
      emergencyId
    );

    if (userId) {
      await EmergencyService.sendTrustedContactAlerts({
        userId,
        locationUrl,
        keyword: assessment.message,
        riskLevel: "HIGH",
        emergencyId,
      });
    }

    return { duplicate: false, emergencyId, locationUrl };
  },
};
