import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import BASE_URL from "../config/api";

export interface Activity {
    id: string;
    emergency_id?: number | null;
    activity_type: string;
    timestamp: string;
    // Optional UI fields
    title?: string;
    details?: string;
    level?: string;
    type?: string; 
}

export const ActivityService = {
    async logActivity(activityType: string, emergencyId: number | null = null) {
        try {
            const response = await fetch(`${BASE_URL}/activity/log`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    emergency_id: emergencyId,
                    activity_type: activityType,
                }),
            });

            if (!response.ok) {
                console.error("Log activity failed with status:", response.status);
                return;
            }

            DeviceEventEmitter.emit("ACTIVITY_UPDATED");
            return await response.json();
        } catch (e) {
            console.error("Error logging activity:", e);
        }
    },

    async getActivities(): Promise<Activity[]> {
        try {
            const email = await AsyncStorage.getItem("userEmail");
            if (!email) return [];

            // Updated this to match new backend structure if a generic fetch exists, 
            // otherwise using a placeholder for now since we focused on logs storage.
            // For now, let's assume we want to see recent logs.
            const response = await fetch(`${BASE_URL}/activities/${email}`);

            if (!response.ok) {
                console.error("Fetch activities failed with status:", response.status);
                return [];
            }

            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch (e) {
            console.error("Error fetching activities:", e);
            return [];
        }
    },

    async clearActivities() {
        try {
            const email = await AsyncStorage.getItem("userEmail");
            if (!email) return;
            
            // Backend endpoint for clearing logs if exists, otherwise logging local clear
            console.log("Clearing activities for", email);
            // Example: await fetch(`${BASE_URL}/activities/clear/${email}`, { method: 'DELETE' });
        } catch (e) {
            console.error("Error clearing activities:", e);
        }
    }
};
