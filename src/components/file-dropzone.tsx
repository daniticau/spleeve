import { useCallback, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
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
        'cursor-pointer rounded-xl border border-dashed text-center transition-all duration-200',
        isDragging
          ? 'border-primary bg-primary/5 shadow-[0_0_24px_-6px] shadow-primary/30 scale-[1.01]'
          : 'border-white/10 hover:border-white/20',
        hasFiles ? 'px-4 py-3' : 'px-6 py-8',
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
        <p className="text-xs text-muted-foreground">
          <Upload className="mr-1.5 inline h-3 w-3" />
          Drop or click to add more
        </p>
      ) : (
        <>
          <div className="relative mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Upload className="h-5 w-5 text-primary" />
            <div className="absolute inset-0 rounded-xl bg-primary/5 blur-xl" />
          </div>
          <p className="text-sm font-medium text-foreground">
            Drop your MP3s here
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            or click to browse
          </p>
        </>
      )}
    </div>
  );
}
