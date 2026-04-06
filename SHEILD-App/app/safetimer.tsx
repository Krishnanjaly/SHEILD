import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";
import { EmergencyService } from "../services/EmergencyService";

export default function SafeTimer() {
    const router = useRouter();

    const [hours, setHours] = useState(0);
    const [minutes, setMinutes] = useState(30);
    const [seconds, setSeconds] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const intervalRef = useRef<number | null>(null);

    const format = (num: number) => num.toString().padStart(2, "0");

    const increment = (type: string) => {
        if (type === "hours") setHours((h) => (h + 1) % 24);
        if (type === "minutes") setMinutes((m) => (m + 1) % 60);
        if (type === "seconds") setSeconds((s) => (s + 1) % 60);
    };

    const decrement = (type: string) => {
        if (type === "hours") setHours((h) => (h - 1 + 24) % 24);
        if (type === "minutes") setMinutes((m) => (m - 1 + 60) % 60);
        if (type === "seconds") setSeconds((s) => (s - 1 + 60) % 60);
    };

    const setQuick = (min: number) => {
        setHours(0);
        setMinutes(min);
        setSeconds(0);
    };

    const startTimer = async () => {
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;

        if (totalSeconds <= 0) {
            alert("Set valid time");
            return;
        }

        setIsRunning(true);

        let remaining = totalSeconds;

        intervalRef.current = setInterval(async () => {
            remaining--;

            const h = Math.floor(remaining / 3600);
            const m = Math.floor((remaining % 3600) / 60);
            const s = remaining % 60;

            setHours(h);
            setMinutes(m);
            setSeconds(s);

            if (remaining <= 0) {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                }

                setIsRunning(false);

                await triggerEmergencySms();
            }

        }, 1000);
    };


    const triggerEmergencySms = async () => {
        try {
            const userId = await AsyncStorage.getItem("userId");

            if (!userId) {
                alert("User not logged in");
                return;
            }

            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") return;

            const loc = await Location.getCurrentPositionAsync({});
            const mapsLink = `https://www.google.com/maps?q=${loc.coords.latitude},${loc.coords.longitude}`;

            const startRes = await EmergencyService.startEmergency(userId, "SAFE TIMER", mapsLink);
            await EmergencyService.sendTrustedContactAlerts({
                userId,
                locationUrl: mapsLink,
                keyword: "SAFE TIMER",
                riskLevel: "HIGH",
                emergencyId: startRes?.success ? startRes.emergency_id : undefined,
            });

            if (startRes?.success) {
                await EmergencyService.logAlert(startRes.emergency_id, "sms");
            }

            alert("🚨 Emergency alert sent automatically!");

        } catch (error) {
            console.log("Emergency SMS Error:", error);
            alert("Emergency system failed");
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <MaterialIcons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Safe Timer</Text>
                    <View style={{ width: 24 }} />
                </View>

                {/* Title Section */}
                <View style={styles.titleSection}>
                    <Text style={styles.title}>Set Safety Timer</Text>
                    <Text style={styles.subtitle}>
                        If timer ends,{" "}
                        <Text style={{ color: "#EC1313", fontWeight: "600" }}>
                            SOS activates automatically
                        </Text>{" "}
                        with your live location.
                    </Text>
                </View>

                {/* Circular Timer */}
                <View style={styles.timerWrapper}>
                    <View style={styles.timerCircle}>
                        <Text style={styles.timerText}>
                            {format(hours)}:{format(minutes)}:{format(seconds)}
                        </Text>
                        <Text style={styles.timerStatus}>READY TO SECURE</Text>
                    </View>
                </View>

                {/* Controls */}
                <View style={styles.controlsRow}>
                    {["hours", "minutes", "seconds"].map((type) => (
                        <View key={type} style={styles.controlColumn}>

                            <TouchableOpacity
                                style={styles.controlBtn}
                                onPress={() => increment(type)}
                            >
                                <MaterialIcons name="add" size={22} color="#EC1313" />
                            </TouchableOpacity>

                            <View style={styles.timeBox}>
                                <Text style={styles.timeValue}>
                                    {format(
                                        type === "hours"
                                            ? hours
                                            : type === "minutes"
                                                ? minutes
                                                : seconds
                                    )}
                                </Text>
                                <Text style={styles.timeLabel}>
                                    {type.toUpperCase()}
                                </Text>
                            </View>

                            <TouchableOpacity
                                style={styles.controlBtn}
                                onPress={() => decrement(type)}
                            >
                                <MaterialIcons name="remove" size={22} color="#EC1313" />
                            </TouchableOpacity>

                        </View>
                    ))}
                </View>

                {/* Quick Selection */}
                <View style={styles.quickRow}>
                    {[15, 30, 45, 60].map((min) => (
                        <TouchableOpacity
                            key={min}
                            style={[
                                styles.quickChip,
                                minutes === min && styles.quickChipActive,
                            ]}
                            onPress={() => setQuick(min)}
                        >
                            <Text
                                style={[
                                    styles.quickText,
                                    minutes === min && { color: "#EC1313", fontWeight: "bold" },
                                ]}
                            >
                                {min === 60 ? "1h" : `${min}m`}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* AI Footer */}
                <View style={styles.aiFooter}>
                    <MaterialIcons
                        name="favorite"
                        size={16}
                        color="#EC1313"
                    />
                    <Text style={styles.aiText}>
                        SHIELD AI IS MONITORING YOUR STATUS
                    </Text>
                </View>

            </ScrollView>

            {/* Bottom Start Button */}
            <TouchableOpacity
                style={styles.startButton}
                onPress={startTimer}
                disabled={isRunning}
            >
                <MaterialIcons name="timer" size={22} color="#fff" />
                <Text style={styles.startText}>
                    {isRunning ? "Running..." : "Start Safe Timer"}
                </Text>
            </TouchableOpacity>

        </SafeAreaView>
    );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#120A0A",
    },

    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(255,255,255,0.05)",
    },

    headerTitle: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "bold",
    },

    titleSection: {
        marginTop: 30,
        alignItems: "center",
        paddingHorizontal: 20,
    },

    title: {
        fontSize: 26,
        fontWeight: "bold",
        color: "#fff",
        marginBottom: 8,
    },

    subtitle: {
        color: "#aaa",
        textAlign: "center",
        fontSize: 13,
        lineHeight: 20,
    },

    timerWrapper: {
        alignItems: "center",
        marginVertical: 40,
    },

    timerCircle: {
        width: 240,
        height: 240,
        borderRadius: 120,
        borderWidth: 2,
        borderColor: "rgba(236,19,19,0.3)",
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#EC1313",
        shadowOpacity: 0.3,
        shadowRadius: 20,
    },

    timerText: {
        fontSize: 32,
        color: "#fff",
        letterSpacing: 4,
    },

    timerStatus: {
        marginTop: 10,
        fontSize: 10,
        color: "#EC1313",
        fontWeight: "bold",
        letterSpacing: 2,
    },

    controlsRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        paddingHorizontal: 20,
        marginBottom: 30,
    },

    controlColumn: {
        alignItems: "center",
        gap: 8,
    },

    controlBtn: {
        width: 70,
        paddingVertical: 10,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderRadius: 12,
        alignItems: "center",
    },

    timeBox: {
        width: 80,
        paddingVertical: 16,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderRadius: 12,
        alignItems: "center",
    },

    timeValue: {
        fontSize: 22,
        color: "#fff",
        fontWeight: "bold",
    },

    timeLabel: {
        fontSize: 10,
        color: "#777",
        marginTop: 4,
    },

    quickRow: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 10,
        marginBottom: 30,
    },

    quickChip: {
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: "rgba(255,255,255,0.05)",
    },

    quickChipActive: {
        backgroundColor: "rgba(236,19,19,0.2)",
        borderWidth: 1,
        borderColor: "#EC1313",
    },

    quickText: {
        color: "#ccc",
        fontSize: 13,
    },

    aiFooter: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 6,
        opacity: 0.7,
    },

    aiText: {
        fontSize: 11,
        color: "#aaa",
    },

    footer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        padding: 20,
        backgroundColor: "#120A0A",
    },

    startButton: {
        flexDirection: "row",
        backgroundColor: "#EC1313",
        paddingVertical: 16,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
    },

    startText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 16,
    },
});
