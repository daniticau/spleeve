import { useState, useCallback, useEffect, useRef, useMemo, useReducer } from 'react';
import { X, Loader2, Download, Folder, ChevronRight, Moon, Sun } from 'lucide-react';
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
import { applyGain } from '@/lib/audio/normalizer';
import { encodeMp3 } from '@/lib/audio/mp3-encoder';
import { downloadBlob, saveToFolder } from '@/lib/download';
import { saveFolder, loadFolder } from '@/lib/store/folder-store';
import { parseFilename } from '@/lib/metadata/filename-parser';
import { searchItunes, fetchCoverArtAsBuffer } from '@/lib/itunes/search';
import { filesReducer, generateFileId, type FilesState } from '@/lib/store/file-store';

function App() {
  const [files, dispatch] = useReducer(filesReducer, new Map() as FilesState);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('theme') === 'dark' ? 'dark' : 'light',
  );
  const [themeSpinning, setThemeSpinning] = useState(false);

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

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('no-transition');
      });
    });
  }, [theme]);

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
          if (!metadata.title && metadata.artists.length === 0) {
            const parsed = parseFilename(file.name);
            if (parsed?.title) metadata.title = parsed.title;
            if (parsed?.artist) metadata.artists = [parsed.artist];
            if (parsed?.trackNumber) metadata.trackNumber = parsed.trackNumber;
          }
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

  const demoLoadedRef = useRef(false);

  useEffect(() => {
    if (demoLoadedRef.current) return;
    if (!new URLSearchParams(window.location.search).has('demo')) return;
    demoLoadedRef.current = true;

    fetch('/demo-track.mp3')
      .then(async (response) => {
        if (!response.ok) throw new Error('Demo track missing');
        const blob = await response.blob();
        await handleFiles([
          new File([blob], 'Spleeve Demo - Local File Test.mp3', { type: 'audio/mpeg' }),
        ]);
      })
      .catch((err) => {
        console.error(err);
        showToast('Could not load demo track');
      });
  }, [handleFiles, showToast]);

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
    if (parsed.trackNumber) updates.trackNumber = parsed.trackNumber;

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
        if (parsed.trackNumber) itunesUpdates.trackNumber = parsed.trackNumber;
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
      let bufferToWrite = isTrimmed
        ? trimMp3(originalBuffer, entry.trimStart, entry.trimEnd)
        : originalBuffer;

      // Apply actual audio normalization (decode → gain → re-encode)
      if (replayGain) {
        const decoded = await decodeAudioBuffer(bufferToWrite);
        const normalized = applyGain(decoded, replayGain.gainDb);
        const bitrate = Math.round((metadata.bitrate ?? 320_000) / 1000);
        bufferToWrite = encodeMp3(normalized, Math.min(bitrate, 320));
      }

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

  const handleSaveOne = useCallback(async (id: string) => {
    const entry = files.get(id);
    if (entry?.status !== 'ready' || !entry.metadata || !entry.originalBuffer) return;

    const { metadata, originalBuffer, loudness } = entry;
    const replayGain =
      entry.normalizeEnabled && loudness
        ? calculateReplayGain(loudness)
        : undefined;

    const isTrimmed =
      entry.trimStart > 0 ||
      (entry.waveform && entry.trimEnd < entry.waveform.duration);
    let bufferToWrite = isTrimmed
      ? trimMp3(originalBuffer, entry.trimStart, entry.trimEnd)
      : originalBuffer;

    if (replayGain) {
      const decoded = await decodeAudioBuffer(bufferToWrite);
      const normalized = applyGain(decoded, replayGain.gainDb);
      const bitrate = Math.round((metadata.bitrate ?? 320_000) / 1000);
      bufferToWrite = encodeMp3(normalized, Math.min(bitrate, 320));
    }

    const blob = writeMetadata(
      bufferToWrite,
      metadata,
      replayGain ? { gain: replayGain.gain, peak: replayGain.peak } : undefined,
    );

    const artist = metadata.artists[0] || 'Unknown Artist';
    const title = metadata.title || 'Unknown Title';
    const filename = `${artist} - ${title}.mp3`;

    if (dirHandle) {
      try {
        await saveToFolder(dirHandle, blob, filename);
        showToast(`Saved ${filename} to ${folderName}`);
      } catch {
        downloadBlob(blob, filename);
        showToast('Folder access lost — downloaded instead.');
      }
    } else {
      downloadBlob(blob, filename);
      showToast(`Downloaded ${filename}`);
    }

    dispatch({ type: 'MARK_SAVED', id });
  }, [files, dirHandle, folderName, showToast]);

  const handleTrimChange = useCallback((id: string, trimStart: number, trimEnd: number) => {
    dispatch({ type: 'SET_TRIM', id, trimStart, trimEnd });
  }, []);

  const handleRemove = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_FILE', id });
  }, []);

  const handleThemeToggle = useCallback(() => {
    document.documentElement.classList.add('no-transition');
    setTheme((current) => current === 'dark' ? 'light' : 'dark');
    setThemeSpinning(false);
    requestAnimationFrame(() => setThemeSpinning(true));
  }, []);

  const hasFiles = files.size > 0;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col overflow-x-hidden px-4 py-5 pb-32 sm:px-6 lg:px-8">
      <header className="mb-5 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Your tracks
          </h1>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            Edit artwork, metadata, crop, loudness, and export Spotify-ready MP3s.
          </p>
        </div>
        <button
          type="button"
          id="theme-toggle"
          className={`theme-toolbar-btn shrink-0 ${themeSpinning ? 'spinning' : ''}`}
          aria-label="Toggle dark mode"
          onClick={handleThemeToggle}
          onAnimationEnd={() => setThemeSpinning(false)}
        >
          <span className="theme-icon-sun">
            <Sun strokeWidth={1.5} />
          </span>
          <span className="theme-icon-moon">
            <Moon strokeWidth={1.5} />
          </span>
        </button>
      </header>

      {!hasFiles ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full sm:max-w-lg" style={{ maxWidth: 'min(32rem, calc(100vw - 2rem))' }}>
            <FileDropzone onFiles={handleFiles} hasFiles={false} />
          </div>
        </div>
      ) : (
        <>
          {/* Top bar: dropzone */}
          <div className="mb-5">
            <FileDropzone onFiles={handleFiles} hasFiles={true} />
          </div>

          {/* Song cards */}
          <div className="space-y-5">
            {fileEntries.map(entry => {
              if (entry.status === 'loading') {
                return (
                  <div
                    key={entry.id}
                    className="flex min-w-0 flex-col items-center justify-center gap-3 rounded-2xl bg-card py-16 shadow-sm"
                    style={{ maxWidth: 'calc(100vw - 2rem)' }}
                  >
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="max-w-full truncate px-4 text-sm text-muted-foreground">
                      Reading {entry.file.name}...
                    </p>
                  </div>
                );
              }

              if (entry.status === 'error') {
                return (
                  <div key={entry.id} className="flex items-center justify-between gap-4 rounded-2xl bg-card px-5 py-6 text-destructive shadow-sm">
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
                const searchQuery = entry.metadata.album || entry.metadata.artists[0] || '';
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
                    onSave={() => handleSaveOne(entry.id)}
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
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/92 px-4 py-3 backdrop-blur-xl sm:px-6">
            <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-stretch">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm sm:min-h-14 sm:flex-row sm:items-center sm:py-0">
                <Folder className="size-5 shrink-0 text-primary" />
                {folderName ? (
                  <>
                    <span className="shrink-0 text-sm text-muted-foreground">Save to</span>
                    <span className="flex-1 truncate text-sm font-medium text-foreground">
                      {folderName}
                    </span>
                    <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={handlePickFolder}>
                      Change
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 text-sm text-muted-foreground sm:flex-1">
                      No save folder — files will download normally
                    </span>
                    <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={handlePickFolder}>
                      Choose folder
                    </Button>
                  </>
                )}
              </div>
              <Button
                onClick={handleSaveAll}
                className="h-14 w-full shrink-0 rounded-2xl bg-primary px-5 text-sm shadow-lg shadow-primary/20 sm:w-auto sm:px-8"
                disabled={readyCount === 0}
              >
                <Download className="h-4 w-4" />
                {dirHandle
                  ? `Save All (${readyCount})`
                  : `Download All (${readyCount})`
                }
                <ChevronRight className="h-4 w-4 opacity-70" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="animate-in slide-in-from-bottom-4 fade-in fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-card px-4 py-3 text-sm text-foreground shadow-xl duration-200">
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
