import type {
  AudioFile,
  TranscribeListener,
  TranscribeListenerCallbackMap,
  TranscribeConnectionParams,
} from "@/transcribe/types";

export interface TranscribeActions {
  // Callback setters
  addTranscribeListener: <T extends TranscribeListener>(
    type: T,
    callback: TranscribeListenerCallbackMap[T]
  ) => void;
  removeTranscribeListener: <T extends TranscribeListener>(
    type: T,
    callback: TranscribeListenerCallbackMap[T]
  ) => void;

  // Action functions
  startTranscribing: (params: TranscribeConnectionParams) => Promise<void>;
  stopTranscribing: () => Promise<AudioFile | null>;
  stopTranscribeKeepSocket: () => Promise<AudioFile | null>;
  resumeTranscribe: (
    fallbackConnectionParams?: TranscribeConnectionParams
  ) => Promise<void>;
  requestPermission: () => Promise<void>;
  getMediaStream: () => MediaStream | null;
}
