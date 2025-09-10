/**
 * Convert AudioBuffer to WAV format Blob
 * @param audioBuffer - AudioBuffer to convert
 * @param sampleRate - Sample rate of the audio
 * @returns Blob - WAV format audio data
 */
const audioBufferToWav = (
  audioBuffer: AudioBuffer,
  targetSampleRate: number
): Blob => {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const sampleRate = targetSampleRate;
  const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
  const view = new DataView(arrayBuffer);

  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const writeUint32 = (offset: number, value: number) => {
    view.setUint32(offset, value, true);
  };

  const writeUint16 = (offset: number, value: number) => {
    view.setUint16(offset, value, true);
  };

  // RIFF chunk descriptor
  writeString(0, "RIFF");
  writeUint32(4, 36 + length * numberOfChannels * 2);
  writeString(8, "WAVE");

  // fmt sub-chunk
  writeString(12, "fmt ");
  writeUint32(16, 16); // Sub-chunk size
  writeUint16(20, 1); // Audio format (PCM)
  writeUint16(22, numberOfChannels);
  writeUint32(24, sampleRate);
  writeUint32(28, sampleRate * numberOfChannels * 2); // Byte rate
  writeUint16(32, numberOfChannels * 2); // Block align
  writeUint16(34, 16); // Bits per sample

  // data sub-chunk
  writeString(36, "data");
  writeUint32(40, length * numberOfChannels * 2);

  // Convert audio data to PCM16
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(
        -1,
        Math.min(1, audioBuffer.getChannelData(channel)[i])
      );
      const intSample = Math.floor(sample * 32767);
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
};

export default audioBufferToWav;
