import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AudioWaveform,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  ImageIcon,
  Paintbrush,
  Scissors,
  Search,
  Sparkles,
  Tag,
  Wand2,
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
import { TagInput } from '@/components/ui/tag-input';
import { Spinner } from '@/components/ui/spinner';
import { CoverArtPicker } from '@/components/cover-art-picker';
import { CoverArtSearch } from '@/components/cover-art-search';
import { WaveformEditor } from '@/components/waveform-editor';
import type { TrackMetadata } from '@/lib/metadata/reader';
import type { LoudnessResult } from '@/lib/audio/lufs-meter';
import type { WaveformData } from '@/lib/audio/waveform';
import { calculateReplayGain } from '@/lib/audio/replaygain';
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

type EditorSheet = 'cover' | 'crop' | 'normalize' | 'export' | null;
type ContentRating = TrackMetadata['contentRating'];

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

  const replayGain = useMemo(
    () => loudness ? calculateReplayGain(loudness) : null,
    [loudness],
  );

  const lufsDisplay =
    loudness && isFinite(loudness.integratedLufs)
      ? `${loudness.integratedLufs.toFixed(1)} LUFS`
      : null;

  const trimDuration = waveform ? trimEnd - trimStart : 0;
  const isTrimmed = Boolean(waveform && (trimStart > 0 || trimEnd < waveform.duration));

  const updateMetadata = useCallback((updates: Partial<TrackMetadata>) => {
    onChange({ ...metadata, ...updates });
  }, [metadata, onChange]);

  const applyGeneratedCover = useCallback(async (styleIndex = 0) => {
    const [background, backgroundEnd, text] = COVER_STYLES[styleIndex];
    const coverArt = await generateTextCover({
      title: metadata.title,
      artist: metadata.artists[0] ?? '',
      background,
      backgroundEnd,
      text,
    });
    updateMetadata({ coverArt, coverArtMime: 'image/jpeg' });
    setActiveSheet(null);
  }, [metadata.artists, metadata.title, updateMetadata]);

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

      <div className="relative mb-6 flex min-h-[300px] items-center justify-center overflow-hidden rounded-[1.5rem] bg-card">
        <HeroBlur coverArt={metadata.coverArt} coverArtMime={metadata.coverArtMime} />
        <div className="relative z-10">
          <CoverArtPicker
            coverArt={metadata.coverArt}
            coverArtMime={metadata.coverArtMime}
            onImageUpload={onImageUpload}
            onCoverArtSearch={onCoverArtSearch}
            searchQuery={searchQuery}
          />
        </div>
      </div>

      <div className="space-y-5">
        <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
          <Field
            label="Title"
            value={metadata.title}
            onChange={(v) => updateMetadata({ title: v })}
          />
          <Separator />
          <div className="grid grid-cols-[76px_minmax(0,1fr)] items-center gap-3 px-4 py-3.5">
            <Label className="text-sm font-medium text-muted-foreground">Artist</Label>
            <TagInput
              values={metadata.artists}
              onChange={(artists) => updateMetadata({ artists })}
              placeholder="Add artist..."
            />
          </div>
          <Separator />
          <Field
            label="Album"
            value={metadata.album}
            onChange={(v) => updateMetadata({ album: v })}
          />
        </div>

        <section className="space-y-2">
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

        <section className="space-y-2">
          <SectionHeader>Tools</SectionHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ToolButton
              icon={autoFilling ? <Spinner className="size-5" /> : <Wand2 className="size-5" />}
              label={autoFilling ? 'Finding' : 'Auto'}
              onClick={onAutoFill}
              disabled={autoFilling}
            />
            <ToolButton icon={<Search className="size-5" />} label="Search" onClick={() => setSearchOpen(true)} />
            <ToolButton icon={<Paintbrush className="size-5" />} label="Cover" onClick={() => setActiveSheet('cover')} />
            <ToolButton icon={<Sparkles className="size-5" />} label="Polish" onClick={() => void makeSpotifyLike()} />
          </div>
        </section>

        <section className="space-y-2">
          <SectionHeader>Audio</SectionHeader>
          <div className="overflow-hidden rounded-2xl bg-card shadow-sm">
            <ToolRow
              icon={<Scissors className="size-4" />}
              title="Crop Length"
              subtitle={
                waveform
                  ? isTrimmed
                    ? `Trimmed to ${formatTime(trimDuration)} (from ${formatTime(waveform.duration)})`
                    : `Full length · ${formatTime(waveform.duration)}`
                  : 'Preparing waveform'
              }
              tint="orange"
              onClick={() => setActiveSheet('crop')}
            />
            <Separator />
            <ToolRow
              icon={<AudioWaveform className="size-4" />}
              title="Normalize Loudness"
              subtitle={
                normalizeEnabled && lufsDisplay
                  ? `Matched to -14 LUFS (was ${lufsDisplay})`
                  : "Match Spotify's -14 LUFS standard"
              }
              tint="green"
              onClick={() => setActiveSheet('normalize')}
            />
          </div>
        </section>

        {waveform && (
          <section className="space-y-2">
            <div className="rounded-2xl bg-card p-4 shadow-sm">
              <WaveformEditor
                waveform={waveform}
                audioBuffer={audioBuffer}
                trimStart={trimStart}
                trimEnd={trimEnd}
                onTrimChange={onTrimChange}
              >
                <LoudnessInline
                  measuring={measuring}
                  loudnessError={loudnessError}
                  lufsDisplay={lufsDisplay}
                  replayGain={replayGain?.gain}
                  normalizeEnabled={normalizeEnabled}
                  onNormalizeChange={onNormalizeChange}
                />
              </WaveformEditor>
            </div>
          </section>
        )}
      </div>

      <CoverArtSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={onCoverArtSearch}
        initialQuery={searchQuery}
      />

      <Dialog open={activeSheet === 'cover'} onOpenChange={(open) => !open && setActiveSheet(null)}>
        <DialogContent className="max-w-xl rounded-3xl p-5">
          <DialogHeader>
            <DialogTitle>Color Style</DialogTitle>
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
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => updateMetadata({ coverArt: null, coverArtMime: null })}>
              Remove Cover
            </Button>
            <Button className="rounded-2xl" onClick={() => void applyGeneratedCover(0)}>
              Generate Spleeve Cover
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle>Normalize</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-6">
            <div className="relative grid size-48 place-items-center rounded-full border-[14px] border-primary/15">
              <div className="absolute inset-[-14px] rounded-full border-[14px] border-primary border-l-transparent border-b-transparent" />
              {normalizeEnabled ? (
                <CheckCircle2 className="size-16 text-primary" />
              ) : lufsDisplay ? (
                <div className="text-center">
                  <div className="text-4xl font-bold tabular-nums">{lufsDisplay.replace(' LUFS', '')}</div>
                  <div className="text-xs font-semibold text-muted-foreground">LUFS</div>
                </div>
              ) : (
                <AudioWaveform className="size-14 text-primary" />
              )}
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold">
                {normalizeEnabled ? 'Matched to Spotify' : measuring ? 'Analyzing loudness...' : 'Ready to normalize'}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {lufsDisplay
                  ? `Apply ${replayGain?.gain ?? '+0.0 dB'} to target -14 LUFS.`
                  : "Spotify targets -14 LUFS so tracks sit at a consistent volume."}
              </p>
            </div>
            {lufsDisplay && (
              <div className="grid w-full grid-cols-2 divide-x divide-border rounded-2xl bg-card py-4 shadow-sm">
                <TimeBlock label="Before" value={lufsDisplay.replace(' LUFS', '')} unit="LUFS" />
                <TimeBlock label="Target" value="-14.0" unit="LUFS" accent />
              </div>
            )}
            <Button
              className="w-full rounded-2xl py-6"
              disabled={measuring}
              onClick={() => {
                onNormalizeChange(true);
                setActiveSheet(null);
              }}
            >
              {normalizeEnabled ? 'Done' : 'Normalize'}
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

