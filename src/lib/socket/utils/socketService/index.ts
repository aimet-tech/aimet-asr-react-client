import type { TranscribeResponse } from "@/transcribe";
import {
  ConnectionStatus,
  type TranscribeConnection,
} from "@/transcribe/types";
import { generateTranscriptionId } from "@/transcribe/utils/generateTranscriptionId";
import type { SocketConfig, ISocketService } from "@/socket/types";
import { ReconnectManager } from "@/socket/utils/reconnectManager";
import {
  SocketError,
  SocketConnectionError,
  SocketConnectionTimeoutError,
  SocketNotInitializedError,
  SocketDisconnectedError,
  SocketMessageParseError,
  SocketNoURLForReconnectionError,
  SocketReconnectionFailedError,
  SocketSendError,
  SocketBufferOverflowError,
} from "@/socket/errors";

/**
 * SocketService
 *
 * Core service for managing WebSocket connections with automatic reconnection and FIFO-ordered audio streaming.
 * Uses a queue-based architecture to guarantee correct ordering of audio chunks even during reconnections.
 *
 * **Features:**
 * - WebSocket connection management with automatic reconnection
 * - Queue-based FIFO audio chunk ordering (prevents race conditions)
 * - Automatic buffering during network disruptions
 * - Smart reconnection based on user intent (needsSocket flag)
 * - Network detection and automatic recovery
 * - Connection status tracking
 * - Message parsing and routing
 * - Comprehensive error handling with custom error types
 *
 * **Error Callbacks:**
 * All errors reported via the `onError` callback:
 * - `SocketDisconnectedError` - Connection lost unexpectedly
 * - `SocketMessageParseError` - Invalid message format received
 * - `SocketSendError` - Failed to send audio chunk
 * - `SocketBufferOverflowError` - Queue full, chunks being dropped
 * - `SocketReconnectionFailedError` - Max reconnection attempts reached
 *
 * @example
 * ```typescript
 * const socket = new SocketService({
 *   config: { reconnectAttempts: 3, reconnectDelay: 1000 },
 *   onConnect: () => console.log('Connected'),
 *   onReconnected: (newId) => console.log('Reconnected:', newId),
 *   onError: (error) => {
 *     if (error instanceof SocketReconnectionFailedError) {
 *       console.log('Reconnection failed');
 *     }
 *   },
 *   onTranscription: (data) => console.log('Received:', data)
 * });
 *
 * await socket.connect(new URL('ws://localhost:8000'));
 * socket.sendAudioChunk(audioData); // Always queued for FIFO ordering
 * socket.disconnect();
 * ```
 */
export class SocketService implements ISocketService {
  private socket: WebSocket | null = null;
  private config: SocketConfig;
  private reconnectManager: ReconnectManager;
  private audioBuffer: ArrayBuffer[] = [];
  private maxBufferSize = 200; // Prevent memory issues
  private bufferOverflowReported = false; // Track if overflow error was already reported
  private isProcessingQueue = false; // Track if queue is being processed
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private allowReconnect: boolean = true; // Auto reconnect to socket after disconnected if true
  private needsSocket: boolean = false; // Track if socket is still needed (true after start/resume transcribe, false after stop/disconnect transcribe)
  private url: URL | null = null;

  // Network detection
  private isOnline: boolean = true;
  private onlineListener: (() => void) | null = null;
  private offlineListener: (() => void) | null = null;

  // Callbacks - now arrays to support multiple listeners
  private onConnect?: () => void;
  private onDisconnect?: (event: CloseEvent) => void;
  private onReconnected?: (newTranscriptionId: string) => void;
  private onError?: (
    error:
      | SocketDisconnectedError
      | SocketMessageParseError
      | SocketSendError
      | SocketBufferOverflowError
      | SocketReconnectionFailedError
  ) => void;
  private onTranscription?: (response: TranscribeResponse) => void;
  private onConnectionStatusChange?: (status: TranscribeConnection) => void;

