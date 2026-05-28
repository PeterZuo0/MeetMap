import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decideVoiceActivity } from "../audio-analysis/voiceActivity";
import type { MeetingStructure } from "../intelligence/meetingStructure";
import type { PostMeetingWorkflowServices } from "./postMeetingWorkflow";
import { parseProductionSmokeArgs, runProductionSmoke } from "./productionSmokeRunner";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function createPcmWavFixture(): Buffer {
  const sampleRateHz = 16000;
  const channelCount = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const byteRate = sampleRateHz * channelCount * bytesPerSample;
  const dataSize = byteRate;
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
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function createFakeWorkflowServices(): PostMeetingWorkflowServices {
  return {
    async detectActivity(tracks) {
      return decideVoiceActivity({
        tracks: {
          system: tracks.system
            ? {
                id: "system",
                hasSpeech: tracks.system.hasAudio,
                durationMs: tracks.system.durationMs
              }
            : undefined,
          microphone: tracks.microphone
            ? {
                id: "microphone",
                hasSpeech: tracks.microphone.hasAudio,
                durationMs: tracks.microphone.durationMs
              }
            : undefined
        }
      });
    },

    async transcribe(tracksToProcess) {
      return tracksToProcess.map((trackId, index) => ({
        id: `segment-${trackId}`,
        trackId,
        startTimeMs: index * 1000,
        endTimeMs: index * 1000 + 900,
        text: `${trackId} transcript`,
        language: "en",
        confidence: 0.98
      }));
    },

    async extractStructure(transcript, metadata) {
      const firstSegment = transcript[0]!;
      const refs = [
        {
          segmentId: firstSegment.id,
          startTimeMs: firstSegment.startTimeMs,
          endTimeMs: firstSegment.endTimeMs
        }
      ];

      return {
        metadata: {
          meetingId: metadata.id,
          title: metadata.title,
          startedAt: metadata.timestamps.recordingStartedAt ?? metadata.timestamps.createdAt,
          endedAt: metadata.timestamps.recordingEndedAt,
          sourceLanguage: "en",
          outputLanguage: metadata.outputLanguage
        },
        summary: "Smoke summary",
        topics: [
          {
            id: "topic-1",
            type: "topic",
            title: "Smoke topic",
            summary: "Smoke topic summary",
            sourceRefs: refs
          }
        ],
        points: [],
        decisions: [
          {
            id: "decision-1",
            type: "decision",
            text: "The smoke runner works",
            topicId: "topic-1",
            sourceRefs: refs
          }
        ],
        actionItems: [],
        openQuestions: [],
        risks: [],
        relations: []
      } satisfies MeetingStructure;
    }
  };
}

describe("runProductionSmoke", () => {
  test("requires explicit cloud upload consent", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "meetmap-smoke-"));

    try {
      await expect(
        runProductionSmoke(
          {
            allowCloudUpload: false,
            dataDir,
            meetingId: "manual-smoke",
            outputLanguage: "en",
            title: "Manual smoke"
          },
          { workflowServices: createFakeWorkflowServices() }
        )
      ).rejects.toThrow("Production smoke requires --allow-cloud-upload.");
    } finally {
      await rm(dataDir, { force: true, recursive: true });
    }
  });

  test("requires at least one audio source", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "meetmap-smoke-"));

    try {
      await expect(
        runProductionSmoke(
          {
            allowCloudUpload: true,
            dataDir,
            meetingId: "manual-smoke",
            outputLanguage: "en",
            title: "Manual smoke"
          },
          { workflowServices: createFakeWorkflowServices() }
        )
      ).rejects.toThrow("No audio source was provided.");
    } finally {
      await rm(dataDir, { force: true, recursive: true });
    }
  });

  test("copies WAV inputs, processes the meeting, and returns artifact paths", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "meetmap-smoke-data-"));
    const inputDir = await mkdtemp(join(tmpdir(), "meetmap-smoke-input-"));

    try {
      const systemAudioPath = join(inputDir, "system-source.wav");
      const microphoneAudioPath = join(inputDir, "microphone-source.wav");
      await writeFile(systemAudioPath, createPcmWavFixture());
      await writeFile(microphoneAudioPath, createPcmWavFixture());

      const report = await runProductionSmoke(
        {
          allowCloudUpload: true,
          dataDir,
          meetingId: "manual-smoke",
          microphoneAudioPath,
          outputLanguage: "bilingual",
          systemAudioPath,
          title: "Manual smoke"
        },
        { workflowServices: createFakeWorkflowServices() }
      );

      expect(report).toEqual({
        htmlMapExportPath: join(dataDir, "manual-smoke", "exports", "meeting-map.html"),
        meetingDir: join(dataDir, "manual-smoke"),
        meetingId: "manual-smoke",
        structurePath: join(dataDir, "manual-smoke", "structure.json"),
        transcriptPath: join(dataDir, "manual-smoke", "transcript.json"),
        wordExportPath: join(dataDir, "manual-smoke", "exports", "meeting-summary.docx")
      });
      await expect(pathExists(join(dataDir, "manual-smoke", "audio", "system.wav"))).resolves.toBe(true);
      await expect(pathExists(join(dataDir, "manual-smoke", "audio", "microphone.wav"))).resolves.toBe(true);
      await expect(pathExists(report.transcriptPath)).resolves.toBe(true);
      await expect(pathExists(report.structurePath)).resolves.toBe(true);
      await expect(pathExists(report.wordExportPath)).resolves.toBe(true);
      await expect(pathExists(report.htmlMapExportPath)).resolves.toBe(true);

      const metadata = JSON.parse(
        await readFile(join(dataDir, "manual-smoke", "metadata.json"), "utf8")
      );
      expect(metadata).toMatchObject({
        status: "completed",
        audioTracks: {
          system: {
            byteLength: 32044,
            channelCount: 1,
            durationMs: 1000,
            format: "wav",
            hasAudio: true,
            sampleRateHz: 16000
          },
          microphone: {
            byteLength: 32044,
            channelCount: 1,
            durationMs: 1000,
            format: "wav",
            hasAudio: true,
            sampleRateHz: 16000
          }
        }
      });
    } finally {
      await rm(dataDir, { force: true, recursive: true });
      await rm(inputDir, { force: true, recursive: true });
    }
  });
});

