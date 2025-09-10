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
  error: string | null;
  currentAudioFile: AudioFile | null;
}

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
