import { useRef, useMemo, useEffect, useState } from 'react';
import { ImageIcon, Search } from 'lucide-react';
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
        className="group relative h-[200px] w-[200px] cursor-pointer overflow-hidden rounded-xl border border-white/[0.06] bg-muted shadow-lg shadow-black/25 transition-all duration-200 hover:border-primary/40 hover:shadow-primary/10"
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
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="h-10 w-10 text-primary/40" />
            <span className="text-xs">Upload cover art</span>
          </div>
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
        variant="outline"
        size="sm"
        onClick={() => setSearchOpen(true)}
        className="w-[200px]"
      >
        <Search className="mr-2 h-4 w-4" />
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
