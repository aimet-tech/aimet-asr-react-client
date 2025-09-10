import { useEffect, useRef, useState } from "react";
import { AudioRecorderService } from "@/recorder/utils/audioRecorderService";
import type { AudioFile } from "@/transcribe/types";
import { UseRecorderReturn } from "@/recorder/hooks/useRecorder/types";

export const useRecorder = (): UseRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderServiceRef = useRef<AudioRecorderService | null>(null);

  // Initialize AudioRecorderService
  useEffect(() => {
    recorderServiceRef.current = new AudioRecorderService({
      onRecordingStart: () => {
        setIsRecording(true);
        setError(null);
      },
      onRecordingStop: () => {
        setIsRecording(false);
      },
      onPermissionGranted: () => {
        setHasPermission(true);
        setError(null);
      },
      onPermissionDenied: () => {
        setHasPermission(false);
        setError("Microphone permission denied");
      },
      onError: (error) => {
        setError(error.message);
        setIsRecording(false);
      },
    });

    // Cleanup function
    return () => {
      if (recorderServiceRef.current) {
        recorderServiceRef.current.closeMic();
      }
    };
  }, []);

  const requestPermission = async (): Promise<void> => {
    try {
      setError(null);
      await recorderServiceRef.current?.requestPermission();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to request permission"
      );
      throw error;
    }
  };

  const openMic = async (): Promise<void> => {
    try {
      setError(null);
      await recorderServiceRef.current?.openMic();
      setIsRecording(true);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to open microphone"
      );
      throw error;
    }
  };

  const closeMic = (): void => {
    try {
      setError(null);
      recorderServiceRef.current?.closeMic();
      setIsRecording(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to close microphone"
      );
    }
  };

  const startRecord = async (): Promise<void> => {
    try {
      setError(null);
      await recorderServiceRef.current?.startRecording();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to start recording"
      );
      throw error;
    }
  };

  const stopRecord = async (): Promise<AudioFile | null> => {
    try {
      setError(null);
      const audioFile = await recorderServiceRef.current?.stopRecording();
      recorderServiceRef.current?.closeMic();
      return audioFile || null;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Failed to stop recording"
      );
      throw error;
    }
  };

  const reset = (): void => {
    setError(null);
    setIsRecording(false);
  };

  return {
    isRecording,
    hasPermission,
    error,
    recorderServiceRef,
    startRecord,
    stopRecord,
    requestPermission,
    openMic,
    closeMic,
    reset,
  };
};

export default useRecorder;
