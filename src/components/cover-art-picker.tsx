import { useRef, useMemo, useEffect, useState } from 'react';
import { ImageIcon, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { arrayBufferToObjectUrl } from '@/lib/image-utils';
import { CoverArtSearch } from '@/components/cover-art-search';

interface CoverArtPickerProps {
  coverArt: ArrayBuffer | null;
  coverArtMime: string | null;
  onImageUpload: (file: File) => void;
  onCoverArtSearch: (buffer: ArrayBuffer) => void;
  searchQuery: string;
}

export function CoverArtPicker({
  coverArt,
  coverArtMime,
  onImageUpload,
  onCoverArtSearch,
  searchQuery,
}: CoverArtPickerProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(
    () => coverArt && coverArtMime ? arrayBufferToObjectUrl(coverArt, coverArtMime) : null,
    [coverArt, coverArtMime],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageUpload(file);
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        onClick={() => inputRef.current?.click()}
        className="group relative size-[220px] cursor-pointer overflow-hidden rounded-[22px] bg-muted shadow-2xl shadow-black/20 transition-all duration-200 hover:scale-[1.01]"
      >
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt="Cover art"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
              <span className="text-sm font-medium text-white">
                Change image
              </span>
            </div>
          </>
        ) : (
          <GeneratedCover />
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        className="hidden"
      />

      <Button
        variant="secondary"
        size="sm"
        onClick={() => setSearchOpen(true)}
        className="h-auto w-[220px] rounded-2xl bg-card py-3 shadow-sm"
      >
        <Search className="mr-2 h-4 w-4 text-primary" />
        Search Cover Art
      </Button>

      <CoverArtSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={onCoverArtSearch}
        initialQuery={searchQuery}
      />
    </div>
  );
}

function GeneratedCover() {
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-[#e2e6e8] to-[#9aa2a8] p-5 text-[#050505]">
      <p className="relative z-10 max-w-[72%] text-left text-xl font-semibold leading-tight">
        Untitled
      </p>
      <div className="absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#050507] shadow-xl">
        <div className="absolute inset-3 rounded-full border border-white/15" />
        <div className="absolute inset-6 rounded-full border border-white/15" />
        <div className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
        <div className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#cfd4d7]" />
      </div>
      <div className="relative z-10 flex items-center justify-between">
        <span className="text-xs font-semibold">Spleeve</span>
        <div className="flex size-10 items-center justify-center rounded-full bg-black/10">
          <ImageIcon className="size-4" />
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles className="size-4" />
          Add image
        </span>
      </div>
    </div>
  );
}
