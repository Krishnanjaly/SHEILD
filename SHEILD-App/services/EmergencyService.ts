import BASE_URL from "../config/api";
import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import * as SMS from "expo-sms";

type TrustedContact = {
    trusted_id?: number | string;
    trusted_name?: string;
    trusted_no?: string;
    email?: string;
    user_id?: string;
    latitude?: string | number;
    longitude?: string | number;
};

type AutoSmsNativeModule = {
    sendSms: (phoneNumber: string, message: string) => Promise<boolean>;
};

const AutoSmsModule = NativeModules.AutoSmsModule as AutoSmsNativeModule | undefined;

function normalizeLocationUrl(locationUrl: string) {
    if (!locationUrl || locationUrl === "Location unavailable" || locationUrl === "Location Disabled") {
        return "Location unavailable";
    }

    if (locationUrl.startsWith("http://") || locationUrl.startsWith("https://")) {
        return locationUrl;
    }

    const coords = locationUrl.split(",").map((part) => part.trim());
    if (coords.length === 2 && coords[0] && coords[1]) {
        return `https://www.google.com/maps?q=${coords[0]},${coords[1]}`;
    }

    return locationUrl;
}

function extractCoordinates(locationUrl: string) {
    const normalized = normalizeLocationUrl(locationUrl);
    const mapMatch = normalized.match(/q=([-.\d]+),([-.\d]+)/i);

    if (!mapMatch) {
        return { latitude: null, longitude: null };
    }

    return {
        latitude: Number(mapMatch[1]),
        longitude: Number(mapMatch[2]),
    };
}

function normalizePhoneNumber(value?: string | null) {
    return String(value ?? "").replace(/[^\d+]/g, "").trim();
}

function uniquePhoneNumbers(contacts: TrustedContact[]) {
    return contacts
        .map((contact) => normalizePhoneNumber(contact.trusted_no))
        .filter(Boolean)
        .filter((value, index, array) => array.indexOf(value) === index);
}

function buildEmergencySmsMessage(params: {
    riskLevel: "LOW" | "HIGH";
    keyword: string | null;
    locationUrl: string;
    mediaUrls?: string[];
}) {
    const trigger = params.keyword || "Emergency";
    const location = normalizeLocationUrl(params.locationUrl);
    const mediaText =
        params.mediaUrls && params.mediaUrls.length > 0
            ? `\nMedia: ${params.mediaUrls.join(", ")}`
            : "";

    return `SHEILD ${params.riskLevel} ALERT\nTrigger: ${trigger}\nLocation: ${location}\nPlease check immediately.${mediaText}`;
}

async function ensureSmsPermission() {
    if (Platform.OS !== "android") {
        return true;
    }

    const permission = PermissionsAndroid.PERMISSIONS.SEND_SMS;
    const existing = await PermissionsAndroid.check(permission);
    if (existing) {
        return true;
    }

    const granted = await PermissionsAndroid.request(permission, {
        title: "SMS Permission Required",
        message: "SHEILD needs SMS permission to alert trusted contacts during emergencies.",
        buttonPositive: "Allow",
    });

    return granted === PermissionsAndroid.RESULTS.GRANTED;
}

async function sendSmsMessage(phoneNumber: string, message: string) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
        return { success: false, message: "Missing phone number" };
    }

    if (Platform.OS === "android" && AutoSmsModule?.sendSms) {
        const hasPermission = await ensureSmsPermission();
        if (!hasPermission) {
            return { success: false, message: "SMS permission denied" };
        }

        await AutoSmsModule.sendSms(normalizedPhone, message);
        return { success: true, message: "SMS sent" };
    }

    const isAvailable = await SMS.isAvailableAsync();
    if (!isAvailable) {
        return { success: false, message: "SMS is not available on this device" };
    }

    const result = await SMS.sendSMSAsync([normalizedPhone], message);
    return { success: result.result === "sent" || result.result === "unknown", message: result.result };
}

