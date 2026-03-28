/**
 * Applies gain to an AudioBuffer with clipping protection.
 */

const DEFAULT_CEILING_DB = -0.5;

export function applyGain(
  audioBuffer: AudioBuffer,
  gainDb: number,
  ceilingDb: number = DEFAULT_CEILING_DB,
): AudioBuffer {
  const gainLinear = Math.pow(10, gainDb / 20);
  const ceiling = Math.pow(10, ceilingDb / 20);

  const output = new AudioBuffer({
    numberOfChannels: audioBuffer.numberOfChannels,
    length: audioBuffer.length,
    sampleRate: audioBuffer.sampleRate,
  });

  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const input = audioBuffer.getChannelData(ch);
    const out = output.getChannelData(ch);
    for (let i = 0; i < input.length; i++) {
      const sample = input[i] * gainLinear;
      out[i] = Math.max(-ceiling, Math.min(ceiling, sample));
    }
  }

  return output;
}
