import type {
  RecordingConfig,
  RecorderService as IRecorderService,
  RecorderState,
} from "@/recorder/types";
import type { AudioConfig, AudioFile } from "@/transcribe/types";
import { getMimeType } from "@/recorder/utils/getMimeType";
import { calculateDuration } from "@/recorder/utils/calculateDuration";
import { convertFloat32ToPcm16 } from "@/recorder/utils/convertFloat32ToPcm16";
import resampleAudio from "@/recorder/utils/resampleAudio";

export class AudioRecorderService implements IRecorderService {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private processor: ScriptProcessorNode | null = null; // Added ScriptProcessor

  private config: AudioConfig;
  private recordingConfig: RecordingConfig;

  // Callbacks - now arrays to support multiple listeners
  private onAudioData?: (audioData: ArrayBuffer) => void;
  private onRecordingStart?: () => void;
  private onRecordingStop?: (audioFile: AudioFile) => void;
  private onError?: (error: Error) => void;
  private onPermissionGranted?: () => void;
  private onPermissionDenied?: () => void;

  private state: RecorderState = {
    isRecording: false,
    isMicActive: false,
    hasPermission: false,
    error: null,
    currentAudioFile: null,
  };

  private recordingChunks: Blob[] = [];
  private recordingStartTime: number = 0;
  private isMediaRecorderStopped: boolean = false;

  constructor({
    audioConfig,
    recordingConfig,
    onAudioData,
    onRecordingStart,
    onRecordingStop,
    onError,
    onPermissionGranted,
    onPermissionDenied,
  }: {
    audioConfig?: AudioConfig;
    recordingConfig?: RecordingConfig;
    onAudioData?: (audioData: ArrayBuffer) => void;
    onRecordingStart?: () => void;
    onRecordingStop?: (audioFile: AudioFile) => void;
    onError?: (error: Error) => void;
    onPermissionGranted?: () => void;
    onPermissionDenied?: () => void;
  }) {
    this.config = {
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      bufferSize: 4096,
      ...audioConfig,
    };
    this.recordingConfig = {
      audioBitsPerSecond: 128000, // Default: 128 kbps (medium quality)
      timeSlice: 1000,
      ...recordingConfig,
    };
    this.onAudioData = onAudioData;
    this.onRecordingStart = onRecordingStart;
    this.onRecordingStop = onRecordingStop;
    this.onError = onError;
    this.onPermissionGranted = onPermissionGranted;
    this.onPermissionDenied = onPermissionDenied;
  }

  async requestPermission(): Promise<void> {
    await this.openMic();
    // Stop the stream after permission check to release resources
    this.closeMic();
  }

  async startRecording(): Promise<void> {
    try {
      await this.openMic();
      await this.initializeMediaRecorder();
      this.recordingChunks = [];
      this.isMediaRecorderStopped = false; // Reset stop state
      this.mediaRecorder?.start(this.recordingConfig.timeSlice);
      this.recordingStartTime = Date.now();
      this.state.isRecording = true;
      this.onRecordingStart?.();
    } catch (error) {
      this.state.error =
        error instanceof Error ? error.message : "Failed to start recording";
      this.onError?.(
        error instanceof Error ? error : new Error("Failed to start recording")
      );
      throw error;
    }
  }

  async stopRecording(): Promise<AudioFile | null> {
    if (!this.state.isRecording || !this.mediaRecorder) {
      return null;
    }

    console.log("stopping recording");

    // Stop the MediaRecorder
    this.mediaRecorder.stop();
    this.state.isRecording = false;

    // Wait for the stop event to complete with timeout
    await this.waitForMediaRecorderStop();

    // Check if we have any recorded chunks
    if (this.recordingChunks.length === 0) {
      console.log("no recording chunks");
      return null;
    }

    // Build the audio file after recording is complete
    const mimeType = getMimeType(this.recordingConfig.mimeType);
    const originalBlob = new Blob(this.recordingChunks, { type: mimeType });

    // Resample the audio to the configured sample rate (16000 Hz)
    const resampledBlob = await resampleAudio(
      await originalBlob.arrayBuffer(),
      this.config.sampleRate,
      this.config.channels
    );

    // Calculate duration from resampled audio data
    const arrayBuffer = await resampledBlob.arrayBuffer();
    const duration = calculateDuration(
      arrayBuffer,
      this.config.sampleRate,
      this.config.channels,
      this.config.bitsPerSample
    );

    const audioFile: AudioFile = {
      blob: resampledBlob,
      duration,
      timestamp: this.recordingStartTime,
      format: "wav", // Resampled audio is always WAV format
      fileType: "audio/wav",
    };

    this.recordingChunks = [];
    this.state.currentAudioFile = audioFile;
    this.onRecordingStop?.(audioFile);

    // Reset MediaRecorder instance so a new one can be created for next recording
    // this.mediaRecorder = null;

    return audioFile;
  }

