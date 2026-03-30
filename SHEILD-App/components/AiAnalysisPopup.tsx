import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";

interface AiAnalysisPopupProps {
  visible: boolean;
  detectedMovement: string;
  progress: number;
  statusText: string;
  onCancel: () => void;
}

export default function AiAnalysisPopup({
  visible,
  detectedMovement,
  progress,
  statusText,
  onCancel,
}: AiAnalysisPopupProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="psychology" size={30} color="#fff" />
          </View>
          <Text style={styles.title}>AI Detecting Abnormal Movement</Text>
          <Text style={styles.movement}>Movement: {detectedMovement}</Text>

          <View style={styles.progressTrack}>
            <LinearGradient
              colors={["#ec1313", "#ff6a00"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.progressFill, { width: `${Math.max(4, progress)}%` }]}
            />
          </View>

          <View style={styles.row}>
            <Text style={styles.progressText}>{progress}%</Text>
            <Text style={styles.statusText}>
              {statusText || "Classifying risk as LOW or HIGH"}
            </Text>
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <MaterialIcons name="close" size={18} color="#fff" />
            <Text style={styles.cancelText}>Cancel Detection</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#120c0c",
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(236,19,19,0.35)",
    shadowColor: "#ec1313",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 12,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ec1313",
    marginBottom: 16,
    alignSelf: "center",
  },
  title: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  movement: {
    color: "#f2caca",
    fontSize: 14,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 18,
  },
  progressTrack: {
    width: "100%",
    height: 14,
    backgroundColor: "#2a1b1b",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  row: {
    marginTop: 14,
    alignItems: "center",
  },
  progressText: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
  },
  statusText: {
    color: "#b9a7a7",
    fontSize: 13,
    marginTop: 6,
    textAlign: "center",
  },
  cancelBtn: {
    marginTop: 22,
    backgroundColor: "#2a1b1b",
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  cancelText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
