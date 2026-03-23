export interface ItunesResult {
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  primaryGenreName: string;
  releaseDate: string;
  trackTimeMillis: number;
}

export interface SearchResult {
  title: string;
  artists: string[];
  album: string;
  artworkUrl: string;
  artworkUrlHiRes: string;
}

const cache = new Map<string, SearchResult[]>();
const MAX_CACHE = 20;

export async function searchItunes(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const cached = cache.get(query);
  if (cached) return cached;

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=8`;
  const res = await fetch(url, { signal });

  if (!res.ok) {
    throw new Error(`iTunes search failed: ${res.status}`);
  }

  const data = (await res.json()) as { results: ItunesResult[] };

  const results = data.results.map((r) => ({
    title: r.trackName,
    artists: [r.artistName],
    album: r.collectionName,
    artworkUrl: r.artworkUrl100,
    artworkUrlHiRes: r.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg'),
  }));

  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value!;
    cache.delete(firstKey);
  }
  cache.set(query, results);

  return results;
}

/**
 * Fetch cover art image as ArrayBuffer via canvas (handles CORS).
 * Loads the image into an <img> tag, draws to canvas, exports as JPEG.
 */
interface ItunesAlbumResult {
  collectionName: string;
  artistName: string;
  artworkUrl100: string;
}

export async function searchAlbumArt(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const cacheKey = `album:${query}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=12`;
  const res = await fetch(url, { signal });

  if (!res.ok) {
    throw new Error(`iTunes search failed: ${res.status}`);
  }

  const data = (await res.json()) as { results: ItunesAlbumResult[] };

  const results = data.results.map((r) => ({
    title: r.collectionName,
    artists: [r.artistName],
    album: r.collectionName,
    artworkUrl: r.artworkUrl100,
    artworkUrlHiRes: r.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg'),
  }));

  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value!;
    cache.delete(firstKey);
  }
  cache.set(cacheKey, results);

  return results;
}

/**
 * Fetch cover art image as ArrayBuffer via canvas (handles CORS).
 * Loads the image into an <img> tag, draws to canvas, exports as JPEG.
 */
export async function fetchCoverArtAsBuffer(
  imageUrl: string,
): Promise<ArrayBuffer> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load cover art image'));
    el.src = imageUrl;
  });

  const size = 600;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  ctx.drawImage(img, 0, 0, size, size);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode'))),
      'image/jpeg',
      0.92,
    );
  });

  return blob.arrayBuffer();
}
