import type {
  RecordingConfig,
  RecorderService as IRecorderService,
  RecorderState,
} from "@/recorder/types";
import type { AudioConfig, AudioFile } from "@/transcribe/types";
import { getMimeType } from "@/recorder/utils/getMimeType";
import { calculateDuration } from "@/recorder/utils/calculateDuration";
import { convertFloat32ToPcm16 } from "@/recorder/utils/convertFloat32ToPcm16";
import resampleAudio from "@/recorder/utils/resampleAudio";
import {
  MicrophonePermissionDeniedError,
  MicrophoneAccessError,
  RecordingStartError,
  RecordingStopError,
  NoRecordingChunksError,
  MediaStreamNotAvailableError,
  AudioContextInitializationError,
  MicStreamStartError,
  MicStreamStopError,
  MediaRecorderTimeoutError,
  RecorderError,
} from "@/recorder/errors";

/**
 * AudioRecorderService
 *
 * Core service for managing audio recording from the microphone.
 * Handles MediaRecorder initialization, audio streaming, and audio processing.
 *
 * Features:
 * - Microphone permission management
 * - Audio recording with MediaRecorder API
 * - Real-time audio streaming with AudioContext
 * - Audio resampling to specified sample rate
 * - PCM16 audio data processing
 *
 * @example
 * ```typescript
 * const recorder = new AudioRecorderService({
 *   audioConfig: { sampleRate: 16000 },
 *   onRecordingStart: () => console.log('Recording started'),
 *   onRecordingStop: (file) => console.log('Got audio file', file)
 * });
 *
 * await recorder.startRecording();
 * // ... record audio ...
 * const audioFile = await recorder.stopRecording();
 * ```
 */
export class AudioRecorderService implements IRecorderService {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private processor: ScriptProcessorNode | null = null; // Added ScriptProcessor

  private config: AudioConfig;
  private recordingConfig: RecordingConfig;

  // Callbacks - now arrays to support multiple listeners
  private onAudioData?: (audioData: ArrayBuffer) => void;
  private onRecordingStart?: () => void;
  private onRecordingStop?: (audioFile: AudioFile) => void;
  private onPermissionGranted?: () => void;
  private onMicStatusChange?: (isMicActive: boolean) => void;

  private state: RecorderState = {
    isRecording: false,
    isMicActive: false,
    hasPermission: false,
    currentAudioFile: null,
  };

  private recordingChunks: Blob[] = [];
  private recordingStartTime: number = 0;
  private isMediaRecorderStopped: boolean = false;

  constructor({
    audioConfig,
    recordingConfig,
    onAudioData,
    onRecordingStart,
    onRecordingStop,
    onPermissionGranted,
    onMicStatusChange,
  }: {
    audioConfig?: AudioConfig;
    recordingConfig?: RecordingConfig;
    onAudioData?: (audioData: ArrayBuffer) => void;
    onRecordingStart?: () => void;
    onRecordingStop?: (audioFile: AudioFile) => void;
    onPermissionGranted?: () => void;
    onMicStatusChange?: (isMicActive: boolean) => void;
  }) {
    this.config = {
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      bufferSize: 4096,
      ...audioConfig,
    };
    this.recordingConfig = {
      audioBitsPerSecond: 128000, // Default: 128 kbps (medium quality)
      timeSlice: 1000,
      ...recordingConfig,
    };
    this.onAudioData = onAudioData;
    this.onRecordingStart = onRecordingStart;
    this.onRecordingStop = onRecordingStop;
    this.onPermissionGranted = onPermissionGranted;
    this.onMicStatusChange = onMicStatusChange;
  }

  /**
   * Request microphone permission from the browser.
   *
   * Opens the microphone temporarily to request permission, then closes it.
   * Use this to check if the user grants microphone access before starting recording.
   *
   * **Possible Errors:**
   * - `MicrophonePermissionDeniedError` - User denies microphone permission
   * - `MicrophoneAccessError` - Microphone cannot be accessed
   *
   * @throws {MicrophonePermissionDeniedError}
   * @throws {MicrophoneAccessError}
   */
  async requestPermission(): Promise<void> {
    await this.openMic();
    // Stop the stream after permission check to release resources
    this.closeMic();
  }

