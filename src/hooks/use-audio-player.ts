import { useRef, useState, useCallback, useEffect } from 'react';

export interface AudioPlayerState {
  playing: boolean;
  currentTime: number;
  duration: number;
}

export interface AudioPlayerControls {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (time: number) => void;
}

export function useAudioPlayer(
  audioBuffer: AudioBuffer | null,
  regionStart: number,
  regionEnd: number,
): [AudioPlayerState, AudioPlayerControls] {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(regionStart);

  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  // Wall-clock time (from AudioContext.currentTime) when playback started
  const startCtxTimeRef = useRef(0);
  // The region offset we started playing from
  const startOffsetRef = useRef(regionStart);

  const duration = audioBuffer?.duration ?? 0;

  const stopSource = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
      } catch {
        // already stopped
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const updateTime = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !sourceRef.current) return;
    const elapsed = ctx.currentTime - startCtxTimeRef.current;
    const time = Math.min(startOffsetRef.current + elapsed, regionEnd);
    setCurrentTime(time);
    if (time < regionEnd) {
      rafRef.current = requestAnimationFrame(updateTime);
    }
  }, [regionEnd]);

  const play = useCallback(() => {
    if (!audioBuffer) return;

    // Lazy-create AudioContext (browser autoplay policy)
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    const ctx = ctxRef.current;

    // Resume if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    stopSource();

    const offset = startOffsetRef.current;
    const playDuration = regionEnd - offset;
    if (playDuration <= 0) {
      // At end of region — restart from regionStart
      startOffsetRef.current = regionStart;
      // Recurse with updated offset
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      startCtxTimeRef.current = ctx.currentTime;
      startOffsetRef.current = regionStart;

      source.onended = () => {
        setPlaying(false);
        setCurrentTime(regionEnd);
        sourceRef.current = null;
      };

      source.start(0, regionStart, regionEnd - regionStart);
      sourceRef.current = source;
      setPlaying(true);
      setCurrentTime(regionStart);
      rafRef.current = requestAnimationFrame(updateTime);
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    startCtxTimeRef.current = ctx.currentTime;

    source.onended = () => {
      setPlaying(false);
      setCurrentTime(regionEnd);
      sourceRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    source.start(0, offset, playDuration);
    sourceRef.current = source;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(updateTime);
  }, [audioBuffer, regionStart, regionEnd, stopSource, updateTime]);

  const pause = useCallback(() => {
    if (!ctxRef.current || !sourceRef.current) return;
    const elapsed = ctxRef.current.currentTime - startCtxTimeRef.current;
    const paused = Math.min(startOffsetRef.current + elapsed, regionEnd);
    startOffsetRef.current = paused;
    stopSource();
    setPlaying(false);
    setCurrentTime(paused);
  }, [regionEnd, stopSource]);

  const toggle = useCallback(() => {
    if (playing) {
      pause();
    } else {
      play();
    }
  }, [playing, play, pause]);

  const seek = useCallback((time: number) => {
    const clamped = Math.max(regionStart, Math.min(time, regionEnd));
    startOffsetRef.current = clamped;
    setCurrentTime(clamped);

    if (playing) {
      // Restart playback from new position
      if (!audioBuffer || !ctxRef.current) return;
      stopSource();

      const ctx = ctxRef.current;
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      startCtxTimeRef.current = ctx.currentTime;
      startOffsetRef.current = clamped;

      source.onended = () => {
        setPlaying(false);
        setCurrentTime(regionEnd);
        sourceRef.current = null;
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = 0;
        }
      };

      source.start(0, clamped, regionEnd - clamped);
      sourceRef.current = source;
      rafRef.current = requestAnimationFrame(updateTime);
    }
  }, [audioBuffer, playing, regionStart, regionEnd, stopSource, updateTime]);

  // When region bounds change, clamp the current position
  useEffect(() => {
    if (startOffsetRef.current < regionStart) {
      startOffsetRef.current = regionStart;
      setCurrentTime(regionStart);
    }
    if (startOffsetRef.current > regionEnd) {
      startOffsetRef.current = regionStart;
      setCurrentTime(regionStart);
    }
    // If playing and current position is past regionEnd, stop
    if (playing && currentTime >= regionEnd) {
      pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionStart, regionEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSource();
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {});
        ctxRef.current = null;
      }
    };
  }, [stopSource]);

  return [
    { playing, currentTime, duration },
    { play, pause, toggle, seek },
  ];
}
