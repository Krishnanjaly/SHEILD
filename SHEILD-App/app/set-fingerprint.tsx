import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import { AppLockStorage } from "../services/AppLockStorage";

type ScanStatus = "idle" | "scanning" | "success" | "error";

const progressSegments = Array.from({ length: 5 }, (_, index) => index);

export default function SetFingerprintScreen() {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [failureCount, setFailureCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Waiting for input");
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const activeSegments = useMemo(() => {
    if (progress >= 100) return 5;
    if (progress >= 80) return 4;
    if (progress >= 60) return 3;
    if (progress >= 40) return 2;
    if (progress >= 20) return 1;
    return 0;
  }, [progress]);

  const resetState = () => {
    setIsScanning(false);
    setProgress(0);
    setScanStatus("idle");
    setStatusMessage("Waiting for input");
  };

  const stopProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const startProgress = () => {
    stopProgress();
    setProgress(0);
    progressIntervalRef.current = setInterval(() => {
      setProgress((current) => {
        if (current >= 92) {
          return current;
        }
        return current + 4;
      });
    }, 120);
  };

  useEffect(() => {
    const checkBiometricAvailability = async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();

        if (!hasHardware) {
          setScanStatus("error");
          setStatusMessage("Fingerprint not supported on this device");
          Alert.alert("Fingerprint Error", "Fingerprint not supported on this device");
          return;
        }

        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!isEnrolled) {
          setScanStatus("error");
          setStatusMessage("No fingerprint found");
          Alert.alert(
            "Fingerprint Error",
            "No fingerprint found. Please register fingerprint in device settings"
          );
          return;
        }

        setScanStatus("idle");
        setStatusMessage("Waiting for input");
      } catch (error) {
        console.log("Fingerprint availability check failed:", error);
        setScanStatus("error");
        setStatusMessage("Try again");
      }
    };

    checkBiometricAvailability().catch(() => {});

    return () => {
      isMountedRef.current = false;
      stopProgress();
      resetState();
    };
  }, []);

  const handleStartScan = async () => {
    if (isScanning) {
      return;
    }

    setIsScanning(true);
    setScanStatus("scanning");
    setStatusMessage("Scanning...");
    startProgress();

    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);

      if (!hasHardware) {
        stopProgress();
        setIsScanning(false);
        setScanStatus("error");
        setStatusMessage("Fingerprint not supported on this device");
        Alert.alert("Fingerprint Error", "Fingerprint not supported on this device");
        return;
      }

      if (!isEnrolled) {
        stopProgress();
        setIsScanning(false);
        setScanStatus("error");
        setStatusMessage("No fingerprint found");
        Alert.alert(
          "Fingerprint Error",
          "No fingerprint found. Please register fingerprint in device settings"
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Scan your fingerprint",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });

      stopProgress();

      if (result.success) {
        setProgress(100);
        setScanStatus("success");
        setStatusMessage("Fingerprint captured");
        setFailureCount(0);
        await AppLockStorage.activateFingerprint();
        Alert.alert("Success", "Fingerprint Registered Successfully", [
          {
            text: "OK",
            onPress: () => router.replace("/dashboard"),
          },
        ]);
        return;
      }

      const nextFailureCount = failureCount + 1;
      setFailureCount(nextFailureCount);
      setScanStatus("error");
      setStatusMessage("Try again");
      setProgress(0);

      if (result.error !== "user_cancel" && result.error !== "system_cancel") {
        if (nextFailureCount >= 3) {
          Alert.alert(
            "Authentication failed",
            "Authentication failed. Try again. You can use PIN or Pattern as fallback."
          );
        } else {
          Alert.alert("Authentication failed", "Authentication failed. Try again");
        }
      }
    } catch (error) {
      stopProgress();
      console.log("Fingerprint authentication failed:", error);
      setScanStatus("error");
      setStatusMessage("Try again");
      setProgress(0);
      Alert.alert("Authentication failed", "Authentication failed. Try again");
    } finally {
      if (isMountedRef.current) {
        setIsScanning(false);
      }
    }
  };

  const handleCancel = () => {
    stopProgress();
    resetState();
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.ambientGlowTop} />
      <View style={styles.ambientGlowBottom} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.headerBackButton}
            activeOpacity={0.85}
            onPress={handleCancel}
          >
            <MaterialIcons name="arrow-back" size={24} color="#EC1313" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SECURITY_SCAN</Text>
        </View>
        <Text style={styles.headerStatus}>System: Active</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroSection}>
          <View style={styles.outerRingSmall} />
          <View style={styles.outerRingLarge} />

          <View style={styles.scannerWrap}>
            <View style={styles.progressRing}>
              <View style={styles.progressTrack} />
              <View
                style={[
                  styles.progressArc,
                  { transform: [{ rotate: `${(progress / 100) * 360}deg` }] },
                ]}
              />
            </View>

            <View style={styles.fingerprintShell}>
              <MaterialIcons name="fingerprint" size={92} color="#EC1313" />
              <View style={[styles.scanLine, { top: progress >= 100 ? "50%" : "60%" }]} />
            </View>
          </View>

          <View style={styles.progressCopy}>
            <Text style={styles.progressEyebrow}>
              {scanStatus === "scanning"
                ? "Scanning..."
                : scanStatus === "success"
                  ? "Fingerprint Captured"
                  : statusMessage}
            </Text>
            <View style={styles.progressRow}>
              <Text style={styles.progressValue}>{progress}</Text>
              <Text style={styles.progressLabel}>Percent Complete</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.segmentRow}>
            {progressSegments.map((segment) => (
              <View
                key={`segment-${segment}`}
                style={[
                  styles.segment,
                  segment < activeSegments ? styles.segmentActive : null,
                ]}
              />
            ))}
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <View style={styles.infoIconBox}>
                <MaterialIcons name="verified-user" size={22} color="#EC1313" />
              </View>
              <Text style={styles.infoTitle}>Secure Biometric Access</Text>
            </View>
            <Text style={styles.infoText}>
              Your fingerprint will be securely stored and used to unlock the app instantly.
              Encrypted hardware isolation ensures your data remains local.
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.9} onPress={handleStartScan}>
            <LinearGradient
              colors={["#ec1313", "#930004"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryButtonFill}
            >
              <Text style={styles.primaryButtonText}>{isScanning ? "Scanning..." : "Start Scan"}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.9} onPress={handleCancel}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.navBar}>
        <NavItem icon="shield" label="Core" active={false} />
        <NavItem icon="fingerprint" label="Setup" active />
        <NavItem icon="settings" label="Config" active={false} />
      </View>
    </SafeAreaView>
  );
}

