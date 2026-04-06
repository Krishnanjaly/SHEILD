import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  StyleProp,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";
import { AppLockStorage, AppLockType } from "../services/AppLockStorage";
import { GuardianStateService } from "../services/GuardianStateService";

const pinDigits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "backspace"];
const patternNodes = Array.from({ length: 9 }, (_, index) => index);
const minPatternLength = 4;
const dotSize = 24;

type DotCenter = { x: number; y: number };

const serializePattern = (value: number[]) => JSON.stringify(value);

function GlassLayer({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View pointerEvents="none" style={style} />;
}

export default function AppLockScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [isReady, setIsReady] = useState(false);
  const [lockType, setLockType] = useState<AppLockType>(null);
  const [savedPin, setSavedPin] = useState("");
  const [savedPattern, setSavedPattern] = useState<number[]>([]);
  const [pinInput, setPinInput] = useState("");
  const [patternInput, setPatternInput] = useState<number[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  const dotCentersRef = useRef<Record<number, DotCenter>>({});
  const patternInputRef = useRef<number[]>([]);

  useEffect(() => {
    const loadLockState = async () => {
      const state = await AppLockStorage.getState();

      if (!state.isAppLockEnabled || !state.lockType) {
        router.replace("/dashboard");
        return;
      }

      if (state.lockType === "PIN" && state.pin) {
        setLockType("PIN");
        setSavedPin(state.pin);
        setIsReady(true);
        return;
      }

      if (state.lockType === "PATTERN" && state.pattern) {
        try {
          const parsed = JSON.parse(state.pattern);
          if (Array.isArray(parsed)) {
            const normalized = parsed
              .map((item) => Number(item))
              .filter((item) => Number.isInteger(item) && item >= 0 && item < 9);

            if (normalized.length >= minPatternLength) {
              setLockType("PATTERN");
              setSavedPattern(normalized);
              setIsReady(true);
              return;
            }
          }
        } catch {}
      }

      router.replace("/dashboard");
    };

    loadLockState().catch(() => {
      router.replace("/dashboard");
    });
  }, [router]);

  const finishUnlock = async () => {
    await GuardianStateService.ensureBackgroundGuardianForLoggedInUser();
    router.replace("/dashboard");
  };

  const handlePinPress = async (value: string) => {
    if (lockType !== "PIN" || pinInput.length >= savedPin.length) {
      return;
    }

    const nextValue = `${pinInput}${value}`;
    setPinInput(nextValue);

    if (nextValue.length === savedPin.length) {
      if (nextValue === savedPin) {
        setPinInput("");
        await finishUnlock();
        return;
      }

      setTimeout(() => {
        setPinInput("");
        Alert.alert("PIN Error", "Incorrect PIN");
      }, 80);
    }
  };

  const handlePinBackspace = () => {
    setPinInput((current) => current.slice(0, -1));
  };

  const handlePatternGridLayout = (event: LayoutChangeEvent) => {
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

  const detectNodeFromTouch = (x: number, y: number) => {
    const hitRadius = dotSize * 1.25;

    for (const node of patternNodes) {
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

  const appendPatternNode = (node: number | null) => {
    if (node === null || lockType !== "PATTERN") {
      return;
    }

    setPatternInput((current) => {
      if (current.includes(node) || current.length >= savedPattern.length) {
        return current;
      }

      const nextValue = [...current, node];
      patternInputRef.current = nextValue;
      return nextValue;
    });
  };

  const handleTouchStart = (x: number, y: number) => {
    setIsTracking(true);
    appendPatternNode(detectNodeFromTouch(x, y));
  };

  const handleTouchMove = (x: number, y: number) => {
    if (!isTracking) {
      return;
    }

    appendPatternNode(detectNodeFromTouch(x, y));
  };

  const handleTouchEnd = async () => {
    setIsTracking(false);

    if (lockType !== "PATTERN") {
      return;
    }

    const candidate = patternInputRef.current;

    if (candidate.length < savedPattern.length) {
      return;
    }

    if (serializePattern(candidate) === serializePattern(savedPattern)) {
      patternInputRef.current = [];
      setPatternInput([]);
      await finishUnlock();
      return;
    }

    patternInputRef.current = [];
    setPatternInput([]);
    Alert.alert("Pattern Error", "Incorrect Pattern");
  };

  const patternPanResponder = useMemo(
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
        onPanResponderRelease: () => {
          handleTouchEnd().catch(() => {});
        },
        onPanResponderTerminate: () => {
          handleTouchEnd().catch(() => {});
        },
      }),
    [isTracking, lockType, patternInput, savedPattern]
  );

  const lineSegments = useMemo(() => {
    const segments: Array<{ from: DotCenter; to: DotCenter }> = [];

    for (let index = 1; index < patternInput.length; index += 1) {
      const from = dotCentersRef.current[patternInput[index - 1]];
      const to = dotCentersRef.current[patternInput[index]];
      if (from && to) {
        segments.push({ from, to });
      }
    }

    return segments;
  }, [patternInput, gridSize.width, gridSize.height]);

  const pinSlots = useMemo(() => Array.from({ length: Math.max(savedPin.length, 6) || 6 }), [savedPin.length]);

  if (!isReady) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#EC1313" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {lockType === "PIN" ? (
        <View style={styles.pinWrapper}>
          <View style={styles.pinGlowTop} pointerEvents="none" />
          <View style={styles.pinGlowBottom} pointerEvents="none" />

          <View style={[styles.pinHeader, { paddingTop: insets.top + 12 }]}>
            <GlassLayer style={styles.pinHeaderGlass} />
            <TouchableOpacity style={styles.pinHeaderButton}>
              <MaterialIcons name="arrow-back" size={24} color="#EC1313" />
            </TouchableOpacity>
            <View style={styles.brandWrap}>
              <Text style={styles.brandText}>SHIELD</Text>
              <Text style={styles.brandSubtext}>ENTER PIN</Text>
            </View>
            <TouchableOpacity style={styles.pinHeaderButton}>
              <MaterialIcons name="security" size={22} color="#EC1313" />
            </TouchableOpacity>
          </View>

          <View style={styles.pinContent}>
            <View style={styles.pinTitleBlock}>
              <View style={styles.pinSecurityBadge}>
                <View style={styles.pinSecurityDot} />
                <Text style={styles.pinSecurityText}>Security</Text>
              </View>
              <Text style={styles.pinTitle}>Enter PIN</Text>
              <Text style={styles.pinSubtitle}>Unlock to continue</Text>
            </View>

            <View style={styles.dotRow}>
              {pinSlots.map((_, index) => (
                <View
                  key={`unlock-pin-dot-${index}`}
                  style={[styles.dot, index < pinInput.length ? styles.dotActive : null]}
                />
              ))}
            </View>

            <View style={styles.pinKeypadShell}>
              <View style={styles.keypad}>
              {pinDigits.map((item, index) => {
                if (!item) {
                  return <View key={`unlock-empty-${index}`} style={styles.keypadButton} />;
                }

                return (
                  <Pressable
                    key={`${item}-${index}`}
                    style={({ pressed }) => [
                      styles.keypadButton,
                      pressed ? styles.keypadButtonPressed : null,
                    ]}
                    onPress={() => {
                      if (item === "backspace") {
                        handlePinBackspace();
                        return;
                      }
                      handlePinPress(item).catch(() => {});
                    }}
                    android_ripple={{ color: "rgba(236,19,19,0.12)", borderless: false }}
                  >
                    <GlassLayer style={styles.keypadButtonGlass} />
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

            <View style={styles.pinFooter}>
              <Text style={styles.pinFooterText}>
                Authorized device access only. Your PIN will be encrypted and stored locally.
              </Text>
            </View>
          </View>
        </View>
      ) : lockType === "PATTERN" ? (
        <View style={styles.patternWrapper}>
          <View style={[styles.patternHeader, { paddingTop: insets.top + 16 }]}>
            <View style={styles.patternHeaderLeft}>
              <Text style={styles.patternHeaderTitle}>Unlock Pattern</Text>
            </View>
            <Text style={styles.patternBrand}>SHIELD</Text>
          </View>

          <View style={styles.patternMain}>
            <View style={styles.patternInfo}>
              <View style={styles.statusRow}>
                <View style={styles.statusPulse} />
                <Text style={styles.statusText}>Security Initialization</Text>
              </View>
              <Text style={styles.patternTitle}>Draw your unlock pattern</Text>
              <Text style={styles.patternSubtitle}>Draw the saved pattern to open the app</Text>
            </View>

            <View style={styles.patternPanel}>
              <View
                style={styles.patternGrid}
                onLayout={handlePatternGridLayout}
                {...patternPanResponder.panHandlers}
              >
                <Svg
                  pointerEvents="none"
                  width={gridSize.width || "100%"}
                  height={gridSize.height || "100%"}
                  style={styles.svgOverlay}
                >
                  {lineSegments.map((segment, index) => (
                    <Line
                      key={`unlock-line-${index}`}
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

                {patternNodes.map((item, index) => {
                  const active = patternInput.includes(item);
                  const isFirstActive = active && patternInput[0] === item;

                  return (
                    <TouchableOpacity
                      key={`unlock-pattern-node-${item}`}
                      style={[styles.patternNodeWrap, index % 3 !== 2 ? styles.nodeGapRight : null]}
                      onLayout={(event) => setDotCenter(item, event)}
                      onPress={() => appendPatternNode(item)}
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
                <Text style={styles.readoutText}>Node Complexity: {patternInput.length}/9</Text>
              </View>

              <View style={styles.topReadout}>
                <MaterialIcons name="verified-user" size={14} color="#ffb3ae" />
                <Text style={styles.readoutText}>Secure Layer Active</Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#191212",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#191212",
  },
  pinWrapper: {
    flex: 1,
    backgroundColor: "#191212",
    overflow: "hidden",
  },
  pinGlowTop: {
    position: "absolute",
    top: "25%",
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(236,19,19,0.08)",
    shadowColor: "#EC1313",
    shadowOpacity: 0.22,
    shadowRadius: 96,
  },
  pinGlowBottom: {
    position: "absolute",
    bottom: "20%",
    right: -90,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(236,19,19,0.12)",
    shadowColor: "#EC1313",
    shadowOpacity: 0.2,
    shadowRadius: 120,
  },
  pinHeader: {
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
  pinHeaderGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  pinHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
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
  pinContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
  },
  pinTitleBlock: {
    alignItems: "center",
    width: "100%",
  },
  pinSecurityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  pinSecurityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EC1313",
    shadowColor: "#EC1313",
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  pinSecurityText: {
    color: "#EC1313",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  pinTitle: {
    color: "#eedfde",
    fontSize: 32,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  pinSubtitle: {
    color: "rgba(233,188,182,0.7)",
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
  },
  loginFallbackButton: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.3)",
    paddingHorizontal: 18,
    paddingVertical: 14,
    minWidth: 220,
    alignItems: "center",
  },
  loginFallbackButtonText: {
    color: "#eedfde",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1,
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
  pinKeypadShell: {
    width: "100%",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 24,
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
  },
  keypadButtonGlass: {
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
  pinFooter: {
    width: "100%",
    maxWidth: 260,
    marginTop: "auto",
    paddingTop: 8,
  },
  pinFooterText: {
    color: "rgba(233,188,182,0.4)",
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    textAlign: "center",
    lineHeight: 16,
  },
  patternWrapper: {
    flex: 1,
    backgroundColor: "#191212",
    overflow: "hidden",
  },
  patternHeader: {
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
  patternHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  patternHeaderTitle: {
    color: "#E9BCB6",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  patternBrand: {
    color: "#EC1313",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  patternMain: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 64,
  },
  patternInfo: {
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
  patternTitle: {
    color: "#eedfde",
    fontSize: 30,
    fontWeight: "800",
    textAlign: "center",
  },
  patternSubtitle: {
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
});
