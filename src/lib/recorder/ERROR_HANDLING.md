# Recorder Error Handling

## Overview

The recorder module now uses a robust, throw-based error handling approach. All errors are thrown to the caller, allowing consumers of the library to handle errors as they see fit.

## Custom Error Classes

All recorder errors extend from the base `RecorderError` class, which provides a `code` property for programmatic error handling.

### Base Error Class

```typescript
class RecorderError extends Error {
  code: string;
  name: string;
}
```

### Available Error Classes

#### Permission Errors
- **`MicrophonePermissionDeniedError`** - User denied microphone permission
  - Code: `MICROPHONE_PERMISSION_DENIED`
  
- **`MicrophoneAccessError`** - Failed to access microphone (other reasons)
  - Code: `MICROPHONE_ACCESS_ERROR`

#### Recording Errors
- **`RecordingStartError`** - Failed to start recording
  - Code: `RECORDING_START_ERROR`
  
- **`RecordingStopError`** - Failed to stop recording
  - Code: `RECORDING_STOP_ERROR`
  
- **`NoRecordingChunksError`** - No audio data was recorded
  - Code: `NO_RECORDING_CHUNKS`

#### Stream Errors
- **`MediaStreamNotAvailableError`** - Media stream not available
  - Code: `MEDIA_STREAM_NOT_AVAILABLE`
  
- **`AudioContextInitializationError`** - Failed to initialize audio context
  - Code: `AUDIO_CONTEXT_INITIALIZATION_ERROR`
  
- **`MicStreamStartError`** - Failed to start microphone stream
  - Code: `MIC_STREAM_START_ERROR`
  
- **`MicStreamStopError`** - Failed to stop microphone stream
  - Code: `MIC_STREAM_STOP_ERROR`

#### MediaRecorder Errors
- **`MediaRecorderNotSupportedError`** - MediaRecorder not supported or no supported MIME type
  - Code: `MEDIA_RECORDER_NOT_SUPPORTED`

- **`MediaRecorderTimeoutError`** - MediaRecorder stop operation timed out
  - Code: `MEDIA_RECORDER_TIMEOUT`

## Changes from Previous Version

### Removed
- ❌ `error: string | null` from all state interfaces
- ❌ `onError` callback from `AudioRecorderService`
- ❌ `onPermissionDenied` callback from `AudioRecorderService`
- ❌ Internal error state management
- ❌ Try-catch blocks that stored errors in state

### Added
- ✅ Custom error classes with error codes
- ✅ Throw-based error handling
- ✅ Better error discrimination (permission denied vs other access errors)

## Usage Examples

### Basic Error Handling

```typescript
import { useRecorder, MicrophonePermissionDeniedError } from '@your-lib/recorder';

function MyComponent() {
  const { startRecord, stopRecord } = useRecorder();
  const [error, setError] = useState<string | null>(null);

  const handleStartRecording = async () => {
    try {
      await startRecord();
      setError(null);
    } catch (err) {
      if (err instanceof MicrophonePermissionDeniedError) {
        setError("Please enable microphone access in your browser settings");
      } else {
        setError("Failed to start recording");
      }
      console.error(err);
    }
  };

  return (
    <div>
      <button onClick={handleStartRecording}>Start Recording</button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

### Specific Error Handling

```typescript
import { 
  useRecorder, 
  MicrophonePermissionDeniedError,
  MicrophoneAccessError,
  NoRecordingChunksError,
  RecorderError
} from '@your-lib/recorder';

function AdvancedRecorder() {
  const { startRecord, stopRecord } = useRecorder();

  const handleStartRecording = async () => {
    try {
      await startRecord();
    } catch (err) {
      if (err instanceof MicrophonePermissionDeniedError) {
        // Show permission guide
        showPermissionModal();
      } else if (err instanceof MicrophoneAccessError) {
        // Show troubleshooting
        showTroubleshootingGuide();
      } else if (err instanceof RecorderError) {
        // Handle any other recorder error
        showErrorToast(err.message);
      } else {
        // Unknown error
        console.error("Unexpected error:", err);
      }
    }
  };

  const handleStopRecording = async () => {
    try {
      const audioFile = await stopRecord();
      if (!audioFile) {
        console.warn("No audio file returned");
        return;
      }
      // Process audioFile
    } catch (err) {
      if (err instanceof NoRecordingChunksError) {
        showErrorToast("Recording was too short. Please try again.");
      } else {
        showErrorToast("Failed to stop recording");
      }
    }
  };

  return (
    <div>
      <button onClick={handleStartRecording}>Start</button>
      <button onClick={handleStopRecording}>Stop</button>
    </div>
  );
}
```

### Error Code-Based Handling

```typescript
import { useRecorder, RecorderError } from '@your-lib/recorder';

function ErrorCodeExample() {
  const { startRecord } = useRecorder();

  const handleStartRecording = async () => {
    try {
      await startRecord();
    } catch (err) {
      if (err instanceof RecorderError) {
        switch (err.code) {
          case "MICROPHONE_PERMISSION_DENIED":
            showPermissionDialog();
            break;
          case "MICROPHONE_ACCESS_ERROR":
            showTroubleshootingGuide();
            break;
          case "MEDIA_STREAM_NOT_AVAILABLE":
            showErrorToast("Please open microphone first");
            break;
          default:
            showErrorToast(`Error: ${err.message}`);
        }
      }
    }
  };

  return <button onClick={handleStartRecording}>Record</button>;
}
```

### Catch All Recorder Errors

```typescript
import { useRecorder, RecorderError } from '@your-lib/recorder';

function SimpleErrorHandling() {
  const { startRecord, stopRecord, requestPermission } = useRecorder();

  const handleAnyRecorderAction = async (action: () => Promise<any>) => {
    try {
      await action();
    } catch (err) {
      // Catch ANY recorder error
      if (err instanceof RecorderError) {
        console.error(`Recorder error [${err.code}]:`, err.message);
        showErrorNotification(err.message);
      } else {
        // Non-recorder error
        console.error("Unexpected error:", err);
      }
    }
  };

  return (
    <div>
      <button onClick={() => handleAnyRecorderAction(requestPermission)}>
        Request Permission
      </button>
      <button onClick={() => handleAnyRecorderAction(startRecord)}>
        Start Recording
      </button>
      <button onClick={() => handleAnyRecorderAction(stopRecord)}>
        Stop Recording
      </button>
    </div>
  );
}
```

## Migration Guide

### Before (Old Approach)

```typescript
const { startRecord, error } = useRecorder();

// Error was stored in state
useEffect(() => {
  if (error) {
    console.error("Recorder error:", error);
  }
}, [error]);

// Just call the method
await startRecord();
```

### After (New Approach)

```typescript
const { startRecord } = useRecorder();
const [error, setError] = useState<string | null>(null);

try {
  await startRecord();
  setError(null);
} catch (err) {
  if (err instanceof RecorderError) {
    setError(err.message);
    console.error("Recorder error:", err.code, err.message);
  }
}
```

## Benefits

1. **Cleaner separation of concerns** - Library throws, consumers handle
2. **Type-safe error handling** - Can catch specific error types
3. **Better error messages** - Each error has a specific code and message
4. **Reduced complexity** - No dual error storage (state + throw)
5. **More flexible** - Consumers decide how to handle errors (state, toast, modal, etc.)
6. **Better debugging** - Error codes make it easy to track specific issues
7. **Composability** - Easy to wrap in custom error handling logic