function NavItem({
  icon,
  label,
  active,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  active: boolean;
}) {
  return (
    <View style={[styles.navItem, active ? styles.navItemActive : null]}>
      <MaterialIcons name={icon} size={22} color={active ? "#fff" : "#E9BCB6"} />
      <Text style={[styles.navLabel, active ? styles.navLabelActive : null]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#191212",
  },
  ambientGlowTop: {
    position: "absolute",
    top: -80,
    left: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(236,19,19,0.05)",
  },
  ambientGlowBottom: {
    position: "absolute",
    bottom: -80,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(236,19,19,0.05)",
  },
  header: {
    backgroundColor: "#191212",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(94,63,58,0.15)",
    shadowColor: "#ec1313",
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#EC1313",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerStatus: {
    color: "rgba(233,188,182,0.6)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 120,
  },
  heroSection: {
    alignItems: "center",
    justifyContent: "space-between",
  },
  outerRingSmall: {
    position: "absolute",
    top: 90,
    width: 256,
    height: 256,
    borderRadius: 128,
    borderWidth: 1,
    borderColor: "rgba(236,19,19,0.2)",
  },
  outerRingLarge: {
    position: "absolute",
    top: 42,
    width: 320,
    height: 320,
    borderRadius: 160,
    borderWidth: 1,
    borderColor: "rgba(236,19,19,0.1)",
  },
  scannerWrap: {
    width: 224,
    height: 224,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  progressRing: {
    position: "absolute",
    width: 224,
    height: 224,
    borderRadius: 112,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    position: "absolute",
    width: 208,
    height: 208,
    borderRadius: 104,
    borderWidth: 4,
    borderColor: "#3b3333",
  },
  progressArc: {
    position: "absolute",
    width: 208,
    height: 208,
    borderRadius: 104,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: "#ec1313",
  },
  fingerprintShell: {
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: "#251e1e",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#ec1313",
    shadowOpacity: 0.2,
    shadowRadius: 40,
    overflow: "hidden",
  },
  scanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: "#ec1313",
    shadowColor: "#ec1313",
    shadowOpacity: 0.8,
    shadowRadius: 15,
  },
  progressCopy: {
    marginTop: 32,
    alignItems: "center",
  },
  progressEyebrow: {
    color: "#ffb4a9",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 3,
    marginBottom: 8,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  progressValue: {
    color: "#eedfde",
    fontSize: 40,
    fontWeight: "800",
  },
  progressLabel: {
    color: "#e9bcb6",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  infoSection: {
    width: "100%",
    marginTop: 20,
    gap: 24,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#3b3333",
  },
  segmentActive: {
    backgroundColor: "#ec1313",
  },
  infoCard: {
    backgroundColor: "rgba(42,27,27,0.6)",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.15)",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 24,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 12,
  },
  infoIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(236,19,19,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: {
    color: "#eedfde",
    fontSize: 18,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  infoText: {
    color: "rgba(233,188,182,0.8)",
    fontSize: 14,
    lineHeight: 22,
  },
  actions: {
    width: "100%",
    gap: 16,
    paddingTop: 48,
  },
  primaryButton: {
    borderRadius: 18,
    overflow: "hidden",
  },
  primaryButtonFill: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#130000",
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  secondaryButton: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.3)",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  secondaryButtonText: {
    color: "#eedfde",
    fontSize: 16,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  navBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 32,
    backgroundColor: "rgba(37,30,30,0.6)",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    opacity: 0.5,
  },
  navItemActive: {
    backgroundColor: "#EC1313",
    borderRadius: 12,
    opacity: 1,
    minWidth: 64,
  },
  navLabel: {
    color: "#E9BCB6",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.4,
    marginTop: 4,
  },
  navLabelActive: {
    color: "#fff",
  },
});
