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
  SocketNotConnectedError,
  SocketReconnectionFailedError,
} from "@/socket/errors";

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

  // Callbacks
  listeners: {
    onSpeech: ((response: GcpSpeechResponse) => void)[];
    onError: ((
      error:
        | SocketDisconnectedError
        | SocketMessageParseError
        | SocketSendError
        | SocketBufferOverflowError
        | SocketNotConnectedError
        | SocketReconnectionFailedError
        | TranscribeServerError
    ) => void)[];
    onVAD: ((response: VadResponse) => void)[];
    onConnect: (() => void)[];
    onDisconnect: ((event: CloseEvent) => void)[];
    onConnectionStatusChange: ((status: TranscribeConnection) => void)[];
    onRecordingStart: (() => void)[];
    onRecordingStop: ((audioFile: AudioFile) => void)[];
    onPermissionGranted: (() => void)[];
    onPermissionDenied: (() => void)[];
  };
  constructor(config: TranscribeConfig, audioConfig: AudioConfig) {
    this.listeners = {
      onSpeech: [],
      onError: [],
      onVAD: [],
      onConnect: [],
      onDisconnect: [],
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
          | SocketNotConnectedError
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
   * @throws {SocketError} Socket connection errors
   * @throws {RecorderError} Microphone or recording errors
   */
  async startTranscribing(params: TranscribeConnectionParams): Promise<void> {
    document.dispatchEvent(new CustomEvent("onRecordingStart"));

    // Store connection params for potential reconnection
    this.currentConnectionParams = params;

    // Build WebSocket URL with all parameters
    const wsUrl = buildWebSocketUrl(params);

    // 1. Update socket URL and connect
    await this.socketService.connect(wsUrl);

    // 2. Start recording (both mic and file if enabled)
    if (this.enableRecording) await this.recorderService.startRecording();

    // 3. Start mic streaming
    await this.recorderService.startMicStream();
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
   * Stop transcribing but keep the WebSocket connection open.
   *
   * Stops the microphone stream and recording (if enabled) while maintaining the WebSocket
   * connection. This is useful for pausing transcription without reconnecting. The socket
   * will not attempt automatic reconnection while in this state.
   *
   * **Possible Errors (thrown):**
   * - `MicStreamStopError` - Failed to stop microphone stream
   * - `RecordingStopError` - Failed to stop recording
   * - `NoRecordingChunksError` - No audio data was recorded
   * - `MediaRecorderTimeoutError` - MediaRecorder stop operation timed out
   *
   * @returns The recorded audio file if recording was enabled, null otherwise
   * @throws {RecorderError} Microphone or recording errors during pause
   */
  async stopTranscribeKeepSocket(): Promise<AudioFile | null> {
    // Stop mic streaming but keep recording if active
    await this.recorderService.stopMicStream();

    // Stop current recording and get the file
    let audioFile = null;
    if (this.enableRecording)
      audioFile = await this.recorderService.stopRecording();

    // Mark socket as intentionally idle to prevent auto-reconnection
    this.socketService.setAllowSocketClose(true);

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
    // Reset idle state to enable auto-reconnection if needed
    this.socketService.setAllowSocketClose(false);

    // Check if socket is still connected, reconnect if needed
    if (!this.socketService.isConnected()) {
      if (this.currentConnectionParams || fallbackConnectionParams) {
        const params = this.currentConnectionParams || fallbackConnectionParams;
        if (params) await this.startTranscribing(params);
      }
      return;
    }

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
   * - `SocketBufferOverflowError` - Audio buffer full, chunks dropped
   * - `SocketNotConnectedError` - Attempted to send while disconnected
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
}
