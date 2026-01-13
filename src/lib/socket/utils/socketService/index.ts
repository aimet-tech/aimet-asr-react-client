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
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private allowSocketClose: boolean = false;
  private url: URL | null = null;

  // Callbacks - now arrays to support multiple listeners
  private onConnect?: () => void;
  private onDisconnect?: (event: CloseEvent) => void;
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
    onError,
    onTranscription,
    onConnectionStatusChange,
  }: {
    config: SocketConfig;
    onConnect?: () => void;
    onDisconnect?: (event: CloseEvent) => void;
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
    this.onError = onError;
    this.onTranscription = onTranscription;
    this.onConnectionStatusChange = onConnectionStatusChange;

    this.reconnectManager = new ReconnectManager(
      this.config,
      this.handleReconnect,
      this.handleReconnectFailed
    );
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
   * @throws {SocketConnectionError}
   * @throws {SocketConnectionTimeoutError}
   * @throws {SocketNotInitializedError}
   */
  async connect(url: URL): Promise<void> {
    try {
      this.allowSocketClose = false;

      this.updateConnectionStatus(ConnectionStatus.CONNECTING);

      // Store the URL for reconnection
      this.url = new URL(url);
      this.url.searchParams.set("transcription_id", generateTranscriptionId());

      // Create WebSocket connection with the exact URL (all params already included)
      this.socket = new WebSocket(this.url);

      this.setupEventHandlers();
      await this.waitForConnection();
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
    this.allowSocketClose = true;

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
  }

  /**
   * Send an audio chunk through the WebSocket.
   *
   * Sends raw audio data to the server. If the socket is not connected but reconnecting,
   * the data will be buffered and sent once reconnection succeeds. If the buffer is full,
   * the oldest chunks will be dropped.
   *
   * **Error Handling (via callback):**
   * - `SocketSendError` - Failed to send audio chunk
   * - `SocketBufferOverflowError` - Buffer is full, oldest chunks dropped
   * - `SocketNotConnectedError` - Socket is not connected and not reconnecting
   *
   * Note: This method doesn't throw errors. Errors are reported via the onError callback.
   *
   * @param audioData - Raw audio data as ArrayBuffer
   */
  sendAudioChunk(audioData: ArrayBuffer): void {
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
      // Buffer if disconnected
      this.audioBuffer.push(audioData);
      console.log(
        "%c [SocketService] Audio chunk buffered (socket not connected)",
        "color: orange"
      );

      // Prevent buffer overflow
      if (this.audioBuffer.length > this.maxBufferSize) {
        this.audioBuffer.shift(); // Remove oldest chunk
        // Notify about overflow via callback
        this.onError?.(new SocketBufferOverflowError());
      }
    } else {
      // Not connected and not reconnecting - notify via callback
      this.onError?.(
        new SocketNotConnectedError(
          "Cannot send audio chunk, socket not connected"
        )
      );
    }
  }

  /**
   * Set whether the socket can be closed intentionally.
   *
   * When set to true, the socket will not attempt to reconnect if it closes.
   * When set to false, automatic reconnection will be enabled on unexpected disconnections.
   *
   * @param allow - Whether to allow socket close without reconnection
   */
  setAllowSocketClose(allow: boolean): void {
    this.allowSocketClose = allow;
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
        !this.allowSocketClose &&
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

        // Check if this is a transcription message and handle accordingly
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
    if (!this.url) {
      throw new SocketNoURLForReconnectionError();
    }

    this.updateConnectionStatus(ConnectionStatus.RECONNECTING);
    // Pass the stored access token during reconnection
    await this.connect(this.url);
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
