/**
 * Session state for managing transcription lifecycle.
 *
 * Tracks the current state of the transcription service to handle
 * buffer flushing and prevent stale transcription results.
 */
export enum TranscribeSessionState {
  /**
   * Normal transcription in progress.
   * Audio is being captured and sent to the server.
   */
  ACTIVE = "active",

  /**
   * Sending silent audio to flush server buffer.
   * Transcription results are ignored during this state.
   */
  FLUSHING = "flushing",

  /**
   * Transcription stopped, ready to resume.
   * No audio is being sent.
   */
  PAUSED = "paused",
}
