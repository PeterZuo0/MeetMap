import { readFile } from "node:fs/promises";

export type WavFileInfo = {
  byteLength: number;
  channelCount: number;
  durationMs: number;
  format: "wav";
  sampleRateHz: number;
};

type FmtChunkInfo = {
  byteRate: number;
  channelCount: number;
  sampleRateHz: number;
};

export async function readWavFileInfo(path: string): Promise<WavFileInfo> {
  const buffer = await readFile(path);

  assertRiffWave(buffer, path);

  let fmtChunk: FmtChunkInfo | null = null;
  let dataSize = 0;
  let offset = 12;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;
    const nextOffset = chunkDataOffset + chunkSize + (chunkSize % 2);

    if (chunkDataOffset + chunkSize > buffer.byteLength) {
      break;
    }

    if (chunkId === "fmt ") {
      fmtChunk = readFmtChunk(buffer, chunkDataOffset, chunkSize, path);
    }

    if (chunkId === "data") {
      dataSize = chunkSize;
    }

    offset = nextOffset;
  }

  if (!fmtChunk) {
    throw new Error(`Input WAV has no fmt chunk: ${path}`);
  }

  if (dataSize <= 0) {
    throw new Error(`Input WAV has no audio data: ${path}`);
  }

  return {
    byteLength: buffer.byteLength,
    channelCount: fmtChunk.channelCount,
    durationMs: Math.round((dataSize / fmtChunk.byteRate) * 1000),
    format: "wav",
    sampleRateHz: fmtChunk.sampleRateHz
  };
}

function assertRiffWave(buffer: Buffer, path: string): void {
  if (
    buffer.byteLength < 12 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error(`Input audio is not a RIFF/WAVE file: ${path}`);
  }
}

function readFmtChunk(
  buffer: Buffer,
  offset: number,
  size: number,
  path: string
): FmtChunkInfo {
  if (size < 16) {
    throw new Error(`Input WAV has invalid fmt chunk: ${path}`);
  }

  const channelCount = buffer.readUInt16LE(offset + 2);
  const sampleRateHz = buffer.readUInt32LE(offset + 4);
  const byteRate = buffer.readUInt32LE(offset + 8);

  if (channelCount <= 0 || sampleRateHz <= 0 || byteRate <= 0) {
    throw new Error(`Input WAV has invalid fmt chunk: ${path}`);
  }

  return {
    byteRate,
    channelCount,
    sampleRateHz
  };
}