export const EmergencyService = {
    // 3. Emergency Incident Creation
    async startEmergency(userId: string, keyword: string | null = null, locationUrl: string) {
        try {
            const res = await fetch(`${BASE_URL}/emergency/start`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    user_id: userId, 
                    detected_keyword: keyword, 
                    location_url: locationUrl,
                    status: 'ACTIVE'
                }),
            });
            return await res.json(); // should return { success: true, emergency_id: ... }
        } catch (e) {
            console.error("Error starting emergency:", e);
            return { success: false };
        }
    },

    // 14. Update Status (Safe)
    async endEmergency(emergencyId: number) {
        try {
            const res = await fetch(`${BASE_URL}/emergency/end`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emergency_id: emergencyId }),
            });
            return await res.json();
        } catch (e) {
            console.error("Error ending emergency:", e);
        }
    },

    // 4. Audio Record
    async logAudio(emergencyId: number, filePath: string) {
        try {
            await fetch(`${BASE_URL}/emergency/audio`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emergency_id: emergencyId, audio_file_path: filePath }),
            });
        } catch (e) {
            console.error("Error logging audio:", e);
        }
    },

    // 5. Video Record
    async logVideo(emergencyId: number, cameraType: 'front' | 'rear', filePath: string) {
        try {
            await fetch(`${BASE_URL}/emergency/video`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emergency_id: emergencyId, camera_type: cameraType, video_file_path: filePath }),
            });
        } catch (e) {
            console.error("Error logging video:", e);
        }
    },

    // 7. Alert Logging (SMS/Email)
    async logAlert(emergencyId: number, alertType: 'email' | 'sms') {
        try {
            await fetch(`${BASE_URL}/emergency/alert`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emergency_id: emergencyId, alert_type: alertType }),
            });
        } catch (e) {
            console.error("Error logging alert:", e);
        }
    },

    async storeEvidence(emergencyId: number, evidenceType: 'video' | 'audio') {
        try {
            await fetch(`${BASE_URL}/emergency/evidence`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emergency_id: emergencyId, evidence_type: evidenceType }),
            });
        } catch (e) {
            console.error("Error storing evidence:", e);
        }
    },

    async getTrustedContacts(userId: string) {
        try {
            const response = await fetch(`${BASE_URL}/getTrustedContacts/${userId}`);
            if (response.ok) {
                const contacts = await response.json();
                if (Array.isArray(contacts) && contacts.length > 0) {
                    return contacts as TrustedContact[];
                }
            }

            return [] as TrustedContact[];
        } catch (e) {
            console.error("Error fetching trusted contacts:", e);
            return [] as TrustedContact[];
        }
    },

    async sendTrustedContactAlerts(params: {
        userId: string;
        locationUrl: string;
        keyword: string | null;
        riskLevel: "LOW" | "HIGH";
        emergencyId?: number | null;
        contacts?: TrustedContact[];
    }) {
        try {
            const contacts = params.contacts ?? await this.getTrustedContacts(params.userId);
            const phoneNumbers = uniquePhoneNumbers(contacts);
            const message = buildEmergencySmsMessage({
                riskLevel: params.riskLevel,
                keyword: params.keyword,
                locationUrl: params.locationUrl,
            });

            for (const phoneNumber of phoneNumbers) {
                try {
                    await sendSmsMessage(phoneNumber, message);
                } catch (error) {
                    console.error(`Failed to send emergency SMS to ${phoneNumber}:`, error);
                }
            }

            if (params.emergencyId && phoneNumbers.length > 0) {
                await this.logAlert(params.emergencyId, "sms");
            }

            return contacts;
        } catch (e) {
            console.error("Error sending trusted contact alerts:", e);
            return params.contacts ?? [];
        }
    },

    async sendSosEmailAlert(params: {
        email?: string | null;
        userId?: string | null;
        locationUrl: string;
        keyword: string | null;
        riskLevel: "LOW" | "HIGH";
        emergencyId?: number | null;
        contacts?: TrustedContact[];
    }) {
        if (params.userId) {
            return this.sendTrustedContactAlerts({
                userId: params.userId,
                locationUrl: params.locationUrl,
                keyword: params.keyword,
                riskLevel: params.riskLevel,
                emergencyId: params.emergencyId,
                contacts: params.contacts,
            });
        }

        const { latitude, longitude } = extractCoordinates(params.locationUrl);
        const response = await fetch(`${BASE_URL}/send-sos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: params.email,
                latitude,
                longitude,
                keyword: params.keyword,
                risk_level: params.riskLevel,
            }),
        });

        return response.json();
    },

    async sendSafeSmsAlert(params: {
        userId?: string | null;
        email?: string | null;
        userName?: string | null;
    }) {
        if (!params.email && !params.userId) {
            return { success: false, message: "Missing user email and userId" };
        }

        try {
            const contacts = params.userId ? await this.getTrustedContacts(params.userId) : [];
            const phoneNumbers = uniquePhoneNumbers(contacts);
            const userName = params.userName || params.email || "The SHEILD user";
            const message = `SHEILD SAFE UPDATE\n${userName} is SAFE now. Please ignore the previous emergency alert.`;

            for (const phoneNumber of phoneNumbers) {
                await sendSmsMessage(phoneNumber, message);
            }

            return { success: true, message: "Safe SMS alerts sent", recipients: phoneNumbers.length };
        } catch (e) {
            console.error("Error sending safe SMS alert:", e);
            return { success: false, message: "Failed to send safe SMS alert" };
        }
    },

    // 8. Call Logging
    async logCall(emergencyId: number, status: 'DIALLED' | 'ANSWERED' | 'FAILED') {
        try {
            await fetch(`${BASE_URL}/emergency/call`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emergency_id: emergencyId, call_status: status }),
            });
        } catch (e) {
            console.error("Error logging call:", e);
        }
    },

    // 13. QR Trigger
    async triggerQR(token: string, userId: string, lat: number, lon: number) {
        try {
            const res = await fetch(`${BASE_URL}/qr/trigger`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, user_id: userId, latitude: lat, longitude: lon }),
            });
            return await res.json();
        } catch (e) {
            console.error("Error triggering QR emergency:", e);
        }
    },

    // 12. Access Link
    async createAccessLink(evidenceId: number, level: 'view' | 'download', expiry: string) {
        try {
            const res = await fetch(`${BASE_URL}/access-link`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ evidence_id: evidenceId, access_level: level, expiry_time: expiry }),
            });
            return await res.json();
        } catch (e) {
            console.error("Error creating access link:", e);
        }
    }
};

export const ProfileService = {
    // 1. User Profile Storage
    async saveProfile(userId: string, info: string) {
        try {
            await fetch(`${BASE_URL}/profile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, emergency_info: info }),
            });
        } catch (e) {
            console.error("Error saving profile:", e);
        }
    },

    // 2. Hardware Trigger
    async saveHardwareTrigger(userId: string, status: boolean, pattern: string = 'triple_press') {
        try {
            await fetch(`${BASE_URL}/hardware-trigger`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, trigger_status: status, button_pattern: pattern }),
            });
        } catch (e) {
            console.error("Error saving hardware trigger status:", e);
        }
    }
};

export const FakeCallService = {
    // 11. Fake Call
    async triggerFakeCall(userId: string, name: string) {
        try {
            await fetch(`${BASE_URL}/fake-call`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, caller_name: name, trigger_method: 'manual_button' }),
            });
        } catch (e) {
            console.error("Error triggering fake call:", e);
        }
    }
};

export type { TrustedContact };
