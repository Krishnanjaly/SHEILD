import Constants from "expo-constants";

export interface HuggingFaceEmotionResult {
  label: string;
  score: number;
}

const MODEL_ID = "speechbrain/emotion-recognition-wav2vec2-IEMOCAP";
const ENDPOINT = `https://api-inference.huggingface.co/models/${MODEL_ID}`;

const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

const parseResponse = (payload: unknown): HuggingFaceEmotionResult[] => {
  const rawItems = Array.isArray(payload)
    ? payload.flatMap((item) => (Array.isArray(item) ? item : [item]))
    : [];

  return rawItems
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
    .filter((item): item is HuggingFaceEmotionResult => Boolean(item))
    .sort((a, b) => b.score - a.score);
};

export const HuggingFaceService = {
  async analyzeEmotionFromAudio(audioUri: string): Promise<HuggingFaceEmotionResult[]> {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      throw new Error("Missing Hugging Face API key");
    }

    const audioResponse = await fetch(audioUri);
    const audioBlob = await audioResponse.blob();

    let response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "audio/wav",
      },
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
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "audio/wav",
        },
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

    return emotions;
  },
};
