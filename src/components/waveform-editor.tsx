import { useRef, useEffect, useCallback, useState, type ReactNode } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import type { WaveformData } from '@/lib/audio/waveform';

interface WaveformEditorProps {
  waveform: WaveformData;
  audioBuffer: AudioBuffer | null;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  children?: ReactNode;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

const MIN_TRIM_GAP = 0.1; // seconds
const HANDLE_WIDTH = 10; // px

export function WaveformEditor({
  waveform,
  audioBuffer,
  trimStart,
  trimEnd,
  onTrimChange,
  children,
}: WaveformEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);

  const { duration, peaks } = waveform;

  const [playerState, controls] = useAudioPlayer(audioBuffer, trimStart, trimEnd);

  // Track canvas size via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasWidth === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const height = 64;
    canvas.width = canvasWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvasWidth, height);

    const numPeaks = peaks.length;
    const barWidth = canvasWidth / numPeaks;
    const centerY = height / 2;
    const maxBarHeight = centerY - 2;

    const trimStartFrac = duration > 0 ? trimStart / duration : 0;
    const trimEndFrac = duration > 0 ? trimEnd / duration : 1;

    // Compute CSS variable colors
    const styles = getComputedStyle(canvas);
    const primaryColor = styles.getPropertyValue('color') || '#22c55e';

    for (let i = 0; i < numPeaks; i++) {
      const frac = i / numPeaks;
      const inRegion = frac >= trimStartFrac && frac <= trimEndFrac;

      const amplitude = peaks[i];
      const barHeight = Math.max(1, amplitude * maxBarHeight);

      const x = i * barWidth;

      if (inRegion) {
        ctx.fillStyle = primaryColor;
        ctx.globalAlpha = 0.9;
      } else {
        ctx.fillStyle = primaryColor;
        ctx.globalAlpha = 0.15;
      }

      ctx.fillRect(x, centerY - barHeight, barWidth - 0.5, barHeight * 2);
    }

    ctx.globalAlpha = 1;
  }, [peaks, canvasWidth, trimStart, trimEnd, duration]);

  // Handle dragging
  const draggingRef = useRef<'start' | 'end' | null>(null);

  const timeFromClientX = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container || duration === 0) return 0;
    const rect = container.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return frac * duration;
  }, [duration]);

  const onPointerDown = useCallback((e: React.PointerEvent, handle: 'start' | 'end') => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = handle;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const time = timeFromClientX(e.clientX);

    if (draggingRef.current === 'start') {
      const newStart = Math.max(0, Math.min(time, trimEnd - MIN_TRIM_GAP));
      onTrimChange(newStart, trimEnd);
    } else {
      const newEnd = Math.min(duration, Math.max(time, trimStart + MIN_TRIM_GAP));
      onTrimChange(trimStart, newEnd);
    }
  }, [timeFromClientX, trimStart, trimEnd, duration, onTrimChange]);

  const onPointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // Click-to-seek on waveform (not on handles)
  const onCanvasClick = useCallback((e: React.MouseEvent) => {
    const time = timeFromClientX(e.clientX);
    controls.seek(time);
  }, [timeFromClientX, controls]);

  const startPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPct = duration > 0 ? (trimEnd / duration) * 100 : 100;
  const playheadPct = duration > 0 ? (playerState.currentTime / duration) * 100 : 0;

  const isTrimmed = trimStart > 0 || (duration > 0 && trimEnd < duration);
  const trimDuration = trimEnd - trimStart;

  const handleReset = useCallback(() => {
    onTrimChange(0, duration);
  }, [duration, onTrimChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {/* Play/Pause button */}
        <button
          type="button"
          onClick={controls.toggle}
          disabled={!audioBuffer}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-50"
        >
          {playerState.playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </button>

        {/* Waveform area */}
        <div
          ref={containerRef}
          className="relative min-w-0 flex-1 cursor-pointer select-none"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <canvas
            ref={canvasRef}
            className="block w-full text-primary"
            style={{ height: 64 }}
            onClick={onCanvasClick}
          />

          {/* Left trim handle */}
          <div
            className="absolute top-0 bottom-0 z-10 cursor-col-resize"
            style={{
              left: `calc(${startPct}% - ${HANDLE_WIDTH / 2}px)`,
              width: HANDLE_WIDTH,
            }}
            onPointerDown={(e) => onPointerDown(e, 'start')}
          >
            <div className="mx-auto h-full w-[3px] rounded-full bg-foreground/70 transition-colors hover:bg-foreground" />
          </div>

          {/* Right trim handle */}
          <div
            className="absolute top-0 bottom-0 z-10 cursor-col-resize"
            style={{
              left: `calc(${endPct}% - ${HANDLE_WIDTH / 2}px)`,
              width: HANDLE_WIDTH,
            }}
            onPointerDown={(e) => onPointerDown(e, 'end')}
          >
            <div className="mx-auto h-full w-[3px] rounded-full bg-foreground/70 transition-colors hover:bg-foreground" />
          </div>

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-foreground"
            style={{ left: `${playheadPct}%` }}
          />
        </div>
      </div>

      {/* Time display + reset + children — below the waveform */}
      <div className="flex h-6 items-center gap-2 pl-9">
        <span className="font-mono text-xs text-muted-foreground">
          {formatTime(playerState.currentTime)}
          <span className="text-muted-foreground/50"> / </span>
          {formatTime(trimDuration)}
        </span>
        <button
          type="button"
          onClick={handleReset}
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground ${isTrimmed ? 'visible' : 'invisible'}`}
          title="Reset trim"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset</span>
        </button>
        {children}
      </div>
    </div>
  );
}
