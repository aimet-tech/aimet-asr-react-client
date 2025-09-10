import { type FC, memo } from "react";
import { useTranscribe } from "@/transcribe/hooks/useTranscribe";
import { TranscribeStateContext } from "@/transcribe/contexts/TranscribeStateContext";
import { TranscribeActionContext } from "@/transcribe/contexts/TranscribeActionContext";
import type { TranscribeProviderProps } from "@/transcribe/providers/TranscribeProvider/types";

export const TranscribeProvider: FC<TranscribeProviderProps> = memo(
  ({
    audioConfig = {
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      bufferSize: 4096,
      // mimeType is undefined by default (auto-detection), audioBitsPerSecond defaults to 128000 (128 kbps)
    },
    config = {
      enableRecording: true,
      reconnectAttempts: 5,
      reconnectDelay: 1000,
    },
    children,
  }) => {
    // Use the transcribe hook
    const transcribeResult = useTranscribe({
      config,
      audioConfig,
      autoRequestPermission: false,
    });

    // Context values
    const stateValue = {
      transcribeService: transcribeResult.serviceRef,
      serviceInitialized: transcribeResult.serviceInitialized,
    };

    const actionValue = {
      addTranscribeListener: transcribeResult.addTranscribeListener,
      removeTranscribeListener: transcribeResult.removeTranscribeListener,

      // Action functions
      startTranscribing: transcribeResult.startTranscribing,
      stopTranscribing: transcribeResult.stopTranscribing,
      stopTranscribeKeepSocket: transcribeResult.stopTranscribeKeepSocket,
      resumeTranscribe: transcribeResult.resumeTranscribe,
      requestPermission: transcribeResult.requestPermission,
      getMediaStream: transcribeResult.getMediaStream,
    };

    return (
      <TranscribeStateContext.Provider value={stateValue}>
        <TranscribeActionContext.Provider value={actionValue}>
          {children}
        </TranscribeActionContext.Provider>
      </TranscribeStateContext.Provider>
    );
  }
);
