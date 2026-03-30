import AsyncStorage from "@react-native-async-storage/async-storage";
import BASE_URL from "../config/api";
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
  const [userId, email] = await Promise.all([
    AsyncStorage.getItem("userId"),
    AsyncStorage.getItem("userEmail"),
  ]);

  const locationUrl = locationResolver ? await locationResolver() : "Location unavailable";
  let latitude: string | null = null;
  let longitude: string | null = null;

  if (locationUrl.includes("?q=")) {
    const coords = locationUrl.split("?q=")[1]?.split(",") ?? [];
    latitude = coords[0] ?? null;
    longitude = coords[1] ?? null;
  }

  return { userId, email, locationUrl, latitude, longitude };
}

async function sendEmailAlert(params: {
  email: string;
  keyword: string;
  riskLevel: "LOW" | "HIGH";
  latitude: string | null;
  longitude: string | null;
}) {
  await fetch(`${BASE_URL}/send-sos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: params.email,
      latitude: params.latitude,
      longitude: params.longitude,
      keyword: params.keyword,
      risk_level: params.riskLevel,
      live_status:
        params.riskLevel === "HIGH"
          ? "Emergency Mode Active"
          : "Abnormal movement warning",
    }),
  });
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

    const { userId, email, locationUrl, latitude, longitude } =
      await resolveAlertContext(locationResolver);

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
          await EmergencyService.logAlert(emergencyId, "email");
        }
      }
    }

    await ActivityService.logActivity(
      `ABNORMAL_MOVEMENT_LOW:${assessment.triggers.join(", ") || "Movement anomaly"}`,
      emergencyId
    );

    if (email) {
      await sendEmailAlert({
        email,
        keyword: assessment.message,
        riskLevel: "LOW",
        latitude,
        longitude,
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

    const { userId, email, locationUrl, latitude, longitude } =
      await resolveAlertContext(locationResolver);

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
          await EmergencyService.logAlert(emergencyId, "email");
        }
      }
    }

    await ActivityService.logActivity(
      `ABNORMAL_MOVEMENT_HIGH:${assessment.triggers.join(", ") || "Movement anomaly"}`,
      emergencyId
    );

    if (email) {
      await sendEmailAlert({
        email,
        keyword: assessment.message,
        riskLevel: "HIGH",
        latitude,
        longitude,
      });
    }

    return { duplicate: false, emergencyId, locationUrl };
  },
};
