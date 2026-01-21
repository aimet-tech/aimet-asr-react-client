import {
  type TranscribeConfig,
  type AudioFile,
  type GcpSpeechResponse,
  type VadResponse,
  type ErrorResponse,
  TranscribeResponseType,
  type TranscribeConnection,
  type TranscribeResponse,
  type AudioConfig,
  type TranscribeListenerCallbackMap,
  type TranscribeListener,
  type TranscribeConnectionParams,
  type TranscribeCallbackError,
} from "@/transcribe/types";
import { SocketService } from "@/socket/utils/socketService";
import type { SocketConfig } from "@/socket/types";
import type { RecordingConfig } from "@/recorder/types";
import { AudioRecorderService } from "@/recorder";
import { executeCallbacks } from "@/transcribe/utils/executeCallbacks";
import { buildWebSocketUrl } from "@/transcribe/utils/buildWebSocketUrl";
import { TranscribeServerError } from "@/transcribe/errors";
import type {
  SocketDisconnectedError,
  SocketMessageParseError,
  SocketSendError,
  SocketBufferOverflowError,
  SocketReconnectionFailedError,
} from "@/socket/errors";
import { TranscribeSessionState } from "@/transcribe/models/enums/TranscribeSessionState";

/**
 * TranscribeService
 *
 * High-level orchestration service for real-time speech transcription.
 * Manages the coordination between WebSocket communication (SocketService) and
 * audio recording (AudioRecorderService).
 *
 * **Features:**
 * - Real-time speech-to-text transcription via WebSocket
 * - Automatic audio recording (optional)
 * - Microphone permission management
 * - Connection status tracking with automatic reconnection
 * - Event-driven architecture with listener callbacks
 *
 * **Error Handling:**
 * - Method calls throw errors (RecorderError, SocketError) for direct failures
 * - Listener callbacks receive errors for asynchronous events
 * - Server errors from WebSocket are converted to TranscribeServerError
 *
 * @example
 * ```typescript
 * const service = new TranscribeService(
 *   { enableRecording: true, reconnectAttempts: 3 },
 *   { sampleRate: 16000, channels: 1 }
 * );
 *
 * // Add error listener for async/event-driven errors
 * service.addTranscribeListener('onError', (error) => {
 *   if (error instanceof SocketDisconnectedError) {
 *     console.log('Socket disconnected:', error.message);
 *   } else if (error instanceof SocketReconnectionFailedError) {
 *     console.log('Reconnection failed:', error.message);
 *   } else if (error instanceof TranscribeServerError) {
 *     console.log('Server error:', error.message);
 *   }
 * });
 *
 * // Start transcription
 * await service.startTranscribing({
 *   base_url: 'wss://example.com',
 *   access_token: 'token',
 *   caller_service: 'my-app'
 * });
 * ```
 */
export class TranscribeService {
  private socketService: SocketService;
  private recorderService: AudioRecorderService;
  private enableRecording: boolean = false;
  private currentConnectionParams: TranscribeConnectionParams | null = null;
  private sessionState: TranscribeSessionState = TranscribeSessionState.PAUSED;
  private audioConfig: AudioConfig;