describe("parseProductionSmokeArgs", () => {
  test("maps cloud consent and audio path flags", () => {
    expect(
      parseProductionSmokeArgs([
        "--meeting-id",
        "manual-smoke",
        "--title",
        "Manual smoke",
        "--data-dir",
        "C:\\meetings",
        "--system-audio",
        "C:\\input\\system.wav",
        "--microphone-audio",
        "C:\\input\\microphone.wav",
        "--output-language",
        "bilingual",
        "--allow-cloud-upload"
      ])
    ).toEqual({
      allowCloudUpload: true,
      dataDir: "C:\\meetings",
      meetingId: "manual-smoke",
      microphoneAudioPath: "C:\\input\\microphone.wav",
      outputLanguage: "bilingual",
      systemAudioPath: "C:\\input\\system.wav",
      title: "Manual smoke"
    });
  });

  test("leaves cloud consent false when the flag is missing", () => {
    expect(
      parseProductionSmokeArgs([
        "--meeting-id",
        "manual-smoke",
        "--title",
        "Manual smoke",
        "--data-dir",
        "C:\\meetings"
      ])
    ).toMatchObject({
      allowCloudUpload: false
    });
  });

  test("ignores the pnpm argument separator when forwarded to the script", () => {
    expect(
      parseProductionSmokeArgs([
        "--",
        "--meeting-id",
        "manual-smoke",
        "--title",
        "Manual smoke",
        "--data-dir",
        "C:\\meetings",
        "--microphone-audio",
        "C:\\input\\microphone.wav",
        "--allow-cloud-upload"
      ])
    ).toMatchObject({
      allowCloudUpload: true,
      dataDir: "C:\\meetings",
      meetingId: "manual-smoke",
      microphoneAudioPath: "C:\\input\\microphone.wav",
      title: "Manual smoke"
    });
  });

  test("rejects unsupported output language values", () => {
    expect(() =>
      parseProductionSmokeArgs([
        "--meeting-id",
        "manual-smoke",
        "--title",
        "Manual smoke",
        "--data-dir",
        "C:\\meetings",
        "--output-language",
        "klingon"
      ])
    ).toThrow("Unsupported output language: klingon");
  });
});
