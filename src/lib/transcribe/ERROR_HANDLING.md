# Error Handling - TranscribeService

This document describes the error handling strategy for the TranscribeService module.

## Overview

The TranscribeService orchestrates communication between the WebSocket server (SocketService) and audio recording (AudioRecorderService). It uses a hybrid error handling approach:

1. **Thrown Errors**: For synchronous failures and direct method call errors
2. **Callback Errors**: For asynchronous, event-driven errors

## Error Classes

### TranscribeServerError

Represents errors received from the transcription server via WebSocket.

```typescript
export class TranscribeServerError extends TranscribeError {
  constructor(
    message: string,
    public readonly details?: string,
    public readonly timestamp?: string
  )
}
```

**When it occurs:**
- Server-side processing errors
- Invalid audio format errors
- Server authentication/authorization errors
- Server timeout errors

**How to handle:**
- Via `onError` listener callback
- These are NOT thrown, they come through the event system

## Error Handling Patterns

### Pattern 1: Direct Method Call Errors (Thrown)

Errors from direct method calls are **thrown** and should be caught by the caller.

```typescript
try {
  await service.startTranscribing({
    base_url: 'wss://example.com',
    access_token: 'token',
    caller_service: 'my-app'
  });
} catch (error) {
  if (error instanceof SocketConnectionError) {
    console.error('Failed to connect:', error.message);
  } else if (error instanceof MicrophonePermissionDeniedError) {
    console.error('Microphone permission denied');
  }
}
```

### Pattern 2: Event-Driven Errors (Callbacks)

Errors from event-driven operations are reported via the `onError` listener.

```typescript
service.addTranscribeListener('onError', (error) => {
  if (error instanceof SocketError) {
    console.error('Socket error:', error.message);
  } else if (error instanceof TranscribeServerError) {
    console.error('Server error:', error.message, error.details);
  } else if (error instanceof RecorderError) {
    console.error('Recorder error:', error.message);
  }
});
```

## Method-Level Error Documentation

### startTranscribing()

**Thrown Errors:**
- `SocketConnectionError` - Failed to connect to WebSocket
- `SocketConnectionTimeoutError` - Connection timeout (>10s)
- `SocketNotInitializedError` - Socket failed to initialize
- `RecordingStartError` - Failed to start audio recording
- `MicStreamStartError` - Failed to start microphone stream
- `MicrophoneAccessError` - Microphone cannot be accessed
- `MicrophonePermissionDeniedError` - User denied microphone permission
- `MediaRecorderNotSupportedError` - MediaRecorder not supported

**Callback Errors:**
- `SocketError` - WebSocket communication errors during transcription
- `TranscribeServerError` - Server-side transcription errors

### stopTranscribing()

**Thrown Errors:**
- `MicStreamStopError` - Failed to stop microphone stream
- `RecordingStopError` - Failed to stop recording
- `NoRecordingChunksError` - No audio data was recorded
- `MediaRecorderTimeoutError` - MediaRecorder stop operation timed out

### stopTranscribeKeepSocket()

**Thrown Errors:**
- `MicStreamStopError` - Failed to stop microphone stream
- `RecordingStopError` - Failed to stop recording
- `NoRecordingChunksError` - No audio data was recorded
- `MediaRecorderTimeoutError` - MediaRecorder stop operation timed out

### resumeTranscribe()

**Thrown Errors:**
- `SocketConnectionError` - Failed to reconnect if socket was disconnected
- `RecordingStartError` - Failed to start audio recording
- `MicStreamStartError` - Failed to start microphone stream
- `MicrophoneAccessError` - Microphone cannot be accessed
- `MicrophonePermissionDeniedError` - User denied microphone permission

**Callback Errors:**
- `SocketError` - WebSocket communication errors during reconnection

### requestPermission()

**Thrown Errors:**
- `MicrophonePermissionDeniedError` - User denied microphone permission
- `MicrophoneAccessError` - Microphone cannot be accessed
- `MediaRecorderNotSupportedError` - MediaRecorder not supported

## Error Type Union

The `onError` listener accepts a union type of specific event-driven error classes:

```typescript
type OnErrorCallback = (
  error:
    | SocketDisconnectedError
    | SocketMessageParseError
    | SocketSendError
    | SocketBufferOverflowError
    | SocketReconnectionFailedError
    | TranscribeServerError
) => void;
```

**Note:** `RecorderError` is NOT in the listener callback because RecorderService errors are thrown directly (not event-driven). You must catch them when calling TranscribeService methods.

This provides type safety and allows consumers to use `instanceof` for type narrowing:

```typescript
service.addTranscribeListener('onError', (error) => {
  if (error instanceof SocketDisconnectedError) {
    // Handle unexpected disconnection
  } else if (error instanceof SocketReconnectionFailedError) {
    // Handle reconnection failure
  } else if (error instanceof SocketMessageParseError) {
    // Handle malformed server message
  } else if (error instanceof TranscribeServerError) {
    // Handle server-specific errors
  }
});
```

## Specific Socket Errors via Callback

These socket errors are reported via the `onError` listener (not thrown):

- `SocketDisconnectedError` - WebSocket connection lost unexpectedly (from `socket.onerror`)
- `SocketMessageParseError` - Failed to parse incoming message (from `socket.onmessage`)
- `SocketSendError` - Failed to send audio chunk (e.g., socket closed during send)
- `SocketBufferOverflowError` - Audio queue full, new chunks dropped (max 150 chunks)
- `SocketReconnectionFailedError` - Maximum reconnection attempts reached

## Related Error Classes

### From RecorderService

