// Base error class for all transcribe errors
export class TranscribeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Server-side errors (received from WebSocket)
export class TranscribeServerError extends TranscribeError {
  constructor(
    message: string,
    public readonly details?: string,
    public readonly timestamp?: string
  ) {
    super(message, "TRANSCRIBE_SERVER_ERROR");
  }
}
