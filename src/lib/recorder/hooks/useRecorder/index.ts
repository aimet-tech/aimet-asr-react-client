import { useEffect, useRef, useState, useCallback } from "react";
import { AudioRecorderService } from "@/recorder/utils/audioRecorderService";
import type { AudioFile } from "@/transcribe/types";
import { UseRecorderReturn } from "@/recorder/hooks/useRecorder/types";
import type {
  RecorderListener,
  RecorderListenerCallbackMap,
} from "@/recorder/types";

export const useRecorder = (): UseRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  const recorderServiceRef = useRef<AudioRecorderService | null>(null);
  const latestAudioFileRef = useRef<AudioFile | null>(null);

  // Listener management
  const listenersRef = useRef<{
    onMicStatusChange: ((isMicActive: boolean) => void)[];
    onRecordingStart: (() => void)[];
    onRecordingStop: ((audioFile: AudioFile) => void)[];
    onPermissionGranted: (() => void)[];
  }>({
    onMicStatusChange: [],
    onRecordingStart: [],
    onRecordingStop: [],
    onPermissionGranted: [],
  });

  // Initialize AudioRecorderService
  useEffect(() => {
    recorderServiceRef.current = new AudioRecorderService({
      onMicStatusChange: (isMicActive) => {
        listenersRef.current.onMicStatusChange.forEach((cb) => cb(isMicActive));
      },
      onRecordingStart: () => {
        setIsRecording(true);
        listenersRef.current.onRecordingStart.forEach((cb) => cb());
      },
      onRecordingStop: (audioFile) => {
        setIsRecording(false);
        listenersRef.current.onRecordingStop.forEach((cb) => cb(audioFile));
      },
      onPermissionGranted: () => {
        setHasPermission(true);
        listenersRef.current.onPermissionGranted.forEach((cb) => cb());
      },
    });

    console.log("%c [useRecorder] Service initialized", "color: aqua");

    // Cleanup function
    return () => {
      if (recorderServiceRef.current) {
        console.log("%c [useRecorder] Cleaning up service", "color: aqua");
        // Check if currently recording, if so stop recording first
        const state = recorderServiceRef.current.getState();
        if (state.isRecording) {
          recorderServiceRef.current
            .stopRecording()
            .then((audioFile) => {
              // Save the audio file from cleanup if we got one
              if (audioFile) {
                latestAudioFileRef.current = audioFile;
              }
            })
            .catch(console.error)
            .finally(() => {
              recorderServiceRef.current?.closeMic();
            });
        } else {
          recorderServiceRef.current.closeMic();
        }
      }
    };
  }, []);

  const requestPermission = async (): Promise<void> => {
    await recorderServiceRef.current?.requestPermission();
  };

  const openMic = async (): Promise<void> => {
    await recorderServiceRef.current?.openMic();
  };

  const closeMic = (): void => {
    recorderServiceRef.current?.closeMic();
  };

  const startRecord = async (): Promise<void> => {
    await recorderServiceRef.current?.startRecording();
  };

  const stopRecord = async (): Promise<AudioFile | null> => {
    const audioFile = await recorderServiceRef.current?.stopRecording();

    // Save the latest audio file if we got one
    if (audioFile) {
      latestAudioFileRef.current = audioFile;
    }

    recorderServiceRef.current?.closeMic();

    // If stopRecording returns null, return the last saved audio file
    return audioFile ?? latestAudioFileRef.current;
  };

  const reset = (): void => {
    setIsRecording(false);
  };

  const addRecorderListener = useCallback(
    <T extends RecorderListener>(
      type: T,
      callback: RecorderListenerCallbackMap[T]
    ): void => {
      if (!(listenersRef.current[type] as unknown[]).includes(callback)) {
        (listenersRef.current[type] as unknown[]).push(callback);
      }
    },
    []
  );

  const removeRecorderListener = useCallback(
    <T extends RecorderListener>(
      type: T,
      callback: RecorderListenerCallbackMap[T]
    ): void => {
      const index = (listenersRef.current[type] as unknown[]).indexOf(callback);
      if (index !== -1) {
        listenersRef.current[type].splice(index, 1);
      }
    },
    []
  );

  return {
    isRecording,
    hasPermission,
    recorderServiceRef,
    startRecord,
    stopRecord,
    requestPermission,
    openMic,
    closeMic,
    reset,
    addRecorderListener,
    removeRecorderListener,
  };
};

export default useRecorder;
