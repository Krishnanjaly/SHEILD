import { triggerLowRisk, triggerHighRisk } from "./emergencyActions";
import {
    isVoiceModuleAvailable,
    safeVoiceStart,
    safeVoiceStop,
    voiceRuntime,
} from "./voiceModule";
import { findMatchedKeyword, normalizeSpeechText } from "./keywordMatcher";

const lowRiskKeywords = ["call me", "come later"];
const highRiskKeywords = ["help", "danger", "save me"];

export const startVoiceListening = async () => {
    const result = await safeVoiceStart("en-US");
    if (!result.ok) {
        console.log(result.reason);
    }
};

export const stopVoiceListening = async () => {
    await safeVoiceStop();
};

if (isVoiceModuleAvailable()) {
    voiceRuntime.onSpeechResults = (event) => {
        if (!event.value || event.value.length === 0) {
            return;
        }

        const spokenText = normalizeSpeechText(event.value.join(" "));

        console.log("Heard:", spokenText);

        if (findMatchedKeyword([spokenText], lowRiskKeywords)) {
            triggerLowRisk();
        }

        if (findMatchedKeyword([spokenText], highRiskKeywords)) {
            triggerHighRisk();
        }
    };
}
