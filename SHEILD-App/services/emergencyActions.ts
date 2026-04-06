import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { EmergencyService } from "./EmergencyService";
import { ActivityService } from "./ActivityService";

const getLocation = async () => {
    try {
        const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });
        return location.coords;
    } catch (e) {
        console.log("Location fetch failed:", e);
        return null;
    }
};

const getLocationString = async () => {
    const coords = await getLocation();
    if (coords) {
        return `https://maps.google.com/?q=${coords.latitude},${coords.longitude}`;
    }
    return "Location unavailable";
};

export const triggerLowRisk = async (detectedKeyword?: string) => {
    console.log("LOW RISK Emergency Protocol Triggered");

    try {
        const userId = await AsyncStorage.getItem("userId");
        const locStr = await getLocationString();
        const keyword = detectedKeyword || "LOW_RISK_KEYWORD";

        await ActivityService.logActivity(`LOW_RISK_TRIGGERED: ${keyword}`);

        if (userId) {
            const startRes = await EmergencyService.startEmergency(userId, keyword, locStr);
            if (startRes.success) {
                await EmergencyService.sendTrustedContactAlerts({
                    userId,
                    locationUrl: locStr,
                    keyword,
                    riskLevel: "LOW",
                    emergencyId: startRes.emergency_id,
                });
                await ActivityService.logActivity("SOS_TRIGGERED_LOW", startRes.emergency_id);
            }
        }

        DeviceEventEmitter.emit("KEYWORD_EMERGENCY_ACTION", {
            risk: "LOW",
            keyword,
            location: locStr,
        });
    } catch (error) {
        console.error("Error in LOW RISK protocol:", error);
    }
};

export const triggerHighRisk = async (detectedKeyword?: string) => {
    console.log("HIGH RISK Emergency Protocol Triggered");

    try {
        const userId = await AsyncStorage.getItem("userId");
        const locStr = await getLocationString();
        const keyword = detectedKeyword || "HIGH_RISK_KEYWORD";

        await ActivityService.logActivity(`HIGH_RISK_TRIGGERED: ${keyword}`);

        let emergencyId = null;
        if (userId) {
            const startRes = await EmergencyService.startEmergency(userId, keyword, locStr);
            if (startRes.success) {
                emergencyId = startRes.emergency_id;
                await EmergencyService.sendTrustedContactAlerts({
                    userId,
                    locationUrl: locStr,
                    keyword,
                    riskLevel: "HIGH",
                    emergencyId,
                });
                await ActivityService.logActivity("SOS_TRIGGERED_HIGH", emergencyId);
            }
        }

        DeviceEventEmitter.emit("KEYWORD_EMERGENCY_ACTION", {
            risk: "HIGH",
            keyword,
            location: locStr,
            emergencyId,
        });
    } catch (error) {
        console.error("Error in HIGH RISK protocol:", error);
    }
};
