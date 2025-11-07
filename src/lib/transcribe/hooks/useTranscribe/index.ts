import { useEffect, useRef, useCallback, useState } from "react";
import type {
  UseTranscribeOptions,
  TranscribeListener,
  TranscribeListenerCallbackMap,
  TranscribeConnectionParams,
  AudioFile,
} from "@/transcribe/types";
import { TranscribeService } from "@/transcribe/utils/transcribeService";

export const useTranscribe = (options: UseTranscribeOptions) => {
  const serviceRef = useRef<TranscribeService | null>(null);
  const [serviceInitialized, setServiceInitialized] = useState(false);
  const latestAudioFileRef = useRef<AudioFile | null>(null);

  // Initialize service with enhanced callbacks that update React state
  useEffect(() => {
    setServiceInitialized(false);

    serviceRef.current = new TranscribeService(
      options.config,
      options.audioConfig
    );

    setServiceInitialized(true);

    return () => {
      if (serviceRef.current) {
        console.log("%c Clean up: stopTranscribing", "color: orange");
        serviceRef.current
          .stopTranscribing()
          .then((audioFile) => {
            // Save the audio file from cleanup if we got one
            if (audioFile) {
              latestAudioFileRef.current = audioFile;
            }
          })
          .catch(console.error);
        serviceRef.current = null;
      }
    };
  }, [options.config, options.audioConfig]);

  // Auto-request permission if enabled
  useEffect(() => {
    if (options.autoRequestPermission && serviceRef.current) {
      serviceRef.current.requestPermission().catch(console.error);
    }
  }, [options.autoRequestPermission]);

  const startTranscribing = useCallback(
    async (params: TranscribeConnectionParams) => {
      console.log(serviceRef.current?.listeners);
      try {
        await serviceRef.current?.startTranscribing(params);
      } catch (error) {
        console.error("Failed to start transcribing:", error);
        throw error;
      }
    },
    []
  );

  const stopTranscribing = useCallback(async () => {
    try {
      const audioFile = (await serviceRef.current?.stopTranscribing()) ?? null;

      // Save the latest audio file if we got one
      if (audioFile) {
        latestAudioFileRef.current = audioFile;
      }

      // If stopTranscribing returns null, return the last saved audio file
      return audioFile ?? latestAudioFileRef.current;
    } catch (error) {
      console.error("Failed to stop transcribing:", error);
      return latestAudioFileRef.current;
    }
  }, []);

  const stopTranscribeKeepSocket = useCallback(async () => {
    try {
      const audioFile =
        (await serviceRef.current?.stopTranscribeKeepSocket()) ?? null;

      // Save the latest audio file if we got one
      if (audioFile) {
        latestAudioFileRef.current = audioFile;
      }

      // If stopTranscribeKeepSocket returns null, return the last saved audio file
      return audioFile ?? latestAudioFileRef.current;
    } catch (error) {
      console.error("Failed to pause mic and stop recording:", error);
      // Return last saved audio file even on error
      return latestAudioFileRef.current;
    }
  }, []);

  const resumeTranscribe = useCallback(
    async (fallbackConnectionParams?: TranscribeConnectionParams) => {
      try {
        await serviceRef.current?.resumeTranscribe(fallbackConnectionParams);
      } catch (error) {
        console.error("Failed to resume mic:", error);
        throw error;
      }
    },
    []
  );

  const requestPermission = useCallback(async () => {
    try {
      await serviceRef.current?.requestPermission();
    } catch (error) {
      console.error("Failed to request permission:", error);
      throw error;
    }
  }, []);

  const addTranscribeListener = useCallback(
    <T extends TranscribeListener>(
      type: T,
      callback: TranscribeListenerCallbackMap[T]
    ) => serviceRef.current?.addTranscribeListener(type, callback),
    []
  );

  const removeTranscribeListener = useCallback(
    <T extends TranscribeListener>(
      type: T,
      callback: TranscribeListenerCallbackMap[T]
    ) => serviceRef.current?.removeTranscribeListener(type, callback),
    []
  );

  const getMediaStream = useCallback(() => {
    return serviceRef.current?.getMediaStream() || null;
  }, []);

  return {
    // State
    serviceRef,
    serviceInitialized,

    // Actions
    startTranscribing,
    stopTranscribing,
    stopTranscribeKeepSocket,
    resumeTranscribe,
    requestPermission,
    getMediaStream,
    addTranscribeListener,
    removeTranscribeListener,
  };
};
