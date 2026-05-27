import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import type {
  MeetingId,
  MeetingMetadata,
  MeetingPaths
} from "./meetingTypes";

const SAFE_MEETING_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

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

function validateMeetingId(id: MeetingId): void {
  if (!SAFE_MEETING_ID_PATTERN.test(id)) {
    throw new Error("Invalid meeting id");
  }
}

function assertInsideBaseDirectory(baseDirectory: string, path: string): void {
  const relativePath = relative(baseDirectory, path);

  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    throw new Error("Invalid meeting id");
  }
}

export function createMeetingStore(baseDirectory: string): MeetingStore {
  const resolvedBaseDirectory = resolve(baseDirectory);

  function getMeetingPaths(id: MeetingId): MeetingPaths {
    validateMeetingId(id);

    const meetingDir = resolve(resolvedBaseDirectory, id);
    assertInsideBaseDirectory(resolvedBaseDirectory, meetingDir);

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
