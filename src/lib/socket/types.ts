export interface SocketConfig {
  reconnectAttempts: number;
  reconnectDelay: number;
}

// Socket service interface
export interface ISocketService {
  connect(url: URL): Promise<void>;
  disconnect(): void;
  sendAudioChunk(audioData: ArrayBuffer): void;
  setAllowSocketClose(allow: boolean): void;
  isConnected(): boolean;
}

// Reconnection manager interface
export interface IReconnectManager {
  startReconnection(): void;
  stopReconnection(): void;
  isReconnecting(): boolean;
  getAttemptCount(): number;
}
