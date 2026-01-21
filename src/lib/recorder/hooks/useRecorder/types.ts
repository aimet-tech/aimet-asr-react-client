import type { AudioFile } from "@/transcribe/types";
import type { AudioRecorderService } from "@/recorder/utils/audioRecorderService";
import type {
  RecorderListener,
  RecorderListenerCallbackMap,
} from "@/recorder/types";

export interface UseRecorderReturn {
  // State
  isRecording: boolean;
  hasPermission: boolean;

  // Ref for MediaStream access
  recorderServiceRef: React.RefObject<AudioRecorderService | null>;

  // Actions
  startRecord: () => Promise<void>;
  stopRecord: () => Promise<AudioFile | null>;
  requestPermission: () => Promise<void>;
  openMic: () => Promise<void>;
  closeMic: () => void;

  // Utility
  reset: () => void;

  // Listener Management
  addRecorderListener: <T extends RecorderListener>(
    type: T,
    callback: RecorderListenerCallbackMap[T]
  ) => void;
  removeRecorderListener: <T extends RecorderListener>(
    type: T,
    callback: RecorderListenerCallbackMap[T]
  ) => void;
}
