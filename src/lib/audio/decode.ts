/**
 * Shared AudioBuffer decoding.
 * Decodes an MP3 ArrayBuffer into an AudioBuffer for waveform, playback, and LUFS.
 */

export async function decodeAudioBuffer(buffer: ArrayBuffer): Promise<AudioBuffer> {
  // decodeAudioData detaches the ArrayBuffer in some browsers, so work on a copy
  const copy = buffer.slice(0);
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(copy);
  } finally {
    await ctx.close();
  }
}
