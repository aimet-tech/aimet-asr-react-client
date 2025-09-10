import type { SocketConfig, IReconnectManager } from "@/socket/types";

export class ReconnectManager implements IReconnectManager {
  private config: SocketConfig;
  private onReconnect: () => Promise<void>;
  private _isReconnecting = false;
  private attemptCount = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(config: SocketConfig, onReconnect: () => Promise<void>) {
    this.config = config;
    this.onReconnect = onReconnect;
  }

  startReconnection(): void {
    if (this._isReconnecting) return;

    console.log("startReconnection");

    this._isReconnecting = true;
    this.attemptCount = 0;
    this.scheduleNextAttempt();
  }

  stopReconnection(): void {
    console.log("stopReconnection");

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this._isReconnecting = false;
  }

  isReconnecting(): boolean {
    return this._isReconnecting;
  }

  resetAttemptCount(): void {
    console.log("resetAttemptCount");
    this.attemptCount = 0;
  }

  getAttemptCount(): number {
    return this.attemptCount;
  }

  private scheduleNextAttempt(): void {
    if (!this._isReconnecting) return;

    console.log("scheduleNextAttempt", this.attemptCount);

    if (this.attemptCount >= this.config.reconnectAttempts) {
      this.stopReconnection();
      return;
    }

    const delay = this.calculateDelay();

    this.reconnectTimeout = setTimeout(async () => {
      this.attemptCount++;

      try {
        await this.onReconnect();
        this.stopReconnection(); // Success, stop reconnecting
        this.resetAttemptCount();
      } catch (_error) {
        // Failed, schedule next attempt
        this.scheduleNextAttempt();
      }
    }, delay);
  }

  private calculateDelay(): number {
    // Exponential backoff with jitter
    const baseDelay = this.config.reconnectDelay;
    const maxDelay = baseDelay * 2 ** this.attemptCount;
    const jitter = Math.random() * 0.1 * maxDelay; // 10% jitter
    return Math.min(maxDelay + jitter, 30000); // Max 30 seconds
  }
}
