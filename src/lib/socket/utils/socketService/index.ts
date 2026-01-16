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
  SocketNotConnectedError,
  SocketBufferOverflowError,
} from "@/socket/errors";

/**
 * SocketService
 *
 * Core service for managing WebSocket connections with automatic reconnection.
 * Handles WebSocket lifecycle, message routing, audio chunk buffering, and connection recovery.
 *
 * **Features:**
 * - WebSocket connection management
 * - Automatic reconnection with exponential backoff
 * - Audio chunk buffering during disconnections
 * - Connection status tracking
 * - Message parsing and routing
 * - Error handling with custom error types
 *
 * @example
 * ```typescript
 * const socket = new SocketService({
 *   config: { reconnectAttempts: 3, reconnectDelay: 1000 },
 *   onConnect: () => console.log('Connected'),
 *   onError: (error) => {
 *     if (error instanceof SocketReconnectionFailedError) {
 *       console.log('Reconnection failed');
 *     }
 *   },
 *   onTranscription: (data) => console.log('Received:', data)
 * });
 *
 * await socket.connect(new URL('ws://localhost:8000'));
 * socket.sendAudioChunk(audioData);
 * socket.disconnect();
 * ```
 */
export class SocketService implements ISocketService {
  private socket: WebSocket | null = null;
  private config: SocketConfig;
  private reconnectManager: ReconnectManager;
  private audioBuffer: ArrayBuffer[] = [];
  private maxBufferSize = 100; // Prevent memory issues
  private bufferOverflowReported = false; // Track if overflow error was already reported
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
      | SocketNotConnectedError
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
        | SocketNotConnectedError
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
      }
    };

    this.offlineListener = () => {
      console.log("%c [SocketService] Network went offline", "color: red");
      this.isOnline = false;

      // Prevent reconnection attempts while offline
      // Let the socket die naturally - it will trigger onclose
      this.allowReconnect = false;

      console.log(
        "%c [SocketService] Disabled reconnection while offline, waiting for socket to close naturally",
        "color: orange"
      );
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
      console.log(
        "%c [SocketService] Already connected, skipping connection",
        "color: yellow"
      );
      // Extract existing transcription_id from URL
      const existingId = this.url?.searchParams.get("transcription_id");
      if (existingId) {
        return existingId;
      }
      // Fallback: generate new ID (shouldn't happen)
      return generateTranscriptionId();
    }

    try {
      this.allowReconnect = true;

      this.updateConnectionStatus(ConnectionStatus.CONNECTING);

      // Store the URL for reconnection
      this.url = new URL(url);
      const transcriptionId = generateTranscriptionId();
      this.url.searchParams.set("transcription_id", transcriptionId);

      console.log(
        "%c [SocketService] Connecting to URL",
        "color: orange",
        this.url
      );

      // Create WebSocket connection with the exact URL (all params already included)
      this.socket = new WebSocket(this.url);

      console.log("%c [SocketService] WebSocket created", "color: orange");

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
   * Sends raw audio data to the server. If the socket is not connected but reconnecting,
   * the data will be buffered and sent once reconnection succeeds. If the buffer is full,
   * new chunks will be dropped and an error will be reported once.
   *
   * **Error Handling (via callback):**
   * - `SocketSendError` - Failed to send audio chunk
   * - `SocketBufferOverflowError` - Buffer is full, new chunks dropped (reported once)
   * - `SocketNotConnectedError` - Socket is not connected and not reconnecting
   *
   * Note: This method doesn't throw errors. Errors are reported via the onError callback.
   *
   * @param audioData - Raw audio data as ArrayBuffer
   */
  sendAudioChunk(audioData: ArrayBuffer): void {
    // Priority 1: Check network status FIRST (browser-level detection)
    // Buffer immediately if offline, regardless of socket state
    if (!this.isOnline) {
      this.bufferAudioChunk(audioData, "network offline");
      return;
    }

    // Priority 2: Socket is open - send immediately
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        // Send raw audio data as Uint8Array
        this.socket.send(audioData);
      } catch (error) {
        // Event-based: call error callback
        this.onError?.(
          new SocketSendError(
            error instanceof Error
              ? error.message
              : "Failed to send audio chunk"
          )
        );
      }
    } else if (this.reconnectManager.isReconnecting()) {
      // Priority 3: Reconnecting - buffer the data
      this.bufferAudioChunk(audioData, "socket not connected");
    } else {
      // Priority 4: Not connected and not reconnecting - notify via callback
      this.onError?.(
        new SocketNotConnectedError(
          "Cannot send audio chunk, socket not connected"
        )
      );
    }
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
   * Buffer audio data with overflow protection.
   *
   * Adds audio data to the buffer if space is available. If the buffer is full,
   * drops the new chunk and reports overflow error (only once).
   *
   * @param audioData - Raw audio data to buffer
   * @param reason - Reason for buffering (for logging)
   */
  private bufferAudioChunk(audioData: ArrayBuffer, reason: string): void {
    // Check if buffer is already full
    if (this.audioBuffer.length >= this.maxBufferSize) {
      if (!this.bufferOverflowReported) {
        this.bufferOverflowReported = true;
        this.onError?.(
          new SocketBufferOverflowError(
            `Audio buffer overflow: maximum size of ${this.maxBufferSize} chunks reached. New audio data is being dropped.`
          )
        );
      }
      // Drop the new chunk, don't add to buffer
      return;
    }

    // Buffer the chunk
    this.audioBuffer.push(audioData);
    console.log(
      `%c [SocketService] Audio chunk buffered (${reason})`,
      "color: orange"
    );
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
        "%c [SocketService] WebSocket connected successfully",
        "color: orange"
      );
      this.reconnectManager.resetAttemptCount();
      this.updateConnectionStatus(ConnectionStatus.CONNECTED);
      this.onConnect?.();
      this.bufferOverflowReported = false; // Reset overflow flag on successful connection
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

    await this.flushAudioBuffer();
  }

  private handleReconnectFailed(): void {
    const error = new SocketReconnectionFailedError(
      `Failed to reconnect after ${this.config.reconnectAttempts} attempts`
    );
    this.updateConnectionStatus(ConnectionStatus.ERROR);
    this.onError?.(error);
  }

  private async flushAudioBuffer(): Promise<void> {
    while (this.audioBuffer.length > 0) {
      const chunk = this.audioBuffer.shift();
      if (chunk && this.socket?.readyState === WebSocket.OPEN) {
        try {
          // Send raw audio data as Uint8Array
          this.socket.send(chunk);
          // Small delay to prevent overwhelming the server
          await new Promise((resolve) => setTimeout(resolve, 10));
        } catch (error) {
          // If send fails, notify via callback and stop flushing
          this.onError?.(
            new SocketSendError(
              error instanceof Error
                ? `Failed to flush buffered audio: ${error.message}`
                : "Failed to flush buffered audio"
            )
          );
          break; // Stop flushing on error
        }
      }
    }
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
