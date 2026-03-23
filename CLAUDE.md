# CLAUDE.md — Spleeve

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is
Spleeve is a browser-based tool that prepares MP3s for Spotify local files — tag metadata (title, artist, album, cover art), normalize volume via ReplayGain, and export. All processing happens client-side except YouTube downloads.

## Commands
- `pnpm dev` — start dev server (includes YouTube download API via Vite middleware)
- `pnpm build` — type-check (`tsc -b`) + production build
- `pnpm lint` — ESLint
- `pnpm preview` — preview production build

## Tech Stack
- Vite 8 + React 19 + TypeScript (strict) + pnpm
- Tailwind CSS v4 + shadcn/ui (dark theme, Geist font)
- `music-metadata` (read ID3) + `browser-id3-writer` (write ID3v2.3)
- Web Audio API for LUFS measurement (ITU-R BS.1770)
- iTunes Search API for cover art + metadata lookup
- Path alias: `@/` → `src/`

## Architecture

### UI Layout
- **Empty state**: centered dropzone
- **With files**: stacked card per file (no sidebar/tabs), each card contains cover art, metadata fields, normalization toggle + LUFS readout, search/auto-fill actions, and a remove button
- **Bottom bar**: persistent save bar with folder picker + Save/Download All button

### Data Flow
1. **Input**: User drops MP3s (or pastes YouTube URL → server-side yt-dlp download)
2. **Read**: `metadata-reader.ts` extracts ID3 tags via `music-metadata`; `lufs-meter.ts` measures loudness via Web Audio API
3. **Edit**: User modifies tags in UI; can auto-fill from filename parsing + iTunes search
4. **Write**: `metadata-writer.ts` rebuilds all ID3v2.3 tags via `browser-id3-writer` (destructive write — all fields must be written back every time)
5. **Output**: Save to File System Access API folder or browser download

### State Management
- `useReducer` in `App.tsx` with a `Map<string, FileEntry>` — see `file-store.ts` for the reducer
- Each `FileEntry` tracks: file, metadata, loudness, normalization toggle, save status
- No external state library — all orchestration in App.tsx
- Per-file normalization: each entry has its own `normalizeEnabled` flag

### YouTube Pipeline
- Client: `src/lib/youtube.ts` — validates URL, POSTs to `/api/youtube`, receives MP3 blob + metadata in response headers
- Server: `server/youtube.ts` — Vite dev middleware that shells out to local `yt-dlp` + `ffmpeg`, single-download mutex (429 if busy)
- Requires `yt-dlp` and `ffmpeg` installed locally

### Output Folder Persistence
`folder-store.ts` persists the user's chosen output directory handle in IndexedDB so it survives page reloads. Uses File System Access API (`showDirectoryPicker`).

## Key Technical Constraints
- `browser-id3-writer` **removes ALL existing tags** before writing — always write all fields back
- Spotify reads **ID3v2.3** (not v2.4). Use TYER for year, not TDRC
- Cover art: APIC frame type 3 (Cover front), JPEG, 600x600
- Volume: Write `TXXX:REPLAYGAIN_TRACK_GAIN` and `TXXX:REPLAYGAIN_TRACK_PEAK` tags
- Spotify LUFS targets: -14 (Normal), -11 (Loud), -19 (Quiet); app targets -14
- iTunes cover art URLs: replace `100x100bb.jpg` with `600x600bb.jpg` for hi-res
- LUFS meter implements K-weighting (high-shelf + RLB high-pass biquad) with 400ms blocks, 75% overlap, absolute (-70 LUFS) and relative (-10 LU) gating