  // Callbacks
  listeners: {
    onSpeech: ((response: GcpSpeechResponse) => void)[];
    onError: ((error: TranscribeCallbackError) => void)[];
    onVAD: ((response: VadResponse) => void)[];
    onConnect: (() => void)[];
    onDisconnect: ((event: CloseEvent) => void)[];
    onReconnected: ((newTranscriptionId: string) => void)[];
    onConnectionStatusChange: ((status: TranscribeConnection) => void)[];
    onRecordingStart: (() => void)[];
    onRecordingStop: ((audioFile: AudioFile) => void)[];
    onPermissionGranted: (() => void)[];
    onPermissionDenied: (() => void)[];
  };
  constructor(config: TranscribeConfig, audioConfig: AudioConfig) {
    this.audioConfig = audioConfig;
    
    this.listeners = {
      onSpeech: [],
      onError: [],
      onVAD: [],
      onConnect: [],
      onDisconnect: [],
      onReconnected: [],
      onConnectionStatusChange: [],
      onRecordingStart: [],
      onRecordingStop: [],
      onPermissionGranted: [],
      onPermissionDenied: [],
    };

    // Create socket service with config
    const socketConfig: SocketConfig = {
      reconnectAttempts: config.reconnectAttempts || 5,
      reconnectDelay: config.reconnectDelay || 1000,
    };

    this.socketService = new SocketService({
      config: socketConfig,
      onConnect: () => {
        // Notify all connect listeners
        executeCallbacks(this.listeners.onConnect);
      },
      onDisconnect: (event: CloseEvent) => {
        // Notify all disconnect listeners with the close event
        executeCallbacks(this.listeners.onDisconnect, event);
      },
      onReconnected: (newTranscriptionId: string) => {
        // Notify all reconnected listeners with the new transcription ID
        executeCallbacks(this.listeners.onReconnected, newTranscriptionId);
      },
      onTranscription: (response) => this.handleTranscriptionResponse(response),
      onConnectionStatusChange: (status) => {
        // Call all listeners in the onConnectionStatusChange array
        executeCallbacks(this.listeners.onConnectionStatusChange, status);
      },
      onError: (
        error:
          | SocketDisconnectedError
          | SocketMessageParseError
          | SocketSendError
          | SocketBufferOverflowError
          | SocketReconnectionFailedError
      ) => {
        // Pass socket errors to listeners
        executeCallbacks(this.listeners.onError, error);
      },
    });

    // Create recorder service
    const recordingConfig: RecordingConfig = {
      mimeType: audioConfig.mimeType, // Use user's choice or undefined for auto-detection
      audioBitsPerSecond: audioConfig.audioBitsPerSecond, // Use user's choice or undefined for auto-detection
      timeSlice: 1000, // 1 second chunks
    };
    this.enableRecording = config.enableRecording || false;

    this.recorderService = new AudioRecorderService({
      audioConfig,
      recordingConfig,
      onAudioData: (audioData) => this.socketService.sendAudioChunk(audioData),
      onRecordingStart: () => executeCallbacks(this.listeners.onRecordingStart),
      onRecordingStop: (audioFile) =>
        executeCallbacks(this.listeners.onRecordingStop, audioFile),
      onPermissionGranted: () =>
        executeCallbacks(this.listeners.onPermissionGranted),
    });
  }
  // Main public methods
  /**
   * Start transcribing audio from the microphone.
   *
   * Establishes a WebSocket connection to the transcription server, starts the microphone stream,
   * and optionally begins recording audio to a file. Audio data is automatically sent to the
   * server for transcription.
   *
   * **Possible Errors (thrown):**
   * - `SocketConnectionError` - Failed to connect to WebSocket server
   * - `SocketConnectionTimeoutError` - Connection timeout (>10s)
   * - `SocketNotInitializedError` - Socket failed to initialize
   * - `RecordingStartError` - Failed to start audio recording
   * - `MicStreamStartError` - Failed to start microphone stream
   * - `MicrophoneAccessError` - Microphone cannot be accessed
   * - `MicrophonePermissionDeniedError` - User denied microphone permission
   * - `MediaRecorderNotSupportedError` - MediaRecorder not supported
   *
   * @param params - Connection parameters including server URL, access token, and metadata
   * @returns The generated transcription_id for this session
   * @throws {SocketError} Socket connection errors
   * @throws {RecorderError} Microphone or recording errors
   */
  async startTranscribing(params: TranscribeConnectionParams): Promise<string> {
    document.dispatchEvent(new CustomEvent("onRecordingStart"));

    // Store connection params for potential reconnection
    this.currentConnectionParams = params;

    // Build WebSocket URL with all parameters
    const wsUrl = buildWebSocketUrl(params);

    // 1. Update socket URL and connect
    const transcriptionId = await this.socketService.connect(wsUrl);

    // Set socket as needed for smart reconnection
    this.socketService.setNeedsSocket(true);

    // Mark as active transcription session
    this.sessionState = TranscribeSessionState.ACTIVE;

    // 2. Start recording (both mic and file if enabled)
    if (this.enableRecording) await this.recorderService.startRecording();

    // 3. Start mic streaming
    await this.recorderService.startMicStream();

    return transcriptionId;
  }

  /**
   * Stop transcribing and disconnect from the server.
   *
   * Stops the microphone stream, stops recording (if enabled), and disconnects from the
   * WebSocket server. Cleans up all resources including microphone access.
   *
   * **Possible Errors (thrown):**
   * - `MicStreamStopError` - Failed to stop microphone stream
   * - `RecordingStopError` - Failed to stop recording
   * - `NoRecordingChunksError` - No audio data was recorded
   * - `MediaRecorderTimeoutError` - MediaRecorder stop operation timed out
   *
   * @returns The recorded audio file if recording was enabled, null otherwise
   * @throws {RecorderError} Microphone or recording errors during shutdown
   */
  async stopTranscribing(): Promise<AudioFile | null> {
    // 1. Stop mic streaming
    await this.recorderService.stopMicStream();

    // 2. Stop recording and get final file
    let audioFile = null;
    if (this.enableRecording) {
      audioFile = await this.recorderService.stopRecording();
    }

    // 3. Disconnect socket
    this.socketService.disconnect();

    // 4. Clear stored connection info
    this.currentConnectionParams = null;

    // 5. Cleanup
    this.recorderService.closeMic();

    return audioFile;
  }

