/**
 * Lossless MP3 frame-level trimmer.
 * Parses MP3 frame boundaries and slices at the nearest frame to the requested
 * start/end times. No re-encoding — preserves original audio quality.
 */

// MPEG version lookup
const MPEG_VERSIONS = [2.5, -1, 2, 1] as const;

// Layer lookup
const LAYERS = [-1, 3, 2, 1] as const;

// Bitrate tables [version_index][layer_index][bitrate_index] in kbps
// version_index: 0 = MPEG1, 1 = MPEG2/2.5
// layer_index: 0 = Layer I, 1 = Layer II, 2 = Layer III
const BITRATES: number[][][] = [
  // MPEG1
  [
    [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  ],
  // MPEG2 / MPEG2.5
  [
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  ],
];

// Sample rate tables [version_index][samplerate_index] in Hz
const SAMPLE_RATES: number[][] = [
  [44100, 48000, 32000], // MPEG1
  [22050, 24000, 16000], // MPEG2
  [11025, 12000, 8000],  // MPEG2.5
];

// Samples per frame: [version_index][layer_index]
const SAMPLES_PER_FRAME: number[][] = [
  [384, 1152, 1152], // MPEG1: Layer I, II, III
  [384, 1152, 576],  // MPEG2/2.5: Layer I, II, III
];

interface Mp3Frame {
  offset: number;
  length: number;
  timeStart: number;
  timeEnd: number;
}

function getVersionIndex(mpegVersion: number): number {
  return mpegVersion === 1 ? 0 : 1;
}

function getSampleRateIndex(mpegVersion: number): number {
  if (mpegVersion === 1) return 0;
  if (mpegVersion === 2) return 1;
  return 2; // 2.5
}

/**
 * Skip ID3v2 header if present. Returns the byte offset after the header.
 */
function skipId3v2(view: DataView): number {
  if (view.byteLength < 10) return 0;

  // Check for "ID3" signature
  if (
    view.getUint8(0) === 0x49 && // I
    view.getUint8(1) === 0x44 && // D
    view.getUint8(2) === 0x33    // 3
  ) {
    // Syncsafe integer size at bytes 6-9
    const size =
      (view.getUint8(6) << 21) |
      (view.getUint8(7) << 14) |
      (view.getUint8(8) << 7) |
      view.getUint8(9);

    const flags = view.getUint8(5);
    const hasFooter = (flags & 0x10) !== 0;
    return 10 + size + (hasFooter ? 10 : 0);
  }

  return 0;
}

/**
 * Check if a frame is a Xing/VBRI info frame (should be skipped in trimmed output).
 */
function isInfoFrame(data: Uint8Array, frameOffset: number, frameLength: number): boolean {
  // Search for "Xing", "Info", or "VBRI" within the frame
  const end = Math.min(frameOffset + frameLength, data.length);
  for (let i = frameOffset; i < end - 3; i++) {
    if (
      (data[i] === 0x58 && data[i + 1] === 0x69 && data[i + 2] === 0x6E && data[i + 3] === 0x67) || // Xing
      (data[i] === 0x49 && data[i + 1] === 0x6E && data[i + 2] === 0x66 && data[i + 3] === 0x6F) || // Info
      (data[i] === 0x56 && data[i + 1] === 0x42 && data[i + 2] === 0x52 && data[i + 3] === 0x49)    // VBRI
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Parse all MP3 frame boundaries from a buffer.
 */
function parseMp3Frames(buffer: ArrayBuffer): Mp3Frame[] {
  const view = new DataView(buffer);
  const data = new Uint8Array(buffer);
  const frames: Mp3Frame[] = [];
  let offset = skipId3v2(view);
  let cumulativeTime = 0;

  // Check for ID3v1 tag at end (last 128 bytes starting with "TAG")
  let endBound = buffer.byteLength;
  if (endBound >= 128) {
    const tagOffset = endBound - 128;
    if (data[tagOffset] === 0x54 && data[tagOffset + 1] === 0x41 && data[tagOffset + 2] === 0x47) {
      endBound = tagOffset;
    }
  }

  while (offset < endBound - 4) {
    // Find sync word: 0xFF followed by 0xE0+ (11 sync bits)
    if (data[offset] !== 0xFF || (data[offset + 1] & 0xE0) !== 0xE0) {
      offset++;
      continue;
    }

    const header = view.getUint32(offset);

    const versionBits = (header >> 19) & 0x03;
    const layerBits = (header >> 17) & 0x03;
    const bitrateBits = (header >> 12) & 0x0F;
    const sampleRateBits = (header >> 10) & 0x03;
    const paddingBit = (header >> 9) & 0x01;

    const mpegVersion = MPEG_VERSIONS[versionBits];
    const layer = LAYERS[layerBits];

    // Skip invalid frames
    if (mpegVersion === -1 || layer === -1 || bitrateBits === 0 || bitrateBits === 15 || sampleRateBits === 3) {
      offset++;
      continue;
    }

    const vIdx = getVersionIndex(mpegVersion);
    const lIdx = layer === 1 ? 0 : layer === 2 ? 1 : 2;
    const srIdx = getSampleRateIndex(mpegVersion);

    const bitrate = BITRATES[vIdx][lIdx][bitrateBits] * 1000;
    const sampleRate = SAMPLE_RATES[srIdx][sampleRateBits];
    const samplesPerFrame = SAMPLES_PER_FRAME[vIdx][lIdx];

    if (bitrate === 0 || sampleRate === 0) {
      offset++;
      continue;
    }

    // Frame size calculation
    let frameLength: number;
    if (layer === 1) {
      frameLength = Math.floor((12 * bitrate) / sampleRate + paddingBit) * 4;
    } else {
      frameLength = Math.floor((samplesPerFrame / 8) * bitrate / sampleRate) + paddingBit;
    }

    if (frameLength < 4 || offset + frameLength > buffer.byteLength) {
      offset++;
      continue;
    }

    // Verify next frame also starts with sync (basic continuity check)
    if (offset + frameLength < endBound - 1) {
      const nextByte0 = data[offset + frameLength];
      const nextByte1 = data[offset + frameLength + 1];
      if (nextByte0 !== 0xFF || (nextByte1 & 0xE0) !== 0xE0) {
        // Might be a false sync — skip if this is not an info frame at the start
        if (frames.length === 0) {
          // Could be an info frame followed by silence, try to skip
          offset++;
          continue;
        }
      }
    }

    const frameDuration = samplesPerFrame / sampleRate;

    // Skip Xing/VBRI info frames (first frame in VBR files)
    if (frames.length === 0 && isInfoFrame(data, offset, frameLength)) {
      offset += frameLength;
      continue;
    }

    frames.push({
      offset,
      length: frameLength,
      timeStart: cumulativeTime,
      timeEnd: cumulativeTime + frameDuration,
    });

    cumulativeTime += frameDuration;
    offset += frameLength;
  }

  return frames;
}

/**
 * Trim an MP3 buffer to the specified time range using frame-level slicing.
 * Returns raw MP3 frame data (no ID3 tags — writeMetadata adds those).
 */
export function trimMp3(
  buffer: ArrayBuffer,
  startTime: number,
  endTime: number,
): ArrayBuffer {
  const frames = parseMp3Frames(buffer);
  if (frames.length === 0) return buffer;

  // Find first frame that overlaps with startTime
  let firstIdx = 0;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].timeEnd > startTime) {
      firstIdx = i;
      break;
    }
  }

  // Find last frame that overlaps with endTime
  let lastIdx = frames.length - 1;
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].timeStart < endTime) {
      lastIdx = i;
      break;
    }
  }

  if (firstIdx > lastIdx) {
    // Degenerate case — return first frame
    firstIdx = 0;
    lastIdx = 0;
  }

  // Calculate total size of selected frames
  let totalSize = 0;
  for (let i = firstIdx; i <= lastIdx; i++) {
    totalSize += frames[i].length;
  }

  // Copy frames into new buffer
  const result = new ArrayBuffer(totalSize);
  const dest = new Uint8Array(result);
  const src = new Uint8Array(buffer);
  let writeOffset = 0;

  for (let i = firstIdx; i <= lastIdx; i++) {
    const frame = frames[i];
    dest.set(src.subarray(frame.offset, frame.offset + frame.length), writeOffset);
    writeOffset += frame.length;
  }

  return result;
}
