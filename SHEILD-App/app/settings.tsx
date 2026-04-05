import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Switch,
} from "react-native";
import Slider from "@react-native-community/slider";
import { MaterialIcons } from "@expo/vector-icons";
import { useState, useEffect, useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { ProfileService } from "../services/EmergencyService";
import { AppLockStorage, AppLockType } from "../services/AppLockStorage";

export default function Settings() {
    const [keywordEnabled, setKeywordEnabled] = useState(true);
    const [volumeTrigger, setVolumeTrigger] = useState(false);
    const [shakeEnabled, setShakeEnabled] = useState(true);
    const [shakeLevel, setShakeLevel] = useState(0.5);
    const [autoSiren, setAutoSiren] = useState(true);
    const [loopAudio, setLoopAudio] = useState(false);
    const [isAppLockEnabled, setIsAppLockEnabled] = useState(false);
    const [lockType, setLockType] = useState<AppLockType>(null);
    const [stealthMode, setStealthMode] = useState(false);
    const [keywords, setKeywords] = useState("");
    const router = useRouter();
    const processedKeywords = keywords
        .split(",")
        .map(word => word.trim().toLowerCase());

    const loadSettings = useCallback(async () => {
        const [
            storedKeywordEnabled,
            storedVolumeTrigger,
            storedShakeEnabled,
            storedShakeSensitivity,
            storedAutoSiren,
            storedLoopAudio,
            storedStealthMode,
            appLockState,
        ] = await Promise.all([
            AsyncStorage.getItem("KEYWORD_DETECTION_ENABLED"),
            AsyncStorage.getItem("VOLUME_TRIGGER_ENABLED"),
            AsyncStorage.getItem("SHAKE_DETECTION_ENABLED"),
            AsyncStorage.getItem("SHAKE_SENSITIVITY"),
            AsyncStorage.getItem("AUTO_SIREN_ENABLED"),
            AsyncStorage.getItem("LOOP_AUDIO_ENABLED"),
            AsyncStorage.getItem("STEALTH_MODE_ENABLED"),
            AppLockStorage.getState(),
        ]);
        if (storedKeywordEnabled !== null) {
            setKeywordEnabled(storedKeywordEnabled === "true");
        }
        if (storedVolumeTrigger !== null) {
            setVolumeTrigger(storedVolumeTrigger === "true");
        }
        if (storedShakeEnabled !== null) {
            setShakeEnabled(storedShakeEnabled === "true");
        }
        if (storedShakeSensitivity !== null) {
            const parsedSensitivity = Number(storedShakeSensitivity);
            if (Number.isFinite(parsedSensitivity)) {
                setShakeLevel(Math.min(1, Math.max(0, parsedSensitivity)));
            }
        }
        if (storedAutoSiren !== null) {
            setAutoSiren(storedAutoSiren === "true");
        }
        if (storedLoopAudio !== null) {
            setLoopAudio(storedLoopAudio === "true");
        }
        if (storedStealthMode !== null) {
            setStealthMode(storedStealthMode === "true");
        }
        setIsAppLockEnabled(appLockState.isAppLockEnabled);
        setLockType(appLockState.lockType);
    }, []);

    const handleVolumeToggle = async (val: boolean) => {
        await AsyncStorage.setItem("VOLUME_TRIGGER_ENABLED", val.toString());
        setVolumeTrigger(val);
        DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");

        try {
            const id = await AsyncStorage.getItem("userId");
            if (id) {
                await ProfileService.saveHardwareTrigger(id, val, "double_press");
            }
        } catch (error) {
            console.log("Failed to sync volume trigger setting:", error);
        }
    };

    const handleAppLockToggle = async (value: boolean) => {
        setIsAppLockEnabled(value);
        if (!value) {
            setLockType(null);
        }
        await AppLockStorage.setEnabled(value);
    };

    const handleKeywordToggle = async (value: boolean) => {
        setKeywordEnabled(value);
        await AsyncStorage.setItem("KEYWORD_DETECTION_ENABLED", value.toString());
        DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");
    };

    const handleShakeToggle = async (value: boolean) => {
        setShakeEnabled(value);
        await AsyncStorage.setItem("SHAKE_DETECTION_ENABLED", value.toString());
        DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");
    };

    const handleShakeSensitivityChange = async (value: number) => {
        setShakeLevel(value);
        await AsyncStorage.setItem("SHAKE_SENSITIVITY", value.toString());
        DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");
    };

    const handleAutoSirenToggle = async (value: boolean) => {
        setAutoSiren(value);
        await AsyncStorage.setItem("AUTO_SIREN_ENABLED", value.toString());
        DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");
    };

    const handleLoopAudioToggle = async (value: boolean) => {
        setLoopAudio(value);
        await AsyncStorage.setItem("LOOP_AUDIO_ENABLED", value.toString());
        DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");
    };

    const handleStealthModeToggle = async (value: boolean) => {
        setStealthMode(value);
        await AsyncStorage.setItem("STEALTH_MODE_ENABLED", value.toString());
        DeviceEventEmitter.emit("STATUS_TOGGLE_CHANGED");
    };

    const handleSetPin = async () => {
        setIsAppLockEnabled(true);
        setLockType("PIN");
        await AppLockStorage.preparePinSelection();
        router.push("/set-pin");
    };

    const handleSetPattern = async () => {
        setIsAppLockEnabled(true);
        setLockType("PATTERN");
        await AppLockStorage.preparePatternSelection();
        router.push("/set-pattern");
    };

    useEffect(() => {
        loadSettings().catch((error) => {
            console.log("Failed to load settings:", error);
        });
    }, [loadSettings]);

    useFocusEffect(
        useCallback(() => {
            loadSettings().catch((error) => {
                console.log("Failed to refresh settings:", error);
            });
        }, [loadSettings])
    );


    return (
        <View style={{ flex: 1 }}>

            <ScrollView
                style={styles.container}
                contentContainerStyle={{ paddingBottom: 120 }}
            >

                {/* HEADER */}
                <View style={styles.header}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <TouchableOpacity onPress={() => router.back()}>
                            <MaterialIcons name="arrow-back-ios" size={24} color="#EC1313" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Settings</Text>
                    </View>
                    <MaterialIcons name="help-outline" size={22} color="#AAA" />
                </View>

                {/* KEYWORD SETUP */}
                {/* KEYWORD SETUP */}
                <Section title="KEYWORD SETUP">

                    <Row
                        icon="keyboard-voice"
                        label="Enable Keyword Detection"
                        value={keywordEnabled}
                        onValueChange={handleKeywordToggle}
                    />

                    {keywordEnabled && (
                        <>
                            <TouchableOpacity
                                style={styles.keywordOption}
                                onPress={() => router.push("/high-risk")}
                            >
                                <MaterialIcons name="warning" size={22} color="#EC1313" />
                                <Text style={styles.keywordText}>High Risk Keywords</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.keywordOption}
                                onPress={() => router.push("/low-risk")}
                            >
                                <MaterialIcons name="info" size={22} color="#FFA500" />
                                <Text style={styles.keywordText}>Low Risk Keywords</Text>
                            </TouchableOpacity>
                        </>
                    )}

                </Section>

                {/* HARDWARE SETUP */}
                <Section title="HARDWARE SETUP">
                    <Row
                        icon="volume-up"
                        label="Volume Button Trigger"
                        value={volumeTrigger}
                        onValueChange={handleVolumeToggle}
                    />
                    {volumeTrigger && (
                        <TouchableOpacity
                            style={styles.keywordOption}
                            onPress={() => router.push("/hardware-trigger")}
                        >
                            <MaterialIcons name="devices" size={22} color="#EC1313" />
                            <Text style={styles.keywordText}>Hardware Trigger Settings</Text>
                        </TouchableOpacity>
                    )}
                    <Row
                        icon="vibration"
                        label="Shake Detection"
                        value={shakeEnabled}
                        onValueChange={handleShakeToggle}
                    />
                    {!shakeEnabled && (
                        <Text style={styles.helperText}>
                            Enable this option if you want the sensors to detect abnormal movement.
                        </Text>
                    )}

                    <View style={{ paddingHorizontal: 15 }}>
                        <Text style={styles.sliderLabel}>Shake Sensitivity</Text>
                        <Slider
                            minimumValue={0}
                            maximumValue={1}
                            value={shakeLevel}
                            onSlidingComplete={handleShakeSensitivityChange}
                            minimumTrackTintColor="#EC1313"
                            maximumTrackTintColor="#444"
                        />
                    </View>
                </Section>

                {/* AUDIO SETTINGS */}
                <Section title="AUDIO SETTINGS">
                    <Row
                        icon="campaign"
                        label="Auto-play Siren"
                        value={autoSiren}
                        onValueChange={handleAutoSirenToggle}
                    />
                    <Row
                        icon="loop"
                        label="Loop Alert Audio"
                        value={loopAudio}
                        onValueChange={handleLoopAudioToggle}
                    />
                </Section>

                {/* SECURITY SETTINGS */}
                <Section title="SECURITY SETTINGS">
                    <Row
                        icon="lock"
                        label="PIN Protection"
                        value={isAppLockEnabled}
                        onValueChange={handleAppLockToggle}
                    />
                    {isAppLockEnabled && (
                        <>
                            <TouchableOpacity
                                style={styles.keywordOption}
                                onPress={handleSetPin}
                            >
                                <MaterialIcons name="pin" size={22} color="#EC1313" />
                                <Text style={styles.keywordText}>Set PIN</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.keywordOption}
                                onPress={handleSetPattern}
                            >
                                <MaterialIcons name="gesture" size={22} color="#EC1313" />
                                <Text style={styles.keywordText}>Set Pattern</Text>
                            </TouchableOpacity>

                            <View style={styles.appLockStatus}>
                                <Text style={styles.appLockStatusText}>
                                    {lockType ? `Current: ${lockType}` : "Current: Not Set"}
                                </Text>
                            </View>
                        </>
                    )}
                    <Row
                        icon="visibility-off"
                        label="Stealth Mode"
                        value={stealthMode}
                        onValueChange={handleStealthModeToggle}
                    />
                </Section>

                <Text style={styles.footer}>
                    Stay Protected • SHIELD Safety App
                </Text>

            </ScrollView>

            {/* BOTTOM NAVIGATION */}
            <View style={styles.navBar}>
                <NavItem
                    icon="home"
                    label="Home"
                    onPress={() => router.replace("/dashboard")}
                />
                <NavItem
                    icon="group"
                    label="Contacts"
                    onPress={() => router.push("/contacts")}
                />
                <NavItem
                    icon="map"
                    label="SafeMap"
                    onPress={() => router.push("/safemap")}
                />
                <NavItem
                    icon="settings"
                    label="Settings"
                    active
                />
            </View>

        </View>
    );
}

