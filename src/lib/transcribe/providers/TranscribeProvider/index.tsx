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
    // const stateValue = useMemo(
    //   () => ({
    //     transcribeService: transcribeResult.serviceRef.current,
    //     serviceInitialized: transcribeResult.serviceInitialized,
    //   }),
    //   [transcribeResult]
    // );

    // const actionValue = useMemo(
    //   () => ({
    //     // Callback setters
    //     addTranscribeListener:
    //       transcribeResult.serviceRef.current?.addTranscribeListener ??
    //       (() =>
    //         console.log(
    //           "transcribeService not initialized yet, addListener failed"
    //         )),
    //     removeTranscribeListener:
    //       transcribeResult.serviceRef.current?.removeTranscribeListener ??
    //       (() =>
    //         console.log(
    //           "transcribeService not initialized yet, removeListener failed"
    //         )),

    //     // Action functions
    //     startTranscribing: transcribeResult.startTranscribing,
    //     stopTranscribing: transcribeResult.stopTranscribing,
    //     stopTranscribeKeepSocket: transcribeResult.stopTranscribeKeepSocket,
    //     resumeTranscribe: transcribeResult.resumeTranscribe,
    //     requestPermission: transcribeResult.requestPermission,
    //   }),
    //   [transcribeResult]
    // );
    const stateValue = {
      transcribeService: transcribeResult.serviceRef,
      serviceInitialized: transcribeResult.serviceInitialized,
    };

    const actionValue = {
      // Callback setters
      // addTranscribeListener: <T extends TranscribeListener>(
      //   type: T,
      //   callback: TranscribeListenerCallbackMap[T]
      // ) =>
      //   transcribeResult.serviceRef.current?.addTranscribeListener(
      //     type,
      //     callback
      //   ),

      // removeTranscribeListener: <T extends TranscribeListener>(
      //   type: T,
      //   callback: TranscribeListenerCallbackMap[T]
      // ) =>
      //   transcribeResult.serviceRef.current?.removeTranscribeListener(
      //     type,
      //     callback
      //   ),

      addTranscribeListener: transcribeResult.addTranscribeListener,
      removeTranscribeListener: transcribeResult.removeTranscribeListener,

      // addTranscribeListener:
      //   transcribeResult.serviceRef.current?.addTranscribeListener ??
      //   (() =>
      //     console.log(
      //       "transcribeService not initialized yet, addListener failed"
      //     )),
      // removeTranscribeListener:
      //   transcribeResult.serviceRef.current?.removeTranscribeListener ??
      //   (() =>
      //     console.log(
      //       "transcribeService not initialized yet, removeListener failed"
      //     )),

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
