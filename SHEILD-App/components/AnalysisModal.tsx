import React from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";

interface AnalysisModalProps {
  visible: boolean;
  progress: number;
  result: "LOW" | "HIGH" | null;
  subtitle?: string;
  resultMessage?: string;
  explanations?: string[];
}

export default function AnalysisModal({
  visible,
  progress,
  result,
  subtitle,
  resultMessage,
  explanations = [],
}: AnalysisModalProps) {
  const isComplete = result !== null;
  const isHighRisk = result === "HIGH";
  const title = isComplete
    ? isHighRisk
      ? "HIGH RISK DETECTED"
      : "LOW RISK DETECTED"
    : "AI Analysis Running";
  const helperText = isComplete
    ? isHighRisk
      ? resultMessage || "Emergency protocol activated"
      : resultMessage || "Alerting contacts silently"
    : subtitle || "Detecting abnormal activity...";

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <LinearGradient
          colors={
            isComplete && isHighRisk
              ? ["rgba(236,19,19,0.4)", "rgba(12,6,6,0.97)"]
              : ["rgba(255,132,66,0.22)", "rgba(8,8,8,0.95)"]
          }
          style={[styles.card, isComplete && isHighRisk ? styles.cardHigh : null]}
        >
          <View
            style={[
              styles.iconShell,
              isComplete && isHighRisk ? styles.iconShellHigh : styles.iconShellLow,
            ]}
          >
            <MaterialIcons
              name={isComplete ? "warning" : "graphic-eq"}
              size={42}
              color="#fff"
            />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{helperText}</Text>

          <View style={styles.progressTrack}>
            <LinearGradient
              colors={
                isComplete && isHighRisk
                  ? ["#ec1313", "#ff5f5f"]
                  : ["#ff7a3d", "#ffd166"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${Math.max(progress, 4)}%` }]}
            />
          </View>

          <Text style={styles.percentText}>{Math.round(progress)}%</Text>

          {isComplete && explanations.length > 0 ? (
            <View style={styles.reasonPanel}>
              {explanations.map((reason) => (
                <View key={reason} style={styles.reasonRow}>
                  <MaterialIcons
                    name={isHighRisk ? "priority-high" : "check-circle"}
                    size={18}
                    color={isHighRisk ? "#ff8b8b" : "#ffd166"}
                  />
                  <Text style={styles.reasonText}>{reason}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.84)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    borderRadius: 32,
    paddingHorizontal: 24,
    paddingVertical: 36,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(18,12,12,0.92)",
    shadowColor: "#ec1313",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 18,
    alignItems: "center",
  },
  cardHigh: {
    shadowOpacity: 0.45,
    shadowRadius: 30,
  },
  iconShell: {
    width: 104,
    height: 104,
    borderRadius: 52,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
  },
  iconShellLow: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  iconShellHigh: {
    backgroundColor: "rgba(236,19,19,0.22)",
    borderColor: "rgba(236,19,19,0.5)",
  },
  title: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.4,
  },
  subtitle: {
    color: "#d0baba",
    fontSize: 16,
    marginTop: 12,
    marginBottom: 28,
    textAlign: "center",
    lineHeight: 22,
  },
  progressTrack: {
    width: "100%",
    height: 18,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  percentText: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
    marginTop: 22,
  },
  reasonPanel: {
    width: "100%",
    marginTop: 22,
    gap: 10,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reasonText: {
    color: "#f3eaea",
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
