import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";


export default function Guardian() {
    const router = useRouter();
    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        style={styles.backButton}
                    >
                        <MaterialIcons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>

                    <Text style={styles.headerTitle}>AI Guardian</Text>

                    <View style={styles.robotIcon}>
                        <MaterialIcons name="security" size={20} color="#EC1313" />
                    </View>
                </View>

                {/* Hero Section */}
                <View style={styles.hero}>
                    <View style={styles.orbGlow} />
                    <View style={styles.orbOuter}>
                        <View style={styles.orbInner}>
                            <LinearGradient
                                colors={["#EC1313", "#ff6a00"]}
                                style={styles.orbCore}
                            />
                            <MaterialCommunityIcons
                                name="shield"
                                size={40}
                                color="#fff"
                                style={{ position: "absolute" }}
                            />
                        </View>
                    </View>

                    <Text style={styles.monitorTitle}>AI Monitoring Active</Text>
                    <Text style={styles.monitorSubtitle}>
                        Analyzing environment for anomalies
                    </Text>
                </View>

                {/* Indicators */}
                <View style={styles.card}>
                    <Indicator label="Microphone" status="Listening" />
                    <Indicator label="Location" status="Tracking" />
                    <Indicator label="Motion Sensors" status="Active" />
                    <Indicator label="Volume Pattern" status="Armed" danger />
                </View>

                {/* Threat Section */}
                <View style={styles.threatCard}>
                    <Text style={styles.threatTitle}>
                        Threat Assessment Engine
                    </Text>

                    <View style={styles.threatRow}>
                        <Text style={styles.threatPercent}>12%</Text>
                        <Text style={styles.lowRisk}>Low Risk</Text>
                    </View>

                    <View style={styles.progressBar}>
                        <View style={styles.progressFill} />
                    </View>
                </View>

                {/* Observations */}
                <View style={{ marginTop: 20 }}>
                    <Text style={styles.sectionLabel}>
                        Recent AI Observations
                    </Text>

                    <Observation
                        text="No unusual motion patterns detected in the last 30 mins."
                        time="2 MINUTES AGO"
                    />
                    <Observation
                        text="Background noise levels are within normal safety range."
                        time="5 MINUTES AGO"
                    />
                </View>

                {/* Emergency Button */}
                <TouchableOpacity style={styles.emergencyButton}>
                    <MaterialIcons name="warning" size={22} color="#fff" />
                    <Text style={styles.emergencyText}>
                        Force AI Emergency Mode
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

/* ---------------- COMPONENTS ---------------- */

function Indicator({ label, status, danger }: any) {
    return (
        <View style={styles.indicatorRow}>
            <Text style={styles.indicatorLabel}>{label}</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.indicatorStatus}>{status}</Text>
                <View
                    style={[
                        styles.dot,
                        { backgroundColor: danger ? "#EC1313" : "#22c55e" },
                    ]}
                />
            </View>
        </View>
    );
}

function Observation({ text, time }: any) {
    return (
        <View style={styles.observationCard}>
            <MaterialIcons name="check-circle" size={20} color="#EC1313" />
            <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.observationText}>{text}</Text>
                <Text style={styles.observationTime}>{time}</Text>
            </View>
        </View>
    );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#181111",
        paddingHorizontal: 20,
    },

    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 20,
    },

    headerTitle: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "bold",
    },

    robotIcon: {
        backgroundColor: "rgba(236,19,19,0.2)",
        padding: 8,
        borderRadius: 20,
    },

    hero: {
        alignItems: "center",
        marginTop: 10,
    },

    orbGlow: {
        position: "absolute",
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: "rgba(236,19,19,0.2)",
    },

    orbOuter: {
        width: 150,
        height: 150,
        borderRadius: 75,
        borderWidth: 2,
        borderColor: "rgba(236,19,19,0.4)",
        justifyContent: "center",
        alignItems: "center",
    },

    orbInner: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: "center",
        alignItems: "center",
    },

    orbCore: {
        width: 90,
        height: 90,
        borderRadius: 45,
        opacity: 0.8,
    },

    monitorTitle: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "bold",
        marginTop: 15,
    },

    monitorSubtitle: {
        color: "#aaa",
        fontSize: 12,
        marginTop: 5,
    },

    card: {
        backgroundColor: "#2a1b1b",
        borderRadius: 16,
        padding: 15,
        marginTop: 25,
    },

    indicatorRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 10,
    },

    indicatorLabel: {
        color: "#ddd",
        fontSize: 14,
    },

    indicatorStatus: {
        color: "#888",
        fontSize: 12,
        marginRight: 8,
    },

    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },

    threatCard: {
        backgroundColor: "#2a1b1b",
        borderRadius: 16,
        padding: 15,
        marginTop: 25,
    },

    threatTitle: {
        color: "#fff",
        fontWeight: "bold",
        marginBottom: 10,
    },

    threatRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
    },

    threatPercent: {
        color: "#fff",
        fontSize: 28,
        fontWeight: "bold",
    },

    lowRisk: {
        color: "#22c55e",
        fontWeight: "bold",
    },

    progressBar: {
        height: 8,
        backgroundColor: "#333",
        borderRadius: 10,
        marginTop: 10,
        overflow: "hidden",
    },

    progressFill: {
        width: "12%",
        height: "100%",
        backgroundColor: "#EC1313",
    },

    sectionLabel: {
        color: "#888",
        fontSize: 12,
        fontWeight: "bold",
        marginBottom: 10,
    },

    observationCard: {
        flexDirection: "row",
        backgroundColor: "#222",
        padding: 12,
        borderRadius: 12,
        marginBottom: 10,
    },

    observationText: {
        color: "#ddd",
        fontSize: 13,
    },
    backButton: {
        padding: 8,
        borderRadius: 20,
    },

    observationTime: {
        color: "#666",
        fontSize: 10,
        marginTop: 4,
    },

    emergencyButton: {
        backgroundColor: "#EC1313",
        paddingVertical: 18,
        borderRadius: 20,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 30,
    },

    emergencyText: {
        color: "#fff",
        fontWeight: "bold",
        marginLeft: 10,
    },
});