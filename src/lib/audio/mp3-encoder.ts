/**
 * Encodes an AudioBuffer to MP3 using lamejs.
 */

import { Mp3Encoder } from '@breezystack/lamejs';

const SAMPLES_PER_FRAME = 1152;

function floatTo16Bit(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

export function encodeMp3(
  audioBuffer: AudioBuffer,
  bitrate: number = 320,
): ArrayBuffer {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new Mp3Encoder(channels, sampleRate, bitrate);

  const left = floatTo16Bit(audioBuffer.getChannelData(0));
  const right = channels > 1 ? floatTo16Bit(audioBuffer.getChannelData(1)) : undefined;

  const chunks: Uint8Array[] = [];

  for (let i = 0; i < left.length; i += SAMPLES_PER_FRAME) {
    const leftChunk = left.subarray(i, i + SAMPLES_PER_FRAME);
    const rightChunk = right?.subarray(i, i + SAMPLES_PER_FRAME);
    const encoded = encoder.encodeBuffer(leftChunk, rightChunk);
    if (encoded.length > 0) {
      chunks.push(encoded);
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    chunks.push(flushed);
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}