  async startMicStream(): Promise<void> {
    try {
      await this.openMic();
      await this.initializeAudioContext();
      this.startAudioProcessing();
      this.state.error = null;
    } catch (error) {
      this.state.error =
        error instanceof Error ? error.message : "Failed to start mic stream";
      this.onError?.(
        error instanceof Error ? error : new Error("Failed to start mic stream")
      );
      throw error;
    }
  }

  async stopMicStream(): Promise<void> {
    this.stopAudioProcessing();
    await this.closeAudioContext();
    // this.closeMic();
    // this.state.isMicActive = false;
  }

  async openMic(): Promise<void> {
    if (this.state.isMicActive) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      this.state.isMicActive = true;
      this.mediaStream = stream;
      this.state.hasPermission = true;
      this.state.error = null;
      this.onPermissionGranted?.();
    } catch (error) {
      this.state.hasPermission = false;
      this.state.error =
        error instanceof Error ? error.message : "Failed to get user media";
      this.onPermissionDenied?.();
      throw error;
    }
  }

  closeMic(): void {
    this.state.isMicActive = false;
    if (this.mediaStream) {
      console.log("Closing microphone");
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  getState(): RecorderState {
    return { ...this.state };
  }

  getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  private async closeAudioContext(): Promise<void> {
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
      this.source = null;
      this.processor = null;
      this.analyser = null;
    }
  }

  private async waitForMediaRecorderStop(): Promise<void> {
    // Create a Promise that resolves when the MediaRecorder stop event fires
    const stopEventPromise = new Promise<void>((resolve) => {
      const checkStopState = () => {
        if (this.isMediaRecorderStopped) {
          resolve();
        } else {
          // Check again in the next tick
          window.setTimeout(checkStopState, 100);
        }
      };
      checkStopState();
    });

    // Create a timeout Promise that resolves after 5 seconds
    const timeoutPromise = new Promise<void>((resolve) => {
      window.setTimeout(() => {
        // console.log("MediaRecorder stop timeout reached, proceeding anyway");
        resolve();
      }, 5000);
    });

    // Race between the stop event and timeout
    await Promise.race([stopEventPromise, timeoutPromise]);
  }

  private async initializeMediaRecorder(): Promise<void> {
    // Always create a new MediaRecorder instance for each recording session
    // since MediaRecorder cannot be reused after stopping
    if (this.mediaRecorder) {
      // Clean up the old MediaRecorder if it exists
      this.mediaRecorder = null;
    }

    // mediaStream should already exist from openMic() call
    if (!this.mediaStream) {
      throw new Error("Media stream not available. Call openMic() first.");
    }

    const mimeType = getMimeType(this.recordingConfig.mimeType);
    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType,
      audioBitsPerSecond: this.recordingConfig.audioBitsPerSecond,
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordingChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      console.log("MediaRecorder stopped");
      this.isMediaRecorderStopped = true;
    };
  }

  private async initializeAudioContext(): Promise<void> {
    if (this.audioContext) return;

    // mediaStream should already exist from openMic() call
    if (!this.mediaStream) {
      throw new Error("Media stream not available. Call openMic() first.");
    }

    // this.state.isMicActive = true;

    this.audioContext = new AudioContext({
      sampleRate: this.config.sampleRate,
    });

    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Create ScriptProcessor for audio processing (improved from TempPage1)
    this.processor = this.audioContext.createScriptProcessor(
      this.config.bufferSize,
      1, // Input channels
      1 // Output channels
    );

    // Set up the audio processing event handler
    this.processor.onaudioprocess = (e) => {
      // if (!this.state.isMicActive) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16Data = convertFloat32ToPcm16(inputData);

      // Send audio data to callback
      this.onAudioData?.(pcm16Data);
    };

    // Also create analyser for compatibility with existing code
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.config.bufferSize;
    this.analyser.smoothingTimeConstant = 0.8;

    console.log("AudioContext initialized with:", {
      sampleRate: this.audioContext.sampleRate,
      configSampleRate: this.config.sampleRate,
      channels: this.config.channels,
      bitsPerSample: this.config.bitsPerSample,
      bufferSize: this.config.bufferSize,
    });
  }

  private startAudioProcessing(): void {
    if (this.source && this.processor && this.audioContext) {
      // Connect the nodes for ScriptProcessor-based processing
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      // Also connect to analyser for compatibility
      if (this.analyser) {
        this.source.connect(this.analyser);
      }

      console.log("Audio processing started with ScriptProcessor");
    }
  }

  private stopAudioProcessing(): void {
    if (this.processor) {
      this.processor.disconnect();
    }
    if (this.source) {
      this.source.disconnect();
    }
    if (this.analyser) {
      this.analyser.disconnect();
    }
  }
}
