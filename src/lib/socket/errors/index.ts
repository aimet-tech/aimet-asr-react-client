// Base error class for all socket errors
export class SocketError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Connection errors
export class SocketConnectionError extends SocketError {
  constructor(message = "Failed to establish WebSocket connection") {
    super(message, "SOCKET_CONNECTION_ERROR");
  }
}

export class SocketConnectionTimeoutError extends SocketError {
  constructor(message = "WebSocket connection timeout") {
    super(message, "SOCKET_CONNECTION_TIMEOUT");
  }
}

export class SocketNotInitializedError extends SocketError {
  constructor(message = "WebSocket not initialized") {
    super(message, "SOCKET_NOT_INITIALIZED");
  }
}

export class SocketAlreadyConnectedError extends SocketError {
  constructor(message = "WebSocket is already connected") {
    super(message, "SOCKET_ALREADY_CONNECTED");
  }
}

// Disconnection errors
export class SocketDisconnectedError extends SocketError {
  constructor(message = "WebSocket disconnected unexpectedly") {
    super(message, "SOCKET_DISCONNECTED");
  }
}

export class SocketClosedError extends SocketError {
  constructor(message = "WebSocket connection closed") {
    super(message, "SOCKET_CLOSED");
  }
}

// Reconnection errors
export class SocketReconnectionFailedError extends SocketError {
  constructor(message = "Failed to reconnect after maximum attempts") {
    super(message, "SOCKET_RECONNECTION_FAILED");
  }
}

export class SocketReconnectionError extends SocketError {
  constructor(message = "Error during reconnection attempt") {
    super(message, "SOCKET_RECONNECTION_ERROR");
  }
}

export class SocketNoURLForReconnectionError extends SocketError {
  constructor(message = "No URL available for reconnection") {
    super(message, "SOCKET_NO_URL_FOR_RECONNECTION");
  }
}

// Message errors
export class SocketMessageParseError extends SocketError {
  constructor(message = "Failed to parse WebSocket message") {
    super(message, "SOCKET_MESSAGE_PARSE_ERROR");
  }
}

export class SocketInvalidMessageFormatError extends SocketError {
  constructor(message = "Invalid message format received") {
    super(message, "SOCKET_INVALID_MESSAGE_FORMAT");
  }
}

// Send errors
export class SocketSendError extends SocketError {
  constructor(message = "Failed to send data through WebSocket") {
    super(message, "SOCKET_SEND_ERROR");
  }
}

// Buffer errors
export class SocketBufferOverflowError extends SocketError {
  constructor(message = "Audio buffer overflow, oldest chunks dropped") {
    super(message, "SOCKET_BUFFER_OVERFLOW");
  }
}

