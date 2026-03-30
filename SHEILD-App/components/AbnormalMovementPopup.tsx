import React from "react";
import { Modal, StyleSheet, Text, View } from "react-native";

interface AbnormalMovementPopupProps {
  visible: boolean;
  classification: "LOW" | "HIGH";
  title: string;
  message: string;
}

export default function AbnormalMovementPopup({
  visible,
  classification,
  title,
  message,
}: AbnormalMovementPopupProps) {
  const isHighRisk = classification === "HIGH";
  const classificationText = isHighRisk
    ? "AI classified this as HIGH RISK"
    : "AI classified this as LOW RISK";

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            isHighRisk ? styles.highRiskCard : styles.lowRiskCard,
          ]}
        >
          <Text style={styles.title}>{title}</Text>
          <View
            style={[
              styles.badge,
              isHighRisk ? styles.highRiskBadge : styles.lowRiskBadge,
            ]}
          >
            <Text style={styles.badgeText}>
              {isHighRisk ? "HIGH RISK" : "LOW RISK"}
            </Text>
          </View>
          <Text style={styles.classificationText}>{classificationText}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: 80,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  card: {
    width: "88%",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  lowRiskCard: {
    backgroundColor: "#2b2412",
    borderColor: "#facc15",
  },
  highRiskCard: {
    backgroundColor: "#2b1212",
    borderColor: "#ef4444",
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  badge: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  lowRiskBadge: {
    backgroundColor: "#facc15",
  },
  highRiskBadge: {
    backgroundColor: "#ef4444",
  },
  badgeText: {
    color: "#111",
    fontSize: 12,
    fontWeight: "800",
  },
  classificationText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 12,
  },
  message: {
    color: "#f5f5f5",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
});
