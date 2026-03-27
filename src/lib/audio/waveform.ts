/**
 * Extract a fixed-size amplitude waveform from an AudioBuffer.
 */

export interface WaveformData {
  peaks: Float32Array; // normalized 0..1 amplitude values
  duration: number;    // seconds
}

export function extractWaveform(
  audioBuffer: AudioBuffer,
  targetPeaks = 1500,
): WaveformData {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const duration = audioBuffer.duration;

  // Mix to mono by averaging channels
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i];
    }
  }
  if (numChannels > 1) {
    for (let i = 0; i < length; i++) {
      mono[i] /= numChannels;
    }
  }

  // Bucket into peaks using max absolute amplitude
  const bucketSize = Math.max(1, Math.floor(length / targetPeaks));
  const actualPeaks = Math.ceil(length / bucketSize);
  const peaks = new Float32Array(actualPeaks);

  let globalMax = 0;
  for (let i = 0; i < actualPeaks; i++) {
    const start = i * bucketSize;
    const end = Math.min(start + bucketSize, length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(mono[j]);
      if (abs > max) max = abs;
    }
    peaks[i] = max;
    if (max > globalMax) globalMax = max;
  }

  // Normalize to 0..1
  if (globalMax > 0) {
    for (let i = 0; i < actualPeaks; i++) {
      peaks[i] /= globalMax;
    }
  }

  return { peaks, duration };
}
