/**
 * Calculate audio duration from audio data
 * @param audioData - Audio data as ArrayBuffer
 * @param sampleRate - Sample rate in Hz
 * @param channels - Number of channels
 * @param bitsPerSample - Bits per sample
 * @returns Duration in milliseconds
 */
export function calculateDuration(
  audioData: ArrayBuffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): number {
  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = audioData.byteLength / (bytesPerSample * channels);
  const durationInSeconds = totalSamples / sampleRate;
  return Math.round(durationInSeconds * 1000); // Convert to milliseconds
}
