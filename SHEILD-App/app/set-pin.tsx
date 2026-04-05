import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  StyleProp,
  Text,
  TouchableOpacity,
  ViewStyle,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppLockStorage } from "../services/AppLockStorage";

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "backspace"];
const maxLength = 6;
const minLength = 4;

function GlassLayer({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View pointerEvents="none" style={style} />;
}

export default function SetPinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [oldPinInput, setOldPinInput] = useState("");
  const [savedPin, setSavedPin] = useState("");

  const pinSlots = useMemo(() => Array.from({ length: 6 }), []);
  const activeValue = isUpdating
    ? oldPinInput
    : isConfirming
      ? confirmPin
      : pin;

  useEffect(() => {
    const loadSavedPin = async () => {
      const state = await AppLockStorage.getState();
      if (state.lockType === "PIN" && state.pin) {
        setSavedPin(state.pin);
        setIsUpdating(true);
      }
    };

    loadSavedPin().catch(() => {});
  }, []);

  const resetState = () => {
    setPin("");
    setConfirmPin("");
    setIsConfirming(false);
    setOldPinInput("");
  };

  const handlePinValidation = async (nextConfirmPin: string) => {
    if (nextConfirmPin !== pin) {
      setConfirmPin("");
      Alert.alert("PIN Error", "PINs do not match");
      return;
    }

    await AppLockStorage.activatePin(pin);
    Alert.alert("Success", isUpdating ? "PIN Updated Successfully" : "PIN Saved Successfully", [
      {
        text: "OK",
        onPress: () => {
          resetState();
          router.replace("/dashboard");
        },
      },
    ]);
  };

  const handleOldPinCheck = async () => {
    if (oldPinInput !== savedPin) {
      setOldPinInput("");
      Alert.alert("PIN Error", "Incorrect PIN");
      return;
    }

    setIsUpdating(false);
    setPin("");
    setConfirmPin("");
    setIsConfirming(false);
  };

  const handleNumberPress = async (value: string) => {
    if (isUpdating) {
      if (oldPinInput.length >= maxLength) {
        return;
      }
      setOldPinInput((current) => `${current}${value}`);
      return;
    }

    if (isConfirming) {
      if (confirmPin.length >= maxLength) {
        return;
      }

      const nextConfirmPin = `${confirmPin}${value}`;
      setConfirmPin(nextConfirmPin);
      return;
    }

    if (pin.length >= maxLength) {
      return;
    }

    const nextPin = `${pin}${value}`;
    setPin(nextPin);
  };

  const handleBackspace = () => {
    if (isUpdating) {
      setOldPinInput((current) => current.slice(0, -1));
      return;
    }

    if (isConfirming) {
      setConfirmPin((current) => current.slice(0, -1));
      return;
    }

    setPin((current) => current.slice(0, -1));
  };

  const handleDigitPress = async (value: string) => {
    if (value === "backspace") {
      handleBackspace();
      return;
    }

    if (value >= "0" && value <= "9") {
      await handleNumberPress(value);
    }
  };

  const handleSavePress = async () => {
    if (isUpdating) {
      await handleOldPinCheck();
      return;
    }

    if (!isConfirming) {
      if (pin.length < minLength) {
        Alert.alert("PIN Error", "Enter at least 4 digits");
        return;
      }

      setIsConfirming(true);
      setConfirmPin("");
      return;
    }

    if (confirmPin.length < minLength) {
      Alert.alert("PIN Error", "Confirm your PIN");
      return;
    }

    await handlePinValidation(confirmPin);
  };

  const handleForgotPin = () => {
    Alert.alert("Forgot PIN", "Reset app lock and create a new PIN?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          await AppLockStorage.resetAppLock();
          resetState();
          setSavedPin("");
          setIsUpdating(false);
          Alert.alert("Success", "PIN reset successfully", [
            { text: "OK", onPress: () => router.back() },
          ]);
        },
      },
    ]);
  };

  const saveButtonLabel = isUpdating ? "Verify" : isConfirming ? "Save" : "Next";
  const isSaveDisabled = isUpdating
    ? oldPinInput.length < minLength
    : !isConfirming
      ? pin.length < minLength
      : confirmPin.length < minLength;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.backgroundGlowTop} pointerEvents="none" />
      <View style={styles.backgroundGlowBottom} pointerEvents="none" />

      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <GlassLayer style={styles.topBarBlur} />
        <TouchableOpacity onPress={() => router.back()} style={styles.navButton}>
          <MaterialIcons name="arrow-back" size={24} color="#E9BCB6" />
        </TouchableOpacity>
        <View style={styles.brandWrap}>
          <Text style={styles.brandText}>SHIELD</Text>
          <Text style={styles.brandSubtext}>SET PIN</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveButton, isSaveDisabled ? styles.saveButtonDisabled : null]}
          onPress={handleSavePress}
          disabled={isSaveDisabled}
        >
          <MaterialIcons name="security" size={22} color="#EC1313" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.titleBlock}>
          <View style={styles.securityBadge}>
            <View style={styles.securityBadgeDot} />
            <Text style={styles.securityBadgeText}>Security</Text>
          </View>
          <Text style={styles.title}>Set PIN</Text>
          <Text style={styles.subtitle}>
            {isUpdating
              ? "Enter your current PIN"
              : isConfirming
                ? "Confirm your new PIN"
                : "Enter a 4-6 digit PIN"}
          </Text>
        </View>

        <View style={styles.dotRow}>
          {pinSlots.map((_, index) => (
            <View
              key={`pin-dot-${index}`}
              style={[
                styles.dot,
                index < activeValue.length ? styles.dotActive : null,
              ]}
            />
          ))}
        </View>

        <View style={styles.keypadShell}>
          <View style={styles.keypad}>
          {digits.map((item, index) => {
            if (!item) {
              return <View key={`empty-${index}`} style={styles.keypadButton} />;
            }

            return (
              <Pressable
                key={`${item}-${index}`}
                style={({ pressed }) => [
                  styles.keypadButton,
                  pressed ? styles.keypadButtonPressed : null,
                ]}
                onPress={() => handleDigitPress(item)}
                android_ripple={{ color: "rgba(236,19,19,0.12)", borderless: false }}
              >
                <GlassLayer style={styles.keypadButtonBlur} />
                {item === "backspace" ? (
                  <MaterialIcons name="backspace" size={24} color="rgba(255,255,255,0.7)" />
                ) : (
                  <Text style={styles.keyText}>{item}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
        </View>

        <TouchableOpacity style={styles.forgotButton} onPress={handleForgotPin}>
          <Text style={styles.forgotButtonText}>Forgot PIN?</Text>
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Authorized device access only. Your PIN will be encrypted and stored locally.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#110c0c",
  },
  backgroundGlowTop: {
    position: "absolute",
    top: 30,
    left: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(236,19,19,0.08)",
    shadowColor: "#ec1313",
    shadowOpacity: 0.22,
    shadowRadius: 96,
  },
  backgroundGlowBottom: {
    position: "absolute",
    right: -70,
    bottom: 140,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(236,19,19,0.06)",
    shadowColor: "#ec1313",
    shadowOpacity: 0.18,
    shadowRadius: 110,
  },
  topBar: {
    minHeight: 64,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
    elevation: 10,
    backgroundColor: "rgba(25,18,18,0.8)",
    overflow: "hidden",
  },
  topBarBlur: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  saveButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  brandWrap: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: {
    color: "#EC1313",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
    textTransform: "uppercase",
  },
  brandSubtext: {
    color: "rgba(233,188,182,0.6)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.5,
    marginTop: -2,
    textTransform: "uppercase",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
  },
  titleBlock: {
    alignItems: "center",
    width: "100%",
  },
  securityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  securityBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EC1313",
    shadowColor: "#EC1313",
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  securityBadgeText: {
    color: "#EC1313",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  title: {
    color: "#eedfde",
    fontSize: 32,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  subtitle: {
    color: "rgba(233,188,182,0.7)",
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
  },
  dotRow: {
    flexDirection: "row",
    gap: 14,
    marginTop: 28,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(94,63,58,0.3)",
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.1)",
  },
  dotActive: {
    backgroundColor: "#EC1313",
    shadowColor: "#EC1313",
    shadowOpacity: 0.5,
    shadowRadius: 15,
    borderColor: "rgba(236,19,19,0.2)",
  },
  keypadShell: {
    width: "100%",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 24,
  },
  keypadContainer: {
    width: "100%",
  },
  keypad: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "rgba(42,27,27,0.4)",
    borderRadius: 32,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.15)",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  forgotButton: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  forgotButtonText: {
    color: "#E9BCB6",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },
  keypadButton: {
    width: "30%",
    height: 76,
    borderRadius: 20,
    backgroundColor: "rgba(236,19,19,0.1)",
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.2)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: "#EC1313",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3,
  },
  keypadButtonBlur: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  keypadButtonPressed: {
    transform: [{ scale: 0.95 }],
    shadowColor: "#EC1313",
    shadowOpacity: 0.28,
    shadowRadius: 14,
  },
  keyText: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
  },
  infoCard: {
    width: "100%",
    maxWidth: 260,
    marginTop: "auto",
    paddingTop: 8,
  },
  infoText: {
    color: "rgba(233,188,182,0.4)",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    textAlign: "center",
    lineHeight: 16,
  },
});
