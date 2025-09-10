import { useContext, useEffect, useState } from "react";
import { TranscribeStateContext } from "@/transcribe/contexts";

const useIsRecording = () => {
  const { transcribeService } = useContext(TranscribeStateContext);

  const [isRecording, setRecording] = useState(false);

  useEffect(() => {
    const startRecording = () => {
      setRecording(true);
    };

    transcribeService?.current?.addTranscribeListener(
      "onRecordingStart",
      startRecording
    );

    const stopRecording = () => {
      setRecording(false);
    };
    transcribeService?.current?.addTranscribeListener(
      "onRecordingStop",
      stopRecording
    );

    return () => {
      transcribeService?.current?.removeTranscribeListener(
        "onRecordingStart",
        startRecording
      );
      transcribeService?.current?.removeTranscribeListener(
        "onRecordingStop",
        stopRecording
      );
    };
  }, [transcribeService]);

  return isRecording;
};

export default useIsRecording;
