export const BAR_WIDTH = 3;
export const BAR_GAP = 3;
export const BAR_PITCH = BAR_WIDTH + BAR_GAP;

const MIN_BAR_HEIGHT = 2;
/** Share of the canvas height used by the tallest possible bar. */
const HEIGHT_RATIO = 0.88;

export type WaveformPalette = {
  accent: string;
  accentStrong: string;
  line: string;
};

export type WaveformPaintOptions = {
  width: number;
  height: number;
  paused: boolean;
  palette: WaveformPalette;
};

/** Number of columns that fit the given CSS width at the current bar pitch. */
export function columnsForWidth(width: number): number {
  return Math.max(1, Math.floor(Math.max(0, width) / BAR_PITCH));
}

/**
 * Paints mirrored bars around a centre line, newest on the right, the way a
 * phone recorder shows live input.
 */
export function paintWaveform(
  context: CanvasRenderingContext2D,
  values: Float32Array,
  { width, height, paused, palette }: WaveformPaintOptions
): void {
  context.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0) {
    return;
  }

  const middle = height / 2;
  const maxBar = height * HEIGHT_RATIO;

  context.globalAlpha = 1;
  context.fillStyle = palette.line;
  context.fillRect(0, middle - 0.5, width, 1);

  const count = values.length;
  const offset = Math.max(0, width - count * BAR_PITCH);
  for (let index = 0; index < count; index += 1) {
    const barHeight = Math.max(MIN_BAR_HEIGHT, values[index] * maxBar);
    const position = count === 1 ? 1 : index / (count - 1);
    const newest = index === count - 1;

    context.globalAlpha = paused ? 0.22 : fadeFor(position);
    context.fillStyle = newest && !paused ? palette.accentStrong : palette.accent;
    context.beginPath();
    context.roundRect(
      offset + index * BAR_PITCH,
      middle - barHeight / 2,
      BAR_WIDTH,
      barHeight,
      BAR_WIDTH / 2
    );
    context.fill();
  }
  context.globalAlpha = 1;
}

/** Older columns recede so they scroll off the left edge instead of clipping. */
function fadeFor(position: number): number {
  const trailing = Math.min(1, position / 0.12);
  return 0.34 + 0.56 * position ** 1.4 * trailing;
}
