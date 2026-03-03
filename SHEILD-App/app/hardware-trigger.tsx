import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Switch,
    ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { useRouter } from "expo-router";

export default function HardwareTrigger() {
    const router = useRouter();
    const [enabled, setEnabled] = useState(true);

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

                {/* Configuration Card */}
                <View style={styles.configCard}>
                    <View>
                        <Text style={styles.configTitle}>
                            Silent Activation
                        </Text>
                        <Text style={styles.configSub}>
                            Enable hardware trigger response
                        </Text>
                    </View>

                    <Switch
                        value={enabled}
                        onValueChange={setEnabled}
                        trackColor={{ true: "#EC1313" }}
                        thumbColor="#fff"
                    />
                </View>

                {/* Instruction List */}
                <View style={styles.instructionCard}>
                    <InstructionItem
                        icon="touch-app"
                        title="Custom Pattern"
                        description="Default: Up-Up-Down-Down"
                    />

                    <InstructionItem
                        icon="notifications-off"
                        title="Silent Mode"
                        description="No visual or audio alerts on phone"
                    />
                </View>

                {/* Save Button */}
                <TouchableOpacity style={styles.saveButton}>
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

const InstructionItem = ({ icon, title, description }: any) => (
    <View style={styles.instructionRow}>
        <View style={styles.iconBox}>
            <MaterialIcons name={icon} size={22} color="#aaa" />
        </View>
        <View>
            <Text style={styles.instructionTitle}>{title}</Text>
            <Text style={styles.instructionDesc}>{description}</Text>
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