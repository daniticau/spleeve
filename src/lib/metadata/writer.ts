import { ID3Writer } from 'browser-id3-writer';
import type { TrackMetadata } from './reader';

export interface ReplayGainData {
  gain: string; // e.g. "+2.4 dB"
  peak: string; // e.g. "0.95"
}

export function writeMetadata(
  originalBuffer: ArrayBuffer,
  metadata: TrackMetadata,
  replayGain?: ReplayGainData,
): Blob {
  const writer = new ID3Writer(originalBuffer);
  const setRawFrame = writer.setFrame.bind(writer) as (frameName: string, frameValue: unknown) => void;

  if (metadata.title) {
    writer.setFrame('TIT2', metadata.title);
  }
  if (metadata.artists.length > 0) {
    writer.setFrame('TPE1', [metadata.artists.join(', ')]);
    writer.setFrame('TPE2', metadata.artists[0]);
  }
  if (metadata.album) {
    writer.setFrame('TALB', metadata.album);
  }
  if (metadata.trackNumber) {
    writer.setFrame('TRCK', metadata.trackNumber);
  }
  if (metadata.year) {
    setRawFrame('TYER', metadata.year);
  }
  if (metadata.genre) {
    writer.setFrame('TCON', [metadata.genre]);
  }
  if (metadata.contentRating !== 'unspecified') {
    writer.setFrame('TXXX', {
      description: 'CONTENT_RATING',
      value: metadata.contentRating === 'explicit' ? 'Explicit' : 'Clean',
    });
  }
  if (metadata.coverArt) {
    writer.setFrame('APIC', {
      type: 3,
      data: metadata.coverArt,
      description: '',
    });
  }

  if (replayGain) {
    writer.setFrame('TXXX', {
      description: 'REPLAYGAIN_TRACK_GAIN',
      value: replayGain.gain,
    });
    writer.setFrame('TXXX', {
      description: 'REPLAYGAIN_TRACK_PEAK',
      value: replayGain.peak,
    });
  }

  writer.addTag();
  return writer.getBlob();
}
