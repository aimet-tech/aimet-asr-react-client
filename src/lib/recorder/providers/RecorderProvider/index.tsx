import type React from "react";
import useRecorder from "@/recorder/hooks/useRecorder";
import { RecorderContext } from "@/recorder/contexts/RecorderContext";

interface RecorderProviderProps {
  children: React.ReactNode;
}

export const RecorderProvider: React.FC<RecorderProviderProps> = ({
  children,
}) => {
  const recorderHook = useRecorder(); // Use the hook internally

  const contextValue = {
    // State from hook
    isRecording: recorderHook.isRecording,
    hasPermission: recorderHook.hasPermission,
    error: recorderHook.error,

    // Ref to service for MediaStream access
    recorderServiceRef: recorderHook.recorderServiceRef,

    // Actions from hook
    startRecord: recorderHook.startRecord,
    stopRecord: recorderHook.stopRecord,
    requestPermission: recorderHook.requestPermission,
    openMic: recorderHook.openMic,
    closeMic: recorderHook.closeMic,
    reset: recorderHook.reset,
  };

  return (
    <RecorderContext.Provider value={contextValue}>
      {children}
    </RecorderContext.Provider>
  );
};
