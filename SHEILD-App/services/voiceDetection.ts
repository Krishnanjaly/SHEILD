import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, AppStateStatus, DeviceEventEmitter } from "react-native";
import { triggerLowRisk, triggerHighRisk } from "./emergencyActions";
import { findMatchedKeyword, normalizeSpeechText } from "./keywordMatcher";
import { fetchKeywords } from "./keywordService";
import { aiRiskEngine } from "../utils/AiRiskEngine";
import {
    classifyVoiceError,
    isVoiceModuleAvailable,
    safeVoiceCancel,
    safeVoiceStart,
    safeVoiceStop,
    voiceRuntime,
} from "./voiceModule";

let lowRiskKeywords = ["call me", "come later", "emergency"];
let highRiskKeywords = ["help", "danger", "save me", "help help"];

const RESTART_DELAY_MS = 2500;
const MAX_CONSECUTIVE_RESTARTS = 3;

let keywordListeningEnabled = false;
let keywordListenersBound = false;
let keywordRestartTimeout: ReturnType<typeof setTimeout> | null = null;
let keywordRestartAttempts = 0;
let isStartingKeywordListening = false;
let appStateSubscription: { remove: () => void } | null = null;
let suspendedForBackground = false;

const clearRestartTimer = () => {
    if (keywordRestartTimeout) {
        clearTimeout(keywordRestartTimeout);
        keywordRestartTimeout = null;
    }
};

const isForegroundActive = () => AppState.currentState === "active";

const buildContextualStrings = () =>
    Array.from(new Set([...highRiskKeywords, ...lowRiskKeywords]));

export const syncKeywords = async () => {
    try {
        const userId = await AsyncStorage.getItem("userId");
        if (userId) {
            const data = await fetchKeywords(userId);
            if (data.lowKeywords && data.lowKeywords.length > 0) lowRiskKeywords = data.lowKeywords;
            if (data.highKeywords && data.highKeywords.length > 0) highRiskKeywords = data.highKeywords;
            console.log("Voice keywords synced from backend:", {
                low: lowRiskKeywords,
                high: highRiskKeywords,
            });
        }
    } catch (error) {
        console.log("Keyword sync failed", error);
    }
};

export const getLoadedKeywords = () => ({
    low: lowRiskKeywords,
    high: highRiskKeywords,
});

const processSpeechResults = (transcriptParts: string[]) => {
    const spokenText = normalizeSpeechText(transcriptParts.join(" "));
    console.log("Heard:", spokenText);

    const highMatch = findMatchedKeyword(transcriptParts, highRiskKeywords);
    if (highMatch) {
        console.log("EMERGENCY KEYWORD DETECTED:", highMatch);
        DeviceEventEmitter.emit("KEYWORD_DETECTED", { keyword: highMatch, risk: "HIGH" });
        triggerHighRisk(highMatch);
        return true;
    }

    const lowMatch = findMatchedKeyword(transcriptParts, lowRiskKeywords);
    if (lowMatch) {
        console.log("CAUTION KEYWORD DETECTED:", lowMatch);
        DeviceEventEmitter.emit("KEYWORD_DETECTED", { keyword: lowMatch, risk: "LOW" });
        triggerLowRisk(lowMatch);
        return true;
    }

    return false;
};

const startKeywordListeningInternal = async () => {
    if (!keywordListeningEnabled || !isVoiceModuleAvailable() || !isForegroundActive()) {
        return;
    }

    if (isStartingKeywordListening) {
        return;
    }

    isStartingKeywordListening = true;
    clearRestartTimer();

    try {
        await syncKeywords();
        await aiRiskEngine.pauseAudioRecording();

        const result = await safeVoiceStart(
            "en-US",
            {
                contextualStrings: buildContextualStrings(),
                interimResults: true,
                continuous: true,
                maxAlternatives: 5,
                addsPunctuation: false,
            },
            "keyword"
        );

        if (!result.ok) {
            const failureReason = result.reason ?? "Unknown speech recognition start failure";
            console.log("Voice Listen Start Failed:", failureReason);

            if (
                keywordListeningEnabled &&
                isForegroundActive() &&
                !failureReason.includes("already active")
            ) {
                scheduleRestart(`initial start failed: ${failureReason}`);
            }
            return;
        }

        keywordRestartAttempts = 0;
        console.log("Voice Listening / Keyword Detection Started");
        console.log("Listening for HIGH keywords:", highRiskKeywords);
        console.log("Listening for LOW keywords:", lowRiskKeywords);
    } finally {
        isStartingKeywordListening = false;
    }
};

