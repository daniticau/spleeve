import { useMemo } from 'react';
import { Wand2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TagInput } from '@/components/ui/tag-input';
import { Spinner } from '@/components/ui/spinner';
import { CoverArtPicker } from '@/components/cover-art-picker';
import type { TrackMetadata } from '@/lib/metadata/reader';
import type { LoudnessResult } from '@/lib/audio/lufs-meter';
import { calculateReplayGain } from '@/lib/audio/replaygain';

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
  normalizeEnabled: boolean;
  onNormalizeChange: (enabled: boolean) => void;
  loudness: LoudnessResult | null;
  measuring: boolean;
  loudnessError?: boolean;
}

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
  normalizeEnabled,
  onNormalizeChange,
  loudness,
  measuring,
  loudnessError,
}: MetadataEditorProps) {
  const replayGain = useMemo(
    () => loudness ? calculateReplayGain(loudness) : null,
    [loudness],
  );

  const lufsDisplay =
    loudness && isFinite(loudness.integratedLufs)
      ? `${loudness.integratedLufs.toFixed(1)} LUFS`
      : null;

  return (
    <div className="rounded-xl bg-card/60 px-4 pb-4 pt-3 ring-1 ring-white/[0.06]">
      {/* Header row: filename + remove */}
      <div className="mb-1.5 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{fileName}</p>
        <button
          type="button"
          onClick={onRemove}
          className="-mr-2 -mt-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-start gap-6 max-sm:flex-col max-sm:items-center">
        {/* Left column: cover art + search button */}
        <div className="shrink-0">
          <CoverArtPicker
            coverArt={metadata.coverArt}
            coverArtMime={metadata.coverArtMime}
            onImageUpload={onImageUpload}
            onCoverArtSearch={onCoverArtSearch}
            searchQuery={searchQuery}
          />
        </div>

        {/* Right column: metadata fields + action row */}
        <div className="flex flex-1 flex-col">
          <div className="flex h-[200px] flex-col justify-between">
            <Field
              label="Title"
              value={metadata.title}
              onChange={(v) => onChange({ ...metadata, title: v })}
            />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Artists</Label>
              <TagInput
                values={metadata.artists}
                onChange={(artists) => onChange({ ...metadata, artists })}
                placeholder="Add artist..."
              />
            </div>
            <Field
              label="Album"
              value={metadata.album}
              onChange={(v) => onChange({ ...metadata, album: v })}
            />
          </div>

          {/* Action row: auto-fill + normalization — aligned with search button */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <button
              onClick={onAutoFill}
              disabled={autoFilling}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-primary disabled:opacity-50"
            >
              {autoFilling ? (
                <Spinner className="h-3 w-3 animate-spin" />
              ) : (
                <Wand2 className="h-3 w-3" />
              )}
              {autoFilling ? 'Auto-filling...' : 'Auto-fill from filename'}
            </button>

            <div className="ml-auto flex items-center gap-3">
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
                      Gain <span className="font-mono text-foreground">{replayGain.gain}</span>
                    </span>
                  )}
                </>
              ) : null}
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={normalizeEnabled}
                  onCheckedChange={onNormalizeChange}
                />
                <Label className="text-xs text-muted-foreground">Normalize</Label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
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
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
      />
    </div>
  );
}
