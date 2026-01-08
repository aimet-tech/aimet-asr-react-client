import type { AudioFile } from "@/transcribe/types";
import type { AudioRecorderService } from "@/recorder/utils/audioRecorderService";

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
}
