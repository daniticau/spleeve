import { useState, useCallback, useEffect, useRef, useMemo, useReducer } from 'react';
import { X, Loader2, Download } from 'lucide-react';
import { FileDropzone } from '@/components/file-dropzone';
import { MetadataEditor } from '@/components/metadata-editor';
import { Button } from '@/components/ui/button';
import { readMetadata, type TrackMetadata } from '@/lib/metadata/reader';
import { writeMetadata } from '@/lib/metadata/writer';
import { measureLoudness, measureLoudnessFromBuffer } from '@/lib/audio/lufs-meter';
import { decodeAudioBuffer } from '@/lib/audio/decode';
import { extractWaveform } from '@/lib/audio/waveform';
import { calculateReplayGain } from '@/lib/audio/replaygain';
import { resizeToSquare } from '@/lib/image-utils';
import { trimMp3 } from '@/lib/audio/mp3-trimmer';
import { downloadBlob, saveToFolder } from '@/lib/download';
import { saveFolder, loadFolder } from '@/lib/store/folder-store';
import { parseFilename } from '@/lib/metadata/filename-parser';
import { searchItunes, fetchCoverArtAsBuffer } from '@/lib/itunes/search';
import { filesReducer, generateFileId, type FilesState } from '@/lib/store/file-store';

