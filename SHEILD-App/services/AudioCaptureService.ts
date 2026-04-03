import { Audio } from "expo-av";

export interface AudioCaptureResult {
  uri: string;
  durationMs: number;
}

const ANALYSIS_RECORDING_DURATION_MS = 4000;

const ANALYSIS_RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: ".m4a",
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: ".wav",
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 256000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 64000,
  },
};

const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const AudioCaptureService = {
  async captureAnalysisClip(
    durationMs: number = ANALYSIS_RECORDING_DURATION_MS
  ): Promise<AudioCaptureResult> {
    const permission = await Audio.requestPermissionsAsync();
    if (permission.status !== "granted") {
      throw new Error("Audio permission denied");
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      playThroughEarpieceAndroid: false,
    });

    const recording = new Audio.Recording();

    try {
      await recording.prepareToRecordAsync(ANALYSIS_RECORDING_OPTIONS);
      await recording.startAsync();
      await wait(durationMs);
      await recording.stopAndUnloadAsync();

      const uri = recording.getURI();
      if (!uri) {
        throw new Error("Recorded audio URI unavailable");
      }

      return {
        uri,
        durationMs,
      };
    } finally {
      try {
        const status = await recording.getStatusAsync();
        if (status.isRecording) {
          await recording.stopAndUnloadAsync();
        }
      } catch {}
    }
  },
};
