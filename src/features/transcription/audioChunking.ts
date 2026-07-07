import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import type { AudioTrackId, AudioTrackMetadata, MeetingId } from "../meetings/meetingTypes.js";
import type { TranscriptionChunkRequest } from "./transcriptionClient.js";

export const DEFAULT_TRANSCRIPTION_CHUNK_DURATION_MS = 5 * 60 * 1000;
export const DEFAULT_TRANSCRIPTION_CHUNK_OVERLAP_MS = 5 * 1000;
export const DEFAULT_WHOLE_FILE_TRANSCRIPTION_BYTE_LIMIT = 10 * 1024 * 1024;

export type AudioChunker = {
  createChunks(input: AudioChunkerInput): Promise<TranscriptionChunkRequest[]>;
};

export type AudioChunkerInput = {
  baseRequest: Omit<TranscriptionChunkRequest, "durationMs" | "filePath" | "id" | "index" | "startOffsetMs">;
  chunkOverlapMs?: number;
  chunksDir: string;
  maxChunkDurationMs: number;
  meetingId: MeetingId;
  track: AudioTrackMetadata;
  trackId: AudioTrackId;
};

export type FfmpegAudioChunkerDependencies = {
  now?: () => number;
  probeDurationMs?: (filePath: string) => Promise<number | undefined>;
  run?: (command: string, args: string[]) => Promise<void>;
};

export function shouldChunkAudioTrack(
  track: AudioTrackMetadata,
  maxChunkDurationMs = DEFAULT_TRANSCRIPTION_CHUNK_DURATION_MS,
  maxWholeFileBytes = DEFAULT_WHOLE_FILE_TRANSCRIPTION_BYTE_LIMIT
): boolean {
  if (track.durationMs !== undefined && track.durationMs > maxChunkDurationMs) {
    return true;
  }

  return (track.byteLength ?? 0) > maxWholeFileBytes;
}

export function createFfmpegAudioChunker(
  dependencies: FfmpegAudioChunkerDependencies = {}
): AudioChunker {
  const run = dependencies.run ?? runProcess;
  const probeDurationMs = dependencies.probeDurationMs ?? safeProbeAudioDurationMs;
  const now = dependencies.now ?? Date.now;

  return {
    async createChunks(input) {
      const chunkDirectory = join(input.chunksDir, `${input.trackId}-${now()}`);
      const extension = getChunkExtension(input.track);
      const sourceDurationMs = input.track.durationMs ?? await probeDurationMs(input.track.filePath);

      await mkdir(chunkDirectory, { recursive: true });

      if (sourceDurationMs === undefined) {
        return createFixedSegmentChunks({
          chunkDirectory,
          extension,
          input,
          probeDurationMs,
          run
        });
      }

      const chunkCount = Math.max(1, Math.ceil(sourceDurationMs / input.maxChunkDurationMs));
      const overlapMs = normalizeOverlapMs(input.chunkOverlapMs ?? DEFAULT_TRANSCRIPTION_CHUNK_OVERLAP_MS, input.maxChunkDurationMs);
      const requests: TranscriptionChunkRequest[] = [];

      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const nominalStartMs = chunkIndex * input.maxChunkDurationMs;
        const startOffsetMs = chunkIndex === 0 ? 0 : Math.max(0, nominalStartMs - overlapMs);
        const chunkEndMs = Math.min(sourceDurationMs, nominalStartMs + input.maxChunkDurationMs);
        const requestedDurationMs = Math.max(0, chunkEndMs - startOffsetMs);
        const filePath = join(chunkDirectory, `${input.trackId}-${String(chunkIndex).padStart(4, "0")}.${extension}`);

        await run("ffmpeg", [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          formatSeconds(startOffsetMs),
          "-i",
          input.track.filePath,
          "-t",
          formatSeconds(requestedDurationMs),
          "-avoid_negative_ts",
          "make_zero",
          "-c",
          "copy",
          filePath
        ]);

        const probedDurationMs = await probeDurationMs(filePath);
        requests.push({
          ...input.baseRequest,
          id: `${input.meetingId}-${input.trackId}-${String(chunkIndex + 1).padStart(4, "0")}`,
          index: chunkIndex,
          trackId: input.trackId,
          filePath,
          startOffsetMs,
          durationMs: probedDurationMs ?? requestedDurationMs
        });
      }

      return requests;
    }
  };
}

