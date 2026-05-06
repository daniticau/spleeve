import { useCallback, useRef, useState } from 'react';
import { Music, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  hasFiles: boolean;
}

export function FileDropzone({ onFiles, hasFiles }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filterMp3s = (fileList: FileList): File[] =>
    Array.from(fileList).filter(f => f.type === 'audio/mpeg' || f.name.endsWith('.mp3'));

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const mp3s = filterMp3s(e.dataTransfer.files);
      if (mp3s.length > 0) onFiles(mp3s);
    },
    [onFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleClick = () => inputRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const mp3s = e.target.files ? filterMp3s(e.target.files) : [];
    if (mp3s.length > 0) {
      onFiles(mp3s);
      e.target.value = '';
    }
  };

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        'w-full max-w-full cursor-pointer text-center transition-all duration-200',
        isDragging
          ? 'scale-[1.01] bg-primary/10 shadow-lg shadow-primary/15'
          : 'hover:bg-card/80',
        hasFiles
          ? 'rounded-2xl bg-card px-4 py-3 shadow-sm'
          : 'rounded-[1.25rem] bg-card px-6 py-16 shadow-sm',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,audio/mpeg"
        multiple
        onChange={handleChange}
        className="hidden"
      />

      {hasFiles ? (
        <div className="flex h-5 items-center justify-center text-muted-foreground">
          <Upload className="h-3.5 w-3.5" />
          <span className="sr-only">Add MP3 files</span>
        </div>
      ) : (
        <>
          <div className="mx-auto mb-5 flex size-24 items-center justify-center rounded-full bg-primary/15">
            <Music className="size-11 text-primary" />
          </div>
          <p className="text-xl font-semibold text-foreground">
            No tracks yet
          </p>
          <div className="mx-auto mt-7 inline-flex items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20">
            <Upload className="size-5" />
            Import MP3
          </div>
        </>
      )}
    </div>
  );
}
