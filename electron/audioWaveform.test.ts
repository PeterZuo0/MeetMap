import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { createAudioPlaybackTrack } from "./audioWaveform";

test("creates waveform peaks and a file URL for PCM WAV playback", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-waveform-"));

  try {
    const filePath = join(baseDirectory, "system.wav");
    await writeFile(filePath, createPcm16Wav([0, 32767, 0, -32768], 4));

    await expect(createAudioPlaybackTrack("system", filePath, 4)).resolves.toEqual({
      track: "system",
      audioUrl: pathToFileURL(filePath).toString(),
      durationMs: 1000,
      peaks: [0, expect.closeTo(1, 4), 0, 1]
    });
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

function createPcm16Wav(samples: number[], sampleRateHz: number): Buffer {
  const dataByteLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataByteLength);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRateHz, 24);
  buffer.writeUInt32LE(sampleRateHz * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataByteLength, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  return buffer;
}