  /**
   * Start recording audio from the microphone.
   *
   * Opens the microphone (if not already open), initializes MediaRecorder,
   * and begins capturing audio data in chunks. The recording will continue
   * until stopRecording() is called.
   *
   * **Possible Errors:**
   * - `MicrophonePermissionDeniedError` - User denies microphone permission
   * - `MicrophoneAccessError` - Microphone cannot be accessed
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
  async startRecording(): Promise<void> {
    console.log(
      "%c [AudioRecorderService] Starting record",
      "color: cornflowerblue"
    );
    try {
      await this.openMic();
      await this.initializeMediaRecorder();
      this.recordingChunks = [];
      this.isMediaRecorderStopped = false; // Reset stop state
      this.mediaRecorder?.start(this.recordingConfig.timeSlice);
    } catch (error) {
      // Re-throw known recorder errors as-is to preserve specific error information
      if (error instanceof RecorderError) {
        throw error;
      }
      // Wrap unexpected errors in RecordingStartError
      throw new RecordingStartError(
        error instanceof Error ? error.message : "Failed to start recording"
      );
    }
  }

  /**
   * Stop recording and return the recorded audio file.
   *
   * Stops the MediaRecorder, waits for all audio chunks to be collected,
   * resamples the audio to the configured sample rate (default 16kHz),
   * and returns the processed audio file as WAV format.
   *
   * Returns null if no recording is active.
   *
   * **Possible Errors:**
   * - `NoRecordingChunksError` - No audio data was recorded (recording too short)
   * - `MediaRecorderTimeoutError` - MediaRecorder stop operation times out (>5s)
   * - `RecordingStopError` - Recording fails to stop (wraps unexpected errors)
   *
   * @returns The recorded audio file in WAV format, or null if not recording
   * @throws {NoRecordingChunksError}
   * @throws {MediaRecorderTimeoutError}
   * @throws {RecordingStopError}
   */
  async stopRecording(): Promise<AudioFile | null> {
    if (!this.state.isRecording || !this.mediaRecorder) {
      return null;
    }

    console.log(
      "%c [AudioRecorderService] Stopping record",
      "color: cornflowerblue"
    );

    try {
      // Stop the MediaRecorder
      this.mediaRecorder.stop();
      this.state.isRecording = false;

      // Wait for the stop event to complete with timeout
      await this.waitForMediaRecorderStop();

      // Check if we have any recorded chunks
      if (this.recordingChunks.length === 0) {
        throw new NoRecordingChunksError();
      }

      // Build the audio file after recording is complete
      const mimeType = getMimeType(this.recordingConfig.mimeType);
      const originalBlob = new Blob(this.recordingChunks, { type: mimeType });

      // Resample the audio to the configured sample rate (16000 Hz)
      const resampledBlob = await resampleAudio(
        await originalBlob.arrayBuffer(),
        this.config.sampleRate,
        this.config.channels
      );

      // Calculate duration from resampled audio data
      const arrayBuffer = await resampledBlob.arrayBuffer();
      const duration = calculateDuration(
        arrayBuffer,
        this.config.sampleRate,
        this.config.channels,
        this.config.bitsPerSample
      );

      const audioFile: AudioFile = {
        blob: resampledBlob,
        duration,
        timestamp: this.recordingStartTime,
        format: "wav", // Resampled audio is always WAV format
        fileType: "audio/wav",
      };

      this.recordingChunks = [];
      this.state.currentAudioFile = audioFile;
      this.onRecordingStop?.(audioFile);

      // Reset MediaRecorder instance so a new one can be created for next recording
      // this.mediaRecorder = null;

      return audioFile;
    } catch (error) {
      // Re-throw known recorder errors as-is
      if (error instanceof RecorderError) {
        throw error;
      }
      // Wrap unexpected errors in RecordingStopError
      throw new RecordingStopError(
        error instanceof Error ? error.message : "Failed to stop recording"
      );
    }
  }