/* ---------- COMPONENTS ---------- */

const Section = ({ title, children }: any) => (
    <View style={{ marginBottom: 30 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.card}>{children}</View>
    </View>
);

const Row = ({ icon, label, value, onValueChange }: any) => (
    <View style={styles.row}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <MaterialIcons name={icon} size={20} color="#AAA" />
            <Text style={{ color: "#fff" }}>{label}</Text>
        </View>
        <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ true: "#EC1313" }}
            thumbColor="#fff"
        />
    </View>
);

const NavItem = ({ icon, label, active, onPress }: any) => (
    <TouchableOpacity style={styles.navItem} onPress={onPress}>
        <MaterialIcons
            name={icon}
            size={24}
            color={active ? "#EC1313" : "#777"}
        />
        <Text
            style={[
                styles.navLabel,
                { color: active ? "#EC1313" : "#777" },
            ]}
        >
            {label}
        </Text>
    </TouchableOpacity>
);
/* ---------- STYLES ---------- */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#221610",
        padding: 20,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 30,
    },
    headerTitle: {
        color: "#fff",
        fontSize: 22,
        fontWeight: "bold",
    },
    sectionTitle: {
        color: "#EC1313",
        fontSize: 12,
        fontWeight: "bold",
        marginBottom: 10,
    },
    card: {
        backgroundColor: "#2D1F18",
        borderRadius: 16,
        padding: 15,
        gap: 15,
    },
    avatar: {
        alignSelf: "center",
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: "rgba(236,19,19,0.2)",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
    },
    input: {
        backgroundColor: "#221610",
        padding: 12,
        borderRadius: 10,
        color: "#fff",
    },
    primaryBtn: {
        backgroundColor: "#EC1313",
        padding: 14,
        borderRadius: 12,
        alignItems: "center",
    },
    primaryText: {
        color: "#fff",
        fontWeight: "bold",
    },
    row: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 5,
    },
    sliderLabel: {
        color: "#AAA",
        fontSize: 12,
        marginBottom: 5,
    },
    helperText: {
        color: "#AAA",
        fontSize: 12,
        lineHeight: 18,
        paddingHorizontal: 15,
        marginTop: -4,
    },
    resetBtn: {
        marginTop: 10,
        borderColor: "#EC1313",
        borderWidth: 1,
        padding: 15,
        borderRadius: 16,
        flexDirection: "row",
        justifyContent: "center",
        gap: 10,
    },
    resetText: {
        color: "#EC1313",
        fontWeight: "bold",
    },
    footer: {
        textAlign: "center",
        marginTop: 30,
        color: "#555",
        fontSize: 10,
    },
    navBar: {
        position: "absolute",
        bottom: 0,
        width: "100%",
        height: 80,
        backgroundColor: "#221610",
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.1)",
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
    },

    navItem: {
        alignItems: "center",
    },

    navLabel: {
        fontSize: 10,
        marginTop: 2,
    },
    keywordOption: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: "#3A2720",
        padding: 15,
        borderRadius: 12,
        marginTop: 10,
    },

    keywordText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    appLockStatus: {
        backgroundColor: "#3A2720",
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderRadius: 12,
        marginTop: 10,
    },
    appLockStatusText: {
        color: "#EC1313",
        fontSize: 13,
        fontWeight: "700",
    },
});
