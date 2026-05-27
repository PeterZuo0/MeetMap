import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  MeetingId,
  MeetingMetadata,
  MeetingPaths
} from "./meetingTypes";

export type CreateMeetingInput = {
  id?: MeetingId;
  title: string;
  outputLanguage: MeetingMetadata["outputLanguage"];
};

export type MeetingStore = {
  createMeeting(input: CreateMeetingInput): Promise<MeetingMetadata>;
  readMetadata(id: MeetingId): Promise<MeetingMetadata>;
  writeMetadata(metadata: MeetingMetadata): Promise<void>;
  getMeetingPaths(id: MeetingId): MeetingPaths;
};

export function createMeetingStore(baseDirectory: string): MeetingStore {
  function getMeetingPaths(id: MeetingId): MeetingPaths {
    const meetingDir = join(baseDirectory, id);
    const audioDir = join(meetingDir, "audio");
    const exportsDir = join(meetingDir, "exports");

    return {
      meetingDir,
      metadataPath: join(meetingDir, "metadata.json"),
      audioDir,
      chunksDir: join(audioDir, "chunks"),
      exportsDir,
      logsDir: join(meetingDir, "logs"),
      transcriptPath: join(meetingDir, "transcript.json"),
      structurePath: join(meetingDir, "structure.json"),
      wordExportPath: join(exportsDir, "meeting-summary.docx"),
      htmlMapExportPath: join(exportsDir, "meeting-map.html")
    };
  }

  async function writeMetadata(metadata: MeetingMetadata): Promise<void> {
    const paths = getMeetingPaths(metadata.id);
    await mkdir(paths.meetingDir, { recursive: true });
    await writeFile(
      paths.metadataPath,
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8"
    );
  }

  async function createMeeting(input: CreateMeetingInput): Promise<MeetingMetadata> {
    const id = input.id ?? randomUUID();
    const paths = getMeetingPaths(id);
    const createdAt = new Date().toISOString();
    const metadata: MeetingMetadata = {
      id,
      title: input.title,
      status: "setup",
      outputLanguage: input.outputLanguage,
      timestamps: {
        createdAt,
        updatedAt: createdAt
      },
      audioTracks: {},
      transcriptPath: null,
      structurePath: null,
      exportPaths: {
        wordSummaryPath: null,
        htmlMeetingMapPath: null
      }
    };

    await Promise.all([
      mkdir(paths.chunksDir, { recursive: true }),
      mkdir(paths.exportsDir, { recursive: true }),
      mkdir(paths.logsDir, { recursive: true })
    ]);
    await writeMetadata(metadata);

    return metadata;
  }

  async function readMetadata(id: MeetingId): Promise<MeetingMetadata> {
    const paths = getMeetingPaths(id);
    const metadataJson = await readFile(paths.metadataPath, "utf8");
    return JSON.parse(metadataJson) as MeetingMetadata;
  }

  return {
    createMeeting,
    readMetadata,
    writeMetadata,
    getMeetingPaths
  };
}
