import { useEffect, useRef, useState } from "react";
import { AudioRecorderService } from "@/recorder/utils/audioRecorderService";
import type { AudioFile } from "@/transcribe/types";
import { UseRecorderReturn } from "@/recorder/hooks/useRecorder/types";

export const useRecorder = (): UseRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  const recorderServiceRef = useRef<AudioRecorderService | null>(null);
  const latestAudioFileRef = useRef<AudioFile | null>(null);

  // Initialize AudioRecorderService
  useEffect(() => {
    recorderServiceRef.current = new AudioRecorderService({
      onRecordingStart: () => {
        setIsRecording(true);
      },
      onRecordingStop: () => {
        setIsRecording(false);
      },
      onPermissionGranted: () => {
        setHasPermission(true);
      },
    });

    // Cleanup function
    return () => {
      if (recorderServiceRef.current) {
        console.log("%c Clean up: stop recording & close mic", "color: orange");
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
  };
};

export default useRecorder;
