export interface SocketConfig {
  reconnectAttempts: number;
  reconnectDelay: number;
}

// Socket service interface
export interface ISocketService {
  connect(url: URL): Promise<string>;
  disconnect(): void;
  sendAudioChunk(audioData: ArrayBuffer): void;
  setAllowReconnect(allow: boolean): void;
  setNeedsSocket(needs: boolean): void;
  isConnected(): boolean;
}

// Reconnection manager interface
export interface IReconnectManager {
  startReconnection(): void;
  stopReconnection(): void;
  isReconnecting(): boolean;
  getAttemptCount(): number;
}
