import audioBufferToWav from "@/recorder/utils/audioBufferToWav";

/**
 * Resample audio file to target sample rate
 * @param audioFile - Audio file to resample
 * @param targetSampleRate - Target sample rate in Hz (default: 16000)
 * @param numberOfChannels - Number of audio channels (default: 1)
 * @returns Promise<Blob> - Resampled audio as Blob
 */
const resampleAudio = async (
  arrayBuffer: ArrayBuffer,
  targetSampleRate: number = 16000,
  numberOfChannels: number = 1
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const processAudio = async () => {
      try {
        // Create audio context and decode the audio file
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Create offline context for resampling
        const offlineCtx = new OfflineAudioContext(
          numberOfChannels,
          Math.floor(audioBuffer.duration * targetSampleRate),
          targetSampleRate
        );

        // Create buffer source and connect to offline context
        const offlineSource = offlineCtx.createBufferSource();
        offlineSource.buffer = audioBuffer;
        offlineSource.connect(offlineCtx.destination);
        offlineSource.start();

        // Render the resampled audio
        const resampledBuffer = await offlineCtx.startRendering();

        // Convert resampled buffer to WAV format
        const wavBlob = audioBufferToWav(resampledBuffer, targetSampleRate);

        // Clean up
        await audioContext.close();

        resolve(wavBlob);
      } catch (error) {
        reject(new Error(`Failed to resample audio: ${error}`));
      }
    };

    processAudio();
  });
};

export default resampleAudio;