See `src/lib/recorder/ERROR_HANDLING.md` for details on:
- `MicrophonePermissionDeniedError`
- `MicrophoneAccessError`
- `RecordingStartError`
- `RecordingStopError`
- `NoRecordingChunksError`
- `MediaStreamNotAvailableError`
- `AudioContextInitializationError`
- `MicStreamStartError`
- `MicStreamStopError`
- `MediaRecorderNotSupportedError`
- `MediaRecorderTimeoutError`

### From SocketService (Thrown)

Socket-related errors that are **thrown** during method calls:
- `SocketConnectionError` - Connection failed
- `SocketConnectionTimeoutError` - Connection timeout (>10s)
- `SocketNotInitializedError` - Socket failed to initialize
- `SocketNoURLForReconnectionError` - No URL available for reconnection (internal)

### From SocketService (via Callback)

Socket-related errors that are **reported via callback**:
- `SocketDisconnectedError` - Socket disconnected unexpectedly
- `SocketMessageParseError` - Failed to parse incoming message
- `SocketSendError` - Failed to send data from the queue
- `SocketBufferOverflowError` - Audio queue overflow (max 150 chunks)
- `SocketReconnectionFailedError` - Reconnection attempts exhausted

## Best Practices

1. **Always add an onError listener** before starting transcription
2. **Use onConnect/onDisconnect listeners** to track WebSocket connection lifecycle
3. **Wrap async method calls in try-catch** to handle thrown errors
4. **Use instanceof for type narrowing** to handle specific error types
5. **Don't rely on error messages** for control flow, use error types
6. **Clean up resources** even when errors occur
7. **Log errors with context** to aid debugging

## Available Listeners

The TranscribeService supports the following listener types:

- `onSpeech` - Speech transcription results
- `onError` - Event-driven errors only:
  - Socket: `SocketDisconnectedError`, `SocketMessageParseError`, `SocketSendError`, `SocketBufferOverflowError`, `SocketReconnectionFailedError`
  - Server: `TranscribeServerError`
  - **Note:** RecorderError is thrown, not sent via callback
- `onVAD` - Voice Activity Detection events
- `onConnect` - WebSocket connection established
- `onDisconnect` - WebSocket connection closed (includes CloseEvent details)
- `onReconnected` - WebSocket reconnected with new transcription_id
- `onConnectionStatusChange` - Connection status changes (connecting, connected, reconnecting, etc.)
- `onRecordingStart` - Recording started
- `onRecordingStop` - Recording stopped (includes AudioFile)
- `onPermissionGranted` - Microphone permission granted
- `onPermissionDenied` - Microphone permission denied

## Example: Complete Error Handling

```typescript
import { useEffect } from 'react';
import { useTranscribe } from '@bream-is-a-fish/aimet-asr-react-client';
import {
  RecorderError,
  MicrophonePermissionDeniedError,
  SocketConnectionError,
  SocketDisconnectedError,
  SocketReconnectionFailedError,
  SocketMessageParseError,
  TranscribeServerError
} from '@bream-is-a-fish/aimet-asr-react-client';

function MyComponent() {
  const {
    startTranscribing,
    stopTranscribing,
    addTranscribeListener,
    removeTranscribeListener
  } = useTranscribe({
    config: { enableRecording: true },
    audioConfig: { sampleRate: 16000, channels: 1 }
  });

  useEffect(() => {
    // Handle connection events
    const onConnect = () => {
      console.log('WebSocket connected');
    };

    const onDisconnect = (event: CloseEvent) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
    };

    // Handle event-driven errors (Socket and Server errors only)
    const onError = (
      error:
        | SocketDisconnectedError
        | SocketMessageParseError
        | SocketReconnectionFailedError
        | TranscribeServerError
    ) => {
      if (error instanceof TranscribeServerError) {
        console.error('Server error:', error.message, error.details);
        // Show user-friendly error message
      } else if (error instanceof SocketDisconnectedError) {
        console.error('Connection lost:', error.message);
        // Show connection status UI
      } else if (error instanceof SocketReconnectionFailedError) {
        console.error('Reconnection failed:', error.message);
        // Notify user to manually retry
      } else if (error instanceof SocketMessageParseError) {
        console.error('Invalid message from server:', error.message);
      }
    };

    addTranscribeListener('onConnect', onConnect);
    addTranscribeListener('onDisconnect', onDisconnect);
    addTranscribeListener('onError', onError);

    return () => {
      removeTranscribeListener('onConnect', onConnect);
      removeTranscribeListener('onDisconnect', onDisconnect);
      removeTranscribeListener('onError', onError);
    };
  }, []);

  const handleStart = async () => {
    try {
      await startTranscribing({
        base_url: 'wss://example.com',
        access_token: 'token',
        caller_service: 'my-app'
      });
    } catch (error) {
      // Handle thrown errors (RecorderError and SocketError)
      if (error instanceof MicrophonePermissionDeniedError) {
        // Show permission request UI
        alert('Please allow microphone access');
      } else if (error instanceof SocketConnectionError) {
        // Show connection error UI
        alert('Failed to connect to server');
      } else if (error instanceof RecorderError) {
        console.error('Recorder error:', error.message);
      } else {
        console.error('Unexpected error:', error);
      }
    }
  };

  const handleStop = async () => {
    try {
      const audioFile = await stopTranscribing();
      if (audioFile) {
        console.log('Recorded audio:', audioFile);
      }
    } catch (error) {
      console.error('Failed to stop:', error);
    }
  };

  return (
    <div>
      <button onClick={handleStart}>Start</button>
      <button onClick={handleStop}>Stop</button>
    </div>
  );
}
```
