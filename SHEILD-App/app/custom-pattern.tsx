import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  DeviceEventEmitter,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { VolumeManager } from "react-native-volume-manager";
import { useVolumeListener } from "../hooks/use-volume-listener";

const STORAGE_KEY = "volumePattern";
const RECORDING_EVENT = "VOLUME_PATTERN_RECORDING_CHANGED";
const maxLength = 6;
const minLength = 3;
const previewSlots = Array.from({ length: maxLength });

export default function CustomPatternScreen() {
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [currentPattern, setCurrentPattern] = useState<string[]>([]);
  const lastKnownVolumeRef = useRef<number | null>(null);
  const isRecenteringRef = useRef(false);

  const emitRecordingState = useCallback((active: boolean) => {
    DeviceEventEmitter.emit(RECORDING_EVENT, active);
  }, []);

  const recenterVolume = useCallback(async () => {
    if (isRecenteringRef.current) {
      return;
    }

    isRecenteringRef.current = true;
    try {
      await VolumeManager.setVolume(0.5, {
        showUI: false,
        playSound: false,
        type: "music",
      });
      lastKnownVolumeRef.current = 0.5;
    } catch {
    } finally {
      setTimeout(() => {
        isRecenteringRef.current = false;
      }, 180);
    }
  }, []);

  const persistPattern = useCallback(async (pattern: string[]) => {
    if (pattern.length < minLength) {
      Alert.alert("Pattern Error", "Minimum 3 inputs required");
      return false;
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pattern));
    Alert.alert("Success", "Pattern Saved Successfully");
    return true;
  }, []);

  const stopRecording = useCallback(
    async (patternOverride?: string[]) => {
      const pattern = patternOverride ?? currentPattern;
      setIsRecording(false);
      emitRecordingState(false);
      await persistPattern(pattern);
    },
    [currentPattern, emitRecordingState, persistPattern]
  );

  const handleStartStop = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
      return;
    }

    setCurrentPattern([]);
    setIsRecording(true);
    emitRecordingState(true);
    await recenterVolume();
  }, [emitRecordingState, isRecording, recenterVolume, stopRecording]);

  const handleClear = useCallback(() => {
    setCurrentPattern([]);
  }, []);

  const handleVolumeChange = useCallback(
    (event: { volume?: number | null }) => {
      if (!isRecording) {
        return;
      }

      const nextVolume =
        typeof event?.volume === "number" ? event.volume : null;
      if (nextVolume === null) {
        return;
      }

      if (isRecenteringRef.current) {
        lastKnownVolumeRef.current = nextVolume;
        return;
      }

      const previousVolume = lastKnownVolumeRef.current;
      lastKnownVolumeRef.current = nextVolume;

      if (previousVolume === null) {
        return;
      }

      const delta = nextVolume - previousVolume;
      if (Math.abs(delta) < 0.01) {
        return;
      }

      const nextInput = delta > 0 ? "UP" : "DOWN";

      setCurrentPattern((previousPattern) => {
        if (previousPattern.length >= maxLength) {
          return previousPattern;
        }

        const nextPattern = [...previousPattern, nextInput];

        if (nextPattern.length >= maxLength) {
          setTimeout(() => {
            stopRecording(nextPattern).catch(() => {});
          }, 0);
        } else {
          recenterVolume().catch(() => {});
        }

        return nextPattern;
      });
    },
    [isRecording, recenterVolume, stopRecording]
  );

  useVolumeListener(isRecording, handleVolumeChange);

  useEffect(() => {
    VolumeManager.getVolume()
      .then(({ volume }) => {
        lastKnownVolumeRef.current =
          typeof volume === "number" ? volume : null;
      })
      .catch(() => {});

    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!value) {
          return;
        }

        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          setCurrentPattern(
            parsed.filter(
              (item) => item === "UP" || item === "DOWN"
            ).slice(0, maxLength)
          );
        }
      })
      .catch(() => {});

    return () => {
      emitRecordingState(false);
    };
  }, [emitRecordingState]);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#191212", "#130d0d"]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.topIconButton}>
            <MaterialIcons name="arrow-back" size={24} color="#EC1313" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Custom Pattern</Text>

          <TouchableOpacity style={styles.topIconButton}>
            <MaterialIcons name="info-outline" size={22} color="#EC1313" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroSection}>
          <View style={styles.heroGlow} />
          <View style={styles.phoneMock}>
            <View style={styles.phoneNotch} />
            <View style={styles.centerRing}>
              <MaterialIcons name="vibration" size={42} color="#EC1313" />
            </View>
            <View style={styles.sideButtonTop} />
            <View style={styles.sideButtonBottom} />
          </View>

          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingLabel}>Pattern Recording Mode</Text>
          </View>
        </View>

        <View style={styles.copyBlock}>
          <Text style={styles.mainTitle}>Set Your Secret Pattern</Text>
          <Text style={styles.subtitle}>
            Press volume buttons in your desired sequence. This pattern will be
            used to silently trigger emergency actions.
          </Text>
        </View>

        <View style={styles.glassCard}>
          <Text style={styles.cardEyebrow}>Tap Start to record pattern</Text>

          <View style={styles.previewRow}>
            {previewSlots.map((_, index) => {
              const direction = currentPattern[index];
              return (
                <View
                  key={`slot-${index}`}
                  style={[
                    styles.previewTile,
                    !direction ? styles.previewTileGhost : null,
                  ]}
                >
                  {direction ? (
                    <MaterialIcons
                      name={
                        direction === "UP"
                          ? "keyboard-arrow-up"
                          : "keyboard-arrow-down"
                      }
                      size={28}
                      color="#EC1313"
                    />
                  ) : (
                    <View style={styles.previewGhostDot} />
                  )}
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.9}
            onPress={handleStartStop}
          >
            <MaterialIcons
              name={isRecording ? "stop" : "play-arrow"}
              size={24}
              color="#130000"
            />
            <Text style={styles.primaryButtonText}>
              {isRecording ? "Stop Recording" : "Start Recording"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            activeOpacity={0.9}
            onPress={handleClear}
          >
            <MaterialIcons name="backspace" size={22} color="#eedfde" />
            <Text style={styles.secondaryButtonText}>Clear Pattern</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rulesCard}>
          <MaterialIcons name="rule" size={22} color="#EC1313" style={styles.rulesIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rulesTitle}>Pattern Rules</Text>
            <View style={styles.ruleItem}>
              <View style={styles.ruleDot} />
              <Text style={styles.ruleText}>Minimum 3 inputs required</Text>
            </View>
            <View style={styles.ruleItem}>
              <View style={styles.ruleDot} />
              <Text style={styles.ruleText}>Maximum 6 inputs allowed</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#191212",
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  topIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#EC1313",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  heroSection: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 26,
  },
  heroGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(236,19,19,0.08)",
    shadowColor: "#EC1313",
    shadowOpacity: 0.35,
    shadowRadius: 40,
  },
  phoneMock: {
    width: 190,
    height: 220,
    borderRadius: 30,
    backgroundColor: "#251e1e",
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.5)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  phoneNotch: {
    position: "absolute",
    top: 14,
    width: 64,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#3b3333",
  },
  centerRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(236,19,19,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  sideButtonTop: {
    position: "absolute",
    right: -2,
    top: 76,
    width: 6,
    height: 38,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
    backgroundColor: "#EC1313",
  },
  sideButtonBottom: {
    position: "absolute",
    right: -2,
    top: 122,
    width: 6,
    height: 38,
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
    backgroundColor: "#EC1313",
  },
  recordingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EC1313",
  },
  recordingLabel: {
    color: "#e9bcb6",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  copyBlock: {
    alignItems: "center",
    marginBottom: 24,
  },
  mainTitle: {
    color: "#eedfde",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "#af8781",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 10,
    maxWidth: 300,
  },
  glassCard: {
    backgroundColor: "rgba(42,27,27,0.6)",
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.22)",
    marginBottom: 22,
  },
  cardEyebrow: {
    color: "rgba(233,188,182,0.7)",
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 22,
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 24,
  },
  previewTile: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "#130d0d",
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewTileGhost: {
    opacity: 0.35,
  },
  previewGhostDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#e9bcb6",
  },
  primaryButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: "#EC1313",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: "#130000",
    fontSize: 18,
    fontWeight: "800",
  },
  secondaryButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(37,30,30,0.86)",
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.35)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondaryButtonText: {
    color: "#eedfde",
    fontSize: 18,
    fontWeight: "800",
  },
  rulesCard: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: "rgba(19,13,13,0.5)",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(94,63,58,0.18)",
  },
  rulesIcon: {
    marginTop: 2,
  },
  rulesTitle: {
    color: "#eedfde",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  ruleItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  ruleDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#EC1313",
    marginRight: 8,
  },
  ruleText: {
    color: "#c9afaf",
    fontSize: 12,
    lineHeight: 18,
  },
});
