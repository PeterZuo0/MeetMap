import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { AudioTrackId } from "../src/features/meetings/meetingTypes.js";

export type AudioPlaybackTrack = {
  track: AudioTrackId;
  audioUrl: string;
  durationMs: number;
  peaks: number[];
};

type WavFormat = {
  audioFormat: number;
  bitsPerSample: number;
  blockAlign: number;
  channelCount: number;
  sampleRateHz: number;
};

type WavData = {
  dataOffset: number;
  dataSize: number;
  format: WavFormat;
};

export async function createAudioPlaybackTrack(
  track: AudioTrackId,
  filePath: string,
  peakCount = 96
): Promise<AudioPlaybackTrack> {
  const buffer = await readFile(filePath);
  const wav = readWavData(buffer, filePath);

  return {
    track,
    audioUrl: pathToFileURL(filePath).toString(),
    durationMs: Math.round(
      (wav.dataSize / (wav.format.sampleRateHz * wav.format.blockAlign)) * 1000
    ),
    peaks: calculatePeaks(buffer, wav, peakCount)
  };
}

function readWavData(buffer: Buffer, filePath: string): WavData {
  if (
    buffer.byteLength < 12 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error(`Input audio is not a RIFF/WAVE file: ${filePath}`);
  }

  let format: WavFormat | null = null;
  let dataOffset = 0;
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
      format = readFormat(buffer, chunkDataOffset, chunkSize, filePath);
    }

    if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }

    offset = nextOffset;
  }

  if (!format) {
    throw new Error(`Input WAV has no fmt chunk: ${filePath}`);
  }

  if (dataSize <= 0) {
    throw new Error(`Input WAV has no audio data: ${filePath}`);
  }

  return { dataOffset, dataSize, format };
}

function readFormat(buffer: Buffer, offset: number, size: number, filePath: string): WavFormat {
  if (size < 16) {
    throw new Error(`Input WAV has invalid fmt chunk: ${filePath}`);
  }

  const audioFormat = buffer.readUInt16LE(offset);
  const channelCount = buffer.readUInt16LE(offset + 2);
  const sampleRateHz = buffer.readUInt32LE(offset + 4);
  const blockAlign = buffer.readUInt16LE(offset + 12);
  const bitsPerSample = buffer.readUInt16LE(offset + 14);

  if (channelCount <= 0 || sampleRateHz <= 0 || blockAlign <= 0 || bitsPerSample <= 0) {
    throw new Error(`Input WAV has invalid fmt chunk: ${filePath}`);
  }

  return {
    audioFormat,
    bitsPerSample,
    blockAlign,
    channelCount,
    sampleRateHz
  };
}

function calculatePeaks(buffer: Buffer, wav: WavData, peakCount: number): number[] {
  const safePeakCount = Math.max(1, Math.floor(peakCount));
  const bytesPerSample = Math.max(1, wav.format.bitsPerSample / 8);
  const frameCount = Math.floor(wav.dataSize / wav.format.blockAlign);
  const framesPerPeak = Math.max(1, Math.ceil(frameCount / safePeakCount));

  return Array.from({ length: safePeakCount }, (_, peakIndex) => {
    const startFrame = peakIndex * framesPerPeak;
    const endFrame = Math.min(frameCount, startFrame + framesPerPeak);
    let peak = 0;

    for (let frame = startFrame; frame < endFrame; frame += 1) {
      const frameOffset = wav.dataOffset + frame * wav.format.blockAlign;
      for (let channel = 0; channel < wav.format.channelCount; channel += 1) {
        const sampleOffset = frameOffset + channel * bytesPerSample;
        peak = Math.max(peak, Math.abs(readSample(buffer, sampleOffset, wav.format)));
      }
    }

    return Math.max(0, Math.min(1, peak));
  });
}

function readSample(buffer: Buffer, offset: number, format: WavFormat): number {
  if (format.audioFormat === 3 && format.bitsPerSample === 32) {
    return Math.max(-1, Math.min(1, buffer.readFloatLE(offset)));
  }

  if (format.audioFormat !== 1) {
    return 0;
  }

  switch (format.bitsPerSample) {
    case 8:
      return (buffer[offset] - 128) / 128;
    case 16:
      return buffer.readInt16LE(offset) / 32768;
    case 24:
      return readInt24(buffer, offset) / 8388608;
    case 32:
      return buffer.readInt32LE(offset) / 2147483648;
    default:
      return 0;
  }
}

function readInt24(buffer: Buffer, offset: number): number {
  const value = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
  return (value & 0x800000) !== 0 ? value | 0xff000000 : value;
}