  constructor({
    config,
    onConnect,
    onDisconnect,
    onReconnected,
    onError,
    onTranscription,
    onConnectionStatusChange,
  }: {
    config: SocketConfig;
    onConnect?: () => void;
    onDisconnect?: (event: CloseEvent) => void;
    onReconnected?: (newTranscriptionId: string) => void;
    onError?: (
      error:
        | SocketDisconnectedError
        | SocketMessageParseError
        | SocketSendError
        | SocketBufferOverflowError
        | SocketReconnectionFailedError
    ) => void;
    onTranscription?: (response: TranscribeResponse) => void;
    onConnectionStatusChange?: (status: TranscribeConnection) => void;
  }) {
    this.config = config;

    // Handle single callbacks or arrays of callbacks
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;
    this.onReconnected = onReconnected;
    this.onError = onError;
    this.onTranscription = onTranscription;
    this.onConnectionStatusChange = onConnectionStatusChange;

    this.reconnectManager = new ReconnectManager(
      this.config,
      async () => await this.handleReconnect(), // don't write like this `this.handleReconnect`
      () => this.handleReconnectFailed()
    );

    // Initialize network detection
    this.isOnline = navigator.onLine;
    this.setupNetworkListeners();
  }

  /**
   * Set up browser online/offline event listeners.
   *
   * Detects network connectivity changes immediately, before WebSocket realizes
   * the connection is broken. This allows for immediate buffering and reconnection.
   */
  private setupNetworkListeners(): void {
    this.onlineListener = () => {
      console.log(
        "%c [SocketService] Network back online",
        "color: lightgreen"
      );
      this.isOnline = true;

      // Only reconnect if:
      // 1. Socket is still needed (user hasn't stopped transcription)
      // 2. We have a URL to reconnect to
      if (this.needsSocket && this.url) {
        console.log(
          "%c [SocketService] Triggering reconnection after network recovery (socket still needed)",
          "color: lightgreen"
        );
        this.reconnectManager.startReconnection();
      } else if (this.socket?.readyState === WebSocket.OPEN) {
        // If already connected, just resume queue processing
        this.processQueue();
      }
    };

    this.offlineListener = () => {
      console.log("%c [SocketService] Network went offline", "color: red");
      this.isOnline = false;

      // Prevent reconnection attempts while offline
      // Let the socket die naturally - it will trigger onclose
      this.allowReconnect = false;
    };

    window.addEventListener("online", this.onlineListener);
    window.addEventListener("offline", this.offlineListener);
  }

  /**
   * Remove browser online/offline event listeners.
   */
  private cleanupNetworkListeners(): void {
    if (this.onlineListener) {
      window.removeEventListener("online", this.onlineListener);
      this.onlineListener = null;
    }
    if (this.offlineListener) {
      window.removeEventListener("offline", this.offlineListener);
      this.offlineListener = null;
    }
  }

  /**
   * Connect to a WebSocket server.
   *
   * Establishes a WebSocket connection to the specified URL and sets up event handlers.
   * Automatically adds a unique transcription_id parameter to the URL.
   * Waits for the connection to be established before resolving.
   *
   * **Possible Errors:**
   * - `SocketConnectionError` - Connection failed or unexpected error
   * - `SocketConnectionTimeoutError` - Connection timeout (>10s)
   * - `SocketNotInitializedError` - Socket failed to initialize
   *
   * @param url - The WebSocket server URL to connect to
   * @returns The generated transcription_id for this connection
   * @throws {SocketConnectionError}
   * @throws {SocketConnectionTimeoutError}
   * @throws {SocketNotInitializedError}
   */
  async connect(url: URL): Promise<string> {
    // Don't connect if already connected
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Extract existing transcription_id from URL
      const transcriptionId = this.url?.searchParams.get("transcription_id") ?? generateTranscriptionId();
      console.log(
        "%c [SocketService] Already connected, skipping connection with transcription_id: %s",
        "color: orange",
        transcriptionId
      );
      return transcriptionId;
    }

