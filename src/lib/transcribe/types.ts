import type {
  SocketDisconnectedError,
  SocketMessageParseError,
  SocketSendError,
  SocketBufferOverflowError,
  SocketReconnectionFailedError,
} from "@/socket/errors";
import type { TranscribeServerError } from "@/transcribe/errors";

/**
 * Union type of all possible errors that can be reported via onError listener callback.
 *
 * These errors occur during async/event-driven operations and are NOT thrown.
 * Use try-catch for thrown errors from direct method calls instead.
 */
export type TranscribeCallbackError =
  | SocketDisconnectedError
  | SocketMessageParseError
  | SocketSendError
  | SocketBufferOverflowError
  | SocketReconnectionFailedError
  | TranscribeServerError;

// Base response type matching your Dart structure
export interface TranscribeResponse {
  type: TranscribeResponseType;
  timestamp: string;
}

// Response types enum
export enum TranscribeResponseType {
  SPEECH = "speech",
  ERROR = "error",
  VAD_WARNING = "vad_warning",
}

// GCP Speech Response (matches your Dart GcpSpeechResponse)
export interface GcpSpeechResponse extends TranscribeResponse {
  type: TranscribeResponseType.SPEECH;
  alternatives: Alternative[];
  is_final: boolean;
  result_end_offset?: number;
}

// Alternative transcription (part of GcpSpeechResponse)
export interface Alternative {
  transcript: string;
  confidence: number;
  words?: TranscribeWord[];
}

// Individual word with timing and confidence
export interface TranscribeWord {
  startTime: number;
  endTime: number;
  word: string;
  confidence: number;
  speakerLabel?: string;
}

// Error Response (matches your Dart ErrorResponse)
export interface ErrorResponse extends TranscribeResponse {
  type: TranscribeResponseType.ERROR;
  error_message: string;
  details: string;
}

// Voice Activity Detection Response (matches your Dart VadResponse)
export interface VadResponse extends TranscribeResponse {
  type: TranscribeResponseType.VAD_WARNING;
  voice_activity_count: number;
  idle_time: number; // Direct milliseconds value from Dart
}

// Transcribe configuration
export interface TranscribeConfig {
  enableRecording?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

// Audio file interface
export interface AudioFile {
  blob: Blob;
  duration: number;
  timestamp: number;
  format: string;
  fileType: string;
}

// Connection status enum
export enum ConnectionStatus {
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  RECONNECTING = "reconnecting",
  ERROR = "error",
}

// Enhanced connection status with additional info
export interface TranscribeConnection {
  status: ConnectionStatus;
  reconnectAttempt?: number;
}

// Transcribe connection parameters
export interface TranscribeConnectionParams {
  base_url: string;
  access_token: string;
  caller_ref_id?: string;
  caller_service: string;
  model?: string; // Will be imported from keys.ts
}

// Hook options
export interface UseTranscribeOptions {
  config: TranscribeConfig;
  audioConfig: AudioConfig;
  autoRequestPermission?: boolean;
}

// Audio configuration
export interface AudioConfig {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  bufferSize: number;
  mimeType?: "audio/webm" | "audio/mp4" | "audio/wav";
  audioBitsPerSecond?: number;
}

export type TranscribeListener = keyof TranscribeListenerCallbackMap;

// Type mapping for callback signatures
export type TranscribeListenerCallbackMap = {
  onSpeech: (res: GcpSpeechResponse) => void;
  onError: (error: TranscribeCallbackError) => void;
  onVAD: (res: VadResponse) => void;
  onConnect: () => void;
  onDisconnect: (event: CloseEvent) => void;
  onReconnected: (newTranscriptionId: string) => void;
  onConnectionStatusChange: (res: TranscribeConnection) => void;
  onRecordingStart: () => void;
  onRecordingStop: (res: AudioFile) => void;
  onPermissionGranted: () => void;
  onPermissionDenied: () => void;
};