  /**
   * Stop transcription but keep socket open for quick resume.
   *
   * Stops recording audio but maintains the WebSocket connection. This is useful
   * when you need to temporarily pause transcription but want to resume quickly
   * without the overhead of reconnecting. Recording can be resumed using resumeTranscribe().
   *
   * **Optional Buffer Flush:**
   * By default, sends silent audio to flush the server's transcription buffer,
   * preventing stale transcriptions from appearing after resume. Set `shouldFlushOldData`
   * to false to skip this behavior.
   *
   * **Possible Errors (thrown):**
   * - `MicStreamStopError` - Failed to stop microphone stream
   * - `RecordingStopError` - Failed to stop recording
   * - `NoRecordingChunksError` - No audio data was recorded
   * - `MediaRecorderTimeoutError` - MediaRecorder stop operation timed out
   *
   * @param shouldFlushOldData - Whether to send silent audio to flush server buffer (default: true)
   * @returns The recorded audio file, or null if recording is disabled
   * @throws {RecorderError} Recording or microphone stop errors
   *
   * @example
   * ```typescript
   * // Stop with buffer flush (recommended)
   * const audioFile = await stopTranscribeKeepSocket();
   *
   * // Stop without buffer flush (faster, but may receive stale results on resume)
   * const audioFile = await stopTranscribeKeepSocket(false);
   *
   * // Later resume...
   * await resumeTranscribe();
   * ```
   */
  async stopTranscribeKeepSocket(
    shouldFlushOldData: boolean = true
  ): Promise<AudioFile | null> {
    // Stop mic streaming but keep recording if active
    await this.recorderService.stopMicStream();

    // Stop current recording and get the file
    let audioFile = null;
    if (this.enableRecording)
      audioFile = await this.recorderService.stopRecording();

    // Mark socket as no longer needed (user explicitly stopped)
    this.socketService.setNeedsSocket(false);

    // Mark socket as intentionally idle to prevent auto-reconnection
    this.socketService.setAllowReconnect(false);

    // Flush server's buffer with silent audio if requested
    if (shouldFlushOldData) {
      this.sessionState = TranscribeSessionState.FLUSHING;

      // Flush in background (non-blocking)
      this.flushTranscriptionBufferInBackground();
    } else {
      this.sessionState = TranscribeSessionState.PAUSED;
    }

    // 4. Cleanup
    this.recorderService.closeMic();

    return audioFile;
  }

  /**
   * Resume transcribing with the existing or new connection.
   *
   * Resumes transcription after calling stopTranscribeKeepSocket(). If the socket is still
   * connected, it reuses the connection. If disconnected, it establishes a new connection
   * using stored or provided connection parameters.
   *
   * **Important:** If buffer flush is still in progress (from stopTranscribeKeepSocket with flush),
   * this method will wait for the flush to complete before resuming to ensure clean state transition.
   *
   * **Possible Errors (thrown):**
   * - `SocketConnectionError` - Failed to reconnect if socket was disconnected
   * - `RecordingStartError` - Failed to start audio recording
   * - `MicStreamStartError` - Failed to start microphone stream
   * - `MicrophoneAccessError` - Microphone cannot be accessed
   * - `MicrophonePermissionDeniedError` - User denied microphone permission
   *
   * @param fallbackConnectionParams - Optional connection parameters if stored params are unavailable
   * @throws {SocketError} Socket connection errors during reconnection
   * @throws {RecorderError} Microphone or recording errors during resume
   */
  async resumeTranscribe(
    fallbackConnectionParams?: TranscribeConnectionParams
  ): Promise<void> {
    // Wait for flush to complete if still in progress
    if (this.sessionState === TranscribeSessionState.FLUSHING) {
      console.log(
        "[TranscribeService] Waiting for buffer flush to complete before resuming..."
      );

      // Wait using setInterval with countdown (max 3 seconds)
      await new Promise<void>((resolve) => {
        const maxWaitTime = 3000;
        const pollInterval = 100;
        let elapsed = 0;

        const intervalId = setInterval(() => {
          elapsed += pollInterval;

          // Check if flush completed or timeout reached
          if (
            this.sessionState !== TranscribeSessionState.FLUSHING ||
            elapsed >= maxWaitTime
          ) {
            clearInterval(intervalId);
            resolve();
          }
        }, pollInterval);
      });

      if (this.sessionState === TranscribeSessionState.FLUSHING) {
        console.error("[TranscribeService] Flush timeout - proceeding anyway");
        // Force state to PAUSED if flush is stuck
        this.sessionState = TranscribeSessionState.PAUSED;
      } else {
        console.log("[TranscribeService] Flush completed, resuming...");
      }
    }

    // Reset idle state to enable auto-reconnection if needed
    this.socketService.setAllowReconnect(true);
    this.socketService.setNeedsSocket(true);

    // Check if socket is still connected, reconnect if needed
    if (!this.socketService.isConnected()) {
      if (this.currentConnectionParams || fallbackConnectionParams) {
        const params = this.currentConnectionParams || fallbackConnectionParams;
        if (params) await this.startTranscribing(params);
      }
      return;
    }

    // Mark as active transcription session
    this.sessionState = TranscribeSessionState.ACTIVE;

    // Start new recording session
    if (this.enableRecording) await this.recorderService.startRecording();

    // Resume mic streaming
    // await this.recorderService.resumeMic();

    // 3. Start mic streaming
    await this.recorderService.startMicStream();
  }

