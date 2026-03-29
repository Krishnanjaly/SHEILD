import React, { useEffect, useState, useCallback } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
    Share,
    Dimensions,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import QRCode from "react-native-qrcode-svg";
import BASE_URL from "../config/api";
import * as Clipboard from 'expo-clipboard';

const { width } = Dimensions.get("window");

export default function QRPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [contactsCount, setContactsCount] = useState(0);
    const [qrUrl, setQrUrl] = useState<string | null>(null);
    const [isSetupComplete, setIsSetupComplete] = useState(false);
    const [qrError, setQrError] = useState<string | null>(null);

    const loadData = useCallback(async (isRegenerating = false) => {
        if (!isRegenerating) setLoading(true);
        try {
            setQrError(null);
            const storedId = await AsyncStorage.getItem("userId");
            const storedEmail = await AsyncStorage.getItem("userEmail");
            
            if (!storedEmail) {
                setLoading(false);
                setIsSetupComplete(false);
                return;
            }

            setUserId(storedId);
            setUserEmail(storedEmail);

            // 1. Fetch contacts from both systems to validate setup
            const [oldContactRes, trustedContactRes] = await Promise.all([
                fetch(`${BASE_URL}/contacts/${storedEmail}`),
                fetch(`${BASE_URL}/getTrustedContacts/${storedId}`)
            ]);
            
            const oldData = await oldContactRes.json();
            const trustedData = await trustedContactRes.json();
            
            // Handle different API response formats
            const oldContactsList = Array.isArray(oldData) ? oldData : (Array.isArray(oldData.contacts) ? oldData.contacts : []);
            const trustedContactsList = Array.isArray(trustedData) ? trustedData : [];
            
            const count = oldContactsList.length + trustedContactsList.length;
            setContactsCount(count);

            // 2. Determine if setup is complete
            const setupDone = count > 0 && storedId !== null && storedEmail !== null;
            setIsSetupComplete(setupDone);

            // 3. If setup is complete, fetch/generate QR using numeric userId
            if (setupDone && storedId) {
                const qrRes = await fetch(`${BASE_URL}/generate-qr/${storedId}`);
                if (qrRes.ok) {
                    const qrData = await qrRes.json();
                    setQrUrl(qrData.qrUrl);
                } else {
                    const qrData = await qrRes.json().catch(() => null);
                    setQrUrl(null);
                    setQrError(qrData?.message || "Failed to generate QR link.");
                    console.error("Failed to fetch QR, status:", qrRes.status);
                }
            }
        } catch (error) {
            console.error("QR Load Error:", error);
            setQrUrl(null);
            setQrError("Could not prepare QR. Please check your connection.");
            Alert.alert("Error", "Could not prepare QR. Please check your connection.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleShare = async () => {
        if (!qrUrl) return;
        try {
            await Share.share({
                message: `My SHIELD Emergency Access link: ${qrUrl}`,
                url: qrUrl,
                title: "SHIELD Emergency QR"
            });
        } catch (error) {
            console.log("Share Error:", error);
        }
    };

    const handleCopy = async () => {
        if (!qrUrl) return;
        await Clipboard.setStringAsync(qrUrl);
        Alert.alert("Success", "Link copied to clipboard!");
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color="#ec1313" />
                <Text style={styles.loadingText}>Preparing QR...</Text>
            </View>
        );
    }

    // --- EMPTY STATE (SETUP INCOMPLETE) ---
    if (!isSetupComplete) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <MaterialIcons name="arrow-back" size={24} color="#aaa" />
                    </TouchableOpacity>
                    <View style={{ marginLeft: 15 }}>
                        <Text style={styles.headerTitle}>QR Emergency Access</Text>
                        <Text style={styles.headerSub}>Setup required</Text>
                    </View>
                </View>

                <View style={styles.content}>
                    <View style={styles.iconCircle}>
                        <MaterialIcons name="error-outline" size={60} color="#555" />
                    </View>

                    <Text style={styles.title}>Complete setup to enable QR</Text>
                    <Text style={styles.subtitle}>
                        {!userEmail 
                            ? "You need to log in or set your email first." 
                            : "You need at least one trusted contact to use the Emergency QR."}
                    </Text>

                    <TouchableOpacity
                        style={styles.button}
                        onPress={() => router.push("/contacts")}
                    >
                        <Text style={styles.buttonText}>Go to Setup</Text>
                        <MaterialIcons name="chevron-right" size={18} color="#fff" />
                    </TouchableOpacity>

                    <View style={styles.qrPlaceholder}>
                        {[...Array(16)].map((_, i) => (
                            <View key={i} style={styles.qrBox} />
                        ))}
                    </View>
                </View>
            </View>
        );
    }

    // --- ACTIVE QR UI ---
    return (
        <View style={styles.container}>
            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <MaterialIcons name="arrow-back" size={24} color="#aaa" />
                </TouchableOpacity>

                <View style={{ marginLeft: 15 }}>
                    <Text style={styles.headerTitle}>QR Emergency Access</Text>
                    <Text style={styles.headerSub}>Active & Ready</Text>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.qrSection}>
                    <View style={styles.qrContainer}>
                        {qrUrl && (
                            <QRCode
                                value={qrUrl}
                                size={width * 0.55}
                                color="#fff"
                                backgroundColor="transparent"
                            />
                        )}
                        {!qrUrl && (
                            <View style={styles.qrMissingState}>
                                <MaterialIcons name="qr-code-2" size={52} color="#666" />
                                <Text style={styles.qrMissingText}>
                                    {qrError || "QR link is not available yet."}
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.scanHint}>Scan to send emergency alert</Text>
                </View>

                {/* ACTION BUTTONS */}
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                        <MaterialIcons name="share" size={22} color="#fff" />
                        <Text style={styles.actionText}>Share Link</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.actionButton} onPress={handleCopy}>
                        <MaterialIcons name="content-copy" size={22} color="#fff" />
                        <Text style={styles.actionText}>Copy Link</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={[styles.actionButton, {backgroundColor: "#2a1b1b"}]} 
                        onPress={() => loadData(true)}
                    >
                        <MaterialIcons name="refresh" size={22} color="#ec1313" />
                        <Text style={[styles.actionText, {color: "#ec1313"}]}>Refresh</Text>
                    </TouchableOpacity>
                </View>

                {/* SAFETY WARNING CARD */}
                <View style={styles.warningCard}>
                    <MaterialIcons name="report-problem" size={24} color="#eab308" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.warningTitle}>Safety Warning</Text>
                        <Text style={styles.warningText}>
                            QR code does not auto-trigger SOS. The scanner must confirm the action on our web page before alerts are sent.
                        </Text>
                    </View>
                </View>

                <View style={[styles.warningCard, { borderColor: "#444", backgroundColor: "#1a1616" }]}>
                    <MaterialIcons name="info-outline" size={24} color="#888" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.warningTitle, {color: "#aaa"}]}>How it works</Text>
                        <Text style={[styles.warningText, {color: "#777"}]}>
                            Carry this code (on your lock screen or printed) so bystanders can notify your family even if your phone is locked or out of reach.
                        </Text>
                    </View>
                </View>

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#181111",
        paddingTop: 30,
    },
    center: {
        justifyContent: "center",
        alignItems: "center",
    },
    loadingText: {
        color: "#aaa",
        marginTop: 15,
        fontSize: 14,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingBottom: 20,
        paddingTop: 10,
        borderBottomWidth: 1,
        borderBottomColor: "rgba(236,19,19,0.1)",
    },
    headerTitle: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "bold",
    },
    headerSub: {
        color: "#aaa",
        fontSize: 12,
    },
    content: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 30,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    qrSection: {
        alignItems: "center",
        marginTop: 40,
        marginBottom: 30,
    },
    qrContainer: {
        padding: 20,
        backgroundColor: "rgba(255,255,255,0.05)",
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        minWidth: width * 0.65,
        minHeight: width * 0.65,
        alignItems: "center",
        justifyContent: "center",
    },
    qrMissingState: {
        width: width * 0.55,
        minHeight: width * 0.55,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        paddingHorizontal: 16,
    },
    qrMissingText: {
        color: "#888",
        fontSize: 13,
        textAlign: "center",
        lineHeight: 18,
    },
    scanHint: {
        color: "#aaa",
        marginTop: 20,
        fontSize: 14,
        fontWeight: "500",
    },
    iconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        borderStyle: "dashed",
        borderColor: "#444",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 30,
    },
    title: {
        color: "#ddd",
        fontSize: 18,
        fontWeight: "bold",
        textAlign: "center",
        marginBottom: 10,
    },
    subtitle: {
        color: "#888",
        fontSize: 13,
        textAlign: "center",
        marginBottom: 30,
        lineHeight: 20,
    },
    button: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#ec1313",
        paddingVertical: 14,
        paddingHorizontal: 30,
        borderRadius: 12,
        marginBottom: 40,
    },
    buttonText: {
        color: "#fff",
        fontWeight: "bold",
        fontSize: 16,
        marginRight: 8,
    },
    qrPlaceholder: {
        width: 140,
        height: 140,
        flexDirection: "row",
        flexWrap: "wrap",
        opacity: 0.05,
    },
    qrBox: {
        width: "25%",
        height: "25%",
        borderWidth: 1,
        borderColor: "#777",
    },
    actionRow: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 12,
        paddingHorizontal: 20,
        marginBottom: 30,
    },
    actionButton: {
        backgroundColor: "#ec1313",
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
    },
    actionText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "bold",
        marginTop: 5,
    },
    warningCard: {
        flexDirection: "row",
        backgroundColor: "rgba(234,179,8,0.05)",
        borderWidth: 1,
        borderColor: "rgba(234,179,8,0.2)",
        marginHorizontal: 20,
        padding: 18,
        borderRadius: 15,
        marginBottom: 15,
    },
    warningTitle: {
        color: "#eab308",
        fontWeight: "bold",
        fontSize: 14,
        marginBottom: 4,
    },
    warningText: {
        color: "rgba(255,255,255,0.6)",
        fontSize: 12,
        lineHeight: 18,
    },
});
