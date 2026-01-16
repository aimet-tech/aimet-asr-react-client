import React, { useContext, useState } from "react";
import { RecorderContext } from "@/recorder/contexts/RecorderContext";
import {
  RecorderError,
  MicrophonePermissionDeniedError,
  MicrophoneAccessError,
  RecordingStartError,
  RecordingStopError,
  NoRecordingChunksError,
  MediaStreamNotAvailableError,
  MediaRecorderNotSupportedError,
  MediaRecorderTimeoutError,
} from "@/recorder/errors";
import type { AudioFile } from "@/transcribe/types";
import { TranscribeActionContext } from "@/transcribe";

/**
 * Temporary Test Component for Recorder Service
 *
 * This demonstrates proper usage of the recorder with error handling
 *
 * To use: Wrap this component with <RecorderProvider>
 *
 * Example:
 * ```tsx
 * import { RecorderProvider } from '@/recorder';
 *
 * function App() {
 *   return (
 *     <RecorderProvider>
 *       <TempRecorderTest />
 *     </RecorderProvider>
 *   );
 * }
 * ```
 */
export function TempRecorderTest() {
  // Access recorder via context (as requested)
  const {
    isRecording,
    hasPermission,
    startRecord,
    stopRecord,
    requestPermission,
    openMic,
    closeMic,
    reset,
  } = useContext(RecorderContext);

  // Local state for UI
  const [error, setError] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<AudioFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Helper to display user-friendly error messages
  const getErrorMessage = (err: unknown): string => {
    if (err instanceof MicrophonePermissionDeniedError) {
      return "🚫 Microphone access denied. Please enable it in your browser settings.";
    }
    if (err instanceof MicrophoneAccessError) {
      return "⚠️ Cannot access microphone. Please check if it's available and not used by another app.";
    }
    if (err instanceof MediaRecorderNotSupportedError) {
      return "❌ Your browser doesn't support audio recording. Please use Chrome, Firefox, or Edge.";
    }
    if (err instanceof NoRecordingChunksError) {
      return "⏱️ Recording was too short or no audio was captured. Please try again.";
    }
    if (err instanceof MediaRecorderTimeoutError) {
      return "⏰ Recording stop operation timed out. Please try again.";
    }
    if (err instanceof RecordingStartError) {
      return "❌ Failed to start recording. Please try again.";
    }
    if (err instanceof RecordingStopError) {
      return "❌ Failed to stop recording properly.";
    }
    if (err instanceof MediaStreamNotAvailableError) {
      return "🎤 Microphone stream not available. Please open the microphone first.";
    }
    if (err instanceof RecorderError) {
      return `❌ Recorder error: ${err.message} (Code: ${err.code})`;
    }
    return `❌ Unexpected error: ${
      err instanceof Error ? err.message : String(err)
    }`;
  };

  // Test: Request Permission
  const handleRequestPermission = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await requestPermission();
      console.log("✅ Permission granted!");
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error("Permission request failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Test: Open Microphone
  const handleOpenMic = async () => {
    try {
      setError(null);
      setIsLoading(true);
      await openMic();
      console.log("✅ Microphone opened!");
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error("Open mic failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Test: Close Microphone
  const handleCloseMic = () => {
    try {
      setError(null);
      closeMic();
      console.log("✅ Microphone closed!");
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error("Close mic failed:", err);
    }
  };

  // Test: Start Recording
  const handleStartRecording = async () => {
    try {
      setError(null);
      setAudioFile(null);
      setIsLoading(true);
      await startRecord();
      console.log("✅ Recording started!");
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error("Start recording failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Test: Stop Recording
  const handleStopRecording = async () => {
    try {
      setError(null);
      setIsLoading(true);
      const file = await stopRecord();

      if (file) {
        setAudioFile(file);
        console.log("✅ Recording stopped! Audio file:", {
          duration: file.duration,
          size: file.blob.size,
          format: file.format,
          timestamp: new Date(file.timestamp).toISOString(),
        });
      } else {
        console.warn("⚠️ No audio file returned");
      }
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error("Stop recording failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Test: Quick Record (start -> wait -> stop)
  const handleQuickRecord = async () => {
    try {
      setError(null);
      setAudioFile(null);
      setIsLoading(true);

      console.log("Starting quick record...");
      await startRecord();
      console.log("Recording for 3 seconds...");

      // Record for 3 seconds
      await new Promise((resolve) => setTimeout(resolve, 3000));

      console.log("Stopping record...");
      const file = await stopRecord();

      if (file) {
        setAudioFile(file);
        console.log("✅ Quick record complete!", file);
      }
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      console.error("Quick record failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Test: Play recorded audio
  const handlePlayAudio = () => {
    if (!audioFile) return;

    try {
      const url = URL.createObjectURL(audioFile.blob);
      const audio = new Audio(url);
      audio.play();

      audio.onended = () => {
        URL.revokeObjectURL(url);
      };

      console.log("▶️ Playing audio...");
    } catch (err) {
      console.error("Failed to play audio:", err);
      setError("Failed to play audio");
    }
  };

  // Test: Download recorded audio
  const handleDownloadAudio = () => {
    if (!audioFile) return;

    try {
      const url = URL.createObjectURL(audioFile.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `recording-${audioFile.timestamp}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log("💾 Download started!");
    } catch (err) {
      console.error("Failed to download audio:", err);
      setError("Failed to download audio");
    }
  };

  // Reset everything
  const handleReset = () => {
    reset();
    setError(null);
    setAudioFile(null);
    console.log("🔄 Reset complete!");
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1>🎤 Recorder Service Test</h1>
      <p>Test the recorder service with proper error handling</p>

      {/* Status Display */}
      <div
        style={{
          padding: "15px",
          margin: "20px 0",
          backgroundColor: "#f5f5f5",
          borderRadius: "8px",
          border: "1px solid #ddd",
        }}
      >
        <h3>Status</h3>
        <p>
          📊 Recording: <strong>{isRecording ? "🔴 Yes" : "⚪ No"}</strong>
        </p>
        <p>
          🔐 Permission:{" "}
          <strong>{hasPermission ? "✅ Granted" : "❌ Not granted"}</strong>
        </p>
        <p>
          ⏳ Loading: <strong>{isLoading ? "Yes" : "No"}</strong>
        </p>
        {audioFile && (
          <p>
            🎵 Audio File:{" "}
            <strong>
              {audioFile.duration.toFixed(2)}s,{" "}
              {(audioFile.blob.size / 1024).toFixed(2)} KB
            </strong>
          </p>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div
          style={{
            padding: "15px",
            margin: "20px 0",
            backgroundColor: "#fee",
            border: "1px solid #c00",
            borderRadius: "8px",
            color: "#c00",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Control Buttons */}
      <div
        style={{ display: "grid", gap: "10px", gridTemplateColumns: "1fr 1fr" }}
      >
        <button
          onClick={handleRequestPermission}
          disabled={isLoading || hasPermission}
          style={{ padding: "10px", fontSize: "14px" }}
        >
          🔐 Request Permission
        </button>

        <button
          onClick={handleOpenMic}
          disabled={isLoading || !hasPermission}
          style={{ padding: "10px", fontSize: "14px" }}
        >
          🎤 Open Microphone
        </button>

        <button
          onClick={handleCloseMic}
          disabled={isLoading}
          style={{ padding: "10px", fontSize: "14px" }}
        >
          🔇 Close Microphone
        </button>

        <button
          onClick={handleStartRecording}
          disabled={isLoading || isRecording}
          style={{ padding: "10px", fontSize: "14px" }}
        >
          ⏺️ Start Recording
        </button>

        <button
          onClick={handleStopRecording}
          disabled={isLoading || !isRecording}
          style={{ padding: "10px", fontSize: "14px" }}
        >
          ⏹️ Stop Recording
        </button>

        <button
          onClick={handleQuickRecord}
          disabled={isLoading || isRecording}
          style={{ padding: "10px", fontSize: "14px", fontWeight: "bold" }}
        >
          ⚡ Quick Record (3s)
        </button>

        {audioFile && (
          <>
            <button
              onClick={handlePlayAudio}
              disabled={isLoading}
              style={{ padding: "10px", fontSize: "14px" }}
            >
              ▶️ Play Audio
            </button>

            <button
              onClick={handleDownloadAudio}
              disabled={isLoading}
              style={{ padding: "10px", fontSize: "14px" }}
            >
              💾 Download Audio
            </button>
          </>
        )}

        <button
          onClick={handleReset}
          disabled={isLoading}
          style={{ padding: "10px", fontSize: "14px", gridColumn: "1 / -1" }}
        >
          🔄 Reset
        </button>
      </div>

      {/* Instructions */}
      <div
        style={{
          marginTop: "30px",
          padding: "15px",
          backgroundColor: "#e3f2fd",
          borderRadius: "8px",
        }}
      >
        <h3>📝 Test Instructions</h3>
        <ol>
          <li>Click "Request Permission" to get microphone access</li>
          <li>Click "Start Recording" to begin recording</li>
          <li>Speak into your microphone</li>
          <li>Click "Stop Recording" to finish</li>
          <li>Click "Play Audio" to hear your recording</li>
          <li>Or use "Quick Record (3s)" for an automated 3-second test</li>
        </ol>
        <p>
          <strong>Note:</strong> Check the browser console for detailed logs and
          error information.
        </p>
      </div>

      {/* Error Testing Section */}
      <div
        style={{
          marginTop: "30px",
          padding: "15px",
          backgroundColor: "#fff3e0",
          borderRadius: "8px",
        }}
      >
        <h3>🧪 Error Scenarios to Test</h3>
        <ul>
          <li>
            <strong>Permission Denied:</strong> Deny microphone permission when
            prompted
          </li>
          <li>
            <strong>No Chunks:</strong> Start and immediately stop recording
            (too fast)
          </li>
          <li>
            <strong>Stream Not Available:</strong> Try to start recording
            without opening mic first
          </li>
          <li>
            <strong>Browser Support:</strong> Test in different browsers
          </li>
        </ul>
      </div>
    </div>
  );
}

export default TempRecorderTest;
