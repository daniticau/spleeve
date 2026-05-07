import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AudioWaveform,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Crop,
  Download,
  Gauge,
  ImageIcon,
  Images,
  Search,
  CircleEllipsis,
  Share2,
  Sparkles,
  Tag,
  Target,
  RotateCcw,
  Wand2,
  Zap,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { CoverArtPicker } from '@/components/cover-art-picker';
import { CoverArtSearch } from '@/components/cover-art-search';
import { WaveformEditor } from '@/components/waveform-editor';
import type { TrackMetadata } from '@/lib/metadata/reader';
import type { LoudnessResult } from '@/lib/audio/lufs-meter';
import type { WaveformData } from '@/lib/audio/waveform';
import { calculateReplayGain, TARGET_LUFS } from '@/lib/audio/replaygain';
import { arrayBufferToObjectUrl } from '@/lib/image-utils';

interface MetadataEditorProps {
  metadata: TrackMetadata;
  onChange: (metadata: TrackMetadata) => void;
  onImageUpload: (file: File) => void;
  onCoverArtSearch: (buffer: ArrayBuffer) => void;
  searchQuery: string;
  onAutoFill: () => void;
  autoFilling: boolean;
  fileName: string;
  onRemove: () => void;
  onSave: () => void;
  normalizeEnabled: boolean;
  onNormalizeChange: (enabled: boolean) => void;
  loudness: LoudnessResult | null;
  measuring: boolean;
  loudnessError?: boolean;
  waveform: WaveformData | null;
  audioBuffer: AudioBuffer | null;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
}

type EditorSheet = 'cover' | 'crop' | 'normalize' | 'export' | 'more' | null;
type ContentRating = TrackMetadata['contentRating'];
type CoverQuality = 'sixHundred' | 'thousand' | 'max';
type CoverCropPreset = 'center' | 'top' | 'face' | 'fitBlurred';
type CoverTemplate = 'minimalist' | 'vinyl' | 'cassette' | 'sticker' | 'typography';

interface CoverSnapshot {
  coverArt: ArrayBuffer | null;
  coverArtMime: string | null;
}

const COVER_STYLES = [
  ['#E2E6E8', '#9AA2A8', '#050505'],
  ['#F5E9D6', '#F59E42', '#232329'],
  ['#19254A', '#7C5CFF', '#F1EAF8'],
  ['#F8D447', '#F05A28', '#2B1410'],
  ['#0C3B4C', '#39C6D6', '#E9FAFF'],
  ['#F7C2D2', '#F04D98', '#4B153F'],
  ['#E7ECEA', '#8BA49A', '#121212'],
  ['#332A5C', '#D8FF62', '#F5F7EC'],
] as const;

const COVER_QUALITY_OPTIONS: Array<{ value: CoverQuality; label: string; size: number }> = [
  { value: 'sixHundred', label: '600x600', size: 600 },
  { value: 'thousand', label: '1000x1000', size: 1000 },
  { value: 'max', label: 'Max Available', size: 1400 },
];

const COVER_CROP_OPTIONS: Array<{ value: CoverCropPreset; label: string }> = [
  { value: 'center', label: 'Center' },
  { value: 'top', label: 'Top' },
  { value: 'face', label: 'Face-ish' },
  { value: 'fitBlurred', label: 'Fit + Blur' },
];

const COVER_TEMPLATE_OPTIONS: Array<{ value: CoverTemplate; label: string }> = [
  { value: 'minimalist', label: 'Minimal' },
  { value: 'vinyl', label: 'Vinyl' },
  { value: 'cassette', label: 'Cassette' },
  { value: 'sticker', label: 'Sticker' },
  { value: 'typography', label: 'Type' },
];

