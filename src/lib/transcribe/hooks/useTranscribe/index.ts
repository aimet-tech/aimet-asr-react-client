import { useEffect, useRef, useCallback, useState } from "react";
import type {
  UseTranscribeOptions,
  TranscribeListener,
  TranscribeListenerCallbackMap,
  TranscribeConnectionParams,
  AudioFile,
} from "@/transcribe/types";
import { TranscribeService } from "@/transcribe/utils/transcribeService";
import { TranscribeServiceNotInitializedError } from "@/transcribe/errors";

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

    console.log("%c [useTranscribe] Service initialized", "color: purple");

    return () => {
      if (serviceRef.current) {
        console.log("%c [useTranscribe] Cleaning up service", "color: purple");
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
      if (!serviceRef.current) {
        throw new TranscribeServiceNotInitializedError();
      }
      return await serviceRef.current.startTranscribing(params);
    },
    []
  );

  const stopTranscribing = useCallback(async () => {
    const audioFile = (await serviceRef.current?.stopTranscribing()) ?? null;

    // Save the latest audio file if we got one
    if (audioFile) {
      latestAudioFileRef.current = audioFile;
    }

    // If stopTranscribing returns null, return the last saved audio file
    return audioFile ?? latestAudioFileRef.current;
  }, []);

  const stopTranscribeKeepSocket = useCallback(async () => {
    if (!serviceRef.current) {
      throw new TranscribeServiceNotInitializedError();
    }
    const audioFile = await serviceRef.current.stopTranscribeKeepSocket();

    // Save the latest audio file if we got one
    if (audioFile) {
      latestAudioFileRef.current = audioFile;
    }

    // If stopTranscribeKeepSocket returns null, return the last saved audio file
    return audioFile ?? latestAudioFileRef.current;
  }, []);

  const resumeTranscribe = useCallback(
    async (fallbackConnectionParams?: TranscribeConnectionParams) => {
      if (!serviceRef.current) {
        throw new TranscribeServiceNotInitializedError();
      }
      await serviceRef.current.resumeTranscribe(fallbackConnectionParams);
    },
    []
  );

  const requestPermission = useCallback(async () => {
    if (!serviceRef.current) {
      throw new TranscribeServiceNotInitializedError();
    }
    await serviceRef.current.requestPermission();
  }, []);

  const addTranscribeListener = useCallback(
    <T extends TranscribeListener>(
      type: T,
      callback: TranscribeListenerCallbackMap[T]
    ) => {
      if (!serviceRef.current) {
        throw new TranscribeServiceNotInitializedError();
      }
      serviceRef.current.addTranscribeListener(type, callback);
    },
    []
  );

  const removeTranscribeListener = useCallback(
    <T extends TranscribeListener>(
      type: T,
      callback: TranscribeListenerCallbackMap[T]
    ) => {
      if (!serviceRef.current) {
        throw new TranscribeServiceNotInitializedError();
      }
      serviceRef.current.removeTranscribeListener(type, callback);
    },
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
