import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  searchAlbumArt,
  fetchCoverArtAsBuffer,
  type SearchResult,
} from '@/lib/itunes/search';

interface CoverArtSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (coverArt: ArrayBuffer) => void;
  initialQuery: string;
}

export function CoverArtSearch({
  open,
  onOpenChange,
  onSelect,
  initialQuery,
}: CoverArtSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync query when dialog opens
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setResults([]);
      setError(null);
      setFetching(null);
    }
  }, [open, initialQuery]);

  const handleSearch = async () => {
    if (!query.trim()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const data = await searchAlbumArt(query.trim(), controller.signal);
      setResults(data);
      if (data.length === 0) setError('No results found');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleSelect = async (result: SearchResult, index: number) => {
    setFetching(index);
    try {
      const buffer = await fetchCoverArtAsBuffer(result.artworkUrlHiRes);
      onSelect(buffer);
      onOpenChange(false);
    } catch {
      setError('Failed to load image. Try another.');
      setFetching(null);
    }
  };

  // Deduplicate by hi-res URL (same album art appears for multiple tracks)
  const seen = new Set<string>();
  const uniqueResults = results.filter((r) => {
    if (seen.has(r.artworkUrlHiRes)) return false;
    seen.add(r.artworkUrlHiRes);
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search Cover Art</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by song, artist, album..."
            autoFocus
          />
          <Button onClick={handleSearch} disabled={loading}>
            {loading ? <Spinner className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-muted-foreground">{error}</p>
        )}

        {uniqueResults.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {uniqueResults.map((result, i) => {
              const originalIndex = results.indexOf(result);
              const isFetching = fetching === originalIndex;

              return (
                <button
                  key={`${result.artworkUrlHiRes}-${i}`}
                  onClick={() => handleSelect(result, originalIndex)}
                  disabled={fetching !== null}
                  className="group relative overflow-hidden rounded-lg border border-border bg-muted transition-all hover:border-primary hover:ring-2 hover:ring-primary/25 disabled:opacity-50"
                >
                  <div className="aspect-square">
                    <img
                      src={result.artworkUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  {isFetching && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <Spinner className="h-5 w-5 animate-spin text-white" />
                    </div>
                  )}
                  <div className="px-1.5 py-1">
                    <p className="truncate text-[10px] leading-tight text-muted-foreground">
                      {result.artists[0]} — {result.album}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
