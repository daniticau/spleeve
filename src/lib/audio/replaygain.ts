import type { LoudnessResult } from './lufs-meter';

/** Spotify "Normal" mode target */
export const TARGET_LUFS = -14;

export interface ReplayGainResult {
  gain: string;
  peak: string;
  gainDb: number;
  targetLufs: number;
}

export function calculateReplayGain(
  loudness: LoudnessResult,
): ReplayGainResult {
  const gainDb = TARGET_LUFS - loudness.integratedLufs;

  const peakLinear =
    loudness.truePeakDbfs > -Infinity
      ? Math.pow(10, loudness.truePeakDbfs / 20)
      : 1.0;

  const gainStr = `${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(2)} dB`;
  const peakStr = peakLinear.toFixed(6);

  return {
    gain: gainStr,
    peak: peakStr,
    gainDb,
    targetLufs: TARGET_LUFS,
  };
}
