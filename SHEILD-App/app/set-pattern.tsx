import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";
import { AppLockStorage } from "../services/AppLockStorage";

const minLength = 4;
const maxLength = 9;
const gridItems = Array.from({ length: 9 }, (_, index) => index);
const dotSize = 24;

type DotCenter = { x: number; y: number };

const serializePattern = (value: number[]) => JSON.stringify(value);

export default function SetPatternScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pattern, setPattern] = useState<number[]>([]);
  const [confirmPattern, setConfirmPattern] = useState<number[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [oldPatternInput, setOldPatternInput] = useState<number[]>([]);
  const [savedPattern, setSavedPattern] = useState<number[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  const dotCentersRef = useRef<Record<number, DotCenter>>({});

  useEffect(() => {
    const loadSavedPattern = async () => {
      const state = await AppLockStorage.getState();
      if (state.lockType === "PATTERN" && state.pattern) {
        try {
          const parsed = JSON.parse(state.pattern);
          if (Array.isArray(parsed)) {
            const normalized = parsed
              .map((item) => Number(item))
              .filter((item) => Number.isInteger(item) && item >= 0 && item < 9);
            if (normalized.length >= minLength) {
              setSavedPattern(normalized);
              setIsUpdating(true);
            }
          }
        } catch {}
      }
    };

    loadSavedPattern().catch(() => {});
  }, []);

  const activePattern = isUpdating
    ? oldPatternInput
    : isConfirming
      ? confirmPattern
      : pattern;

  const handleGridLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setGridSize({ width, height });
  };

  const setDotCenter = (index: number, event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    dotCentersRef.current[index] = {
      x: x + width / 2,
      y: y + height / 2,
    };
  };

  const updateActivePattern = (updater: (current: number[]) => number[]) => {
    if (isUpdating) {
      setOldPatternInput(updater);
      return;
    }

    if (isConfirming) {
      setConfirmPattern(updater);
      return;
    }

    setPattern(updater);
  };

  const resetCurrentPattern = () => {
    if (isUpdating) {
      setOldPatternInput([]);
      return;
    }

    if (isConfirming) {
      setConfirmPattern([]);
      return;
    }

    setPattern([]);
  };

  const detectNodeFromTouch = (x: number, y: number) => {
    const hitRadius = dotSize * 1.25;

    for (const node of gridItems) {
      const center = dotCentersRef.current[node];
      if (!center) {
        continue;
      }

      const dx = x - center.x;
      const dy = y - center.y;
      if (Math.sqrt(dx * dx + dy * dy) <= hitRadius) {
        return node;
      }
    }

    return null;
  };

  const appendNode = (node: number | null) => {
    if (node === null) {
      return;
    }

    updateActivePattern((current) => {
      if (current.includes(node) || current.length >= maxLength) {
        return current;
      }

      return [...current, node];
    });
  };

  const handleTouchStart = (x: number, y: number) => {
    setIsTracking(true);
    appendNode(detectNodeFromTouch(x, y));
  };

  const handleTouchMove = (x: number, y: number) => {
    if (!isTracking) {
      return;
    }

    appendNode(detectNodeFromTouch(x, y));
  };

  const handleTouchEnd = () => {
    setIsTracking(false);
  };

  const handlePatternValidation = async (candidate: number[]) => {
    if (serializePattern(candidate) !== serializePattern(pattern)) {
      setConfirmPattern([]);
      Alert.alert("Pattern Error", "Patterns do not match");
      return;
    }

    await AppLockStorage.activatePattern(pattern);
    Alert.alert("Success", isUpdating ? "Pattern Updated Successfully" : "Pattern Set Successfully", [
      { text: "OK", onPress: () => router.replace("/dashboard") },
    ]);
  };

  const handleOldPatternCheck = async () => {
    if (serializePattern(oldPatternInput) !== serializePattern(savedPattern)) {
      setOldPatternInput([]);
      Alert.alert("Pattern Error", "Incorrect Pattern");
      return;
    }

    setIsUpdating(false);
    setPattern([]);
    setConfirmPattern([]);
    setIsConfirming(false);
    setOldPatternInput([]);
  };

  const handleNext = async () => {
    if (isUpdating) {
      if (oldPatternInput.length < minLength) {
        Alert.alert("Pattern Error", "Connect at least 4 dots");
        return;
      }

      await handleOldPatternCheck();
      return;
    }

    if (!isConfirming) {
      if (pattern.length < minLength) {
        Alert.alert("Pattern Error", "Connect at least 4 dots");
        return;
      }

      setIsConfirming(true);
      setConfirmPattern([]);
      return;
    }

    if (confirmPattern.length < minLength) {
      Alert.alert("Pattern Error", "Connect at least 4 dots");
      return;
    }

    await handlePatternValidation(confirmPattern);
  };

  const handleForgotPattern = () => {
    Alert.alert("Forgot Pattern", "Reset app lock and create a new pattern?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          await AppLockStorage.resetAppLock();
          setPattern([]);
          setConfirmPattern([]);
          setOldPatternInput([]);
          setSavedPattern([]);
          setIsConfirming(false);
          setIsUpdating(false);
          Alert.alert("Success", "Pattern reset successfully", [
            { text: "OK", onPress: () => router.back() },
          ]);
        },
      },
    ]);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          handleTouchStart(locationX, locationY);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          handleTouchMove(locationX, locationY);
        },
        onPanResponderRelease: handleTouchEnd,
        onPanResponderTerminate: handleTouchEnd,
      }),
    [isTracking, isUpdating, isConfirming, pattern, confirmPattern, oldPatternInput]
  );

  const activeCountText = `${activePattern.length}/9`;
  const lineSegments = useMemo(() => {
    const segments: Array<{ from: DotCenter; to: DotCenter }> = [];
    for (let index = 1; index < activePattern.length; index += 1) {
      const from = dotCentersRef.current[activePattern[index - 1]];
      const to = dotCentersRef.current[activePattern[index]];
      if (from && to) {
        segments.push({ from, to });
      }
    }
    return segments;
  }, [activePattern, gridSize.width, gridSize.height]);

  const subtitle = isUpdating
    ? "Draw your current pattern"
    : isConfirming
      ? "Redraw pattern to confirm"
      : "Connect at least 4 dots to secure your device";

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            style={styles.headerBackButton}
            onPress={() => router.back()}
          >
            <MaterialIcons name="arrow-back" size={22} color="#E9BCB6" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Set Pattern</Text>
        </View>
        <Text style={styles.headerBrand}>SHIELD</Text>
      </View>

      <View style={styles.main}>
        <View style={styles.headerInfo}>
          <View style={styles.statusRow}>
            <View style={styles.statusPulse} />
            <Text style={styles.statusText}>Security Initialization</Text>
          </View>
          <Text style={styles.title}>Draw your unlock pattern</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <View style={styles.patternPanel}>
          <View
            style={styles.patternGrid}
            onLayout={handleGridLayout}
            {...panResponder.panHandlers}
          >
            <Svg
              pointerEvents="none"
              width={gridSize.width || "100%"}
              height={gridSize.height || "100%"}
              style={styles.svgOverlay}
            >
              {lineSegments.map((segment, index) => (
                <Line
                  key={`segment-${index}`}
                  x1={segment.from.x}
                  y1={segment.from.y}
                  x2={segment.to.x}
                  y2={segment.to.y}
                  stroke="#EC1313"
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>

            {gridItems.map((item, index) => {
              const active = activePattern.includes(item);
              const isFirstActive = active && activePattern[0] === item;

              return (
                <TouchableOpacity
                  key={`pattern-node-${item}`}
                  style={[styles.patternNodeWrap, index % 3 !== 2 ? styles.nodeGapRight : null]}
                  onLayout={(event) => setDotCenter(item, event)}
                  onPress={() => appendNode(item)}
                  activeOpacity={1}
                >
                  <View style={[styles.patternDot, active ? styles.patternDotActive : null]}>
                    {isFirstActive ? <View style={styles.patternDotPulse} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.bottomReadout}>
            <MaterialIcons name="data-usage" size={14} color="#ffb4a9" />
            <Text style={styles.readoutText}>Node Complexity: {activeCountText}</Text>
          </View>

          <View style={styles.topReadout}>
            <MaterialIcons name="verified-user" size={14} color="#ffb3ae" />
            <Text style={styles.readoutText}>Secure Layer Active</Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.resetButton} onPress={resetCurrentPattern}>
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.nextButton, activePattern.length < minLength ? styles.nextButtonDisabled : null]}
            onPress={handleNext}
            disabled={activePattern.length < minLength}
          >
            <Text style={styles.nextButtonText}>
              {isUpdating ? "Verify" : isConfirming ? "Save" : "Next"}
            </Text>
            <MaterialIcons name="arrow-forward" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.forgotButton} onPress={handleForgotPattern}>
          <Text style={styles.forgotButtonText}>Forgot Pattern?</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.leftGlow} pointerEvents="none" />
      <View style={styles.rightGlow} pointerEvents="none" />

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.bottomNavIcon}>
          <MaterialIcons name="shield" size={24} color="rgba(233,188,182,0.5)" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavPrimary}>
          <MaterialIcons name="home" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.bottomNavIcon}>
          <MaterialIcons name="settings" size={24} color="rgba(233,188,182,0.5)" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#191212",
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    backgroundColor: "#191212",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(94,63,58,0.15)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 50,
    elevation: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerBackButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    borderRadius: 999,
  },
  headerTitle: {
    color: "#E9BCB6",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  headerBrand: {
    color: "#EC1313",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  main: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 132,
  },
  headerInfo: {
    alignItems: "center",
    marginBottom: 48,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  statusPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EC1313",
  },
  statusText: {
    color: "#EC1313",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  title: {
    color: "#eedfde",
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(233,188,182,0.6)",
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
  },
  patternPanel: {
    position: "relative",
    width: "100%",
    maxWidth: 360,
    aspectRatio: 1,
    backgroundColor: "rgba(42,27,27,0.4)",
    borderRadius: 32,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.15)",
  },
  patternGrid: {
    width: "100%",
    aspectRatio: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignContent: "space-between",
    position: "relative",
    zIndex: 10,
  },
  svgOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  patternNodeWrap: {
    width: "33.3333%",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 64,
  },
  nodeGapRight: {},
  patternDot: {
    width: dotSize,
    height: dotSize,
    borderRadius: dotSize / 2,
    backgroundColor: "rgba(94,63,58,0.3)",
    shadowColor: "rgba(236,19,19,0.2)",
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  patternDotActive: {
    backgroundColor: "#EC1313",
    shadowColor: "#EC1313",
    shadowOpacity: 0.85,
    shadowRadius: 20,
  },
  patternDotPulse: {
    position: "absolute",
    inset: -4,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.2)",
  },
  bottomReadout: {
    position: "absolute",
    bottom: -16,
    left: 24,
    backgroundColor: "rgba(59,51,51,0.8)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topReadout: {
    position: "absolute",
    top: -16,
    right: 24,
    backgroundColor: "rgba(59,51,51,0.8)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  readoutText: {
    color: "#E9BCB6",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  actionsRow: {
    width: "100%",
    maxWidth: 360,
    flexDirection: "row",
    gap: 16,
    marginTop: 48,
  },
  resetButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#3b3333",
    alignItems: "center",
    justifyContent: "center",
  },
  resetButtonText: {
    color: "#eedfde",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  nextButton: {
    flex: 2,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#EC1313",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    shadowColor: "rgba(236,13,13,0.3)",
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  nextButtonDisabled: {
    opacity: 0.45,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  forgotButton: {
    marginTop: 18,
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
  leftGlow: {
    position: "absolute",
    top: "25%",
    left: -96,
    width: 256,
    height: 256,
    borderRadius: 128,
    backgroundColor: "rgba(236,19,19,0.05)",
    shadowColor: "rgba(236,19,19,0.2)",
    shadowOpacity: 1,
    shadowRadius: 120,
  },
  rightGlow: {
    position: "absolute",
    bottom: "25%",
    right: -96,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(222,53,57,0.05)",
    shadowColor: "rgba(222,53,57,0.2)",
    shadowOpacity: 1,
    shadowRadius: 140,
  },
  bottomNav: {
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
    backgroundColor: "rgba(42,27,27,0.6)",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(94,63,58,0.2)",
  },
  bottomNavIcon: {
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomNavPrimary: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#EC1313",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(236,13,13,0.4)",
    shadowOpacity: 1,
    shadowRadius: 15,
  },
});
