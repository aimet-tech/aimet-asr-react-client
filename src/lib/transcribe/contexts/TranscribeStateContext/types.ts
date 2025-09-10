import type { TranscribeService } from "@/transcribe/utils/transcribeService";

export interface TranscribeState {
  transcribeService: React.RefObject<TranscribeService | null> | null;
  serviceInitialized: boolean;
}
