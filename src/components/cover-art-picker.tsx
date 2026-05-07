import { useRef, useMemo, useEffect } from 'react';
import { arrayBufferToObjectUrl } from '@/lib/image-utils';

interface CoverArtPickerProps {
  coverArt: ArrayBuffer | null;
  coverArtMime: string | null;
  title: string;
  artist: string;
  onImageUpload: (file: File) => void;
}

export function CoverArtPicker({
  coverArt,
  coverArtMime,
  title,
  artist,
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
          <>
            <img
              src={previewUrl}
              alt="Cover art"
              className="h-full w-full object-cover"
            />
          </>
        ) : (
          <GeneratedCover title={title} artist={artist} />
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

function GeneratedCover({ title, artist }: { title: string; artist: string }) {
  const displayTitle = title.trim() || 'Untitled';
  const displayArtist = artist.trim();

  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-[#e2e6e8] to-[#9aa2a8] text-[#050505]">
      <p className="absolute left-[8%] top-[8%] z-10 line-clamp-4 max-h-[34%] w-[84%] text-left text-[19px] font-semibold leading-tight">
        {displayTitle}
      </p>
      <div className="absolute left-1/2 top-1/2 aspect-square w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#050507] shadow-xl">
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
        <div className="absolute left-1/2 top-1/2 aspect-square w-[5.5%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#cfd4d7]" />
      </div>
      {displayArtist && (
        <p className="absolute bottom-[8%] right-[8%] z-10 flex aspect-square w-[28%] items-end justify-end text-right text-[19px] font-semibold leading-tight">
          {displayArtist}
        </p>
      )}
    </div>
  );
}
