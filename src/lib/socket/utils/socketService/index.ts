import type { TranscribeResponse } from "@/transcribe";
import {
  ConnectionStatus,
  type TranscribeConnection,
} from "@/transcribe/types";
import { generateTranscriptionId } from "@/transcribe/utils/generateTranscriptionId";
import type { SocketConfig, ISocketService } from "@/socket/types";
import { ReconnectManager } from "@/socket/utils/reconnectManager";

export class SocketService implements ISocketService {
  private socket: WebSocket | null = null;
  private config: SocketConfig;
  private reconnectManager: ReconnectManager;
  private audioBuffer: ArrayBuffer[] = [];
  private maxBufferSize = 100; // Prevent memory issues
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private error: string | null = null;
  private allowSocketClose: boolean = false;
  private url: URL | null = null;

  // Callbacks - now arrays to support multiple listeners
  private onConnect?: () => void;
  private onDisconnect?: (event: CloseEvent) => void;
  private onError?: (error: Error) => void;
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
    onError?: (error: Error) => void;
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
      async () => await this.handleReconnect()
    );
  }

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
      console.log("error", error);
      this.error = error instanceof Error ? error.message : "Failed to connect";
      this.updateConnectionStatus(ConnectionStatus.ERROR, this.error);
      this.onError?.(error as Error);
      throw new Error(this.error);
    }
  }

  disconnect(): void {
    this.allowSocketClose = true;

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.reconnectManager.stopReconnection();
    // Clear stored URL on intentional disconnect
    this.url = null;
  }

  sendAudioChunk(audioData: ArrayBuffer): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Send raw audio data as Uint8Array
      this.socket.send(audioData);
    } else if (this.reconnectManager.isReconnecting()) {
      // Buffer if disconnected
      this.audioBuffer.push(audioData);
      console.log("⚠️ Audio chunk buffered (socket not connected)");

      // Prevent buffer overflow
      if (this.audioBuffer.length > this.maxBufferSize) {
        this.audioBuffer.shift(); // Remove oldest chunk
      }
    }
  }

  setAllowSocketClose(allow: boolean): void {
    this.allowSocketClose = allow;
  }

  // Check if socket is connected and ready
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.onopen = () => {
      console.log("🔗 WebSocket connected successfully");
      // this.isIntentionallyDisconnected = false;
      this.reconnectManager.resetAttemptCount();
      this.updateConnectionStatus(ConnectionStatus.CONNECTED);
      this.onConnect?.();
    };

    this.socket.onclose = (event) => {
      console.log("onclose", event);
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
        console.log("Starting automatic reconnection (not idle)");
        // Set url with new transcription_id for every new connection after disconnected
        this.url?.searchParams.set(
          "transcription_id",
          generateTranscriptionId()
        );
        this.reconnectManager.startReconnection();
      }
    };

    this.socket.onerror = (error) => {
      this.error = "WebSocket error occurred";
      this.updateConnectionStatus(ConnectionStatus.ERROR, this.error);
      this.onError?.(new Error(`${error}`));
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Check if this is a transcription message and handle accordingly
        this.onTranscription?.(data as TranscribeResponse);
      } catch (error) {
        console.log("❌ Failed to parse WebSocket message:", error);
        console.log("Raw data:", event.data);
        this.onError?.(new Error("Invalid message format"));
      }
    };
  }

  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Socket not initialized"));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
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
          reject(new Error("Connection failed"));
        };

        this.socket?.addEventListener("open", onOpen, { once: true });
        this.socket?.addEventListener("error", onError, { once: true });
      }
    });
  }

  private async handleReconnect(): Promise<void> {
    console.log("Attempting reconnection with stored access token");
    if (!this.url) {
      console.log("No URL available for reconnection");
      // throw new Error("No URL available for reconnection");
      return;
    }

    this.updateConnectionStatus(ConnectionStatus.RECONNECTING);
    // Pass the stored access token during reconnection
    await this.connect(this.url);
    this.flushAudioBuffer();
  }

  private flushAudioBuffer(): void {
    while (this.audioBuffer.length > 0) {
      const chunk = this.audioBuffer.shift();
      if (chunk && this.socket?.readyState === WebSocket.OPEN) {
        // Send raw audio data as Uint8Array
        this.socket.send(chunk);
        // Small delay to prevent overwhelming the server
        setTimeout(() => {}, 10);
      }
    }
  }

  private updateConnectionStatus(
    status: ConnectionStatus,
    error?: string
  ): void {
    this.connectionStatus = status;
    this.error = error || null;

    // Notify listeners of connection status change
    this.onConnectionStatusChange?.({
      status: this.connectionStatus,
      error: this.error || undefined,
      reconnectAttempt: this.reconnectManager.getAttemptCount(),
    });
  }
}
