import {
    Alert,
    DeviceEventEmitter,
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Switch,
    ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ProfileService } from "../services/EmergencyService";

const VOLUME_PATTERN_STORAGE_KEY = "volumePattern";
const ACTIVE_VOLUME_PATTERN_STORAGE_KEY = "ACTIVE_VOLUME_PATTERN";
const VOLUME_TRIGGER_ENABLED_KEY = "VOLUME_TRIGGER_ENABLED";
const DEFAULT_PATTERN_LABEL = "Default: Up-Up-Down-Down";
const DEFAULT_PATTERN = ["UP", "UP", "DOWN", "DOWN"];

export default function HardwareTrigger() {
    const router = useRouter();
    const [enabled, setEnabled] = useState(true);
    const [patternLabel, setPatternLabel] = useState(DEFAULT_PATTERN_LABEL);

    useFocusEffect(useCallback(() => {
        const loadPatternLabel = async () => {
            try {
                const storedEnabled = await AsyncStorage.getItem(VOLUME_TRIGGER_ENABLED_KEY);
                if (storedEnabled !== null) {
                    setEnabled(storedEnabled === "true");
                }

                const rawPattern = await AsyncStorage.getItem(VOLUME_PATTERN_STORAGE_KEY);
                if (!rawPattern) {
                    setPatternLabel(DEFAULT_PATTERN_LABEL);
                    return;
                }

                const parsedPattern = JSON.parse(rawPattern);
                if (!Array.isArray(parsedPattern) || parsedPattern.length === 0) {
                    setPatternLabel(DEFAULT_PATTERN_LABEL);
                    return;
                }

                const formattedPattern = parsedPattern
                    .filter((value) => value === "UP" || value === "DOWN")
                    .map((value) => value === "UP" ? "Up" : "Down")
                    .join("-");

                setPatternLabel(formattedPattern ? `Saved: ${formattedPattern}` : DEFAULT_PATTERN_LABEL);
            } catch {
                setPatternLabel(DEFAULT_PATTERN_LABEL);
            }
        };

        loadPatternLabel();
    }, []));

    const handleEnabledToggle = useCallback(async (value: boolean) => {
        try {
            await AsyncStorage.setItem(VOLUME_TRIGGER_ENABLED_KEY, value.toString());
            setEnabled(value);
            DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");

            const userId = await AsyncStorage.getItem("userId");
            if (userId) {
                await ProfileService.saveHardwareTrigger(
                    userId,
                    value,
                    "custom_pattern"
                );
            }
        } catch (error) {
            console.log("Failed to update hardware trigger enabled state:", error);
            Alert.alert("Update Failed", "Unable to update hardware trigger setting");
        }
    }, []);

    const handleSaveConfiguration = useCallback(async () => {
        try {
            const rawPattern = await AsyncStorage.getItem(VOLUME_PATTERN_STORAGE_KEY);
            const parsedPattern = rawPattern ? JSON.parse(rawPattern) : null;
            const nextPattern = Array.isArray(parsedPattern) && parsedPattern.length >= 3
                ? parsedPattern.filter((value) => value === "UP" || value === "DOWN").slice(0, 6)
                : DEFAULT_PATTERN;

            await AsyncStorage.multiSet([
                [VOLUME_TRIGGER_ENABLED_KEY, enabled.toString()],
                [ACTIVE_VOLUME_PATTERN_STORAGE_KEY, JSON.stringify(nextPattern)],
            ]);

            DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");

            const userId = await AsyncStorage.getItem("userId");
            if (userId) {
                await ProfileService.saveHardwareTrigger(
                    userId,
                    enabled,
                    nextPattern.join("-").toLowerCase()
                );
            }

            Alert.alert("Configuration Saved", "Pattern Saved Successfully");
        } catch (error) {
            console.log("Failed to save hardware trigger configuration:", error);
            Alert.alert("Save Failed", "Unable to save hardware trigger configuration");
        }
    }, [enabled]);

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>

                {/* Top Bar */}
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <MaterialIcons name="arrow-back" size={26} color="#fff" />
                    </TouchableOpacity>

                    <Text style={styles.headerTitle}>Hardware Trigger</Text>

                    <MaterialIcons name="info-outline" size={24} color="#aaa" />
                </View>

                {/* Hero Illustration */}
                <View style={styles.heroCard}>
                    <View style={styles.phoneMock}>
                        <View style={styles.phoneNotch} />
                        <View style={styles.emergencyIconWrapper}>
                            <MaterialIcons
                                name="emergency-share"
                                size={50}
                                color="#EC1313"
                            />
                        </View>
                    </View>

                    <Text style={styles.activeLabel}>
                        ACTIVE DETECTION PATTERN
                    </Text>
                </View>

                {/* Title */}
                <Text style={styles.mainTitle}>
                    Press volume button pattern
                </Text>

                <Text style={styles.subtitle}>
                    Quickly press the volume keys in your secret sequence
                    to trigger a silent AI response even when the screen is locked.
                </Text>

                {/* Instruction List */}
                <View style={styles.instructionCard}>
                    <InstructionItem
                        icon="touch-app"
                        title="Custom Pattern"
                        description={patternLabel}
                        asButton
                        onPress={() => router.push("/custom-pattern")}
                    />

                </View>

                {/* Save Button */}
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveConfiguration}>
                    <Text style={styles.saveText}>Save Configuration</Text>
                </TouchableOpacity>

                <Text style={styles.footer}>
                    Powered by Shield AI Safety Engine
                </Text>

            </ScrollView>
        </SafeAreaView>
    );
}

