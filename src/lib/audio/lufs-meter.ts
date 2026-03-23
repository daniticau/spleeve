/**
 * ITU-R BS.1770 integrated loudness measurement.
 * Measures LUFS (Loudness Units relative to Full Scale) and true peak.
 */

export interface LoudnessResult {
  integratedLufs: number;
  truePeakDbfs: number;
}

/**
 * Measure integrated loudness of an audio file using Web Audio API.
 * Implements simplified ITU-R BS.1770 with K-weighting and gating.
 */
export async function measureLoudness(file: File): Promise<LoudnessResult> {
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new AudioContext();

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return analyzeLoudness(audioBuffer);
  } finally {
    await audioCtx.close();
  }
}

function analyzeLoudness(buffer: AudioBuffer): LoudnessResult {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;

  // Extract channel data and apply K-weighting
  const channels: Float32Array[] = [];
  let truePeak = 0;

  for (let ch = 0; ch < numChannels; ch++) {
    const raw = buffer.getChannelData(ch);
    // Measure true peak before filtering
    for (let i = 0; i < raw.length; i++) {
      const abs = Math.abs(raw[i]);
      if (abs > truePeak) truePeak = abs;
    }
    // Apply K-weighting filter
    channels.push(applyKWeighting(raw, sampleRate));
  }

  const truePeakDbfs = truePeak > 0 ? 20 * Math.log10(truePeak) : -Infinity;

  // Channel weighting per ITU-R BS.1770
  // L=1.0, R=1.0, C=1.0, Ls=1.41, Rs=1.41
  const channelWeights = getChannelWeights(numChannels);

  // Divide into 400ms blocks with 75% overlap (100ms hop)
  const blockSize = Math.floor(sampleRate * 0.4);
  const hopSize = Math.floor(sampleRate * 0.1);
  const numBlocks = Math.floor((channels[0].length - blockSize) / hopSize) + 1;

  if (numBlocks <= 0) {
    return { integratedLufs: -Infinity, truePeakDbfs };
  }

  // Calculate loudness per block
  const blockLoudness: number[] = [];

  for (let b = 0; b < numBlocks; b++) {
    const start = b * hopSize;
    let sumWeighted = 0;

    for (let ch = 0; ch < numChannels; ch++) {
      const data = channels[ch];
      let sumSq = 0;
      for (let i = start; i < start + blockSize; i++) {
        sumSq += data[i] * data[i];
      }
      const meanSq = sumSq / blockSize;
      sumWeighted += channelWeights[ch] * meanSq;
    }

    blockLoudness.push(sumWeighted);
  }

  // Absolute gating at -70 LUFS
  const absoluteThreshold = Math.pow(10, (-70 + 0.691) / 10);
  const gatedBlocks = blockLoudness.filter((l) => l > absoluteThreshold);

  if (gatedBlocks.length === 0) {
    return { integratedLufs: -Infinity, truePeakDbfs };
  }

  // Relative gating: -10 LU below ungated mean
  const ungatedMean =
    gatedBlocks.reduce((sum, l) => sum + l, 0) / gatedBlocks.length;
  const relativeThreshold = ungatedMean * Math.pow(10, -10 / 10);

  const finalBlocks = gatedBlocks.filter((l) => l > relativeThreshold);

  if (finalBlocks.length === 0) {
    return { integratedLufs: -Infinity, truePeakDbfs };
  }

  const finalMean =
    finalBlocks.reduce((sum, l) => sum + l, 0) / finalBlocks.length;
  const integratedLufs = -0.691 + 10 * Math.log10(finalMean);

  return { integratedLufs, truePeakDbfs };
}

/**
 * Apply K-weighting filter (2-stage biquad):
 * Stage 1: High-shelf boost (~+4dB above 1.5kHz)
 * Stage 2: High-pass (RLB weighting, ~38Hz)
 *
 * Coefficients from ITU-R BS.1770-4 for 48kHz, adapted for other sample rates
 * using bilinear transform pre-warping.
 */
function applyKWeighting(input: Float32Array, sampleRate: number): Float32Array {
  const output = new Float32Array(input.length);

  // Stage 1: Pre-filter (high shelf)
  const shelf = highShelfCoeffs(sampleRate, 1681.974450955533, 4.0);
  // Stage 2: RLB high-pass
  const hp = highPassCoeffs(sampleRate, 38.13547087602444);

  // Apply stage 1
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y =
      (shelf.b0 * x + shelf.b1 * x1 + shelf.b2 * x2 -
        shelf.a1 * y1 - shelf.a2 * y2) / shelf.a0;
    output[i] = y;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
  }

  // Apply stage 2 in-place
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  for (let i = 0; i < output.length; i++) {
    const x = output[i];
    const y =
      (hp.b0 * x + hp.b1 * x1 + hp.b2 * x2 -
        hp.a1 * y1 - hp.a2 * y2) / hp.a0;
    output[i] = y;
    x2 = x1; x1 = x;
    y2 = y1; y1 = y;
  }

  return output;
}

interface BiquadCoeffs {
  b0: number; b1: number; b2: number;
  a0: number; a1: number; a2: number;
}

function highShelfCoeffs(
  sampleRate: number,
  frequency: number,
  gainDb: number,
): BiquadCoeffs {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = (sinW0 / 2) * Math.sqrt(2);
  const sqrtA2alpha = 2 * Math.sqrt(A) * alpha;

  return {
    b0: A * (A + 1 + (A - 1) * cosW0 + sqrtA2alpha),
    b1: -2 * A * (A - 1 + (A + 1) * cosW0),
    b2: A * (A + 1 + (A - 1) * cosW0 - sqrtA2alpha),
    a0: A + 1 - (A - 1) * cosW0 + sqrtA2alpha,
    a1: 2 * (A - 1 - (A + 1) * cosW0),
    a2: A + 1 - (A - 1) * cosW0 - sqrtA2alpha,
  };
}

function highPassCoeffs(sampleRate: number, frequency: number): BiquadCoeffs {
  const w0 = (2 * Math.PI * frequency) / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.sqrt(2)); // Q = 1/sqrt(2)

  return {
    b0: (1 + cosW0) / 2,
    b1: -(1 + cosW0),
    b2: (1 + cosW0) / 2,
    a0: 1 + alpha,
    a1: -2 * cosW0,
    a2: 1 - alpha,
  };
}

function getChannelWeights(numChannels: number): number[] {
  if (numChannels === 1) return [1.0];
  if (numChannels === 2) return [1.0, 1.0];
  if (numChannels >= 5) return [1.0, 1.0, 1.0, 1.41, 1.41];
  return Array(numChannels).fill(1.0);
}