    try {
      this.allowReconnect = true;

      this.updateConnectionStatus(ConnectionStatus.CONNECTING);

      // Store the URL for reconnection
      this.url = new URL(url);
      const transcriptionId = generateTranscriptionId();
      this.url.searchParams.set("transcription_id", transcriptionId);

      // Create WebSocket connection with the exact URL (all params already included)
      this.socket = new WebSocket(this.url);

      this.setupEventHandlers();
      await this.waitForConnection();

      return transcriptionId;
    } catch (error) {
      this.updateConnectionStatus(ConnectionStatus.ERROR);

      // Re-throw known socket errors as-is
      if (error instanceof SocketError) {
        throw error;
      }

      // Wrap unexpected errors in SocketConnectionError
      throw new SocketConnectionError(
        error instanceof Error ? error.message : "Failed to connect"
      );
    }
  }

  /**
   * Disconnect from the WebSocket server.
   *
   * Closes the WebSocket connection, stops reconnection attempts, and clears stored URL.
   * Safe to call even if not connected. Errors during close are logged but not thrown.
   *
   * This is a synchronous cleanup operation and typically doesn't throw errors.
   */
  disconnect(): void {
    this.allowReconnect = false;
    this.needsSocket = false;
    this.cleanupNetworkListeners();

    if (this.socket) {
      try {
        this.socket.close();
      } catch (error) {
        // Log but don't throw - this is cleanup code
        console.error("[SocketService] Failed to close socket:", error);
      }
      this.socket = null;
    }
    this.reconnectManager.stopReconnection();
    // Clear stored URL on intentional disconnect
    this.url = null;
    console.log("%c [SocketService] Disconnected", "color: orange");
  }

  /**
   * Send an audio chunk through the WebSocket.
   *
   * All audio data is queued and processed in order to guarantee FIFO ordering.
   * The queue automatically processes chunks when the socket is ready. If the socket
   * is not ready (disconnected, offline, reconnecting), chunks are queued and will
   * be sent once the connection is restored.
   *
   * **Error Handling (via callback):**
   * - `SocketBufferOverflowError` - Queue is full, new chunks dropped (reported once)
   * - `SocketSendError` - Failed to send a chunk from the queue
   *
   * Note: This method doesn't throw errors. All errors are reported via the onError callback.
   *
   * @param audioData - Raw audio data as ArrayBuffer
   */
  sendAudioChunk(audioData: ArrayBuffer): void {
    // Always enqueue - this guarantees FIFO ordering
    this.enqueueAudioChunk(audioData);
    
    // Start processing queue if not already processing
    this.processQueue();
  }

  /**
   * Set whether reconnection is allowed.
   *
   * When set to true, the socket will attempt to reconnect on unexpected disconnections.
   * When set to false, automatic reconnection will be disabled.
   *
   * @param allow - Whether to allow automatic reconnection
   */
  setAllowReconnect(allow: boolean): void {
    this.allowReconnect = allow;
  }

  /**
   * Set whether the socket is still needed.
   *
   * Controls smart reconnection behavior. When true, the socket will attempt
   * to reconnect when network comes back online. When false, reconnection
   * will be skipped even if network is available.
   *
   * This should be set to true when starting transcription, and false when
   * stopping transcription or disconnecting intentionally.
   *
   * @param needs - Whether the socket is still needed
   */
  setNeedsSocket(needs: boolean): void {
    this.needsSocket = needs;
  }

  /**
   * Enqueue audio data with overflow protection.
   *
   * Adds audio data to the queue if space is available. If the queue is full,
   * drops the new chunk and reports overflow error (only once).
   *
   * @param audioData - Raw audio data to enqueue
   */
  private enqueueAudioChunk(audioData: ArrayBuffer): void {
    // Check if queue is already full
    if (this.audioBuffer.length >= this.maxBufferSize) {
      if (!this.bufferOverflowReported) {
        this.bufferOverflowReported = true;
        this.onError?.(
          new SocketBufferOverflowError(
            `Audio buffer overflow: maximum size of ${this.maxBufferSize} chunks reached. New audio data is being dropped.`
          )
        );
      }
      // Drop the new chunk, don't add to queue
      return;
    }

    // Enqueue the chunk
    this.audioBuffer.push(audioData);
  }

  /**
   * Process the audio queue.
   *
   * Sends queued audio chunks to the server when the socket is ready.
   * Only one processing loop runs at a time. Processing stops when:
   * - The queue is empty
   * - Network is offline
   * - Socket is not open
   *
   * Processing automatically resumes when conditions improve.
   */
  private async processQueue(): Promise<void> {
    // Prevent concurrent processing
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.audioBuffer.length > 0) {
        // Stop processing if conditions are not met
        if (
          !this.isOnline ||
          !this.socket ||
          this.socket.readyState !== WebSocket.OPEN
        ) {
          console.log(
            `%c [SocketService] Queue processing paused (chunks queued)`,
            "color: orange"
          );
          break;
        }

        // Get next chunk from queue
        const chunk = this.audioBuffer.shift();
        if (!chunk) break;

        // Send the chunk
        await this.sendChunkToSocket(chunk);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Send a single audio chunk to the WebSocket.
   *
   * Handles the actual socket.send() call with error handling and rate limiting.
   *
   * @param chunk - Audio chunk to send
   */
  private async sendChunkToSocket(chunk: ArrayBuffer): Promise<void> {
    try {
      this.socket!.send(chunk);
      // Small delay to prevent overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 10));
    } catch (error) {
      // If send fails, notify via callback
      this.onError?.(
        new SocketSendError(
          error instanceof Error ? error.message : "Failed to send audio chunk"
        )
      );
    }
  }

  /**
   * Check if the WebSocket is connected and ready to send data.
   *
   * Returns true only if the socket exists and is in the OPEN state.
   *
   * @returns True if socket is connected and ready, false otherwise
   */
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log(
        "%c [SocketService] WebSocket connected successfully with transcription_id: %s",
        "color: orange",
        this.url?.searchParams.get("transcription_id")
      );
      this.reconnectManager.resetAttemptCount();
      this.updateConnectionStatus(ConnectionStatus.CONNECTED);
      this.onConnect?.();
      this.bufferOverflowReported = false; // Reset overflow flag on successful connection
      
      // Start processing queued chunks
      this.processQueue();
    };

    this.socket.onclose = (event) => {
      console.log(
        "%c [SocketService] WebSocket closed",
        "color: orange",
        event
      );
      this.updateConnectionStatus(ConnectionStatus.DISCONNECTED);
      this.onDisconnect?.(event);

      // Start reconnection only if:
      // 1. Not intentionally disconnected
      // 2. Not currently reconnecting
      // 3. Reconnection hasn't already failed (reached max attempts)
      if (
        this.allowReconnect &&
        !this.reconnectManager.isReconnecting() &&
        this.reconnectManager.getAttemptCount() < this.config.reconnectAttempts
      ) {
        console.log(
          "%c [SocketService] Starting automatic reconnection (not idle)",
          "color: orange"
        );
        // Set url with new transcription_id for every new connection after disconnected
        this.url?.searchParams.set(
          "transcription_id",
          generateTranscriptionId()
        );
        this.reconnectManager.startReconnection();
      }
    };

    this.socket.onerror = (event) => {
      // Extract error information from the event
      console.log("%c [SocketService] WebSocket error", "color: orange", event);
      const errorMessage =
        event instanceof ErrorEvent
          ? event.message || "WebSocket error occurred"
          : "WebSocket error occurred";

      const error = new SocketDisconnectedError(errorMessage);
      this.updateConnectionStatus(ConnectionStatus.ERROR);
      this.onError?.(error);
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Handle transcription response
        this.onTranscription?.(data as TranscribeResponse);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? `${error.message}. Raw data: ${event.data}`
            : `Invalid message format. Raw data: ${event.data}`;
        const parseError = new SocketMessageParseError(errorMessage);
        this.onError?.(parseError);
      }
    };
  }

  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new SocketNotInitializedError());
        return;
      }

      const timeout = setTimeout(() => {
        reject(new SocketConnectionTimeoutError());
      }, 10000);

      if (this.socket.readyState === WebSocket.OPEN) {
        clearTimeout(timeout);
        resolve();
      } else {
        const onOpen = () => {
          clearTimeout(timeout);
          resolve();
        };

        const onError = () => {
          clearTimeout(timeout);
          reject(new SocketConnectionError("Connection failed"));
        };

        this.socket?.addEventListener("open", onOpen, { once: true });
        this.socket?.addEventListener("error", onError, { once: true });
      }
    });
  }

  private async handleReconnect(): Promise<void> {
    console.log("%c [SocketService] Handling reconnect", "color: orange");
    if (!this.url) {
      console.log(
        "%c [SocketService] No URL for reconnection",
        "color: orange"
      );
      throw new SocketNoURLForReconnectionError();
    }

    this.updateConnectionStatus(ConnectionStatus.RECONNECTING);

    // Pass the stored access token during reconnection
    // This will generate a new transcription_id
    const newTranscriptionId = await this.connect(this.url);

    console.log(
      "%c [SocketService] Reconnected with new transcription_id:",
      "color: lightgreen",
      newTranscriptionId
    );

    // Notify listeners about the new transcription_id
    this.onReconnected?.(newTranscriptionId);

    // Queue will be automatically processed by socket.onopen
  }

  private handleReconnectFailed(): void {
    const error = new SocketReconnectionFailedError(
      `Failed to reconnect after ${this.config.reconnectAttempts} attempts`
    );
    this.updateConnectionStatus(ConnectionStatus.ERROR);
    this.onError?.(error);
  }


  private updateConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatus = status;

    // Notify listeners of connection status change
    this.onConnectionStatusChange?.({
      status: this.connectionStatus,
      reconnectAttempt: this.reconnectManager.getAttemptCount(),
    });
  }
}