/* ---------- Instruction Component ---------- */

const InstructionItem = ({ icon, title, description, asButton, onPress }: any) => (
    <View style={styles.instructionRow}>
        <View style={styles.iconBox}>
            <MaterialIcons name={icon} size={22} color="#aaa" />
        </View>
        <View>
            <Text style={styles.instructionTitle}>{title}</Text>
            {asButton ? (
                <TouchableOpacity style={styles.patternButton} activeOpacity={0.85} onPress={onPress}>
                    <Text style={styles.patternButtonText}>{description}</Text>
                </TouchableOpacity>
            ) : (
                <Text style={styles.instructionDesc}>{description}</Text>
            )}
        </View>
    </View>
);

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#181111",
    },

    topBar: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
    },

    headerTitle: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "bold",
    },

    heroCard: {
        backgroundColor: "#221010",
        marginHorizontal: 20,
        borderRadius: 20,
        padding: 30,
        alignItems: "center",
        marginBottom: 30,
    },

    phoneMock: {
        width: 160,
        height: 300,
        backgroundColor: "#111",
        borderRadius: 30,
        borderWidth: 4,
        borderColor: "#333",
        alignItems: "center",
        justifyContent: "center",
    },

    phoneNotch: {
        width: 80,
        height: 6,
        backgroundColor: "#222",
        borderRadius: 10,
        position: "absolute",
        top: 15,
    },

    emergencyIconWrapper: {
        backgroundColor: "rgba(236,19,19,0.1)",
        padding: 20,
        borderRadius: 100,
    },

    activeLabel: {
        marginTop: 20,
        fontSize: 10,
        letterSpacing: 2,
        color: "#EC1313",
        fontWeight: "bold",
    },

    mainTitle: {
        color: "#fff",
        fontSize: 22,
        fontWeight: "bold",
        textAlign: "center",
        marginBottom: 10,
        paddingHorizontal: 20,
    },

    subtitle: {
        color: "#aaa",
        textAlign: "center",
        paddingHorizontal: 30,
        marginBottom: 30,
        fontSize: 13,
        lineHeight: 20,
    },

    configCard: {
        backgroundColor: "#221010",
        marginHorizontal: 20,
        borderRadius: 16,
        padding: 20,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 25,
    },

    configTitle: {
        color: "#fff",
        fontWeight: "bold",
    },

    configSub: {
        color: "#aaa",
        fontSize: 12,
    },

    instructionCard: {
        marginHorizontal: 20,
        marginBottom: 30,
    },

    instructionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 15,
        marginBottom: 20,
    },

    iconBox: {
        backgroundColor: "#2a1a1a",
        padding: 10,
        borderRadius: 12,
    },

    instructionTitle: {
        color: "#fff",
        fontWeight: "600",
    },

    instructionDesc: {
        color: "#888",
        fontSize: 12,
    },

    patternButton: {
        marginTop: 8,
        alignSelf: "flex-start",
        backgroundColor: "rgba(236,19,19,0.14)",
        borderWidth: 1,
        borderColor: "rgba(236,19,19,0.38)",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
    },

    patternButtonText: {
        color: "#f6d4d4",
        fontSize: 12,
        fontWeight: "700",
    },

    saveButton: {
        backgroundColor: "#EC1313",
        marginHorizontal: 20,
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: "center",
        shadowColor: "#EC1313",
        shadowOpacity: 0.4,
        shadowRadius: 10,
    },

    saveText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 16,
    },

    footer: {
        textAlign: "center",
        marginTop: 20,
        fontSize: 10,
        color: "#543b3b",
        textTransform: "uppercase",
        letterSpacing: 1,
    },
});
