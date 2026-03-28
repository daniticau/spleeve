import { parseBlob } from 'music-metadata';

export interface TrackMetadata {
  title: string;
  artists: string[];
  album: string;
  coverArt: ArrayBuffer | null;
  coverArtMime: string | null;
  /** Source bitrate in bps (e.g. 320000), null if unknown */
  bitrate: number | null;
}

export async function readMetadata(file: File): Promise<TrackMetadata> {
  const metadata = await parseBlob(file);
  const { common } = metadata;

  let coverArt: ArrayBuffer | null = null;
  let coverArtMime: string | null = null;

  if (common.picture && common.picture.length > 0) {
    const pic = common.picture[0];
    coverArt = pic.data.buffer.slice(pic.data.byteOffset, pic.data.byteOffset + pic.data.byteLength) as ArrayBuffer;
    coverArtMime = pic.format;
  }

  const artists =
    common.artists && common.artists.length > 0
      ? common.artists
      : common.artist
        ? [common.artist]
        : [];

  return {
    title: common.title ?? '',
    artists,
    album: common.album ?? '',
    coverArt,
    coverArtMime,
    bitrate: metadata.format.bitrate ?? null,
  };
}
