# AIMET ASR React Client

A React library for connecting with AIMET global ASR (Automatic Speech Recognition) services. Provides hooks and providers for audio recording and real-time transcription.

## Installation

```bash
npm install @bream-is-a-fish/aimet-asr-react-client
```

## Features

- 🎤 **Audio Recording** - Record audio with configurable formats and quality
- 📝 **Real-time Transcription** - Live speech-to-text with WebSocket connection
- 🔄 **WebSocket Management** - Automatic reconnection and connection handling
<!-- - ⚛️ **React Hooks** - Easy-to-use hooks for React applications -->
<!-- - 📦 **Tree-shakable** - Import only what you need -->

## Quick Start

### Using the Transcribe Module

For real-time transcription, wrap your app with `TranscribeProvider`:

```tsx
import { TranscribeProvider } from '@bream-is-a-fish/aimet-asr-react-client';

function App() {
  return (
    <TranscribeProvider>
      <YourApp />
    </TranscribeProvider>
  );
}
```

Then use the transcription hooks in your components:

```tsx
import {
  AudioFile,
  ErrorResponse,
  GcpSpeechResponse,
  TranscribeActionContext,
  TranscribeStateContext,
  TranscribeConnectionParams,
} from "@bream-is-a-fish/aimet-asr-react-client";

const useMyTranscribe = ({ onTranscription }) => {
  const transcriptionRef = useRef<string[]>([""]);
  const {
    addTranscribeListener,
    removeTranscribeListener,
    startTranscribing,
    stopTranscribing,
    stopTranscribeKeepSocket,
    resumeTranscribe,
  } = useContext(TranscribeActionContext);
  const { serviceInitialized } = useContext(TranscribeStateContext);

  // Set up transcribe callbacks when component mounts
  useEffect(() => {
    // Make sure to check for serviceInitialized to be true first
    // Before setting up callbacks
    if (!serviceInitialized) return;

    const onSpeech = (response: GcpSpeechResponse) => {
        // Example of how to handle transcription
        if (response.is_final) {
            transcriptionRef.current = [
                ...transcriptionRef.current,
                response.alternatives[0]?.transcript ?? "",
            ];
        } else {
            transcriptionRef.current[transcriptionRef.current.length - 1] =
                response.alternatives[0]?.transcript ?? "";
        }
        onTranscription(transcriptionRef.current);
    };

    const onError = (response: ErrorResponse) => {};
    const onRecordingStart = () => {};
    const onRecordingStop = (audioFile: AudioFile) => {};

    addTranscribeListener("onSpeech", onSpeech);
    addTranscribeListener("onError", onError);
    addTranscribeListener("onRecordingStart", onRecordingStart);
    addTranscribeListener("onRecordingStop", onRecordingStop);

    return () => {
      removeTranscribeListener("onSpeech", onSpeech);
      removeTranscribeListener("onError", onError);
      removeTranscribeListener("onRecordingStart", onRecordingStart);
      removeTranscribeListener("onRecordingStop", onRecordingStop);
    };
  }, [serviceInitialized]);

  const startTranscribe = async () => {
    // ...
    await startTranscribing({
      base_url: // ...,
      access_token: // ...,
      caller_service: // app name e.g. braindi,
      caller_ref_id: // e.g. test_id,
    });
  };

  const resumeTranscribe = async () => {
    await resumeTranscribe({
      base_url: // ...,
      access_token: // ...,
      caller_service: // app name e.g. braindi,
      caller_ref_id: // e.g. test_id,
    })
  }

  return {
    startTranscribe,
    startTranscribe,
    resumeTranscribe,
    stopTranscribeKeepSocket,
  };
};
```

### Using Only the Recorder Module

For audio recording without transcription, wrap your app with `RecorderProvider`:

```tsx
import { RecorderProvider } from '@bream-is-a-fish/aimet-asr-react-client';

function App() {
  return (
    <RecorderProvider>
      <YourApp />
    </RecorderProvider>
  );
}
```

Then use the recorder context in your components:

```tsx
import { RecorderContext, AudioFile } from "@bream-is-a-fish/aimet-asr-react-client";

const RecordingComponent = () => {
  // Use the RecorderProvider context
  const { isRecording: recorderIsRecording, startRecord, stopRecord, requestPermission } =
    useContext(RecorderContext);

  const startRecording = async () => {
    try {
        await requestPermission();
        await startRecord();
        // ...
    } catch (error) {
        // ...
    }
  };

  const handleRecordFinish = async () => {
    try {
        const audioFile = await stopRecord();
        if (!audioFile) {
            throw new Error("Failed to get audio file from recording");
        }
        
        // Process the audio file
        console.log("Audio file:", audioFile);
        setIsRecording(false);
    } catch (error) {
        // ...
    }
  };

  return (<div>...</div>);
};
```

### Accessing Media Stream

For advanced use cases where you need direct access to the media stream:

```tsx
import { RecorderContext } from "@bream-is-a-fish/aimet-asr-react-client";

const useAudioVisualizer = () => {
  const { recorderServiceRef } = useContext(RecorderContext);
  
  const startVisualize = () => {
    // Access the underlying media stream
    let stream = recorderServiceRef?.current?.getMediaStream();
    // Use to start audio visualizer
  };

  return (
   // ...
  );
};
```

## API Reference

### Providers

#### `TranscribeProvider`
Provides transcription context to child components.

#### `RecorderProvider`
Provides audio recording context to child components.

### Hooks

#### `useTranscribe()`
Hook for managing transcription state and actions.

#### `useRecorder()`
Hook for managing audio recording state and actions.

#### `useIsRecording()`
Hook to check if recording is currently active.

### Contexts

#### `TranscribeActionContext`
Context containing transcription action methods:
- `startTranscribing(params)`
- `stopTranscribing()`
- `resumeTranscribe(params)`
- `addTranscribeListener(event, callback)`
- `removeTranscribeListener(event, callback)`

#### `TranscribeStateContext`
Context containing transcription state:
- `serviceInitialized: boolean`

#### `RecorderContext`
Context containing recorder methods and state:
- `isRecording: boolean`
- `startRecord()`
- `stopRecord()`
- `requestPermission()`
- `recorderServiceRef: RefObject<AudioRecorderService>` - Access to the underlying recorder service

### Types

#### `TranscribeConnectionParams`
```typescript
interface TranscribeConnectionParams {
  base_url: string;
  access_token: string;
  caller_service: string;
  caller_ref_id?: string;
  model?: string;
}
```

#### `AudioFile`
```typescript
interface AudioFile {
  blob: Blob;
  format: string;
  fileType: string;
  duration: number;
}
```
