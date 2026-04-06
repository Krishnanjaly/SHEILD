import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

export default function About() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <MaterialIcons name="arrow-back" size={24} color="#fff" />
                    </TouchableOpacity>

                    <Text style={styles.headerTitle}>About SHIELD</Text>

                    <MaterialIcons name="info-outline" size={22} color="#EC1313" />
                </View>

                {/* Hero Section */}
                <View style={styles.hero}>
                    <View style={styles.glowBackground} />
                    <View style={styles.shieldWrapper}>
                        <MaterialIcons name="shield" size={60} color="#EC1313" />
                    </View>

                    <Text style={styles.appName}>SHIELD</Text>
                    <Text style={styles.tagline}>
                        AI Powered Personal Safety
                    </Text>
                    <Text style={styles.quote}>
                        &quot;Protecting you silently. Acting instantly.&quot;
                    </Text>
                </View>

                {/* Description Card */}
                <View style={styles.card}>
                    <View style={styles.cardTitleRow}>
                        <MaterialIcons name="security" size={22} color="#EC1313" />
                        <Text style={styles.cardTitle}>Intelligent Protection</Text>
                    </View>

                    <Text style={styles.cardText}>
                        SHIELD&apos;s advanced monitoring, instant alerts,
                        and real-time location sharing ensure you&apos;re never
                        alone. Featuring hardware triggers and AI-driven
                        analysis for proactive safety, SHIELD listens
                        for distress signals and responds in milliseconds.
                    </Text>
                </View>

                {/* Core Features */}
                <Text style={styles.sectionTitle}>Core Features</Text>

                <View style={styles.featureGrid}>
                    <Feature icon="sos" label="Emergency SOS" />
                    <Feature icon="location-on" label="Live Location" />
                    <Feature icon="settings-remote" label="Hardware Trigger" />
                    <Feature icon="psychology" label="AI Guardian" />
                    <Feature icon="group" label="Trusted Contacts" />
                </View>

                {/* Developer Card */}
                <View style={styles.infoCard}>
                    <Text style={styles.infoTitle}>Project Information</Text>

                    <InfoRow label="Developer" value="SHIELD" />
                    <InfoRow label="Type" value="Safety Infrastructure" />

                    <Text style={styles.techTitle}>Tech Stack</Text>
                    <View style={styles.techRow}>
                        <TechTag label="React Native" />
                        <TechTag label="Expo" />
                        <TechTag label="Node.js" />
                        <TechTag label="MySQL" />
                    </View>
                </View>

                {/* Version Info */}
                <View style={styles.versionSection}>
                    <Text style={styles.versionText}>
                        Version 1.0.0  •  Production Build
                    </Text>
                </View>

            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
                <View style={styles.footerLine} />
                <Text style={styles.footerText}>
                    Powered by SHIELD AI Safety Engine
                </Text>
            </View>

        </SafeAreaView>
    );
}

/* ---------- Small Components ---------- */

const Feature = ({ icon, label }: any) => (
    <View style={styles.featureCard}>
        <MaterialIcons name={icon} size={22} color="#EC1313" />
        <Text style={styles.featureLabel}>{label}</Text>
    </View>
);

const InfoRow = ({ label, value }: any) => (
    <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
    </View>
);

const TechTag = ({ label }: any) => (
    <View style={styles.techTag}>
        <Text style={styles.techText}>{label}</Text>
    </View>
);

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#181111",
    },

    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(236,19,19,0.1)",
    },

    headerTitle: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "bold",
    },

    hero: {
        alignItems: "center",
        paddingVertical: 40,
    },

    glowBackground: {
        position: "absolute",
        width: 160,
        height: 160,
        backgroundColor: "rgba(236,19,19,0.3)",
        borderRadius: 100,
        shadowColor: "#EC1313",
        shadowOpacity: 0.8,
        shadowRadius: 40,
        elevation: 20, // Android
    },

    shieldWrapper: {
        backgroundColor: "#2a1b1b",
        padding: 25,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: "rgba(236,19,19,0.3)",
        shadowColor: "#EC1313",
        shadowOpacity: 0.6,
        shadowRadius: 15,
    },

    appName: {
        fontSize: 28,
        color: "#fff",
        fontWeight: "bold",
        marginTop: 20,
    },

    tagline: {
        color: "#EC1313",
        fontWeight: "600",
        marginTop: 5,
    },

    quote: {
        color: "#aaa",
        fontStyle: "italic",
        marginTop: 10,
    },

    card: {
        backgroundColor: "#2a1b1b",
        marginHorizontal: 20,
        borderRadius: 20,
        padding: 20,
        marginBottom: 30,
        borderWidth: 1,
        borderColor: "rgba(236,19,19,0.1)",
    },

    cardTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 10,
    },

    cardTitle: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 16,
    },

    cardText: {
        color: "#ccc",
        fontSize: 13,
        lineHeight: 20,
    },

    sectionTitle: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "bold",
        marginLeft: 20,
        marginBottom: 15,
    },

    featureGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        marginBottom: 30,
    },

    featureCard: {
        width: "48%",
        backgroundColor: "#2a1b1b",
        padding: 20,
        borderRadius: 16,
        marginBottom: 12,
    },

    featureLabel: {
        color: "#fff",
        marginTop: 8,
        fontSize: 12,
    },

    infoCard: {
        backgroundColor: "rgba(42,27,27,0.4)",
        marginHorizontal: 20,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: "#2f1c1c",
    },

    infoTitle: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "bold",
        marginBottom: 15,
    },

    infoRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 10,
    },

    infoLabel: {
        color: "#aaa",
    },

    infoValue: {
        color: "#fff",
        fontWeight: "500",
    },

    techTitle: {
        color: "#aaa",
        marginTop: 10,
        marginBottom: 5,
    },

    techRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 6,
    },

    techTag: {
        backgroundColor: "rgba(236,19,19,0.1)",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        marginRight: 5,
        marginTop: 5,
    },

    techText: {
        color: "#EC1313",
        fontSize: 10,
        fontWeight: "bold",
    },

    versionSection: {
        alignItems: "center",
        marginTop: 30,
    },

    versionText: {
        color: "#777",
        fontSize: 12,
    },

    footer: {
        position: "absolute",
        bottom: 0,
        width: "100%",
        padding: 15,
        backgroundColor: "#181111",
        borderTopWidth: 1,
        borderTopColor: "rgba(236,19,19,0.2)",
        alignItems: "center",
    },

    footerLine: {
        width: 80,
        height: 4,
        backgroundColor: "#EC1313",
        borderRadius: 10,
        marginBottom: 8,
    },

    footerText: {
        color: "#777",
        fontSize: 10,
        letterSpacing: 1,
    },
});
