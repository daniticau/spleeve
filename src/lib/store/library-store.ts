import type { LoudnessResult } from '../audio/lufs-meter';
import type { TrackMetadata } from '../metadata/reader';

const DB_NAME = 'spleeve-library';
const STORE_NAME = 'tracks';
const DB_VERSION = 1;

export interface CachedTrack {
  id: string;
  file: File;
  originalBuffer: ArrayBuffer;
  metadata: TrackMetadata;
  loudness: LoudnessResult | null;
  normalizeEnabled: boolean;
  trimStart: number;
  trimEnd: number | null;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb();
    dbPromise.then(db => {
      db.onclose = () => { dbPromise = null; };
    }).catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

export async function loadLibrary(): Promise<CachedTrack[]> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const tracks = (req.result as CachedTrack[])
        .filter(track => track.file && track.originalBuffer && track.metadata)
        .sort((a, b) => a.savedAt - b.savedAt);
      resolve(tracks);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveLibrary(tracks: CachedTrack[]): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    const savedAt = Date.now();
    for (const [index, track] of tracks.entries()) {
      store.put({ ...track, savedAt: savedAt + index });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearLibrary(): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
