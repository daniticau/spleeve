import { useRef, useMemo, useEffect } from 'react';
import { ImageIcon } from 'lucide-react';
import { arrayBufferToObjectUrl } from '@/lib/image-utils';

interface CoverArtPickerProps {
  coverArt: ArrayBuffer | null;
  coverArtMime: string | null;
  onImageUpload: (file: File) => void;
}

export function CoverArtPicker({
  coverArt,
  coverArtMime,
  onImageUpload,
}: CoverArtPickerProps) {
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
    <div className="flex flex-col items-center">
      <div
        onClick={() => inputRef.current?.click()}
        className="group relative size-[220px] cursor-pointer overflow-hidden rounded-[22px] bg-muted shadow-2xl shadow-black/20 transition-all duration-200 hover:scale-[1.01]"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Cover art"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center bg-card text-muted-foreground">
            <ImageIcon className="size-12" />
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
    </div>
  );
}
