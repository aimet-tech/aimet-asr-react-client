import type { AudioRecorderService } from "@/recorder/utils/audioRecorderService";
import type { AudioFile } from "@/transcribe/types";

export interface RecorderContextValue {
  // State for React to track changes
  isRecording: boolean;
  hasPermission: boolean;
  error: string | null;

  // Ref for current MediaStream access
  recorderServiceRef: React.RefObject<AudioRecorderService | null>;

  // Actions that work with current MediaStream
  startRecord: () => Promise<void>;
  stopRecord: () => Promise<AudioFile | null>;
  requestPermission: () => Promise<void>;
  openMic: () => Promise<void>;
  closeMic: () => void;
  reset: () => void;
}
