import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";

import {
  createFfmpegAudioChunker,
  shouldChunkAudioTrack
} from "./audioChunking";

describe("audio chunking", () => {
  test("decides when recorded audio should be chunked", () => {
    expect(
      shouldChunkAudioTrack({
        id: "system",
        filePath: "system.m4a",
        format: "m4a",
        hasAudio: true,
        byteLength: 25_000_000
      })
    ).toBe(true);
    expect(
      shouldChunkAudioTrack({
        id: "system",
        filePath: "system.wav",
        format: "wav",
        hasAudio: true,
        durationMs: 60_000,
        byteLength: 1_000_000
      })
    ).toBe(false);
  });

  test("creates overlapped transcription chunk requests from ffmpeg output files", async () => {
    const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-audio-chunks-"));
    const chunksDir = join(baseDirectory, "audio", "chunks");
    const calls: Array<{ command: string; args: string[] }> = [];
    const chunker = createFfmpegAudioChunker({
      now: () => 1234,
      async probeDurationMs(filePath) {
        if (filePath.endsWith("0000.m4a")) {
          return 300_000;
        }
        if (filePath.endsWith("0001.m4a")) {
          return 305_000;
        }
        return 25_000;
      },
      async run(command, args) {
        calls.push({ command, args });
        const outputPath = args[args.length - 1];
        if (!outputPath) {
          throw new Error("missing output path");
        }
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `chunk ${calls.length}`);
      }
    });

    const requests = await chunker.createChunks({
      baseRequest: {
        trackId: "system",
        uploadSeparateTracks: true
      },
      chunksDir,
      maxChunkDurationMs: 300_000,
      meetingId: "meeting-1",
      trackId: "system",
      track: {
        id: "system",
        filePath: join(baseDirectory, "audio", "system.m4a"),
        format: "m4a",
        hasAudio: true,
        durationMs: 620_000
      }
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({
      command: "ffmpeg",
      args: expect.arrayContaining(["-ss", "0", "-t", "300", "-c", "copy"])
    });
    expect(calls[1]).toMatchObject({
      command: "ffmpeg",
      args: expect.arrayContaining(["-ss", "295", "-t", "305", "-c", "copy"])
    });
    expect(calls[2]).toMatchObject({
      command: "ffmpeg",
      args: expect.arrayContaining(["-ss", "595", "-t", "25", "-c", "copy"])
    });
    expect(requests).toEqual([
      expect.objectContaining({
        id: "meeting-1-system-0001",
        index: 0,
        filePath: join(chunksDir, "system-1234", "system-0000.m4a"),
        startOffsetMs: 0,
        durationMs: 300_000
      }),
      expect.objectContaining({
        id: "meeting-1-system-0002",
        index: 1,
        filePath: join(chunksDir, "system-1234", "system-0001.m4a"),
        startOffsetMs: 295_000,
        durationMs: 305_000
      }),
      expect.objectContaining({
        id: "meeting-1-system-0003",
        index: 2,
        filePath: join(chunksDir, "system-1234", "system-0002.m4a"),
        startOffsetMs: 595_000,
        durationMs: 25_000
      })
    ]);
  });
});