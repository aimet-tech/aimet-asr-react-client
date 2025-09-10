/**
 * Get the best supported MIME type for audio recording
 * @param preferredMimeType - Optional preferred MIME type
 * @returns Supported MIME type string
 */
export function getMimeType(preferredMimeType?: string): string {
  // If a preferred MIME type is provided and supported, use it
  if (preferredMimeType && MediaRecorder.isTypeSupported(preferredMimeType)) {
    return preferredMimeType;
  }

  // Fallback to checking supported MIME types in order of preference
  const mimeTypes = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/wav",
  ];

  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  throw new Error("No supported audio MIME type found");
}