  /**
   * Start microphone stream with real-time audio processing.
   *
   * Opens the microphone, initializes AudioContext, and starts processing
   * audio data in real-time using ScriptProcessorNode. Audio data is sent
   * to the onAudioData callback as PCM16 format.
   *
   * Use this for real-time audio streaming (e.g., for live transcription)
   * without saving the audio to a file.
   *
   * **Possible Errors:**
   * - `MicrophonePermissionDeniedError` - User denies microphone permission
   * - `MicrophoneAccessError` - Microphone cannot be accessed
   * - `MediaStreamNotAvailableError` - Media stream is not available
   * - `AudioContextInitializationError` - Failed to initialize AudioContext
   * - `MicStreamStartError` - Stream fails to start (wraps unexpected errors)
   *
   * @throws {MicrophonePermissionDeniedError}
   * @throws {MicrophoneAccessError}
   * @throws {MediaStreamNotAvailableError}
   * @throws {AudioContextInitializationError}
   * @throws {MicStreamStartError}
   */
  async startMicStream(): Promise<void> {
    try {
      await this.openMic();
      await this.initializeAudioContext();
      this.startAudioProcessing();
    } catch (error) {
      // Re-throw known recorder errors as-is
      if (error instanceof RecorderError) {
        throw error;
      }
      // Wrap unexpected errors in MicStreamStartError
      throw new MicStreamStartError(
        error instanceof Error ? error.message : "Failed to start mic stream"
      );
    }
  }

  /**
   * Stop the microphone stream and audio processing.
   *
   * Disconnects audio processing nodes and closes the AudioContext.
   * Does not close the microphone itself - call closeMic() for that.
   *
   * **Possible Errors:**
   * - `MicStreamStopError` - Stream fails to stop (wraps unexpected errors)
   *
   * @throws {MicStreamStopError}
   */
  async stopMicStream(): Promise<void> {
    try {
      this.stopAudioProcessing();
      await this.closeAudioContext();
    } catch (error) {
      // Re-throw known recorder errors as-is
      if (error instanceof RecorderError) {
        throw error;
      }
      // Wrap unexpected errors in MicStreamStopError
      throw new MicStreamStopError(
        error instanceof Error ? error.message : "Failed to stop mic stream"
      );
    }
  }

  /**
   * Open the microphone and request permission.
   *
   * Requests microphone access from the browser, which will prompt the user
   * if permission hasn't been granted yet. The microphone will remain active
   * until closeMic() is called.
   *
   * If the microphone is already active, this method does nothing.
   *
   * **Possible Errors:**
   * - `MicrophonePermissionDeniedError` - User denies microphone permission
   * - `MicrophoneAccessError` - Microphone cannot be accessed (device not found, in use, etc.)
   *
   * @throws {MicrophonePermissionDeniedError}
   * @throws {MicrophoneAccessError}
   */
  async openMic(): Promise<void> {
    if (this.state.isMicActive) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      this.state.isMicActive = true;
      this.onMicStatusChange?.(true);
      this.mediaStream = stream;
      this.state.hasPermission = true;
      this.onPermissionGranted?.();
    } catch (error) {
      this.state.hasPermission = false;

      // Check if permission was denied
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        throw new MicrophonePermissionDeniedError();
      }

