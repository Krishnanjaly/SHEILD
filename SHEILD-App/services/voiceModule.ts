import { AppState, PermissionsAndroid, Platform } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  ExpoSpeechRecognitionOptions,
  ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";

type SpeechResultsEvent = { value?: string[] };
type SpeechErrorEvent = unknown;
export type VoiceMode = "keyword" | "emergency";
export type VoiceErrorKind = "aborted" | "network" | "busy" | "permission" | "unknown";

const voiceEngineState: {
  isStarting: boolean;
  isListening: boolean;
  activeMode: VoiceMode | null;
  lastErrorKind: VoiceErrorKind | null;
} = {
  isStarting: false,
  isListening: false,
  activeMode: null,
  lastErrorKind: null,
};

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

function extractTranscripts(event: any): string[] {
  if (event?.results && Array.isArray(event.results)) {
    return event.results
      .map((result: any) => result?.transcript)
      .filter((transcript: any) => typeof transcript === "string" && transcript.trim().length > 0);
  }

  if (event?.value && Array.isArray(event.value)) {
    return event.value.filter(
      (transcript: any) => typeof transcript === "string" && transcript.trim().length > 0
    );
  }

  return [];
}

function attachSpeechListener(
  eventName: string,
  listener: (event?: any) => void
) {
  const addListener = (ExpoSpeechRecognitionModule as any)?.addListener;
  if (typeof addListener !== "function") {
    console.log(`[voiceModule] Missing addListener for speech event: ${eventName}`);
    return null;
  }

  return addListener.call(ExpoSpeechRecognitionModule, eventName, listener);
}

if (ExpoSpeechRecognitionModule) {
  attachSpeechListener("start", () => {
    voiceEngineState.isStarting = false;
    voiceEngineState.isListening = true;
    voiceEngineState.lastErrorKind = null;
    console.log("[voiceModule] Voice recognition started");
  });

  attachSpeechListener("result", (event: ExpoSpeechRecognitionResultEvent) => {
    const transcripts = extractTranscripts(event);
    if (transcripts.length === 0) {
      return;
    }

    if (event?.isFinal) {
      console.log("[voiceModule] Final transcripts:", transcripts);
      voiceRuntime.onSpeechResults?.({ value: transcripts });
      return;
    }

    console.log("[voiceModule] Partial transcripts:", transcripts);
    voiceRuntime.onSpeechPartialResults?.({ value: transcripts });
  });

  attachSpeechListener("end", () => {
    voiceEngineState.isStarting = false;
    voiceEngineState.isListening = false;
    console.log("[voiceModule] Voice recognition ended");
    voiceRuntime.onSpeechEnd?.();
  });

  attachSpeechListener("error", (error: SpeechErrorEvent) => {
    voiceEngineState.isStarting = false;
    voiceEngineState.isListening = false;
    voiceEngineState.lastErrorKind = classifyVoiceError(error);
    console.log("[voiceModule] Voice recognition error:", error);
    voiceRuntime.onSpeechError?.(error);
  });
}

export function isVoiceModuleAvailable() {
  return Boolean(ExpoSpeechRecognitionModule);
}

export function classifyVoiceError(error: SpeechErrorEvent): VoiceErrorKind {
  const raw = typeof error === "string" ? error : JSON.stringify(error ?? {});
  const normalized = raw.toLowerCase();

  if (normalized.includes("aborted")) {
    return "aborted";
  }
  if (normalized.includes("network")) {
    return "network";
  }
  if (
    normalized.includes("busy") ||
    normalized.includes("recognizerbusy") ||
    normalized.includes("already")
  ) {
    return "busy";
  }
  if (
    normalized.includes("permission") ||
    normalized.includes("audio") ||
    normalized.includes("record_audio")
  ) {
    return "permission";
  }

  return "unknown";
}

export function getVoiceEngineState() {
  return { ...voiceEngineState };
}

function getPreferredAndroidRecognitionService() {
  if (Platform.OS !== "android" || !isVoiceModuleAvailable()) {
    return undefined;
  }

  try {
    const services = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
    if (!Array.isArray(services) || services.length === 0) {
      return undefined;
    }

    if (services.includes("com.google.android.as")) {
      return "com.google.android.as";
    }

    if (services.includes("com.google.android.googlequicksearchbox")) {
      return "com.google.android.googlequicksearchbox";
    }

    return services[0];
  } catch {
    return undefined;
  }
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
  options: Partial<ExpoSpeechRecognitionOptions> = {},
  mode: VoiceMode = "keyword"
) {
  if (!isVoiceModuleAvailable()) {
    return {
      ok: false,
      reason:
        "Voice native module is unavailable. Rebuild the Android development app with expo run:android.",
    };
  }

  if (mode === "keyword" && AppState.currentState !== "active") {
    return {
      ok: false,
      reason: "Speech recognition is disabled while the app is in the background.",
    };
  }

  if (voiceEngineState.isStarting || voiceEngineState.isListening) {
    return {
      ok: false,
      reason: "Speech recognition is already active.",
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

    const androidRecognitionServicePackage =
      options.androidRecognitionServicePackage ??
      getPreferredAndroidRecognitionService();

    console.log("[voiceModule] Starting speech recognition engine");
    voiceEngineState.isStarting = true;
    voiceEngineState.isListening = false;
    voiceEngineState.activeMode = mode;
    voiceEngineState.lastErrorKind = null;

    ExpoSpeechRecognitionModule.start({
      lang: locale,
      interimResults: true,
      continuous: true,
      maxAlternatives: 5,
      addsPunctuation: false,
      androidRecognitionServicePackage,
      ...options,
    });
    return {
      ok: true,
    };
  } catch (error) {
    voiceEngineState.isStarting = false;
    voiceEngineState.isListening = false;
    voiceEngineState.activeMode = null;
    voiceEngineState.lastErrorKind = classifyVoiceError(error);
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
    voiceEngineState.isStarting = false;
    voiceEngineState.isListening = false;
    voiceEngineState.activeMode = null;
    ExpoSpeechRecognitionModule.stop();
  } catch {}
}

export async function safeVoiceCancel() {
  if (!isVoiceModuleAvailable()) {
    return;
  }

  try {
    voiceEngineState.isStarting = false;
    voiceEngineState.isListening = false;
    voiceEngineState.activeMode = null;
    ExpoSpeechRecognitionModule.abort();
  } catch {}
}

export async function safeVoiceDestroy() {
  voiceRuntime.onSpeechResults = null;
  voiceRuntime.onSpeechPartialResults = null;
  voiceRuntime.onSpeechEnd = null;
  voiceRuntime.onSpeechError = null;
}
