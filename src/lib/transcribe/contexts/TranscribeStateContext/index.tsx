import { createContext } from "react";
import type { TranscribeState } from "@/transcribe/contexts/TranscribeStateContext/types";

const defaultState: TranscribeState = {
  transcribeService: null,
  serviceInitialized: false,
};

export const TranscribeStateContext =
  createContext<TranscribeState>(defaultState);
