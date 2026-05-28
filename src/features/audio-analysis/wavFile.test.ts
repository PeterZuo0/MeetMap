import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWavFileInfo } from "./wavFile";

function createPcmWavFixture({
  channelCount = 1,
  durationMs = 1000,
  sampleRateHz = 16000
}: {
  channelCount?: number;
  durationMs?: number;
  sampleRateHz?: number;
} = {}): Buffer {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const byteRate = sampleRateHz * channelCount * bytesPerSample;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = Math.round((byteRate * durationMs) / 1000);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRateHz, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function createWavWithoutDataChunk(): Buffer {
  const buffer = Buffer.alloc(36);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(28, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);

  return buffer;
}

describe("readWavFileInfo", () => {
  test("reads valid WAV metadata without decoding samples", async () => {
    const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-wav-"));

    try {
      const path = join(baseDirectory, "valid.wav");
      await writeFile(path, createPcmWavFixture());

      await expect(readWavFileInfo(path)).resolves.toEqual({
        byteLength: 32044,
        channelCount: 1,
        durationMs: 1000,
        format: "wav",
        sampleRateHz: 16000
      });
    } finally {
      await rm(baseDirectory, { force: true, recursive: true });
    }
  });

  test("bubbles missing file errors", async () => {
    const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-wav-"));

    try {
      await expect(readWavFileInfo(join(baseDirectory, "missing.wav"))).rejects.toMatchObject({
        code: "ENOENT"
      });
    } finally {
      await rm(baseDirectory, { force: true, recursive: true });
    }
  });

  test("rejects files that are not RIFF/WAVE audio", async () => {
    const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-wav-"));

    try {
      const path = join(baseDirectory, "not-wav.wav");
      await writeFile(path, Buffer.from("not audio"));

      await expect(readWavFileInfo(path)).rejects.toThrow(
        `Input audio is not a RIFF/WAVE file: ${path}`
      );
    } finally {
      await rm(baseDirectory, { force: true, recursive: true });
    }
  });

  test("rejects WAV files with no audio data chunk", async () => {
    const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-wav-"));

    try {
      const path = join(baseDirectory, "empty.wav");
      await writeFile(path, createWavWithoutDataChunk());

      await expect(readWavFileInfo(path)).rejects.toThrow(
        `Input WAV has no audio data: ${path}`
      );
    } finally {
      await rm(baseDirectory, { force: true, recursive: true });
    }
  });
});
