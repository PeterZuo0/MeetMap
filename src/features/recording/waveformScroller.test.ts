import { expect, test } from "vitest";
import {
  DEFAULT_COLUMN_INTERVAL_MS,
  createWaveformScroller,
  toAmplitude
} from "./waveformScroller";

const LOUD = { level: 0.9, peak: 1 };
const SILENT = { level: 0, peak: 0 };

test("pushes one column per interval and keeps the newest sample on the right", () => {
  const scroller = createWaveformScroller({ columns: 4 });

  scroller.advance(DEFAULT_COLUMN_INTERVAL_MS, LOUD);

  expect(scroller.values.length).toBe(4);
  expect(scroller.values[3]).toBeGreaterThan(0);
  expect(scroller.values[0]).toBe(0);
});

test("carries partial frames instead of dropping them", () => {
  const scroller = createWaveformScroller({ columns: 8 });
  const half = DEFAULT_COLUMN_INTERVAL_MS / 2;

  scroller.advance(half, LOUD);
  expect(scroller.values[7]).toBe(0);

  scroller.advance(half, LOUD);
  expect(scroller.values[7]).toBeGreaterThan(0);
});

test("rises faster than it falls so speech reads as peaks", () => {
  const scroller = createWaveformScroller({ columns: 6 });

  scroller.advance(DEFAULT_COLUMN_INTERVAL_MS, LOUD);
  const attacked = scroller.values[5];
  scroller.advance(DEFAULT_COLUMN_INTERVAL_MS, SILENT);
  const released = scroller.values[5];

  expect(attacked).toBeGreaterThan(released);
  expect(released).toBeGreaterThan(attacked * 0.5);
});

test("caps how many columns a single long frame can produce", () => {
  const scroller = createWaveformScroller({ columns: 64 });

  scroller.advance(DEFAULT_COLUMN_INTERVAL_MS * 40, LOUD);

  expect(scroller.values.filter((value) => value > 0).length).toBeLessThanOrEqual(8);
});

test("idle scrolls a decaying tail without reading new samples", () => {
  const scroller = createWaveformScroller({ columns: 4 });
  scroller.advance(DEFAULT_COLUMN_INTERVAL_MS, LOUD);
  const loud = scroller.values[3];

  scroller.idle(DEFAULT_COLUMN_INTERVAL_MS);

  expect(scroller.values[3]).toBeLessThan(loud);
});

test("resize keeps the newest columns", () => {
  const scroller = createWaveformScroller({ columns: 3 });
  scroller.advance(DEFAULT_COLUMN_INTERVAL_MS * 3, LOUD);
  const newest = scroller.values[2];

  scroller.resize(5);

  expect(scroller.values.length).toBe(5);
  expect(scroller.values[4]).toBe(newest);
});

test("amplitude favours the peak over the average", () => {
  expect(toAmplitude({ level: 0.4, peak: 0.9 })).toBeGreaterThan(toAmplitude({ level: 0.4, peak: 0.4 }));
  expect(toAmplitude(SILENT)).toBe(0);
});
