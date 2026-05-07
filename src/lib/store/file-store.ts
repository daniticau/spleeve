import type { TrackMetadata } from '../metadata/reader';
import type { LoudnessResult } from '../audio/lufs-meter';
import type { WaveformData } from '../audio/waveform';

export type FileEntryStatus = 'loading' | 'ready' | 'error';

export interface FileEntry {
  id: string;
  file: File;
  originalBuffer: ArrayBuffer | null;
  metadata: TrackMetadata | null;
  initialMetadata: TrackMetadata | null;
  status: FileEntryStatus;
  loudness: LoudnessResult | null;
  measuringLoudness: boolean;
  loudnessError: boolean;
  autoFilling: boolean;
  saved: boolean;
  normalizeEnabled: boolean;
  audioBuffer: AudioBuffer | null;
  waveform: WaveformData | null;
  trimStart: number;
  trimEnd: number;
}

export type FilesState = Map<string, FileEntry>;

export type FilesAction =
  | { type: 'ADD_FILES'; entries: Array<{ id: string; file: File }> }
  | {
      type: 'RESTORE_FILE';
      id: string;
      file: File;
      buffer: ArrayBuffer;
      metadata: TrackMetadata;
      loudness: LoudnessResult | null;
      normalizeEnabled: boolean;
      trimStart: number;
      trimEnd: number;
    }
  | { type: 'FILE_LOADED'; id: string; buffer: ArrayBuffer; metadata: TrackMetadata }
  | { type: 'FILE_LOAD_ERROR'; id: string }
  | { type: 'REMOVE_FILE'; id: string }
  | { type: 'UPDATE_METADATA'; id: string; metadata: TrackMetadata }
  | { type: 'SET_LOUDNESS'; id: string; loudness: LoudnessResult }
  | { type: 'SET_MEASURING_LOUDNESS'; id: string; measuring: boolean }
  | { type: 'SET_LOUDNESS_ERROR'; id: string }
  | { type: 'SET_AUTO_FILLING'; id: string; filling: boolean }
  | { type: 'MARK_SAVED'; id: string }
  | { type: 'SET_NORMALIZE'; id: string; enabled: boolean }
  | { type: 'SET_AUDIO_BUFFER'; id: string; audioBuffer: AudioBuffer; waveform: WaveformData }
  | { type: 'SET_TRIM'; id: string; trimStart: number; trimEnd: number };

function updateEntry(state: FilesState, id: string, patch: Partial<FileEntry>): FilesState {
  const entry = state.get(id);
  if (!entry) return state;
  const next = new Map(state);
  next.set(id, { ...entry, ...patch });
  return next;
}

export function filesReducer(state: FilesState, action: FilesAction): FilesState {
  switch (action.type) {
    case 'ADD_FILES': {
      const next = new Map(state);
      for (const { id, file } of action.entries) {
        next.set(id, {
          id,
          file,
          originalBuffer: null,
          metadata: null,
          initialMetadata: null,
          status: 'loading',
          loudness: null,
          measuringLoudness: false,
          loudnessError: false,
          autoFilling: false,
          saved: false,
          normalizeEnabled: true,
          audioBuffer: null,
          waveform: null,
          trimStart: 0,
          trimEnd: 0,
        });
      }
      return next;
    }
    case 'RESTORE_FILE': {
      const next = new Map(state);
      next.set(action.id, {
        id: action.id,
        file: action.file,
        originalBuffer: action.buffer,
        metadata: action.metadata,
        initialMetadata: structuredClone(action.metadata),
        status: 'ready',
        loudness: action.loudness,
        measuringLoudness: false,
        loudnessError: false,
        autoFilling: false,
        saved: false,
        normalizeEnabled: action.normalizeEnabled,
        audioBuffer: null,
        waveform: null,
        trimStart: action.trimStart,
        trimEnd: action.trimEnd,
      });
      return next;
    }
    case 'FILE_LOADED':
      return updateEntry(state, action.id, {
        originalBuffer: action.buffer,
        metadata: action.metadata,
        initialMetadata: structuredClone(action.metadata),
        status: 'ready',
      });
    case 'FILE_LOAD_ERROR':
      return updateEntry(state, action.id, { status: 'error' });
    case 'REMOVE_FILE': {
      const next = new Map(state);
      next.delete(action.id);
      return next;
    }
    case 'UPDATE_METADATA':
      return updateEntry(state, action.id, { metadata: action.metadata });
    case 'SET_LOUDNESS':
      return updateEntry(state, action.id, {
        loudness: action.loudness,
        measuringLoudness: false,
        loudnessError: false,
      });
    case 'SET_MEASURING_LOUDNESS':
      return updateEntry(state, action.id, { measuringLoudness: action.measuring });
    case 'SET_LOUDNESS_ERROR':
      return updateEntry(state, action.id, {
        loudnessError: true,
        measuringLoudness: false,
      });
    case 'SET_AUTO_FILLING':
      return updateEntry(state, action.id, { autoFilling: action.filling });
    case 'MARK_SAVED':
      return updateEntry(state, action.id, { saved: true });
    case 'SET_NORMALIZE':
      return updateEntry(state, action.id, { normalizeEnabled: action.enabled });
    case 'SET_AUDIO_BUFFER':
      return updateEntry(state, action.id, {
        audioBuffer: action.audioBuffer,
        waveform: action.waveform,
        trimEnd: action.waveform.duration,
      });
    case 'SET_TRIM':
      return updateEntry(state, action.id, {
        trimStart: action.trimStart,
        trimEnd: action.trimEnd,
        saved: false,
      });
    default:
      return state;
  }
}

export function isEdited(entry: FileEntry): boolean {
  if (!entry.metadata || !entry.initialMetadata) return false;
  const { metadata: m, initialMetadata: i } = entry;
  const isTrimmed =
    entry.trimStart > 0 ||
    (entry.waveform !== null && entry.trimEnd < entry.waveform.duration);
  return (
    isTrimmed ||
    m.title !== i.title ||
    m.album !== i.album ||
    m.artists.join('\0') !== i.artists.join('\0') ||
    m.coverArt !== i.coverArt
  );
}

export function generateFileId(): string {
  return crypto.randomUUID();
}