const stopKeywordListeningInternal = async (
    preserveEnabled: boolean,
    resumeAiAudio: boolean
) => {
    clearRestartTimer();
    keywordRestartAttempts = 0;
    keywordListeningEnabled = preserveEnabled;
    isStartingKeywordListening = false;

    await safeVoiceStop();
    await safeVoiceCancel();

    if (resumeAiAudio) {
        await aiRiskEngine.resumeAudioRecording();
    }
};

const scheduleRestart = (reason: string) => {
    if (!keywordListeningEnabled || !isForegroundActive()) {
        return;
    }

    if (keywordRestartAttempts >= MAX_CONSECUTIVE_RESTARTS) {
        console.log("Voice restart limit reached. Stopping keyword listening:", reason);
        stopKeywordListeningInternal(true, true).catch(console.error);
        return;
    }

    keywordRestartAttempts += 1;
    clearRestartTimer();
    keywordRestartTimeout = setTimeout(() => {
        console.log(`Restarting keyword detection (${keywordRestartAttempts}/${MAX_CONSECUTIVE_RESTARTS}): ${reason}`);
        startKeywordListeningInternal().catch(console.error);
    }, RESTART_DELAY_MS);
};

const ensureAppStateSubscription = () => {
    if (appStateSubscription) {
        return;
    }

    appStateSubscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
        if (nextState === "active") {
            if (keywordListeningEnabled && suspendedForBackground) {
                suspendedForBackground = false;
                startKeywordListeningInternal().catch(console.error);
            }
            return;
        }

        if (keywordListeningEnabled) {
            suspendedForBackground = true;
            stopKeywordListeningInternal(true, true).catch(console.error);
        }
    });
};

const bindKeywordVoiceHandlers = () => {
    if (keywordListenersBound || !isVoiceModuleAvailable()) {
        return;
    }

    voiceRuntime.onSpeechResults = (event) => {
        if (!event.value || event.value.length === 0) {
            return;
        }

        keywordRestartAttempts = 0;
        processSpeechResults(event.value);
    };

    voiceRuntime.onSpeechPartialResults = (event) => {
        if (!event.value || event.value.length === 0) {
            return;
        }

        keywordRestartAttempts = 0;
        const spokenText = normalizeSpeechText(event.value.join(" "));
        console.log("Partial:", spokenText);

        processSpeechResults(event.value);
    };

    voiceRuntime.onSpeechEnd = () => {
        if (!keywordListeningEnabled || !isForegroundActive()) {
            return;
        }

        scheduleRestart("speech ended");
    };

    voiceRuntime.onSpeechError = (error) => {
        const kind = classifyVoiceError(error);
        console.log("Speech Recognition Error Callback:", error, "kind:", kind);

        if (!keywordListeningEnabled || !isForegroundActive()) {
            return;
        }

        if (kind === "aborted") {
            console.log("Speech recognition aborted. Restarting after a short delay.");
        }

        scheduleRestart(`speech error: ${kind}`);
    };

    keywordListenersBound = true;
};

export const startVoiceListening = async () => {
    console.log("Attempting to start voice detection...");

    if (!isVoiceModuleAvailable()) {
        console.log("Voice native module unavailable. Keyword detection is disabled.");
        return;
    }

    keywordListeningEnabled = true;
    suspendedForBackground = false;
    ensureAppStateSubscription();
    bindKeywordVoiceHandlers();

    if (!isForegroundActive()) {
        console.log("App is not in foreground. Keyword listening will wait until the app becomes active.");
        return;
    }

    await startKeywordListeningInternal();
};

export const stopVoiceListening = async () => {
    await stopKeywordListeningInternal(false, true);
    console.log("Voice Listening Stopped");
};