export function MetadataEditor({
  metadata,
  onChange,
  onImageUpload,
  onCoverArtSearch,
  searchQuery,
  onAutoFill,
  autoFilling,
  fileName,
  onRemove,
  onSave,
  normalizeEnabled,
  onNormalizeChange,
  loudness,
  measuring,
  loudnessError,
  waveform,
  audioBuffer,
  trimStart,
  trimEnd,
  onTrimChange,
}: MetadataEditorProps) {
  const [showsExtras, setShowsExtras] = useState(false);
  const [activeSheet, setActiveSheet] = useState<EditorSheet>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [coverQuality, setCoverQuality] = useState<CoverQuality>('max');
  const [coverCropPreset, setCoverCropPreset] = useState<CoverCropPreset>('center');
  const [lastCoverSnapshot, setLastCoverSnapshot] = useState<CoverSnapshot | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const replayGain = useMemo(
    () => loudness ? calculateReplayGain(loudness) : null,
    [loudness],
  );

  const lufsDisplay =
    loudness && isFinite(loudness.integratedLufs)
      ? `${loudness.integratedLufs.toFixed(1)} LUFS`
      : null;
  const targetLufs = replayGain?.targetLufs ?? TARGET_LUFS;
  const outputLufs = replayGain ? targetLufs : null;
  const gainTone =
    !replayGain || Math.abs(replayGain.gainDb) < 0.1
      ? 'neutral'
      : replayGain.gainDb > 0
        ? 'boost'
        : 'trim';
  const coverQualityOption = COVER_QUALITY_OPTIONS.find((option) => option.value === coverQuality) ?? COVER_QUALITY_OPTIONS[2];
  const coverSize = coverQualityOption.size;
  const coverCropLabel = COVER_CROP_OPTIONS.find((option) => option.value === coverCropPreset)?.label ?? 'Center';

  const updateMetadata = useCallback((updates: Partial<TrackMetadata>) => {
    onChange({ ...metadata, ...updates });
  }, [metadata, onChange]);

  const rememberCoverSnapshot = useCallback(() => {
    setLastCoverSnapshot({
      coverArt: metadata.coverArt ? metadata.coverArt.slice(0) : null,
      coverArtMime: metadata.coverArtMime,
    });
  }, [metadata.coverArt, metadata.coverArtMime]);

  const applyCoverBuffer = useCallback((coverArt: ArrayBuffer, remember = true) => {
    if (remember) rememberCoverSnapshot();
    updateMetadata({ coverArt, coverArtMime: 'image/jpeg' });
  }, [rememberCoverSnapshot, updateMetadata]);

  const applyGeneratedCover = useCallback(async (styleIndex = 0, template: CoverTemplate = 'vinyl') => {
    const [background, backgroundEnd, text] = COVER_STYLES[styleIndex];
    rememberCoverSnapshot();
    const coverArt = await generateTemplateCover({
      title: metadata.title,
      artist: metadata.artists[0] ?? '',
      background,
      backgroundEnd,
      text,
      size: coverSize,
      template,
    });
    updateMetadata({ coverArt, coverArtMime: 'image/jpeg' });
    setActiveSheet(null);
  }, [coverSize, metadata.artists, metadata.title, rememberCoverSnapshot, updateMetadata]);

  const cleanMetadata = useCallback(() => {
    updateMetadata({
      title: titleCase(cleanTitle(metadata.title)),
      artists: metadata.artists.map((artist) => cleanField(artist)).filter(Boolean),
      album: titleCase(metadata.album),
      trackNumber: cleanField(metadata.trackNumber),
      year: cleanField(metadata.year),
      genre: titleCase(metadata.genre),
    });
  }, [metadata, updateMetadata]);

  const makeSpotifyLike = useCallback(async () => {
    cleanMetadata();
    onNormalizeChange(true);
    if (!metadata.coverArt) {
      await applyGeneratedCover(0);
    }
  }, [applyGeneratedCover, cleanMetadata, metadata.coverArt, onNormalizeChange]);

  const processSelectedCover = useCallback(async (source: Blob) => {
    const coverArt = await processCoverImage(source, {
      size: coverSize,
      cropPreset: coverCropPreset,
    });
    applyCoverBuffer(coverArt);
  }, [applyCoverBuffer, coverCropPreset, coverSize]);

  const handlePhotoChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void processSelectedCover(file);
      event.target.value = '';
    }
  }, [processSelectedCover]);

  const coverBlob = useCallback(async () => {
    if (metadata.coverArt && metadata.coverArtMime) {
      return new Blob([metadata.coverArt], { type: metadata.coverArtMime });
    }

    const [background, backgroundEnd, text] = COVER_STYLES[0];
    const buffer = await generateTextCover({
      title: metadata.title,
      artist: metadata.artists[0] ?? '',
      background,
      backgroundEnd,
      text,
      size: coverSize,
    });
    return new Blob([buffer], { type: 'image/jpeg' });
  }, [coverSize, metadata.artists, metadata.coverArt, metadata.coverArtMime, metadata.title]);

  const pasteCoverFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        await processSelectedCover(blob);
        setActiveSheet(null);
        return;
      }
    } catch (err) {
      console.error('Paste cover failed:', err);
    }
  }, [processSelectedCover]);

  const copyCover = useCallback(async () => {
    try {
      const blob = await coverBlob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setActiveSheet(null);
    } catch (err) {
      console.error('Copy cover failed:', err);
    }
  }, [coverBlob]);

  const downloadCover = useCallback(async () => {
    const blob = await coverBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Spleeve Cover.jpg';
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setActiveSheet(null);
  }, [coverBlob]);

  const undoCoverChange = useCallback(() => {
    if (!lastCoverSnapshot) return;
    const current: CoverSnapshot = {
      coverArt: metadata.coverArt ? metadata.coverArt.slice(0) : null,
      coverArtMime: metadata.coverArtMime,
    };
    updateMetadata(lastCoverSnapshot);
    setLastCoverSnapshot(current);
    setActiveSheet(null);
  }, [lastCoverSnapshot, metadata.coverArt, metadata.coverArtMime, updateMetadata]);

  const applyCoverQuality = useCallback(async (quality: CoverQuality) => {
    setCoverQuality(quality);
    if (!metadata.coverArt || !metadata.coverArtMime) return;

    const option = COVER_QUALITY_OPTIONS.find((item) => item.value === quality) ?? COVER_QUALITY_OPTIONS[2];
    try {
      rememberCoverSnapshot();
      const coverArt = await processCoverImage(new Blob([metadata.coverArt], { type: metadata.coverArtMime }), {
        size: option.size,
        cropPreset: coverCropPreset,
      });
      updateMetadata({ coverArt, coverArtMime: 'image/jpeg' });
    } catch (err) {
      console.error('Cover quality change failed:', err);
    }
  }, [coverCropPreset, metadata.coverArt, metadata.coverArtMime, rememberCoverSnapshot, updateMetadata]);

  const applyCoverCropPreset = useCallback(async (preset: CoverCropPreset) => {
    setCoverCropPreset(preset);
    if (!metadata.coverArt || !metadata.coverArtMime) return;

    try {
      rememberCoverSnapshot();
      const coverArt = await processCoverImage(new Blob([metadata.coverArt], { type: metadata.coverArtMime }), {
        size: coverSize,
        cropPreset: preset,
      });
      updateMetadata({ coverArt, coverArtMime: 'image/jpeg' });
    } catch (err) {
      console.error('Cover framing change failed:', err);
    }
  }, [coverSize, metadata.coverArt, metadata.coverArtMime, rememberCoverSnapshot, updateMetadata]);

  const shareCover = useCallback(async () => {
    try {
      const blob = await coverBlob();
      const file = new File([blob], 'Spleeve Cover.jpg', { type: blob.type });
      if (!navigator.canShare?.({ files: [file] })) return;
      await navigator.share({ files: [file], title: 'Spleeve Cover' });
      setActiveSheet(null);
    } catch (err) {
      console.error('Share cover failed:', err);
    }
  }, [coverBlob]);

  useEffect(() => {
    if (activeSheet !== 'more') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveSheet(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSheet]);

  return (
    <article className="rounded-[1.5rem]">
      <div className="mb-3 flex items-center gap-3 px-1">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{fileName}</p>
        <Button
          type="button"
          size="sm"
          onClick={() => setActiveSheet('export')}
          className="rounded-full bg-primary px-3 text-primary-foreground"
        >
          Export
        </Button>
        <button
          type="button"
          onClick={onRemove}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="flex justify-center lg:justify-start">
              <CoverArtPicker
                coverArt={metadata.coverArt}
                coverArtMime={metadata.coverArtMime}
                title={metadata.title}
                artist={metadata.artists.join(', ')}
                onImageUpload={onImageUpload}
              />
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhotoChange}
              className="hidden"
            />
            <div className="grid grid-cols-2 gap-2">
              <ToolButton
                icon={autoFilling ? <Spinner className="size-5" /> : <Wand2 className="size-5" />}
                label={autoFilling ? 'Finding' : 'Auto'}
                onClick={onAutoFill}
                disabled={autoFilling}
              />
              <ToolButton icon={<Images className="size-5" />} label="Photos" onClick={() => photoInputRef.current?.click()} />
              <ToolButton icon={<Search className="size-5" />} label="Search" onClick={() => setSearchOpen(true)} />
              <ToolButton icon={<CircleEllipsis className="size-5" />} label="More" onClick={() => setActiveSheet('more')} />
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
              <Field
                label="Title"
                value={metadata.title}
                onChange={(v) => updateMetadata({ title: v })}
              />
              <Separator />
              <div className="grid gap-px bg-border sm:grid-cols-2">
                <div className="bg-card px-4 py-3.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Artist</Label>
                  <ArtistLineInput
                    key={metadata.artists.join('\0')}
                    values={metadata.artists}
                    onChange={(artists) => updateMetadata({ artists })}
                    placeholder="e.g., Kanye West"
                  />
                </div>
                <div className="bg-card px-4 py-3.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Album</Label>
                  <Input
                    value={metadata.album}
                    onChange={(event) => updateMetadata({ album: event.target.value })}
                    placeholder="Album"
                    className="h-8 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 md:text-base"
                  />
                </div>
              </div>
            </div>

            <section className="min-w-0 space-y-2">
              <button
                type="button"
                onClick={() => setShowsExtras((current) => !current)}
                className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm"
              >
                <IconBubble tint="purple">
                  <Tag className="size-4" />
                </IconBubble>
                <span className="text-sm font-semibold">Extra Metadata</span>
                <span className="ml-auto text-muted-foreground">
                  {showsExtras ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </span>
              </button>

              {showsExtras && (
                <div className="rounded-2xl bg-card p-3 shadow-sm">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CompactField
                      label="Track"
                      value={metadata.trackNumber}
                      onChange={(trackNumber) => updateMetadata({ trackNumber })}
                      placeholder="4"
                    />
                    <CompactField
                      label="Year"
                      value={metadata.year}
                      onChange={(year) => updateMetadata({ year })}
                      placeholder="2026"
                    />
                  </div>
                  <div className="mt-3">
                    <CompactField
                      label="Genre"
                      value={metadata.genre}
                      onChange={(genre) => updateMetadata({ genre })}
                      placeholder="Pop"
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-3 rounded-xl bg-muted p-1">
                    {(['unspecified', 'clean', 'explicit'] as ContentRating[]).map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => updateMetadata({ contentRating: rating })}
                        className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${
                          metadata.contentRating === rating
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {rating === 'unspecified' ? 'None' : rating}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {waveform && (
              <section>
                <div className="rounded-2xl bg-card p-4 shadow-sm">
                  <WaveformEditor
                    waveform={waveform}
                    audioBuffer={audioBuffer}
                    trimStart={trimStart}
                    trimEnd={trimEnd}
                    onTrimChange={onTrimChange}
                  />
                  <div className="mt-3 border-t border-border pt-3">
                    <LoudnessInline
                      measuring={measuring}
                      loudnessError={loudnessError}
                      lufsDisplay={lufsDisplay}
                      replayGain={replayGain?.gain}
                      normalizeEnabled={normalizeEnabled}
                      onNormalizeChange={onNormalizeChange}
                    />
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <CoverArtSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(buffer) => {
          rememberCoverSnapshot();
          onCoverArtSearch(buffer);
        }}
        initialQuery={searchQuery}
      />

      <Dialog open={activeSheet === 'cover'} onOpenChange={(open) => !open && setActiveSheet(null)}>
        <DialogContent className="max-w-xl rounded-3xl p-5">
          <DialogHeader>
            <DialogTitle>Spleeve Cover</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {COVER_STYLES.map(([background, backgroundEnd, text], index) => (
              <button
                key={`${background}-${backgroundEnd}`}
                type="button"
                onClick={() => void applyGeneratedCover(index)}
                className="overflow-hidden rounded-2xl shadow-sm ring-1 ring-border transition hover:-translate-y-0.5"
              >
                <GeneratedCoverPreview
                  title={metadata.title}
                  artist={metadata.artists[0] ?? ''}
                  background={background}
                  backgroundEnd={backgroundEnd}
                  text={text}
                />
              </button>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {COVER_TEMPLATE_OPTIONS.map((template) => (
              <button
                key={template.value}
                type="button"
                onClick={() => void applyGeneratedCover(0, template.value)}
                className="rounded-xl bg-card px-2 py-2 text-xs font-semibold text-foreground shadow-sm transition hover:bg-secondary"
              >
                {template.label}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="rounded-2xl"
              onClick={() => {
                rememberCoverSnapshot();
                updateMetadata({ coverArt: null, coverArtMime: null });
              }}
            >
              Remove Cover
            </Button>
            <Button className="rounded-2xl" onClick={() => void applyGeneratedCover(0)}>
              Generate Spleeve Cover
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {activeSheet === 'more' && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/10 p-4 backdrop-blur-xs">
          <button
            type="button"
            aria-label="Close more tools"
            className="absolute inset-0"
            onClick={() => setActiveSheet(null)}
          />
          <div className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl bg-background p-5 shadow-xl ring-1 ring-foreground/10">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">More Cover Tools</h2>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
              <ToolRow
                icon={<ClipboardPaste className="size-4" />}
                title="Paste Cover"
                subtitle="Use image data from the clipboard"
                tint="green"
                onClick={() => void pasteCoverFromClipboard()}
                disabled={!navigator.clipboard?.read}
              />
              <Separator />
              <ToolRow
                icon={<ImageIcon className="size-4" />}
                title="Remove Cover"
                subtitle="Use the default Spleeve artwork"
                tint="orange"
                onClick={() => {
                  rememberCoverSnapshot();
                  updateMetadata({ coverArt: null, coverArtMime: null });
                  setActiveSheet(null);
                }}
                disabled={!metadata.coverArt}
              />
              <Separator />
              <ToolRow
                icon={<Sparkles className="size-4" />}
                title="Spleeve Cover"
                subtitle="Pick a generated color style"
                tint="green"
                onClick={() => setActiveSheet('cover')}
              />
              <Separator />
              <ToolSetting
                icon={<ImageIcon className="size-4" />}
                title={`Quality: ${coverQualityOption.label}`}
                subtitle="Artwork export size"
                options={COVER_QUALITY_OPTIONS}
                value={coverQuality}
                onChange={(quality) => void applyCoverQuality(quality as CoverQuality)}
              />
              <Separator />
              <ToolSetting
                icon={<Crop className="size-4" />}
                title={`Image Framing: ${coverCropLabel}`}
                subtitle="How imported artwork is squared"
                options={COVER_CROP_OPTIONS}
                value={coverCropPreset}
                onChange={(preset) => void applyCoverCropPreset(preset as CoverCropPreset)}
              />
              <Separator />
              <ToolRow
                icon={<Share2 className="size-4" />}
                title="Share Cover"
                subtitle="Open the system share sheet"
                tint="green"
                onClick={() => void shareCover()}
                disabled={!navigator.canShare}
              />
              <Separator />
              <ToolRow
                icon={<Copy className="size-4" />}
                title="Copy Cover"
                subtitle="Copy the current artwork"
                tint="green"
                onClick={() => void copyCover()}
                disabled={!navigator.clipboard?.write}
              />
              <Separator />
              <ToolRow
                icon={<Download className="size-4" />}
                title="Save to Photos"
                subtitle="Download artwork in the browser"
                tint="green"
                onClick={() => void downloadCover()}
              />
              <Separator />
              <ToolRow
                icon={<RotateCcw className="size-4" />}
                title="Undo Cover"
                subtitle="Restore the previous artwork"
                tint="orange"
                onClick={undoCoverChange}
                disabled={!lastCoverSnapshot}
              />
              <Separator />
              <ToolRow
                icon={<Wand2 className="size-4" />}
                title="Make Spotify-like"
                subtitle="Clean tags, normalize, and fill missing art"
                tint="green"
                onClick={() => {
                  void makeSpotifyLike();
                  setActiveSheet(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      <Dialog open={activeSheet === 'crop'} onOpenChange={(open) => !open && setActiveSheet(null)}>
        <DialogContent className="max-w-2xl rounded-3xl p-5">
          <DialogHeader>
            <DialogTitle>Crop Audio</DialogTitle>
          </DialogHeader>
          {waveform ? (
            <div className="space-y-5">
              <div className="rounded-2xl bg-card p-4 shadow-sm">
                <WaveformEditor
                  waveform={waveform}
                  audioBuffer={audioBuffer}
                  trimStart={trimStart}
                  trimEnd={trimEnd}
                  onTrimChange={onTrimChange}
                />
              </div>
              <div className="grid grid-cols-3 items-center text-center">
                <TimeBlock label="Start" value={formatTime(trimStart)} />
                <TimeBlock label="Selection" value={formatTime(trimEnd - trimStart)} accent />
                <TimeBlock label="End" value={formatTime(trimEnd)} />
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <Button variant="secondary" className="rounded-2xl" onClick={() => onTrimChange(0, waveform.duration)}>
                  Reset
                </Button>
                <Button className="rounded-2xl px-6" onClick={() => setActiveSheet(null)}>
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <Spinner className="mx-auto size-6" />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={activeSheet === 'normalize'} onOpenChange={(open) => !open && setActiveSheet(null)}>
        <DialogContent className="max-w-lg rounded-3xl p-5">
          <DialogHeader>
            <DialogTitle>Normalize Loudness</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl bg-card shadow-sm">
              <div className="flex items-center gap-4 px-4 py-4">
                <div
                  className={`grid size-16 shrink-0 place-items-center rounded-2xl ${
                    normalizeEnabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {measuring ? (
                    <Spinner className="size-6" />
                  ) : normalizeEnabled ? (
                    <CheckCircle2 className="size-7" />
                  ) : (
                    <AudioWaveform className="size-7" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-semibold text-foreground">
                    {normalizeEnabled ? 'Matched to Spotify' : measuring ? 'Analyzing loudness' : 'Normalization off'}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {loudnessError
                      ? 'Measurement unavailable'
                      : replayGain
                        ? `${replayGain.gain} gain · ${targetLufs.toFixed(0)} LUFS target`
                        : 'Waiting for loudness scan'}
                  </div>
                </div>
                <Switch
                  checked={normalizeEnabled}
                  disabled={measuring || loudnessError || !replayGain}
                  onCheckedChange={onNormalizeChange}
                />
              </div>

              <div className="h-px bg-border" />

              <div className="grid grid-cols-3 gap-px bg-border">
                <NormalizeStat
                  icon={<Gauge className="size-4" />}
                  label="Input"
                  value={lufsDisplay ? lufsDisplay.replace(' LUFS', '') : '--'}
                  unit="LUFS"
                />
                <NormalizeStat
                  icon={<Target className="size-4" />}
                  label="Target"
                  value={targetLufs.toFixed(1)}
                  unit="LUFS"
                  accent
                />
                <NormalizeStat
                  icon={<Zap className="size-4" />}
                  label="Gain"
                  value={replayGain?.gain.replace(' dB', '') ?? '--'}
                  unit="dB"
                />
              </div>
            </div>

            {replayGain && (
              <div className="rounded-3xl bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Level Match</span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      gainTone === 'boost'
                        ? 'bg-primary/15 text-primary'
                        : gainTone === 'trim'
                          ? 'bg-orange-500/15 text-orange-600 dark:text-orange-300'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {gainTone === 'boost' ? 'Boosting' : gainTone === 'trim' ? 'Trimming' : 'Already close'}
                  </span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="absolute inset-y-0 left-1/2 w-px bg-foreground/25"
                    aria-hidden="true"
                  />
                  <div
                    className={`absolute top-0 h-full rounded-full ${
                      gainTone === 'trim' ? 'right-1/2 bg-orange-500' : 'left-1/2 bg-primary'
                    }`}
                    style={{
                      width: `${Math.min(50, Math.max(5, Math.abs(replayGain.gainDb) * 7))}%`,
                    }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 text-xs text-muted-foreground">
                  <span>-8 dB</span>
                  <span className="text-center">0</span>
                  <span className="text-right">+8 dB</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <NormalizeMiniStat label="True Peak" value={loudness ? `${loudness.truePeakDbfs.toFixed(1)} dBFS` : '--'} />
              <NormalizeMiniStat label="Output" value={outputLufs ? `${outputLufs.toFixed(1)} LUFS` : '--'} />
            </div>

            <Button
              className="w-full rounded-2xl py-6"
              disabled={measuring}
              onClick={() => setActiveSheet(null)}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={activeSheet === 'export'} onOpenChange={(open) => !open && setActiveSheet(null)}>
        <DialogContent className="max-w-lg rounded-3xl p-5">
          <DialogHeader>
            <DialogTitle>Export</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <ExportPreview metadata={metadata} />
            <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
              <ReviewRow label="Title" value={metadata.title || 'Untitled'} />
              <Separator />
              <ReviewRow label="Artist" value={metadata.artists.join(', ')} />
              <Separator />
              <ReviewRow label="Album" value={metadata.album} />
              <Separator />
              <ReviewRow label="Track" value={metadata.trackNumber} />
              <Separator />
              <ReviewRow label="Year" value={metadata.year} />
              <Separator />
              <ReviewRow label="Genre" value={metadata.genre} />
              <Separator />
              <ReviewRow label="Format" value="MP3" />
              <Separator />
              <ReviewRow label="Filename" value={`${metadata.artists[0] || 'Unknown Artist'} - ${metadata.title || 'Unknown Title'}.mp3`} />
            </div>
            <ToolRow
              icon={<CheckCircle2 className="size-4" />}
              title="Make Spotify-like"
              subtitle="Clean tags, normalize to -14 LUFS, square art"
              tint="green"
              onClick={() => void makeSpotifyLike()}
            />
            <ToolRow
              icon={<Download className="size-4" />}
              title="Save or Download"
              subtitle="Drop into Spotify Local Files"
              tint="green"
              onClick={() => {
                onSave();
                setActiveSheet(null);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function LoudnessInline({
  measuring,
  loudnessError,
  lufsDisplay,
  replayGain,
  normalizeEnabled,
  onNormalizeChange,
}: {
  measuring: boolean;
  loudnessError?: boolean;
  lufsDisplay: string | null;
  replayGain?: string;
  normalizeEnabled: boolean;
  onNormalizeChange: (enabled: boolean) => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
      {measuring ? (
        <div className="flex items-center gap-1.5">
          <Spinner className="h-3 w-3" />
          <span>Measuring...</span>
        </div>
      ) : loudnessError ? (
        <span className="text-destructive">Measurement failed</span>
      ) : lufsDisplay ? (
        <>
          <span className="font-mono text-primary">{lufsDisplay}</span>
          {replayGain && (
            <span>
              Gain <span className="font-mono text-foreground">{replayGain}</span>
            </span>
          )}
        </>
      ) : null}
      <div className="flex items-center gap-1.5">
        <Switch checked={normalizeEnabled} onCheckedChange={onNormalizeChange} />
        <Label className="text-xs text-muted-foreground">Normalize</Label>
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-card px-2 py-3 text-sm font-medium text-foreground shadow-sm transition enabled:hover:-translate-y-0.5 disabled:cursor-default"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
        {icon}
      </span>
      {label}
    </button>
  );
}

function ToolRow({
  icon,
  title,
  subtitle,
  tint,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  tint: 'green' | 'orange';
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left shadow-sm transition enabled:hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45"
    >
      <IconBubble tint={tint}>{icon}</IconBubble>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}

function ToolSetting({
  icon,
  title,
  subtitle,
  options,
  value,
  onChange,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  options: Array<{ value: CoverQuality | CoverCropPreset; label: string }>;
  value: CoverQuality | CoverCropPreset;
  onChange: (value: CoverQuality | CoverCropPreset) => void;
}) {
  return (
    <div className="bg-card px-4 py-4">
      <div className="mb-3 flex items-center gap-3">
        <IconBubble tint="green">{icon}</IconBubble>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        </span>
      </div>
      <div className="grid gap-1 rounded-xl bg-muted p-1 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
              option.value === value
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function IconBubble({ children, tint }: { children: ReactNode; tint: 'green' | 'orange' | 'purple' }) {
  const color =
    tint === 'orange'
      ? 'bg-orange-500/15 text-orange-500'
      : tint === 'purple'
        ? 'bg-purple-500/15 text-purple-500'
        : 'bg-primary/15 text-primary';

  return (
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${color}`}>
      {children}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-3 px-4 py-3.5">
      <Label className="text-sm font-medium text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="h-8 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 md:text-base"
      />
    </div>
  );
}

function ArtistLineInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(values.join(', '));

  const commit = useCallback((raw: string) => {
    const artists = raw
      .split(',')
      .map((artist) => artist.trim())
      .filter(Boolean);
    onChange(artists);
    setDraft(artists.join(', '));
  }, [onChange]);

  return (
    <Input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => commit(draft)}
      placeholder={placeholder}
      className="h-8 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 md:text-base"
    />
  );
}

function CompactField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block rounded-xl bg-muted px-3 py-2">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
      />
    </label>
  );
}

function Separator() {
  return <div className="ml-4 h-px bg-border" />;
}

function TimeBlock({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-[0.65rem] font-semibold uppercase text-muted-foreground">{label}</div>
      <div className={`font-mono text-lg font-bold tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
        {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function NormalizeStat({
  icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 bg-card p-3">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${accent ? 'text-primary' : 'text-muted-foreground'}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className={`truncate font-mono text-lg font-bold tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </div>
      <div className="text-[0.65rem] font-semibold text-muted-foreground">{unit}</div>
    </div>
  );
}

function NormalizeMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-base font-bold text-foreground">{value}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const display = cleanField(value);
  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)] gap-3 px-4 py-3">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className={`line-clamp-2 text-sm ${display ? 'text-foreground' : 'text-muted-foreground'}`}>
        {display || 'Empty'}
      </span>
    </div>
  );
}

function ExportPreview({ metadata }: { metadata: TrackMetadata }) {
  const previewUrl = useObjectUrl(metadata.coverArt, metadata.coverArtMime);

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-neutral-950 p-3 text-white">
      <div className="size-14 overflow-hidden rounded-lg bg-neutral-800">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center">
            <ImageIcon className="size-6 text-white/45" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{metadata.title || 'Untitled'}</div>
        <div className="truncate text-xs text-white/65">{metadata.artists.join(', ') || 'Unknown Artist'}</div>
      </div>
      <span className="text-white/45">...</span>
    </div>
  );
}

function GeneratedCoverPreview({
  title,
  artist,
  background,
  backgroundEnd,
  text,
}: {
  title: string;
  artist: string;
  background: string;
  backgroundEnd: string;
  text: string;
}) {
  return (
    <div
      className="relative aspect-square overflow-hidden text-left"
      style={{
        color: text,
        background: `linear-gradient(135deg, ${background}, ${backgroundEnd})`,
      }}
    >
      <div className="absolute left-[8%] top-[8%] z-10 line-clamp-4 max-h-[34%] w-[84%] text-sm font-semibold leading-tight">
        {cleanField(title) || 'Untitled'}
      </div>
      <div className="absolute left-1/2 top-1/2 aspect-square w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#050507]">
        <div
          className="absolute inset-0 rounded-full opacity-70"
          style={{
            background: 'conic-gradient(rgba(255,255,255,0.16), transparent, rgba(0,0,0,0.42), transparent, rgba(255,255,255,0.10), rgba(255,255,255,0.16))',
          }}
        />
        {[0.28, 0.36, 0.44, 0.52, 0.6, 0.68, 0.76, 0.84, 0.92].map((diameter) => (
          <div
            key={diameter}
            className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15"
            style={{ width: `${diameter * 100}%` }}
          />
        ))}
        <div className="absolute left-1/2 top-1/2 aspect-square w-[17%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
        <div
          className="absolute left-1/2 top-1/2 aspect-square w-[5.5%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background }}
        />
      </div>
      {artist && (
        <div className="absolute bottom-[8%] right-[8%] z-10 flex aspect-square w-[28%] items-end justify-end text-right text-sm font-semibold leading-tight">
          {artist}
        </div>
      )}
    </div>
  );
}

function useObjectUrl(buffer: ArrayBuffer | null, mime: string | null) {
  const previewUrl = useMemo(
    () => buffer && mime ? arrayBufferToObjectUrl(buffer, mime) : null,
    [buffer, mime],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return previewUrl;
}

function formatTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const m = Math.floor(safeSeconds / 60);
  const s = Math.floor(safeSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function cleanField(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function cleanTitle(value: string): string {
  return cleanField(value)
    .replace(/\s*[([]\s*official\s+(audio|video|music\s+video|visualizer)\s*[\])]/gi, '')
    .replace(/\s*[([]\s*(lyrics?|lyric\s+video)\s*[\])]/gi, '')
    .replace(/\s*[([]\s*(clean|explicit)\s*[\])]/gi, '')
    .trim();
}

function titleCase(value: string): string {
  return cleanField(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

async function generateTextCover({
  title,
  artist,
  background,
  backgroundEnd,
  text,
  size = 1200,
}: {
  title: string;
  artist: string;
  background: string;
  backgroundEnd: string;
  text: string;
  size?: number;
}): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, background);
  gradient.addColorStop(1, backgroundEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const padding = size * 0.08;
  const recordSide = size * 0.52;
  const recordRadius = recordSide / 2;
  const ringLineWidth = Math.max(1, recordSide * 0.008);

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.fillStyle = '#050507';
  ctx.beginPath();
  ctx.arc(0, 0, recordRadius, 0, Math.PI * 2);
  ctx.fill();

  const conic = ctx.createConicGradient(0, 0, 0);
  conic.addColorStop(0, 'rgba(255,255,255,0.16)');
  conic.addColorStop(0.25, 'rgba(255,255,255,0)');
  conic.addColorStop(0.5, 'rgba(0,0,0,0.42)');
  conic.addColorStop(0.72, 'rgba(255,255,255,0)');
  conic.addColorStop(1, 'rgba(255,255,255,0.10)');
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = conic;
  ctx.beginPath();
  ctx.arc(0, 0, recordRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = ringLineWidth;
  for (const diameter of [0.28, 0.36, 0.44, 0.52, 0.6, 0.68, 0.76, 0.84, 0.92]) {
    ctx.beginPath();
    ctx.arc(0, 0, (recordSide * diameter) / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  const labelRadius = (recordSide * 0.17) / 2;
  const labelGradient = ctx.createConicGradient(0, 0, 0);
  labelGradient.addColorStop(0, '#1DB954');
  labelGradient.addColorStop(0.25, 'rgba(29,185,84,0.72)');
  labelGradient.addColorStop(0.5, 'rgba(29,185,84,0.96)');
  labelGradient.addColorStop(0.75, 'rgba(29,185,84,0.72)');
  labelGradient.addColorStop(1, '#1DB954');
  ctx.fillStyle = '#1DB954';
  ctx.fillStyle = labelGradient;
  ctx.beginPath();
  ctx.arc(0, 0, labelRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.arc(0, 0, (recordSide * 0.055) / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = text;
  ctx.textBaseline = 'top';
  const coverTextSize = size * 0.088;
  const coverLineHeight = size * 0.102;
  ctx.font = `600 ${coverTextSize}px Geist, system-ui, sans-serif`;
  wrapText(ctx, cleanField(title) || 'Untitled', padding, padding, size - padding * 2, coverLineHeight, 4);
  if (artist) {
    ctx.font = `600 ${coverTextSize}px Geist, system-ui, sans-serif`;
    ctx.textAlign = 'right';
    drawBottomAlignedText(ctx, artist, size - padding, size - padding, size * 0.28, coverLineHeight, 3, 'right');
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not encode cover')), 'image/jpeg', 0.92);
  });
  return blob.arrayBuffer();
}

async function generateTemplateCover({
  template,
  title,
  artist,
  background,
  backgroundEnd,
  text,
  size,
}: {
  template: CoverTemplate;
  title: string;
  artist: string;
  background: string;
  backgroundEnd: string;
  text: string;
  size: number;
}): Promise<ArrayBuffer> {
  if (template === 'vinyl') {
    return generateTextCover({ title, artist, background, backgroundEnd, text, size });
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, background);
  gradient.addColorStop(1, backgroundEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  if (template === 'cassette') drawCassetteTemplate(ctx, size, text);
  if (template === 'sticker') drawStickerTemplate(ctx, size, background, text);
  if (template === 'typography') drawTypographyTemplate(ctx, size, title, artist, text);

  ctx.fillStyle = text;
  const padding = size * 0.09;
  if (template === 'minimalist') {
    ctx.textBaseline = 'top';
    ctx.font = `700 ${size * 0.105}px Geist, system-ui, sans-serif`;
    wrapText(ctx, cleanField(title) || 'Untitled', padding, padding, size * 0.74, size * 0.12, 4);
    if (artist) {
      ctx.font = `600 ${size * 0.046}px Geist, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      wrapText(ctx, artist, padding, size - padding - size * 0.08, size * 0.72, size * 0.055, 2);
    }
  } else if (template !== 'typography') {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `700 ${size * 0.072}px Geist, system-ui, sans-serif`;
    wrapText(ctx, cleanField(title) || 'Untitled', size / 2, size * 0.45, size * 0.72, size * 0.084, 3, 'center');
    if (artist) {
      ctx.font = `600 ${size * 0.036}px Geist, system-ui, sans-serif`;
      wrapText(ctx, artist, size / 2, size * 0.69, size * 0.62, size * 0.046, 2, 'center');
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not encode cover')), 'image/jpeg', 0.92);
  });
  return blob.arrayBuffer();
}

function drawCassetteTemplate(ctx: CanvasRenderingContext2D, size: number, text: string) {
  const x = size * 0.16;
  const y = size * 0.24;
  const width = size * 0.68;
  const height = size * 0.34;
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundRect(ctx, x, y, width, height, size * 0.035);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, x + width * 0.1, y + height * 0.18, width * 0.8, height * 0.24, size * 0.02);
  ctx.fill();
  ctx.strokeStyle = text;
  ctx.lineWidth = size * 0.011;
  for (const reelX of [x + width * 0.3, x + width * 0.7]) {
    ctx.beginPath();
    ctx.arc(reelX, y + height * 0.62, size * 0.063, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(reelX, y + height * 0.62, size * 0.019, 0, Math.PI * 2);
    ctx.fillStyle = text;
    ctx.fill();
  }
}

function drawStickerTemplate(ctx: CanvasRenderingContext2D, size: number, background: string, text: string) {
  ctx.save();
  ctx.translate(size * 0.5, size * 0.42);
  ctx.rotate(-0.08);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  roundRect(ctx, -size * 0.28, -size * 0.18, size * 0.56, size * 0.36, size * 0.055);
  ctx.fill();
  ctx.strokeStyle = text;
  ctx.lineWidth = size * 0.01;
  ctx.stroke();
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.arc(size * 0.2, -size * 0.12, size * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTypographyTemplate(
  ctx: CanvasRenderingContext2D,
  size: number,
  title: string,
  artist: string,
  text: string,
) {
  const phrase = cleanField(title) || 'Untitled';
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = text;
  ctx.font = `800 ${size * 0.11}px Geist, system-ui, sans-serif`;
  ctx.rotate(-0.16);
  for (let y = -size * 0.05; y < size * 1.2; y += size * 0.16) {
    ctx.fillText(phrase, -size * 0.12, y);
  }
  ctx.restore();

  ctx.fillStyle = text;
  ctx.textBaseline = 'top';
  ctx.font = `800 ${size * 0.118}px Geist, system-ui, sans-serif`;
  wrapText(ctx, phrase, size * 0.09, size * 0.18, size * 0.82, size * 0.13, 4);
  if (artist) {
    ctx.font = `600 ${size * 0.044}px Geist, system-ui, sans-serif`;
    wrapText(ctx, artist, size * 0.09, size * 0.74, size * 0.72, size * 0.052, 2);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function processCoverImage(
  source: Blob,
  {
    size,
    cropPreset,
  }: {
    size: number;
    cropPreset: CoverCropPreset;
  },
): Promise<ArrayBuffer> {
  const image = await loadCoverImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  if (cropPreset === 'fitBlurred') {
    drawFitBlurredCover(ctx, image, size);
  } else {
    drawAspectFillCover(ctx, image, size, cropPreset);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not encode cover')), 'image/jpeg', 0.92);
  });
  return blob.arrayBuffer();
}

function loadCoverImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load cover image'));
    };
    image.src = url;
  });
}

function drawAspectFillCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  size: number,
  cropPreset: CoverCropPreset,
) {
  const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const verticalBias = cropPreset === 'top' ? 0 : cropPreset === 'face' ? 0.34 : 0.5;
  const x = (size - drawWidth) / 2;
  const y = -(drawHeight - size) * verticalBias;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}

function drawFitBlurredCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  size: number,
) {
  const fillScale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
  const fillWidth = image.naturalWidth * fillScale;
  const fillHeight = image.naturalHeight * fillScale;
  ctx.save();
  ctx.filter = 'blur(22px)';
  ctx.drawImage(image, (size - fillWidth) / 2, (size - fillHeight) / 2, fillWidth, fillHeight);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fillRect(0, 0, size, size);

  const fitScale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
  const fitWidth = image.naturalWidth * fitScale;
  const fitHeight = image.naturalHeight * fitScale;
  ctx.drawImage(image, (size - fitWidth) / 2, (size - fitHeight) / 2, fitWidth, fitHeight);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
  align: CanvasTextAlign = 'left',
) {
  ctx.textAlign = align;
  const words = text.split(' ');
  let line = '';
  let lineCount = 0;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
      lineCount += 1;
      if (lineCount >= maxLines - 1) break;
    } else {
      line = testLine;
    }
  }

  if (line && lineCount < maxLines) {
    ctx.fillText(line, x, y);
  }
}

function drawBottomAlignedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  bottom: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
  align: CanvasTextAlign,
) {
  const lines = wrapLines(ctx, text, maxWidth, maxLines);
  let y = bottom - lines.length * lineHeight;
  ctx.textAlign = align;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines - 1) break;
    } else {
      line = testLine;
    }
  }

  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}
