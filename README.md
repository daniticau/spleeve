# Spleeve

Tag, normalize, and export your MP3s for Spotify local files. Everything runs in the browser.

## Features

- **Metadata editing** — title, artist(s), album, cover art
- **Cover art search** — search iTunes and apply hi-res (600x600) artwork
- **Auto-fill** — parse artist/title from filename, then match against iTunes for album + artwork
- **Volume normalization** — measures loudness (ITU-R BS.1770 LUFS) and writes ReplayGain tags targeting Spotify's -14 LUFS
- **Batch processing** — drop multiple files, each gets its own editor card
- **Folder output** — pick a save folder once via File System Access API; it persists across sessions
- **YouTube download** — paste a URL to download and tag (requires local `yt-dlp` + `ffmpeg`)

## Getting Started

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 and drop your MP3s.

## Tech Stack

- Vite 8 + React 19 + TypeScript
- Tailwind CSS v4 + shadcn/ui
- `music-metadata` + `browser-id3-writer` for ID3 tag read/write
- Web Audio API for LUFS measurement

## How It Works

1. Drop MP3 files (or paste a YouTube URL)
2. Edit metadata — or hit auto-fill to pull from filename + iTunes
3. Toggle per-file volume normalization
4. Hit **Save All** to write tagged MP3s to your chosen folder (or download)

All ID3 tags are written as v2.3 (what Spotify reads). Cover art is resized to 600x600 JPEG. ReplayGain tags (`REPLAYGAIN_TRACK_GAIN`, `REPLAYGAIN_TRACK_PEAK`) are written as TXXX frames.

## YouTube Downloads

Requires `yt-dlp` and `ffmpeg` on your PATH. The dev server exposes `/api/youtube` which handles the download server-side.