function HeroBlur({
  coverArt,
  coverArtMime,
}: {
  coverArt: ArrayBuffer | null;
  coverArtMime: string | null;
}) {
  const previewUrl = useMemo(
    () => coverArt && coverArtMime ? URL.createObjectURL(new Blob([coverArt], { type: coverArtMime })) : null,
    [coverArt, coverArtMime],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!previewUrl) {
    return <div className="absolute inset-0 bg-gradient-to-br from-[#e2e6e8] to-[#9aa2a8] opacity-70" />;
  }

  return (
    <img
      src={previewUrl}
      alt=""
      className="absolute inset-0 h-full w-full scale-125 object-cover opacity-55 blur-3xl"
    />
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <h2 className="px-1 text-xs font-semibold uppercase tracking-normal text-muted-foreground">
      {children}
    </h2>
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
      className="flex flex-col items-center gap-2 rounded-2xl bg-card px-3 py-4 text-sm font-medium text-foreground shadow-sm transition enabled:hover:-translate-y-0.5 disabled:cursor-default"
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
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  tint: 'green' | 'orange';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-4 text-left shadow-sm transition hover:bg-secondary"
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
      className="relative aspect-square overflow-hidden p-3 text-left"
      style={{
        color: text,
        background: `linear-gradient(135deg, ${background}, ${backgroundEnd})`,
      }}
    >
      <div className="relative z-10 line-clamp-3 text-sm font-semibold leading-tight">
        {cleanField(title) || 'Untitled'}
      </div>
      <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#050507]">
        <div className="absolute inset-3 rounded-full border border-white/15" />
        <div className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
      </div>
      {artist && (
        <div className="absolute bottom-3 right-3 max-w-[60%] truncate text-right text-[0.65rem] font-semibold">
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
}: {
  title: string;
  artist: string;
  background: string;
  backgroundEnd: string;
  text: string;
}): Promise<ArrayBuffer> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const gradient = ctx.createLinearGradient(0, 0, 1200, 1200);
  gradient.addColorStop(0, background);
  gradient.addColorStop(1, backgroundEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 1200);

  ctx.save();
  ctx.translate(600, 600);
  ctx.fillStyle = '#050507';
  ctx.beginPath();
  ctx.arc(0, 0, 285, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 6;
  for (const radius of [90, 140, 190, 240]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#1DB954';
  ctx.beginPath();
  ctx.arc(0, 0, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = text;
  ctx.font = '700 72px Geist, system-ui, sans-serif';
  wrapText(ctx, cleanField(title) || 'Untitled', 88, 115, 760, 84, 4);
  if (artist) {
    ctx.font = '700 42px Geist, system-ui, sans-serif';
    ctx.textAlign = 'right';
    wrapText(ctx, artist, 1110, 1030, 520, 54, 2, 'right');
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not encode cover')), 'image/jpeg', 0.92);
  });
  return blob.arrayBuffer();
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
