import Constants from "expo-constants";

export interface EmotionAnalysisResult {
  label: string;
  score: number;
}

export interface AudioAnalysisResult {
  emotions: EmotionAnalysisResult[];
  dominantEmotion: string;
  confidence: number;
  emotionScore: number | null;
  usedFallback: boolean;
}

const MODEL_ID = "speechbrain/emotion-recognition-wav2vec2-IEMOCAP";
const ENDPOINT = `https://api-inference.huggingface.co/models/${MODEL_ID}`;

const EMOTION_SCORE_MAP: Record<string, number> = {
  angry: 100,
  anger: 100,
  fear: 100,
  fearful: 100,
  panic: 100,
  terrified: 100,
  frustrated: 82,
  frustration: 82,
  sad: 62,
  sadness: 62,
  surprise: 50,
  neutral: 25,
  calm: 15,
  happy: 20,
  happiness: 20,
};

const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeLabel = (value: string) => value.trim().toLowerCase();

const resolveApiKey = () => {
  const extra = Constants.expoConfig?.extra as
    | { huggingFaceApiKey?: string }
    | undefined;

  return (
    process.env.EXPO_PUBLIC_HUGGING_FACE_API_KEY ||
    process.env.HUGGING_FACE_API_KEY ||
    extra?.huggingFaceApiKey ||
    null
  );
};

const parseResponse = (payload: unknown): EmotionAnalysisResult[] => {
  const items = Array.isArray(payload)
    ? payload.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
    : [];

  return items
    .map((item) => {
      if (
        item &&
        typeof item === "object" &&
        "label" in item &&
        "score" in item
      ) {
        return {
          label: normalizeLabel(String((item as { label: string }).label)),
          score: Number((item as { score: number }).score) || 0,
        };
      }

      return null;
    })
    .filter((item): item is EmotionAnalysisResult => Boolean(item))
    .sort((left, right) => right.score - left.score);
};

const toEmotionScore = (label: string, confidence: number) => {
  const base = EMOTION_SCORE_MAP[normalizeLabel(label)] ?? 35;
  return clamp(Math.round(base * clamp(confidence, 0, 1)), 0, 100);
};

const resolveContentType = (uri: string) => {
  const lowerUri = uri.toLowerCase();
  if (lowerUri.endsWith(".wav")) {
    return "audio/wav";
  }
  if (lowerUri.endsWith(".m4a")) {
    return "audio/mp4";
  }
  if (lowerUri.endsWith(".webm")) {
    return "audio/webm";
  }
  return "application/octet-stream";
};

export const AudioAnalysisService = {
  async analyzeEmotionFromAudio(audioUri: string): Promise<AudioAnalysisResult> {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      throw new Error("Missing Hugging Face API key");
    }

    const audioResponse = await fetch(audioUri);
    const audioBlob = await audioResponse.blob();
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": resolveContentType(audioUri),
    };

    let response = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: audioBlob,
    });

    if (response.status === 503) {
      const payload = await response.json().catch(() => null);
      const estimatedTime =
        typeof payload?.estimated_time === "number"
          ? payload.estimated_time
          : 2;
      await wait(Math.ceil(estimatedTime * 1000));

      response = await fetch(ENDPOINT, {
        method: "POST",
        headers,
        body: audioBlob,
      });
    }

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Hugging Face inference failed: ${response.status} ${message}`);
    }

    const payload = await response.json();
    const emotions = parseResponse(payload);
    if (emotions.length === 0) {
      throw new Error("No emotion result returned from Hugging Face");
    }

    const dominantEmotion = emotions[0].label;
    const confidence = emotions[0].score;

    return {
      emotions,
      dominantEmotion,
      confidence,
      emotionScore: toEmotionScore(dominantEmotion, confidence),
      usedFallback: false,
    };
  },

  async analyzeEmotionWithFallback(audioUri: string): Promise<AudioAnalysisResult> {
    try {
      return await this.analyzeEmotionFromAudio(audioUri);
    } catch {
      return {
        emotions: [],
        dominantEmotion: "unavailable",
        confidence: 0,
        emotionScore: null,
        usedFallback: true,
      };
    }
  },

  mapEmotionToScore(label: string, confidence: number) {
    return toEmotionScore(label, confidence);
  },
};
