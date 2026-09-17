import type { AudioTrackId } from "../meetings/meetingTypes.js";

export type LiveLevelSample = {
  level: number;
  peak: number;
};

export type LiveLevelStream = {
  push(track: AudioTrackId, sample: LiveLevelSample, atMs?: number): void;
  read(atMs?: number): LiveLevelSample;
  reset(): void;
};

/**
 * A track that stops reporting (stopped, muted, or unplugged) must not keep the
 * waveform frozen at its last amplitude, so samples expire after this window.
 */
export const LIVE_LEVEL_STALE_MS = 400;

/**
 * Holds the newest amplitude per audio track outside React state: the native
 * helper reports every 40ms per track, and re-rendering the app that often just
 * to move a waveform is wasteful.
 */
export function createLiveLevelStream(now: () => number = () => Date.now()): LiveLevelStream {
  const latest = new Map<AudioTrackId, LiveLevelSample & { at: number }>();

  return {
    push(track, sample, atMs) {
      const level = clampUnit(sample.level);
      latest.set(track, {
        level,
        peak: Math.max(level, clampUnit(sample.peak)),
        at: atMs ?? now()
      });
    },
    read(atMs) {
      const current = atMs ?? now();
      let level = 0;
      let peak = 0;
      for (const sample of latest.values()) {
        if (current - sample.at > LIVE_LEVEL_STALE_MS) {
          continue;
        }
        level = Math.max(level, sample.level);
        peak = Math.max(peak, sample.peak);
      }
      return { level, peak };
    },
    reset() {
      latest.clear();
    }
  };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
