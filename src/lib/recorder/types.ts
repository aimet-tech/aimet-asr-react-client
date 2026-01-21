import type { AudioFile } from "@/transcribe/types";

export interface RecordingConfig {
  mimeType?: "audio/webm" | "audio/mp4" | "audio/wav";
  audioBitsPerSecond?: number;
  timeSlice?: number; // For chunked recording
}

export interface RecorderState {
  isRecording: boolean;
  isMicActive: boolean;
  hasPermission: boolean;
  currentAudioFile: AudioFile | null;
}

// Recorder listener callback map
export type RecorderListener = keyof RecorderListenerCallbackMap;

export type RecorderListenerCallbackMap = {
  onMicStatusChange: (isMicActive: boolean) => void;
  onRecordingStart: () => void;
  onRecordingStop: (audioFile: AudioFile) => void;
  onPermissionGranted: () => void;
};

// Recorder service interface
export interface RecorderService {
  startRecording(): Promise<void>;
  stopRecording(): Promise<AudioFile | null>;
  startMicStream(): Promise<void>;
  stopMicStream(): void;
  closeMic(): void;
  requestPermission(): Promise<void>;
  getState(): RecorderState;
}