      // Other microphone access errors
      throw new MicrophoneAccessError(
        error instanceof Error ? error.message : "Failed to access microphone"
      );
    }
  }

  /**
   * Close the microphone and release the device.
   *
   * Stops all tracks in the media stream and releases the microphone device.
   * Call this when you're done with the microphone to free system resources.
   *
   * This is a synchronous operation and doesn't throw errors.
   */
  closeMic(): void {
    this.state.isMicActive = false;
    this.onMicStatusChange?.(false);
    if (this.mediaStream) {
      console.log(
        "%c [AudioRecorderService] Closing microphone",
        "color: cornflowerblue"
      );
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  /**
   * Get the current recorder state.
   *
   * Returns a copy of the internal state object containing:
   * - isRecording: Whether recording is active
   * - isMicActive: Whether microphone stream is open
   * - hasPermission: Whether microphone permission is granted
   * - currentAudioFile: The most recently recorded audio file
   *
   * @returns A copy of the current recorder state
   */
  getState(): RecorderState {
    return { ...this.state };
  }

  /**
   * Get the current MediaStream.
   *
   * Returns the active MediaStream object if the microphone is open,
   * or null if the microphone is closed.
   *
   * Use this to access the raw media stream for custom processing.
   *
   * @returns The active MediaStream, or null if microphone is closed
   */
  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  private async closeAudioContext(): Promise<void> {
    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch (error) {
        // Log but don't throw - this is cleanup code
        console.error(
          "[AudioRecorderService] Failed to close AudioContext:",
          error
        );
      }
      this.audioContext = null;
      this.source = null;
      this.processor = null;
      this.analyser = null;
    }
  }

  private async waitForMediaRecorderStop(): Promise<void> {
    // Create a Promise that resolves when the MediaRecorder stop event fires
    const stopEventPromise = new Promise<void>((resolve) => {
      const checkStopState = () => {
        if (this.isMediaRecorderStopped) {
          resolve();
        } else {
          // Check again in the next tick
          window.setTimeout(checkStopState, 100);
        }
      };
      checkStopState();
    });

    // Create a timeout Promise that rejects after 5 seconds
    const timeoutPromise = new Promise<void>((_, reject) => {
      window.setTimeout(() => {
        reject(new MediaRecorderTimeoutError());
      }, 5000);
    });

    // Race between the stop event and timeout
    await Promise.race([stopEventPromise, timeoutPromise]);
  }

  private async initializeMediaRecorder(): Promise<void> {
    // Always create a new MediaRecorder instance for each recording session
    // since MediaRecorder cannot be reused after stopping
    if (this.mediaRecorder) {
      // Clean up the old MediaRecorder if it exists
      this.mediaRecorder = null;
    }

    // mediaStream should already exist from openMic() call
    if (!this.mediaStream) {
      throw new MediaStreamNotAvailableError();
    }

    const mimeType = getMimeType(this.recordingConfig.mimeType);
    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType,
      audioBitsPerSecond: this.recordingConfig.audioBitsPerSecond,
    });

    this.mediaRecorder.onstart = () => {
      console.log(
        "%c [AudioRecorderService] MediaRecorder started",
        "color: cornflowerblue"
      );
      this.recordingStartTime = Date.now();
      this.state.isRecording = true;
      this.onRecordingStart?.();
    };

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordingChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      console.log(
        "%c [AudioRecorderService] MediaRecorder stopped",
        "color: cornflowerblue"
      );
      this.isMediaRecorderStopped = true;
    };
  }

  private async initializeAudioContext(): Promise<void> {
    if (this.audioContext) return;

    // mediaStream should already exist from openMic() call
    if (!this.mediaStream) {
      throw new MediaStreamNotAvailableError();
    }

    try {
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create ScriptProcessor for audio processing (improved from TempPage1)
      this.processor = this.audioContext.createScriptProcessor(
        this.config.bufferSize,
        1, // Input channels
        1 // Output channels
      );

      // Set up the audio processing event handler
      this.processor.onaudioprocess = (e) => {
        // if (!this.state.isMicActive) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16Data = convertFloat32ToPcm16(inputData);
        // Send audio data to callback
        this.onAudioData?.(pcm16Data);
      };

      // Also create analyser for compatibility with existing code
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.config.bufferSize;
      this.analyser.smoothingTimeConstant = 0.8;

      console.log("[AudioRecorderService] AudioContext initialized with:", {
        sampleRate: this.audioContext.sampleRate,
        configSampleRate: this.config.sampleRate,
        channels: this.config.channels,
        bitsPerSample: this.config.bitsPerSample,
        bufferSize: this.config.bufferSize,
      });
    } catch (error) {
      throw new AudioContextInitializationError(
        error instanceof Error
          ? error.message
          : "Failed to initialize audio context"
      );
    }
  }

  private startAudioProcessing(): void {
    if (this.source && this.processor && this.audioContext) {
      // Connect the nodes for ScriptProcessor-based processing
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Also connect to analyser for compatibility
      if (this.analyser) {
        this.source.connect(this.analyser);
      }
    }
  }

  private stopAudioProcessing(): void {
    try {
      if (this.processor) {
        this.processor.disconnect();
      }
      if (this.source) {
        this.source.disconnect();
      }
      if (this.analyser) {
        this.analyser.disconnect();
      }
    } catch (error) {
      // Log but don't throw - this is cleanup code
      console.error(
        "[AudioRecorderService] Failed to disconnect audio nodes:",
        error
      );
    }
  }
}
