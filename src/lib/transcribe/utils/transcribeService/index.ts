import {
  type TranscribeConfig,
  type AudioFile,
  type GcpSpeechResponse,
  type VadResponse,
  type ErrorResponse,
  TranscribeResponseType,
  type TranscribeConnection,
  type TranscribeResponse,
  type AudioConfig,
  type TranscribeListenerCallbackMap,
  type TranscribeListener,
  type TranscribeConnectionParams,
} from "@/transcribe/types";
import { SocketService } from "@/socket/utils/socketService";
import type { SocketConfig } from "@/socket/types";
import type { RecordingConfig } from "@/recorder/types";
import { AudioRecorderService } from "@/recorder";
import { executeCallbacks } from "@/transcribe/utils/executeCallbacks";
import { buildWebSocketUrl } from "@/transcribe/utils/buildWebSocketUrl";

export class TranscribeService {
  private socketService: SocketService;
  private recorderService: AudioRecorderService;
  private enableRecording: boolean = false;
  private currentConnectionParams: TranscribeConnectionParams | null = null;

  // Callbacks
  listeners: {
    onSpeech: ((response: GcpSpeechResponse) => void)[];
    onError: ((response: ErrorResponse) => void)[];
    onVAD: ((response: VadResponse) => void)[];
    onConnectionStatusChange: ((status: TranscribeConnection) => void)[];
    onRecordingStart: (() => void)[];
    onRecordingStop: ((audioFile: AudioFile) => void)[];
    onPermissionGranted: (() => void)[];
    onPermissionDenied: (() => void)[];
  };
  constructor(config: TranscribeConfig, audioConfig: AudioConfig) {
    console.log("TranscribeService constructor");

    this.listeners = {
      onSpeech: [],
      onError: [],
      onVAD: [],
      onConnectionStatusChange: [],
      onRecordingStart: [],
      onRecordingStop: [],
      onPermissionGranted: [],
      onPermissionDenied: [],
    };

    // Create socket service with config
    const socketConfig: SocketConfig = {
      reconnectAttempts: config.reconnectAttempts || 5,
      reconnectDelay: config.reconnectDelay || 1000,
    };

    this.socketService = new SocketService({
      config: socketConfig,
      // undefined, // onConnect - not needed since we handle connection status via onConnectionStatusChange
      // undefined, // onDisconnect - not needed since we handle connection status via onConnectionStatusChange
      // undefined, // onError - not needed since we handle connection status via onConnectionStatusChange
      onTranscription: (response) => this.handleTranscriptionResponse(response),
      onConnectionStatusChange: (status) => {
        // Update local state with new connection status
        // this.updateState({ connectionStatus: status });

        // Call all listeners in the onConnectionStatusChange array
        executeCallbacks(this.listeners.onConnectionStatusChange, status);
      },
    });

    // Create recorder service
    const recordingConfig: RecordingConfig = {
      mimeType: audioConfig.mimeType, // Use user's choice or undefined for auto-detection
      audioBitsPerSecond: audioConfig.audioBitsPerSecond, // Use user's choice or undefined for auto-detection
      timeSlice: 1000, // 1 second chunks
    };
    this.enableRecording = config.enableRecording || false;

    this.recorderService = new AudioRecorderService({
      audioConfig,
      recordingConfig,
      onAudioData: (audioData) => this.socketService.sendAudioChunk(audioData),
      onRecordingStart: () => executeCallbacks(this.listeners.onRecordingStart),
      onRecordingStop: (audioFile) =>
        executeCallbacks(this.listeners.onRecordingStop, audioFile),
      onError: (error) =>
        executeCallbacks(this.listeners.onError, {
          type: TranscribeResponseType.ERROR,
          timestamp: new Date().toISOString(),
          error_message: error.message,
          details: error.stack || "",
        }),
      onPermissionGranted: () =>
        executeCallbacks(this.listeners.onPermissionGranted),
      onPermissionDenied: () =>
        executeCallbacks(this.listeners.onPermissionDenied),
    });
  }
  // Main public methods
  async startTranscribing(params: TranscribeConnectionParams): Promise<void> {
    document.dispatchEvent(new CustomEvent("onRecordingStart"));

    // Store connection params for potential reconnection
    this.currentConnectionParams = params;

    // Build WebSocket URL with all parameters
    const wsUrl = buildWebSocketUrl(params);

    // 1. Update socket URL and connect
    await this.socketService.connect(wsUrl);

    // 2. Start recording (both mic and file if enabled)
    if (this.enableRecording) await this.recorderService.startRecording();

    // 3. Start mic streaming
    await this.recorderService.startMicStream();

    console.log("mic stream started");
  }