  /**
   * Request microphone permission from the browser.
   *
   * Prompts the user to allow/deny microphone access. Should be called in response to
   * user interaction (e.g., button click) for best browser compatibility.
   *
   * **Possible Errors (thrown):**
   * - `MicrophonePermissionDeniedError` - User denied microphone permission
   * - `MicrophoneAccessError` - Microphone cannot be accessed
   * - `MediaRecorderNotSupportedError` - MediaRecorder not supported in browser
   *
   * @throws {RecorderError} Permission or access errors
   */
  async requestPermission(): Promise<void> {
    await this.recorderService.requestPermission();
  }

  /**
   * Get the current MediaStream from the microphone.
   *
   * Returns the active MediaStream if the microphone is currently open, or null otherwise.
   * Useful for visualizations or custom audio processing.
   *
   * @returns The active MediaStream or null if microphone is not open
   */
  getMediaStream(): MediaStream | null {
    return this.recorderService.getMediaStream();
  }

  /**
   * Add a listener for transcription events.
   *
   * Registers a callback function to be invoked when specific events occur (e.g., speech
   * transcription, errors, recording start/stop). Multiple listeners can be added for the
   * same event type.
   *
   * **Available Listener Types:**
   * - `onSpeech` - Speech transcription results from the server
   * - `onVAD` - Voice Activity Detection warnings
   * - `onConnect` - WebSocket connection established
   * - `onDisconnect` - WebSocket connection closed
   * - `onConnectionStatusChange` - Connection status updates
   * - `onRecordingStart` - Recording started
   * - `onRecordingStop` - Recording stopped (includes AudioFile)
   * - `onPermissionGranted` - Microphone permission granted
   * - `onPermissionDenied` - Microphone permission denied
   * - `onError` - Errors from async/event-driven operations
   *
   * **onError Listener - Possible Errors:**
   *
   * *Socket Errors (during transcription):*
   * - `SocketDisconnectedError` - WebSocket connection lost unexpectedly
   * - `SocketMessageParseError` - Failed to parse server message
   * - `SocketSendError` - Failed to send audio chunk
   * - `SocketBufferOverflowError` - Audio queue full, chunks dropped
   * - `SocketReconnectionFailedError` - Reconnection attempts exhausted
   *
   * *Server Errors:*
   * - `TranscribeServerError` - Server-side transcription errors
   *
   * **Note:** Errors from direct method calls (e.g., `startTranscribing()`) are thrown,
   * not sent to onError listeners. Use try-catch to handle those errors.
   *
   * @param type - The event type to listen for
   * @param callback - The callback function to invoke when the event occurs
   *
   * @example
   * ```typescript
   * // Listen for transcription results
   * service.addTranscribeListener('onSpeech', (response) => {
   *   console.log('Transcription:', response.alternatives[0].transcript);
   * });
   *
   * // Listen for errors (event-driven only)
   * service.addTranscribeListener('onError', (error) => {
   *   if (error instanceof SocketDisconnectedError) {
   *     console.error('Connection lost:', error.message);
   *   } else if (error instanceof SocketReconnectionFailedError) {
   *     console.error('Reconnection failed after max attempts');
   *   } else if (error instanceof TranscribeServerError) {
   *     console.error('Server error:', error.message, error.details);
   *   }
   * });
   *
   * // Listen for connection events
   * service.addTranscribeListener('onConnect', () => {
   *   console.log('Connected to transcription server');
   * });
   * ```
   */
  addTranscribeListener<T extends TranscribeListener>(
    type: T,
    callback: TranscribeListenerCallbackMap[T]
  ): void {
    if (!(this.listeners[type] as unknown[]).includes(callback)) {
      (this.listeners[type] as unknown[]).push(callback);
    }
  }