async function createFixedSegmentChunks({
  chunkDirectory,
  extension,
  input,
  probeDurationMs,
  run
}: {
  chunkDirectory: string;
  extension: "m4a" | "wav";
  input: AudioChunkerInput;
  probeDurationMs(filePath: string): Promise<number | undefined>;
  run(command: string, args: string[]): Promise<void>;
}): Promise<TranscriptionChunkRequest[]> {
  const outputPattern = join(chunkDirectory, `${input.trackId}-%04d.${extension}`);
  const segmentSeconds = Math.max(1, Math.ceil(input.maxChunkDurationMs / 1000));

  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input.track.filePath,
    "-f",
    "segment",
    "-segment_time",
    String(segmentSeconds),
    "-reset_timestamps",
    "1",
    "-c",
    "copy",
    outputPattern
  ]);

  const chunkFiles = (await readdir(chunkDirectory))
    .filter((fileName) => fileName.toLowerCase().endsWith(`.${extension}`))
    .sort();

  if (chunkFiles.length === 0) {
    throw new Error(`Audio chunking produced no chunks for ${input.track.filePath}`);
  }

  const requests: TranscriptionChunkRequest[] = [];
  let startOffsetMs = 0;
  for (const [chunkIndex, fileName] of chunkFiles.entries()) {
    const filePath = join(chunkDirectory, fileName);
    const probedDurationMs = await probeDurationMs(filePath);
    const durationMs = probedDurationMs ?? fallbackChunkDurationMs(input, chunkIndex, chunkFiles.length);
    requests.push({
      ...input.baseRequest,
      id: `${input.meetingId}-${input.trackId}-${String(chunkIndex + 1).padStart(4, "0")}`,
      index: chunkIndex,
      trackId: input.trackId,
      filePath,
      startOffsetMs,
      durationMs
    });
    startOffsetMs += durationMs;
  }

  return requests;
}

function fallbackChunkDurationMs(
  input: AudioChunkerInput,
  chunkIndex: number,
  chunkCount: number
): number {
  if (chunkIndex === chunkCount - 1 && input.track.durationMs !== undefined) {
    return Math.max(0, input.track.durationMs - chunkIndex * input.maxChunkDurationMs);
  }

  return input.maxChunkDurationMs;
}

function normalizeOverlapMs(overlapMs: number, maxChunkDurationMs: number): number {
  return Math.max(0, Math.min(Math.floor(maxChunkDurationMs / 2), Math.floor(overlapMs)));
}

function formatSeconds(valueMs: number): string {
  return String(Math.max(0, valueMs / 1000));
}

function getChunkExtension(track: AudioTrackMetadata): "m4a" | "wav" {
  if (track.format === "m4a") {
    return "m4a";
  }

  const extension = extname(track.filePath).toLowerCase();
  return extension === ".m4a" ? "m4a" : "wav";
}

async function safeProbeAudioDurationMs(filePath: string): Promise<number | undefined> {
  try {
    const output = await runProcessWithOutput("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    const seconds = Number(output.trim());
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined;
  } catch {
    return undefined;
  }
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(new Error(`Audio chunking failed to start ${command}: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Audio chunking failed with ${command} exit code ${code}: ${stderr.trim()}`));
    });
  });
}

function runProcessWithOutput(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      reject(new Error(`Audio probing failed to start ${command}: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`Audio probing failed with ${command} exit code ${code}: ${stderr.trim()}`));
    });
  });
}