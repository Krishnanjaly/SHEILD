import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
} from "react-native";
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EmergencyService } from "../services/EmergencyService";

export default function EmergencyScreen() {
    const router = useRouter();
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Fade in animation
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
        }).start();
    }, []);

    const handleSafe = async () => {
        const email = await AsyncStorage.getItem("userEmail");
        const userId = await AsyncStorage.getItem("userId");
        const userName =
            (await AsyncStorage.getItem("userName")) ||
            (await AsyncStorage.getItem("userFullName")) ||
            email;

        try {
            const result = await EmergencyService.sendSafeSmsAlert({
                userId,
                email,
                userName,
            });
            console.log("Safe SMS Response:", result);

            if (!result.success) {
                alert(result.message || "Failed to notify contacts");
                return;
            }

            alert("Safe message sent to contacts");
            router.replace("/dashboard");

        } catch (err) {
            console.log("Cancel SOS Error:", err);
            alert("Server error while cancelling SOS");
        }
    };

    return (
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.logo}>SHIELD</Text>
            </View>

            {/* Center Content */}
            <View style={styles.center}>
                <Text style={styles.emergencyText}>
                    🚨 EMERGENCY ALERT SENT
                </Text>

                <Text style={styles.subText}>
                    Your trusted contacts have been notified.
                </Text>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <TouchableOpacity style={styles.safeButton} onPress={handleSafe}>
                    <Text style={styles.safeText}>I&apos;M SAFE</Text>
                </TouchableOpacity>

                <Text style={styles.helperText}>
                    Tap if you are safe to notify your contacts.
                </Text>
            </View>

        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#181111",
        justifyContent: "space-between",
        padding: 20,
    },

    header: {
        paddingTop: 60,
        alignItems: "center",
        opacity: 0.5,
    },

    logo: {
        color: "#fff",
        letterSpacing: 4,
        fontWeight: "bold",
    },

    center: {
        alignItems: "center",
    },

    emergencyText: {
        fontSize: 28,
        fontWeight: "900",
        textAlign: "center",
        color: "#ff2e2e",
        textShadowColor: "rgba(255,0,0,0.8)",
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 15,
    },

    subText: {
        marginTop: 15,
        fontSize: 16,
        color: "#ccc",
        textAlign: "center",
    },

    footer: {
        alignItems: "center",
        paddingBottom: 60,
    },

    safeButton: {
        backgroundColor: "#27ae60",
        width: "100%",
        paddingVertical: 18,
        borderRadius: 50,
        alignItems: "center",
        shadowColor: "#27ae60",
        shadowOpacity: 0.6,
        shadowRadius: 10,
        elevation: 10,
    },

    safeText: {
        color: "#fff",
        fontSize: 20,
        fontWeight: "bold",
        letterSpacing: 1,
    },

    helperText: {
        marginTop: 15,
        fontSize: 13,
        color: "#777",
        textAlign: "center",
    },
});