function App() {
  const [files, dispatch] = useReducer(filesReducer, new Map() as FilesState);

  // Output folder state (global)
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);

  // Toast state
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  // Derived state
  const fileEntries = useMemo(() => [...files.values()], [files]);
  const readyCount = useMemo(() => fileEntries.filter(e => e.status === 'ready').length, [fileEntries]);

  // Restore saved folder on mount
  useEffect(() => {
    loadFolder().then(async (handle) => {
      if (!handle) return;
      if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
        setDirHandle(handle);
        setFolderName(handle.name);
      }
    }).catch(() => {});
  }, []);

  const handlePickFolder = useCallback(async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveFolder(handle);
      setDirHandle(handle);
      setFolderName(handle.name);
    } catch {
      // User cancelled the picker
    }
  }, []);

  const handleFiles = useCallback(async (newFiles: File[]) => {
    const entries = newFiles.map(f => ({ id: generateFileId(), file: f }));
    dispatch({ type: 'ADD_FILES', entries });

    // Load each file in parallel
    await Promise.allSettled(
      entries.map(async ({ id, file }) => {
        try {
          const buffer = await file.arrayBuffer();
          const metadata = await readMetadata(file);
          dispatch({ type: 'FILE_LOADED', id, buffer, metadata });

          // Decode AudioBuffer for waveform + playback + LUFS
          try {
            const audioBuffer = await decodeAudioBuffer(buffer);
            const waveform = extractWaveform(audioBuffer);
            dispatch({ type: 'SET_AUDIO_BUFFER', id, audioBuffer, waveform });
          } catch (decodeErr) {
            console.error('Audio decode failed:', decodeErr);
          }
        } catch (err) {
          dispatch({ type: 'FILE_LOAD_ERROR', id });
          showToast(`Failed to read ${file.name}`);
          console.error(err);
        }
      })
    );
  }, [showToast]);

  // Track which file IDs have LUFS measurement in flight
  const measuringIds = useRef(new Set<string>());

  // Measure loudness for all ready files
  useEffect(() => {
    for (const entry of files.values()) {
      if (entry.status !== 'ready') continue;
      if (entry.loudness !== null) continue;
      if (measuringIds.current.has(entry.id)) continue;

      const id = entry.id;
      measuringIds.current.add(id);

      dispatch({ type: 'SET_MEASURING_LOUDNESS', id, measuring: true });
      const loudnessPromise = entry.audioBuffer
        ? Promise.resolve(measureLoudnessFromBuffer(entry.audioBuffer))
        : measureLoudness(entry.file);
      loudnessPromise
        .then((result) => {
          dispatch({ type: 'SET_LOUDNESS', id, loudness: result });
        })
        .catch((err) => {
          console.error('LUFS measurement failed:', err);
          dispatch({ type: 'SET_LOUDNESS_ERROR', id });
        })
        .finally(() => {
          measuringIds.current.delete(id);
        });
    }
  }, [files]);

  const handleImageUpload = useCallback(
    async (id: string, imageFile: File) => {
      const entry = files.get(id);
      if (!entry?.metadata) return;
      try {
        const buffer = await resizeToSquare(imageFile, 600);
        dispatch({
          type: 'UPDATE_METADATA',
          id,
          metadata: { ...entry.metadata, coverArt: buffer, coverArtMime: 'image/jpeg' },
        });
      } catch (err) {
        showToast('Failed to process image');
        console.error(err);
      }
    },
    [files, showToast],
  );

  const handleMetadataChange = useCallback(
    (id: string, metadata: TrackMetadata) => {
      dispatch({ type: 'UPDATE_METADATA', id, metadata });
    },
    [],
  );

  const handleAutoFill = useCallback(async (id: string) => {
    const entry = files.get(id);
    if (!entry?.file || !entry.metadata) return;
    const parsed = parseFilename(entry.file.name);
    if (!parsed) {
      showToast('Could not parse filename');
      return;
    }

    const updates: Partial<TrackMetadata> = {};
    if (parsed.title) updates.title = parsed.title;
    if (parsed.artist) updates.artists = [parsed.artist];

    dispatch({
      type: 'UPDATE_METADATA',
      id,
      metadata: { ...entry.metadata, ...updates },
    });

    const query = `${parsed.artist} ${parsed.title}`.trim();
    if (!query) {
      showToast('Filled from filename');
      return;
    }

    dispatch({ type: 'SET_AUTO_FILLING', id, filling: true });
    try {
      const results = await searchItunes(query);
      if (results.length > 0) {
        const best = results[0];
        const itunesUpdates: Partial<TrackMetadata> = {};
        if (parsed.title) itunesUpdates.title = parsed.title;
        if (parsed.artist) itunesUpdates.artists = [parsed.artist];
        if (best.album) itunesUpdates.album = best.album;

        try {
          const coverArt = await fetchCoverArtAsBuffer(best.artworkUrlHiRes);
          itunesUpdates.coverArt = coverArt;
          itunesUpdates.coverArtMime = 'image/jpeg';
        } catch {
          // Cover art fetch failed, skip it
        }

        dispatch({
          type: 'UPDATE_METADATA',
          id,
          metadata: { ...entry.metadata, ...updates, ...itunesUpdates },
        });
        showToast('Filled from filename + iTunes match');
      } else {
        showToast('Filled from filename (no iTunes match)');
      }
    } catch {
      showToast('Filled from filename (iTunes lookup failed)');
    } finally {
      dispatch({ type: 'SET_AUTO_FILLING', id, filling: false });
    }
  }, [files, showToast]);

  const handleCoverArtSearch = useCallback(
    (id: string, buffer: ArrayBuffer) => {
      const entry = files.get(id);
      if (!entry?.metadata) return;
      dispatch({
        type: 'UPDATE_METADATA',
        id,
        metadata: { ...entry.metadata, coverArt: buffer, coverArtMime: 'image/jpeg' },
      });
    },
    [files],
  );

  const handleSaveAll = useCallback(async () => {
    const readyEntries = [...files.values()].filter(
      (e) => e.status === 'ready' && e.metadata && e.originalBuffer,
    );
    if (readyEntries.length === 0) return;

    let savedCount = 0;
    let folderLost = false;

    for (const entry of readyEntries) {
      const { metadata, originalBuffer, loudness } = entry;
      if (!metadata || !originalBuffer) continue;

      const replayGain =
        entry.normalizeEnabled && loudness
          ? calculateReplayGain(loudness)
          : undefined;

      // Apply trim if user has cropped the audio
      const isTrimmed =
        entry.trimStart > 0 ||
        (entry.waveform && entry.trimEnd < entry.waveform.duration);
      const bufferToWrite = isTrimmed
        ? trimMp3(originalBuffer, entry.trimStart, entry.trimEnd)
        : originalBuffer;

      const blob = writeMetadata(
        bufferToWrite,
        metadata,
        replayGain ? { gain: replayGain.gain, peak: replayGain.peak } : undefined,
      );

      const artist = metadata.artists[0] || 'Unknown Artist';
      const title = metadata.title || 'Unknown Title';
      const filename = `${artist} - ${title}.mp3`;

      if (dirHandle && !folderLost) {
        try {
          await saveToFolder(dirHandle, blob, filename);
        } catch {
          folderLost = true;
          downloadBlob(blob, filename);
        }
      } else {
        downloadBlob(blob, filename);
      }

      dispatch({ type: 'MARK_SAVED', id: entry.id });
      savedCount++;
    }

    if (folderLost) {
      showToast(`Saved ${savedCount} file${savedCount !== 1 ? 's' : ''} — folder access lost, downloaded instead.`);
    } else if (dirHandle) {
      showToast(`Saved ${savedCount} file${savedCount !== 1 ? 's' : ''} to ${folderName}!`);
    } else {
      showToast(`Downloaded ${savedCount} file${savedCount !== 1 ? 's' : ''}. Choose a save folder to skip this step.`);
    }
  }, [files, dirHandle, folderName, showToast]);

  const handleTrimChange = useCallback((id: string, trimStart: number, trimEnd: number) => {
    dispatch({ type: 'SET_TRIM', id, trimStart, trimEnd });
  }, []);

  const handleRemove = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_FILE', id });
  }, []);

  const hasFiles = files.size > 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-8 pb-24 lg:px-6">
      <header className="mb-8 text-center">
        <h1 className="font-mono text-xl font-semibold tracking-tight text-foreground">
          Spleeve
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tag, normalize, and export your MP3(s) for Spotify
        </p>
      </header>

      {!hasFiles ? (
        <div className="mx-auto w-full max-w-lg">
          <FileDropzone onFiles={handleFiles} hasFiles={false} />
        </div>
      ) : (
        <>
          {/* Top bar: dropzone */}
          <div className="mb-6">
            <FileDropzone onFiles={handleFiles} hasFiles={true} />
          </div>

          {/* Song cards */}
          <div className="space-y-5">
            {fileEntries.map(entry => {
              if (entry.status === 'loading') {
                return (
                  <div key={entry.id} className="flex flex-col items-center justify-center gap-3 rounded-xl bg-card/60 py-16 ring-1 ring-white/[0.06]">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Reading {entry.file.name}...</p>
                  </div>
                );
              }

              if (entry.status === 'error') {
                return (
                  <div key={entry.id} className="flex items-center justify-between gap-4 rounded-xl bg-destructive/5 px-5 py-6 ring-1 ring-destructive/20">
                    <p className="text-sm text-destructive">Failed to read {entry.file.name}</p>
                    <button
                      type="button"
                      onClick={() => handleRemove(entry.id)}
                      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              }

              if (entry.status === 'ready' && entry.metadata) {
                const searchQuery = `${entry.metadata.artists[0] ?? ''} ${entry.metadata.title}`.trim();
                return (
                  <MetadataEditor
                    key={entry.id}
                    metadata={entry.metadata}
                    onChange={(m) => handleMetadataChange(entry.id, m)}
                    onImageUpload={(f) => handleImageUpload(entry.id, f)}
                    onCoverArtSearch={(b) => handleCoverArtSearch(entry.id, b)}
                    searchQuery={searchQuery}
                    onAutoFill={() => handleAutoFill(entry.id)}
                    autoFilling={entry.autoFilling}
                    fileName={entry.file.name}
                    onRemove={() => handleRemove(entry.id)}
                    normalizeEnabled={entry.normalizeEnabled}
                    onNormalizeChange={(enabled) => dispatch({ type: 'SET_NORMALIZE', id: entry.id, enabled })}
                    loudness={entry.loudness}
                    measuring={entry.measuringLoudness}
                    loudnessError={entry.loudnessError}
                    waveform={entry.waveform}
                    audioBuffer={entry.audioBuffer}
                    trimStart={entry.trimStart}
                    trimEnd={entry.trimEnd}
                    onTrimChange={(s, e) => handleTrimChange(entry.id, s, e)}
                  />
                );
              }

              return null;
            })}
          </div>

          {/* Global save bar */}
          <div className="mt-8 flex items-stretch gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-card/60 px-4 ring-1 ring-white/[0.06]">
              {folderName ? (
                <>
                  <span className="shrink-0 text-sm text-muted-foreground">Save to</span>
                  <span className="flex-1 truncate rounded-md bg-black/20 px-2.5 py-1 font-mono text-sm text-foreground">
                    {folderName}
                  </span>
                  <Button variant="outline" size="sm" onClick={handlePickFolder}>
                    Change
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-muted-foreground">
                    No save folder — files will download normally
                  </span>
                  <Button variant="outline" size="sm" onClick={handlePickFolder}>
                    Choose folder
                  </Button>
                </>
              )}
            </div>
            <Button
              onClick={handleSaveAll}
              className="h-14 shrink-0 px-8 text-sm"
              disabled={readyCount === 0}
            >
              <Download className="h-4 w-4" />
              {dirHandle
                ? `Save All (${readyCount})`
                : `Download All (${readyCount})`
              }
            </Button>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="animate-in slide-in-from-bottom-4 fade-in duration-200 fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm text-foreground shadow-xl shadow-black/20 ring-1 ring-white/[0.08]">
          <span>{toast}</span>
          <button
            onClick={() => {
              setToast(null);
              if (toastTimer.current) clearTimeout(toastTimer.current);
            }}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
