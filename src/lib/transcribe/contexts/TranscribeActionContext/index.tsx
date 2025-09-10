import { createContext } from "react";
import type { TranscribeActions } from "@/transcribe/contexts/TranscribeActionContext/types";

const defaultActions: TranscribeActions = {
  // Default callback setters (no-op)
  addTranscribeListener: () => {
    console.error(
      "addTranscribeListener must be used within TranscribeProvider"
    );
  },
  removeTranscribeListener: () => {
    console.error(
      "removeTranscribeListener must be used within TranscribeProvider"
    );
  },

  // Default action functions (no-op)
  startTranscribing: async () => {
    console.error("startTranscribing must be used within TranscribeProvider");
  },
  stopTranscribing: async () => {
    console.error("stopTranscribing must be used within TranscribeProvider");
    return null;
  },
  stopTranscribeKeepSocket: async () => {
    console.error(
      "stopTranscribeKeepSocket must be used within TranscribeProvider"
    );
    return null;
  },
  resumeTranscribe: async () => {
    console.error("resumeTranscribe must be used within TranscribeProvider");
  },
  requestPermission: async () => {
    console.error("requestPermission must be used within TranscribeProvider");
  },
  getMediaStream: () => {
    console.error("getMediaStream must be used within TranscribeProvider");
    return null;
  },
};

export const TranscribeActionContext =
  createContext<TranscribeActions>(defaultActions);
