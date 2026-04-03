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

    if (services.includes("com.google.android.googlequicksearchbox")) {
      return "com.google.android.googlequicksearchbox";
    }

    if (services.includes("com.google.android.as")) {
      return "com.google.android.as";
    }

    return services[0];
  } catch {
    return undefined;
  }
}

async function resolveRecognitionLocale(
  requestedLocale: string,
  androidRecognitionServicePackage?: string
) {
  const normalizedRequested = requestedLocale.toLowerCase();
  const requestedLanguage = normalizedRequested.split("-")[0];
  const deviceLocale =
    Intl.DateTimeFormat().resolvedOptions().locale?.replace("_", "-") ?? requestedLocale;
  const normalizedDeviceLocale = deviceLocale.toLowerCase();
  const deviceLanguage = normalizedDeviceLocale.split("-")[0];

  try {
    const localeResult = await ExpoSpeechRecognitionModule.getSupportedLocales({
      androidRecognitionServicePackage,
    });
    const installedLocales = (localeResult.installedLocales ?? []).filter(Boolean);
    const supportedLocales = (localeResult.locales ?? []).filter(Boolean);
    const availableLocales = [...installedLocales, ...supportedLocales];

    if (availableLocales.length === 0) {
      return requestedLocale;
    }

    const uniqueInstalledLocales = Array.from(new Set(installedLocales));
    const uniqueLocales = Array.from(new Set(availableLocales));

    // Prefer locales that are already installed on the device.
    // Some Android recognition services advertise support for locales like en-US
    // but immediately fail with LANGUAGE_PACK_ERROR when that language pack
    // is not installed. Falling back to an installed same-language locale like
    // en-GB keeps recognition working.
    const exactInstalledRequested = uniqueInstalledLocales.find(
      (locale) => locale.toLowerCase() === normalizedRequested
    );
    if (exactInstalledRequested) {
      return exactInstalledRequested;
    }

    const sameLanguageInstalledRequested = uniqueInstalledLocales.find(
      (locale) => locale.toLowerCase().split("-")[0] === requestedLanguage
    );
    if (sameLanguageInstalledRequested) {
      if (sameLanguageInstalledRequested.toLowerCase() !== normalizedRequested) {
        console.log(
          `[voiceModule] Requested locale ${requestedLocale} is not installed. Falling back to installed locale ${sameLanguageInstalledRequested}.`
        );
      }
      return sameLanguageInstalledRequested;
    }

    const exactInstalledDeviceLocale = uniqueInstalledLocales.find(
      (locale) => locale.toLowerCase() === normalizedDeviceLocale
    );
    if (exactInstalledDeviceLocale) {
      console.log(
        `[voiceModule] Requested locale ${requestedLocale} is not installed. Falling back to installed device locale ${exactInstalledDeviceLocale}.`
      );
      return exactInstalledDeviceLocale;
    }

    const sameLanguageInstalledDevice = uniqueInstalledLocales.find(
      (locale) => locale.toLowerCase().split("-")[0] === deviceLanguage
    );
    if (sameLanguageInstalledDevice) {
      console.log(
        `[voiceModule] Requested locale ${requestedLocale} is not installed. Falling back to installed device language locale ${sameLanguageInstalledDevice}.`
      );
      return sameLanguageInstalledDevice;
    }

    const exactRequested = uniqueLocales.find(
      (locale) => locale.toLowerCase() === normalizedRequested
    );
    if (exactRequested) {
      return exactRequested;
    }

    const sameLanguageRequested = uniqueLocales.find(
      (locale) => locale.toLowerCase().split("-")[0] === requestedLanguage
    );
    if (sameLanguageRequested) {
      console.log(
        `[voiceModule] Requested locale ${requestedLocale} unavailable. Falling back to ${sameLanguageRequested}.`
      );
      return sameLanguageRequested;
    }

    const exactDeviceLocale = uniqueLocales.find(
      (locale) => locale.toLowerCase() === normalizedDeviceLocale
    );
    if (exactDeviceLocale) {
      console.log(
        `[voiceModule] Requested locale ${requestedLocale} unavailable. Falling back to device locale ${exactDeviceLocale}.`
      );
      return exactDeviceLocale;
    }

    const sameLanguageDevice = uniqueLocales.find(
      (locale) => locale.toLowerCase().split("-")[0] === deviceLanguage
    );
    if (sameLanguageDevice) {
      console.log(
        `[voiceModule] Requested locale ${requestedLocale} unavailable. Falling back to device language locale ${sameLanguageDevice}.`
      );
      return sameLanguageDevice;
    }

    console.log(
      `[voiceModule] Requested locale ${requestedLocale} unavailable. Falling back to first available locale ${uniqueLocales[0]}.`
    );
    return uniqueLocales[0];
  } catch (error) {
    console.log("[voiceModule] Could not resolve supported locales, using requested locale.", error);
    return requestedLocale;
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
    const recognitionLocale = await resolveRecognitionLocale(
      locale,
      androidRecognitionServicePackage
    );

    console.log("[voiceModule] Starting speech recognition engine");
    voiceEngineState.isStarting = true;
    voiceEngineState.isListening = false;
    voiceEngineState.activeMode = mode;
    voiceEngineState.lastErrorKind = null;

    const mergedOptions: ExpoSpeechRecognitionOptions = {
      interimResults: true,
      continuous: true,
      maxAlternatives: 5,
      addsPunctuation: false,
      androidRecognitionServicePackage,
      requiresOnDeviceRecognition: false,
      androidIntentOptions:
        Platform.OS === "android"
          ? {
              EXTRA_LANGUAGE_MODEL: "free_form",
              EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 15000,
              EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 5000,
              EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 5000,
              ...(options.androidIntentOptions ?? {}),
            }
          : options.androidIntentOptions,
      ...options,
    };

    if (Platform.OS !== "android" || recognitionLocale) {
      mergedOptions.lang = recognitionLocale;
    }

    ExpoSpeechRecognitionModule.start(mergedOptions);
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
