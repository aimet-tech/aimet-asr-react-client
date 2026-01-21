import { useContext, useEffect, useState } from "react";
import { RecorderContext } from "@/recorder/contexts/RecorderContext";

export const useIsMicActive = () => {
  const { addRecorderListener, removeRecorderListener } =
    useContext(RecorderContext);

  const [isMicActive, setIsMicActive] = useState(false);

  useEffect(() => {
    const handleMicStatusChange = (active: boolean) => {
      setIsMicActive(active);
    };

    addRecorderListener("onMicStatusChange", handleMicStatusChange);

    return () => {
      removeRecorderListener("onMicStatusChange", handleMicStatusChange);
    };
  }, [addRecorderListener, removeRecorderListener]);

  return isMicActive;
};


