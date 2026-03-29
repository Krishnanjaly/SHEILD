import { PermissionsAndroid, Platform } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  ExpoSpeechRecognitionOptions,
} from "expo-speech-recognition";

type SpeechResultsEvent = { value?: string[] };
type SpeechErrorEvent = unknown;

export const voiceRuntime: {
  onSpeechResults?: ((event: SpeechResultsEvent) => void) | null;
  onSpeechPartialResults?: ((event: SpeechResultsEvent) => void) | null;
  onSpeechEnd?: (() => void) | null;
  onSpeechError?: ((event: SpeechErrorEvent) => void) | null;
} = {
  onSpeechResults: null,
  onSpeechPartialResults: null,
  onSpeechEnd: null,
  onSpeechError: null,
};

export function isVoiceModuleAvailable() {
  return Boolean(ExpoSpeechRecognitionModule);
}

export async function ensureVoicePermission() {
  if (Platform.OS === "android") {
    const currentStatus = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );

    if (!currentStatus) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone permission required",
          message:
            "SHIELD needs microphone access to detect emergency voice commands.",
          buttonPositive: "Allow",
          buttonNegative: "Deny",
        }
      );

      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        return false;
      }
    }
  }

  const permissionResponse =
    await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return permissionResponse.granted;
}

export async function safeVoiceStart(
  locale = "en-US",
  options: Partial<ExpoSpeechRecognitionOptions> = {}
) {
  if (!isVoiceModuleAvailable()) {
    return {
      ok: false,
      reason:
        "Voice native module is unavailable. Rebuild the Android development app with expo run:android.",
    };
  }

  const hasPermission = await ensureVoicePermission();
  if (!hasPermission) {
    return {
      ok: false,
      reason: "Microphone permission was denied.",
    };
  }

  try {
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      return {
        ok: false,
        reason: "Speech recognition service is not available on this device.",
      };
    }

    ExpoSpeechRecognitionModule.start({
      lang: locale,
      interimResults: true,
      continuous: true,
      maxAlternatives: 5,
      addsPunctuation: false,
      ...options,
    });
    return {
      ok: true,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `Speech recognition start failed: ${String(error)}`,
    };
  }
}

export async function safeVoiceStop() {
  if (!isVoiceModuleAvailable()) {
    return;
  }

  try {
    ExpoSpeechRecognitionModule.stop();
  } catch {}
}

export async function safeVoiceCancel() {
  if (!isVoiceModuleAvailable()) {
    return;
  }

  try {
    ExpoSpeechRecognitionModule.abort();
  } catch {}
}

export async function safeVoiceDestroy() {
  voiceRuntime.onSpeechResults = null;
  voiceRuntime.onSpeechPartialResults = null;
  voiceRuntime.onSpeechEnd = null;
  voiceRuntime.onSpeechError = null;
}