  async stopTranscribing(): Promise<AudioFile | null> {
    // 1. Stop mic streaming
    await this.recorderService.stopMicStream();

    // 2. Stop recording and get final file
    let audioFile = null;
    if (this.enableRecording) {
      console.log("stop recording enableRecording");
      audioFile = await this.recorderService.stopRecording();
    }

    // 3. Disconnect socket
    this.socketService.disconnect();

    // 4. Clear stored connection info
    this.currentConnectionParams = null;

    // 5. Cleanup
    this.recorderService.closeMic();

    return audioFile;
  }

  /// Stop transcribe and keep socket connection
  async stopTranscribeKeepSocket(): Promise<AudioFile | null> {
    // Stop mic streaming but keep recording if active
    await this.recorderService.stopMicStream();

    // Stop current recording and get the file
    let audioFile = null;
    if (this.enableRecording)
      audioFile = await this.recorderService.stopRecording();

    // Mark socket as intentionally idle to prevent auto-reconnection
    this.socketService.setAllowSocketClose(true);

    // 4. Cleanup
    this.recorderService.closeMic();

    return audioFile;
  }

  /// Resume transcribe with existing socket connection
  async resumeTranscribe(
    fallbackConnectionParams?: TranscribeConnectionParams
  ): Promise<void> {
    // Reset idle state to enable auto-reconnection if needed
    this.socketService.setAllowSocketClose(false);

    // Check if socket is still connected, reconnect if needed
    if (!this.socketService.isConnected()) {
      console.log("Socket not connected, attempting to reconnect...");
      // console.log("currentConnectionParams", this.currentConnectionParams);
      // console.log("fallbackConnectionParams", fallbackConnectionParams);
      if (this.currentConnectionParams || fallbackConnectionParams) {
        // const wsUrl = buildWebSocketUrl(this.currentConnectionParams);
        // await this.socketService.connect(wsUrl);
        const params = this.currentConnectionParams || fallbackConnectionParams;
        if (params) await this.startTranscribing(params);
      }
      return;
    }

    // Start new recording session
    if (this.enableRecording) await this.recorderService.startRecording();

    // Resume mic streaming
    // await this.recorderService.resumeMic();

    // 3. Start mic streaming
    await this.recorderService.startMicStream();
  }

  async requestPermission(): Promise<void> {
    await this.recorderService.requestPermission();
  }

  getMediaStream(): MediaStream | null {
    return this.recorderService.getMediaStream();
  }

  addTranscribeListener<T extends TranscribeListener>(
    type: T,
    callback: TranscribeListenerCallbackMap[T]
  ): void {
    if (!(this.listeners[type] as unknown[]).includes(callback)) {
      (this.listeners[type] as unknown[]).push(callback);
    }
  }

  removeTranscribeListener<T extends TranscribeListener>(
    type: T,
    callback: TranscribeListenerCallbackMap[T]
  ): void {
    const index = (this.listeners[type] as unknown[]).indexOf(callback);
    if (index === -1) {
      console.log("🚨 Listener not found");
      return;
    }
    this.listeners[type].splice(index, 1);
  }

  // Private methods
  private handleTranscriptionResponse(response: TranscribeResponse): void {
    switch (response.type) {
      case TranscribeResponseType.SPEECH:
        console.log("🗣️ Speech response detected", this.listeners.onSpeech);
        executeCallbacks(
          this.listeners.onSpeech,
          response as GcpSpeechResponse
        );
        break;
      case TranscribeResponseType.VAD_WARNING:
        console.log("🎤 VAD response detected");
        executeCallbacks(this.listeners.onVAD, response as VadResponse);
        break;
      case TranscribeResponseType.ERROR:
        console.log("❌ Error response detected", response);
        executeCallbacks(this.listeners.onError, response as ErrorResponse);
        break;
      default:
        console.warn("⚠️ Unknown response type:", response);
    }
  }
}
