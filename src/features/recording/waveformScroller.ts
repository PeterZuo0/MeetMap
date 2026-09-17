import type { LiveLevelSample } from "./liveLevelStream.js";

export type WaveformScrollerOptions = {
  columns: number;
  /** How often a new column is pushed; also sets the scroll speed. */
  columnIntervalMs?: number;
  /** How quickly a column rises toward a louder sample (0-1 per column). */
  attack?: number;
  /** How quickly a column falls toward a quieter sample (0-1 per column). */
  release?: number;
};

export type WaveformScroller = {
  /** Column amplitudes in 0-1, oldest first, newest last. */
  readonly values: Float32Array;
  advance(elapsedMs: number, sample: LiveLevelSample): void;
  /** Scrolls a flat, decaying tail in while recording is paused. */
  idle(elapsedMs: number): void;
  resize(columns: number): void;
  reset(): void;
};

export const DEFAULT_COLUMN_INTERVAL_MS = 38;
const DEFAULT_ATTACK = 0.55;
const DEFAULT_RELEASE = 0.2;
/** Weighting between RMS (body) and short-window peak (snap). */
const PEAK_WEIGHT = 0.4;
/** Silence still draws a hairline so the waveform never disappears. */
const FLOOR = 0.012;
/** Keeps a burst of buffered time from redrawing hundreds of columns at once. */
const MAX_COLUMNS_PER_ADVANCE = 8;

export function createWaveformScroller({
  columns,
  columnIntervalMs = DEFAULT_COLUMN_INTERVAL_MS,
  attack = DEFAULT_ATTACK,
  release = DEFAULT_RELEASE
}: WaveformScrollerOptions): WaveformScroller {
  let values = new Float32Array(Math.max(1, columns));
  let smoothed = 0;
  let carriedMs = 0;

  function pushColumn(target: number): void {
    const rate = target > smoothed ? attack : release;
    smoothed += (target - smoothed) * rate;
    values.copyWithin(0, 1);
    values[values.length - 1] = Math.max(FLOOR, Math.min(1, smoothed));
  }

  function step(elapsedMs: number, target: number): void {
    carriedMs = Math.min(carriedMs + elapsedMs, columnIntervalMs * MAX_COLUMNS_PER_ADVANCE);
    while (carriedMs >= columnIntervalMs) {
      carriedMs -= columnIntervalMs;
      pushColumn(target);
    }
  }

  return {
    get values() {
      return values;
    },
    advance(elapsedMs, sample) {
      step(elapsedMs, toAmplitude(sample));
    },
    idle(elapsedMs) {
      step(elapsedMs, 0);
    },
    resize(nextColumns) {
      const size = Math.max(1, nextColumns);
      if (size === values.length) {
        return;
      }
      const next = new Float32Array(size);
      next.fill(FLOOR);
      const kept = Math.min(size, values.length);
      next.set(values.subarray(values.length - kept), size - kept);
      values = next;
    },
    reset() {
      values.fill(0);
      smoothed = 0;
      carriedMs = 0;
    }
  };
}

/**
 * Levels arrive perceptually normalized already; the curve below only softens
 * the bottom of the range so quiet rooms do not look like a solid block.
 */
export function toAmplitude({ level, peak }: LiveLevelSample): number {
  const blended = level * (1 - PEAK_WEIGHT) + Math.max(level, peak) * PEAK_WEIGHT;
  return Math.max(0, Math.min(1, blended ** 1.2));
}
