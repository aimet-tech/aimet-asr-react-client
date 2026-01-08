import type { AudioRecorderService } from "@/recorder/utils/audioRecorderService";
import type { AudioFile } from "@/transcribe/types";

export interface RecorderContextValue {
  // State for React to track changes
  isRecording: boolean;
  hasPermission: boolean;

  // Ref for current MediaStream access
  recorderServiceRef: React.RefObject<AudioRecorderService | null>;

  /**
   * Start recording audio from the microphone.
   *
   * This will open the microphone if not already open, initialize MediaRecorder,
   * and begin capturing audio data.
   *
   * **Possible Errors:**
   * - `MicrophonePermissionDeniedError` - User denies microphone permission
   * - `MicrophoneAccessError` - Microphone cannot be accessed (device not found, in use, etc.)
   * - `MediaStreamNotAvailableError` - Media stream is not available
   * - `MediaRecorderNotSupportedError` - Browser doesn't support MediaRecorder or required MIME types
   * - `RecordingStartError` - Recording fails to start (wraps unexpected errors)
   *
   * @throws {MicrophonePermissionDeniedError}
   * @throws {MicrophoneAccessError}
   * @throws {MediaStreamNotAvailableError}
   * @throws {MediaRecorderNotSupportedError}
   * @throws {RecordingStartError}
   */
  startRecord: () => Promise<void>;

  /**
   * Stop recording and return the recorded audio file.
   *
   * This will stop the MediaRecorder, process the audio data (resample to configured format),
   * and return the audio file. Returns null if no recording is active.
   *
   * **Possible Errors:**
   * - `NoRecordingChunksError` - No audio data was recorded
   * - `MediaRecorderTimeoutError` - MediaRecorder stop operation times out
   * - `RecordingStopError` - Recording fails to stop (wraps unexpected errors)
   *
   * @returns The recorded audio file, or null if not recording
   * @throws {NoRecordingChunksError}
   * @throws {MediaRecorderTimeoutError}
   * @throws {RecordingStopError}
   */
  stopRecord: () => Promise<AudioFile | null>;

  /**
   * Request microphone permission from the browser.
   *
   * This will prompt the user to allow/deny microphone access.
   * Opens the microphone temporarily and closes it after checking permission.
   *
   * **Possible Errors:**
   * - `MicrophonePermissionDeniedError` - User denies microphone permission
   * - `MicrophoneAccessError` - Microphone cannot be accessed
   *
   * @throws {MicrophonePermissionDeniedError}
   * @throws {MicrophoneAccessError}
   */
  requestPermission: () => Promise<void>;

  /**
   * Open the microphone stream without starting recording.
   *
   * Use this when you need the microphone active but don't want to record yet.
   * The microphone will remain active until closeMic() is called.
   *
   * **Possible Errors:**
   * - `MicrophonePermissionDeniedError` - User denies microphone permission
   * - `MicrophoneAccessError` - Microphone cannot be accessed
   *
   * @throws {MicrophonePermissionDeniedError}
   * @throws {MicrophoneAccessError}
   */
  openMic: () => Promise<void>;

  /**
   * Close the microphone stream and release the device.
   *
   * Call this when you're done with the microphone to free resources.
   * This is a synchronous operation and typically doesn't throw errors.
   */
  closeMic: () => void;

  /**
   * Reset the recorder state.
   *
   * This resets the isRecording flag to false.
   * Does not close the microphone or clear permissions.
   */
  reset: () => void;
}
