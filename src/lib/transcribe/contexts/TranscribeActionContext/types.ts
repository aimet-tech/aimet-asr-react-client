import type {
  AudioFile,
  TranscribeListener,
  TranscribeListenerCallbackMap,
  TranscribeConnectionParams,
} from "@/transcribe/types";

/**
 * Actions for controlling the transcription service.
 *
 * These methods are used to control the transcription lifecycle, manage listeners,
 * and access the microphone stream.
 */
export interface TranscribeActions {
  /**
   * Add a listener for transcription events.
   *
   * Registers a callback function to be invoked when specific events occur.
   * Multiple listeners can be added for the same event type.
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
   * addTranscribeListener('onSpeech', (response) => {
   *   console.log('Transcription:', response.alternatives[0].transcript);
   * });
   *
   * // Listen for errors (event-driven only)
   * addTranscribeListener('onError', (error) => {
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
   * addTranscribeListener('onConnect', () => {
   *   console.log('Connected to transcription server');
   * });
   *
   * addTranscribeListener('onDisconnect', (event) => {
   *   console.log('Disconnected:', event.code, event.reason);
   * });
   * ```
   */
  addTranscribeListener: <T extends TranscribeListener>(
    type: T,
    callback: TranscribeListenerCallbackMap[T]
  ) => void;

  /**
   * Remove a previously added listener.
   *
   * Unregisters a callback function for a specific event type. The callback must be
   * the exact same function reference that was passed to addTranscribeListener.
   *
   * @param type - The event type to remove the listener from
   * @param callback - The callback function to remove
   */
  removeTranscribeListener: <T extends TranscribeListener>(
    type: T,
    callback: TranscribeListenerCallbackMap[T]
  ) => void;

  /**
   * Start transcribing audio from the microphone.
   *
   * Establishes a WebSocket connection to the transcription server, starts the microphone
   * stream, and optionally begins recording audio to a file. Audio data is automatically
   * sent to the server for transcription.
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
   *
   * @example
   * ```typescript
   * try {
   *   await startTranscribing({
   *     base_url: 'wss://example.com',
   *     access_token: 'token',
   *     caller_service: 'my-app',
   *     caller_ref_id: 'session-123'
   *   });
   * } catch (error) {
   *   if (error instanceof MicrophonePermissionDeniedError) {
   *     alert('Please allow microphone access');
   *   }
   * }
   * ```
   */
  startTranscribing: (params: TranscribeConnectionParams) => Promise<void>;

  /**
   * Stop transcribing and disconnect from the server.
   *
   * Stops the microphone stream, stops recording (if enabled), and disconnects from
   * the WebSocket server. Cleans up all resources including microphone access.
   *
   * **Possible Errors (thrown):**
   * - `MicStreamStopError` - Failed to stop microphone stream
   * - `RecordingStopError` - Failed to stop recording
   * - `NoRecordingChunksError` - No audio data was recorded
   * - `MediaRecorderTimeoutError` - MediaRecorder stop operation timed out
   *
   * @returns The recorded audio file if recording was enabled, null otherwise
   * @throws {RecorderError} Microphone or recording errors during shutdown
   *
   * @example
   * ```typescript
   * const audioFile = await stopTranscribing();
   * if (audioFile) {
   *   console.log('Recorded audio:', audioFile.duration, 'ms');
   * }
   * ```
   */
  stopTranscribing: () => Promise<AudioFile | null>;

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
   *
   * @example
   * ```typescript
   * // Pause transcription
   * const audioFile = await stopTranscribeKeepSocket();
   *
   * // ... do something else ...
   *
   * // Resume later without reconnecting
   * await resumeTranscribe();
   * ```
   */
  stopTranscribeKeepSocket: () => Promise<AudioFile | null>;

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
   *
   * @example
   * ```typescript
   * // Resume with stored connection params
   * await resumeTranscribe();
   *
   * // Or provide fallback params
   * await resumeTranscribe({
   *   base_url: 'wss://example.com',
   *   access_token: 'new-token',
   *   caller_service: 'my-app'
   * });
   * ```
   */
  resumeTranscribe: (
    fallbackConnectionParams?: TranscribeConnectionParams
  ) => Promise<void>;

  /**
   * Request microphone permission from the browser.
   *
   * Prompts the user to allow/deny microphone access. Should be called in response to
   * user interaction (e.g., button click) for best browser compatibility. This must be
   * called before startTranscribing() if the user hasn't granted permission yet.
   *
   * **Possible Errors (thrown):**
   * - `MicrophonePermissionDeniedError` - User denied microphone permission
   * - `MicrophoneAccessError` - Microphone cannot be accessed
   * - `MediaRecorderNotSupportedError` - MediaRecorder not supported in browser
   *
   * @throws {RecorderError} Permission or access errors
   *
   * @example
   * ```typescript
   * try {
   *   await requestPermission();
   *   console.log('Microphone access granted');
   * } catch (error) {
   *   if (error instanceof MicrophonePermissionDeniedError) {
   *     alert('Microphone permission is required');
   *   }
   * }
   * ```
   */
  requestPermission: () => Promise<void>;

  /**
   * Get the current MediaStream from the microphone.
   *
   * Returns the active MediaStream if the microphone is currently open, or null otherwise.
   * Useful for audio visualizations, custom audio processing, or displaying audio levels.
   *
   * @returns The active MediaStream or null if microphone is not open
   *
   * @example
   * ```typescript
   * const stream = getMediaStream();
   * if (stream) {
   *   // Use for audio visualization
   *   const audioContext = new AudioContext();
   *   const source = audioContext.createMediaStreamSource(stream);
   *   const analyser = audioContext.createAnalyser();
   *   source.connect(analyser);
   *   // ... draw audio visualizer
   * }
   * ```
   */
  getMediaStream: () => MediaStream | null;
}
