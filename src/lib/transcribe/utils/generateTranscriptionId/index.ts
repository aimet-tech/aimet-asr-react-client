/**
 * Generates a unique UUID v4 for transcription sessions
 * @returns Unique UUID string
 */
export function generateTranscriptionId(): string {
  // Use crypto.randomUUID() if available, otherwise fallback to custom implementation
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback implementation using crypto.getRandomValues
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);

  // Set version (4) and variant bits
  array[6] = (array[6] & 0x0f) | 0x40;
  array[8] = (array[8] & 0x3f) | 0x80;

  // Convert to hex string
  return Array.from(array, (byte: number) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
