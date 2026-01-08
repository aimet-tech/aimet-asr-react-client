// Base error class for all recorder errors
export class RecorderError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Permission errors
export class MicrophonePermissionDeniedError extends RecorderError {
  constructor(message = "Microphone permission denied by user") {
    super(message, "MICROPHONE_PERMISSION_DENIED");
  }
}

export class MicrophoneAccessError extends RecorderError {
  constructor(message = "Failed to access microphone") {
    super(message, "MICROPHONE_ACCESS_ERROR");
  }
}

// Recording errors
export class RecordingStartError extends RecorderError {
  constructor(message = "Failed to start recording") {
    super(message, "RECORDING_START_ERROR");
  }
}

export class RecordingStopError extends RecorderError {
  constructor(message = "Failed to stop recording") {
    super(message, "RECORDING_STOP_ERROR");
  }
}

export class NoRecordingChunksError extends RecorderError {
  constructor(message = "No audio data was recorded") {
    super(message, "NO_RECORDING_CHUNKS");
  }
}

// Stream errors
export class MediaStreamNotAvailableError extends RecorderError {
  constructor(
    message = "Media stream not available. Microphone must be opened first"
  ) {
    super(message, "MEDIA_STREAM_NOT_AVAILABLE");
  }
}

export class AudioContextInitializationError extends RecorderError {
  constructor(message = "Failed to initialize audio context") {
    super(message, "AUDIO_CONTEXT_INITIALIZATION_ERROR");
  }
}

export class MicStreamStartError extends RecorderError {
  constructor(message = "Failed to start microphone stream") {
    super(message, "MIC_STREAM_START_ERROR");
  }
}

export class MicStreamStopError extends RecorderError {
  constructor(message = "Failed to stop microphone stream") {
    super(message, "MIC_STREAM_STOP_ERROR");
  }
}

// MediaRecorder errors
export class MediaRecorderNotSupportedError extends RecorderError {
  constructor(message = "MediaRecorder is not supported in this browser") {
    super(message, "MEDIA_RECORDER_NOT_SUPPORTED");
  }
}

export class MediaRecorderTimeoutError extends RecorderError {
  constructor(message = "MediaRecorder stop operation timed out") {
    super(message, "MEDIA_RECORDER_TIMEOUT");
  }
}