  /**
   * Remove a previously added listener.
   *
   * Unregisters a callback function for a specific event type. The callback must be the
   * exact same function reference that was passed to addTranscribeListener.
   *
   * @param type - The event type to remove the listener from
   * @param callback - The callback function to remove
   */
  removeTranscribeListener<T extends TranscribeListener>(
    type: T,
    callback: TranscribeListenerCallbackMap[T]
  ): void {
    const index = (this.listeners[type] as unknown[]).indexOf(callback);
    if (index === -1) {
      console.log("[TranscribeService] No listener to remove");
      return;
    }
    this.listeners[type].splice(index, 1);
  }

  // Private methods
  private handleTranscriptionResponse(response: TranscribeResponse): void {
    // Ignore transcription results while flushing buffer
    if (
      this.sessionState === TranscribeSessionState.FLUSHING &&
      response.type === TranscribeResponseType.SPEECH
    ) {
      console.log(
        "[TranscribeService] Ignoring stale transcription during buffer flush"
      );
      return;
    }

    switch (response.type) {
      case TranscribeResponseType.SPEECH:
        executeCallbacks(
          this.listeners.onSpeech,
          response as GcpSpeechResponse
        );
        break;
      case TranscribeResponseType.VAD_WARNING:
        executeCallbacks(this.listeners.onVAD, response as VadResponse);
        break;
      case TranscribeResponseType.ERROR:
        const errorResponse = response as ErrorResponse;
        const serverError = new TranscribeServerError(
          errorResponse.error_message,
          errorResponse.details,
          errorResponse.timestamp
        );
        executeCallbacks(this.listeners.onError, serverError);
        break;
      default:
        console.warn("[TranscribeService] Unknown response type:", response);
    }
  }

  /**
   * Inject virtual silence into the WebSocket stream.
   *
   * Sends a short period of silent audio in small chunks to signal end-of-utterance
   * to the transcription service and flush its buffer. This approach mimics natural
   * audio streaming behavior by sending chunks periodically rather than all at once.
   *
   * Based on working implementation that streams 100ms silence chunks over 2 seconds.
   */
  private async flushTranscriptionBufferInBackground(): Promise<void> {
    try {
      const durationMs = 2000; // 2 seconds of silence
      const sampleRate = this.audioConfig.sampleRate; // e.g., 16000 Hz
      const bytesPerSample = 2; // 16-bit PCM
      const channels = this.audioConfig.channels; // 1 = mono, 2 = stereo
      const chunkMs = 100; // stream in 100ms chunks

      const totalChunks = Math.ceil(durationMs / chunkMs);
      const samplesPerChunk = Math.floor((sampleRate * chunkMs) / 1000);
      const bytesPerChunk = samplesPerChunk * bytesPerSample * channels;

      // Create a single reusable silence chunk (all zeros in PCM16 format)
      const silenceChunk = new ArrayBuffer(bytesPerChunk);

      console.log(
        `[TranscribeService] Injecting virtual silence: ${totalChunks} chunks of ${bytesPerChunk} bytes each`
      );

      // Send silence chunks with small delays to mimic natural streaming
      for (let i = 0; i < totalChunks; i++) {
        try {
          this.socketService.sendAudioChunk(silenceChunk);
          
          // Wait chunkMs between chunks (except for the last one)
          if (i < totalChunks - 1) {
            await new Promise((resolve) => setTimeout(resolve, chunkMs));
          }
        } catch (error) {
          console.error(
            `[TranscribeService] Error sending virtual silence chunk ${i + 1}/${totalChunks}:`,
            error
          );
          break;
        }
      }

      // Wait a bit more for final processing
      await new Promise((resolve) => setTimeout(resolve, 500));

      this.sessionState = TranscribeSessionState.PAUSED;
      console.log("[TranscribeService] Virtual silence injection completed");
    } catch (error) {
      console.error("[TranscribeService] Buffer flush failed:", error);
      // Even if flush fails, mark as paused so service can resume
      this.sessionState = TranscribeSessionState.PAUSED;
    }
  }
}
