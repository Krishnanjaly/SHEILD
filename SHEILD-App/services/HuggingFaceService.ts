import {
  AudioAnalysisService,
  EmotionAnalysisResult as HuggingFaceEmotionResult,
} from "./AudioAnalysisService";

export const HuggingFaceService = {
  async analyzeEmotionFromAudio(audioUri: string): Promise<HuggingFaceEmotionResult[]> {
    const result = await AudioAnalysisService.analyzeEmotionFromAudio(audioUri);
    return result.emotions;
  },
};
