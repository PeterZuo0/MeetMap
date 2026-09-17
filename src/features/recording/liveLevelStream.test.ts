import { expect, test } from "vitest";
import { LIVE_LEVEL_STALE_MS, createLiveLevelStream } from "./liveLevelStream";

test("combines the loudest recent sample across tracks", () => {
  const stream = createLiveLevelStream(() => 1_000);
  stream.push("system", { level: 0.2, peak: 0.3 });
  stream.push("microphone", { level: 0.5, peak: 0.9 });

  expect(stream.read()).toEqual({ level: 0.5, peak: 0.9 });
});

test("clamps samples into the unit range and never reports a peak below the level", () => {
  const stream = createLiveLevelStream(() => 0);
  stream.push("system", { level: 1.4, peak: Number.NaN });

  expect(stream.read()).toEqual({ level: 1, peak: 1 });
});

test("drops samples from a track that stopped reporting", () => {
  const stream = createLiveLevelStream(() => 0);
  stream.push("system", { level: 0.8, peak: 0.8 }, 0);
  stream.push("microphone", { level: 0.1, peak: 0.2 }, LIVE_LEVEL_STALE_MS);

  expect(stream.read(LIVE_LEVEL_STALE_MS + 1)).toEqual({ level: 0.1, peak: 0.2 });
});

test("reset clears the retained samples", () => {
  const stream = createLiveLevelStream(() => 0);
  stream.push("system", { level: 0.6, peak: 0.7 });
  stream.reset();

  expect(stream.read()).toEqual({ level: 0, peak: 0 });
});
