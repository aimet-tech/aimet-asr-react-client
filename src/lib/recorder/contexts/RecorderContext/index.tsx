import { createContext } from "react";
import { RecorderContextValue } from "@/recorder/contexts/RecorderContext/types";

// Create context with default value so it's never undefined
export const RecorderContext = createContext<RecorderContextValue>({
  // Default state values
  isRecording: false,
  hasPermission: false,
  error: null,

  // Default ref
  recorderServiceRef: { current: null },

  // Default actions (will throw error if called without provider)
  startRecord: () => {
    throw new Error("RecorderContext must be used within a RecorderProvider");
  },
  stopRecord: () => {
    throw new Error("RecorderContext must be used within a RecorderProvider");
  },
  requestPermission: () => {
    throw new Error("RecorderContext must be used within a RecorderProvider");
  },
  openMic: () => {
    throw new Error("RecorderContext must be used within a RecorderProvider");
  },
  closeMic: () => {
    throw new Error("RecorderContext must be used within a RecorderProvider");
  },
  reset: () => {
    throw new Error("RecorderContext must be used within a RecorderProvider");
  },
});
