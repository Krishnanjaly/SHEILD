import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { EmergencyService } from "./EmergencyService";
import { ActivityService } from "./ActivityService";
import BASE_URL from "../config/api";

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

/**
 * LOW RISK EMERGENCY PROTOCOL
 * - Send location email to trusted contacts
 * - Log activity
 * - Create emergency record in DB
 */
export const triggerLowRisk = async (detectedKeyword?: string) => {
    console.log("⚠️ LOW RISK Emergency Protocol Triggered");

    try {
        const email = await AsyncStorage.getItem("userEmail");
        const userId = await AsyncStorage.getItem("userId");
        const locStr = await getLocationString();
        const coords = await getLocation();
        const keyword = detectedKeyword || "LOW_RISK_KEYWORD";

        // Log activity
        await ActivityService.logActivity(`LOW_RISK_TRIGGERED: ${keyword}`);

        // Start emergency record in DB
        if (userId) {
            const startRes = await EmergencyService.startEmergency(userId, keyword, locStr);
            if (startRes.success) {
                await EmergencyService.logAlert(startRes.emergency_id, "email");
                await ActivityService.logActivity("SOS_TRIGGERED_LOW", startRes.emergency_id);
            }
        }

        // Send SOS email to trusted contacts
        if (email) {
            const sosRes = await fetch(`${BASE_URL}/send-sos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    latitude: coords?.latitude || null,
                    longitude: coords?.longitude || null,
                    keyword,
                    risk_level: "LOW",
                }),
            });
            const sosData = await sosRes.json();
            console.log("✅ LOW RISK SOS sent:", sosData.message);
        }

        // Emit event for UI updates
        DeviceEventEmitter.emit("KEYWORD_EMERGENCY_ACTION", {
            risk: "LOW",
            keyword,
            location: locStr,
        });

    } catch (error) {
        console.error("Error in LOW RISK protocol:", error);
    }
};

/**
 * HIGH RISK EMERGENCY PROTOCOL
 * - Send location email to trusted contacts
 * - Log activity
 * - Create emergency record in DB
 * - Trigger call rotation (via event)
 * - Start evidence recording (via event)
 */
export const triggerHighRisk = async (detectedKeyword?: string) => {
    console.log("🚨 HIGH RISK Emergency Protocol Triggered");

    try {
        const email = await AsyncStorage.getItem("userEmail");
        const userId = await AsyncStorage.getItem("userId");
        const locStr = await getLocationString();
        const coords = await getLocation();
        const keyword = detectedKeyword || "HIGH_RISK_KEYWORD";

        // Log activity
        await ActivityService.logActivity(`HIGH_RISK_TRIGGERED: ${keyword}`);

        // Start emergency record in DB
        let emergencyId = null;
        if (userId) {
            const startRes = await EmergencyService.startEmergency(userId, keyword, locStr);
            if (startRes.success) {
                emergencyId = startRes.emergency_id;
                await EmergencyService.logAlert(startRes.emergency_id, "email");
                await ActivityService.logActivity("SOS_TRIGGERED_HIGH", startRes.emergency_id);
            }
        }

        // Send SOS email to trusted contacts
        if (email) {
            const sosRes = await fetch(`${BASE_URL}/send-sos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email,
                    latitude: coords?.latitude || null,
                    longitude: coords?.longitude || null,
                    keyword,
                    risk_level: "HIGH",
                }),
            });
            const sosData = await sosRes.json();
            console.log("✅ HIGH RISK SOS sent:", sosData.message);
        }

        // Emit event for UI to show emergency modals and start recording
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