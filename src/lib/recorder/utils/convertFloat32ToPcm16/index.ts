/**
 * Convert Float32Array audio buffer to PCM16 format
 * @param buffer - Float32Array audio buffer with values in range [-1.0, 1.0]
 * @returns ArrayBuffer containing PCM16 audio data
 */
export function convertFloat32ToPcm16(buffer: Float32Array): ArrayBuffer {
  const int16Data = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    // Convert float32 [-1.0, 1.0] to int16 [-32768, 32767]
    int16Data[i] = Math.max(
      -32768,
      Math.min(32767, Math.floor(buffer[i] * 32767))
    );
  }
  return int16Data.buffer;
}
