import type { ReactNode } from "react";
import type { AudioConfig, TranscribeConfig } from "@/transcribe/types";

export interface TranscribeProviderProps {
  config?: TranscribeConfig;
  audioConfig?: AudioConfig;
  children: ReactNode;
}
