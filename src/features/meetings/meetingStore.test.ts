import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMeetingStore } from "./meetingStore";

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

async function createTempMeetingDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "meetmap-meetings-"));
}

test("creates a deterministic meeting folder layout", async () => {
  const baseDirectory = await createTempMeetingDirectory();

  try {
    const store = createMeetingStore(baseDirectory);

    const meeting = await store.createMeeting({
      id: "meeting-123",
      title: "Weekly Sync",
      outputLanguage: "auto"
    });

    const paths = store.getMeetingPaths(meeting.id);

    expect(paths).toEqual({
      meetingDir: join(baseDirectory, "meeting-123"),
      metadataPath: join(baseDirectory, "meeting-123", "metadata.json"),
      audioDir: join(baseDirectory, "meeting-123", "audio"),
      chunksDir: join(baseDirectory, "meeting-123", "audio", "chunks"),
      exportsDir: join(baseDirectory, "meeting-123", "exports"),
      logsDir: join(baseDirectory, "meeting-123", "logs"),
      transcriptPath: join(baseDirectory, "meeting-123", "transcript.json"),
      structurePath: join(baseDirectory, "meeting-123", "structure.json"),
      wordExportPath: join(baseDirectory, "meeting-123", "exports", "meeting-summary.docx"),
      htmlMapExportPath: join(baseDirectory, "meeting-123", "exports", "meeting-map.html")
    });

    await expect(pathExists(paths.metadataPath)).resolves.toBe(true);
    await expect(pathExists(paths.audioDir)).resolves.toBe(true);
    await expect(pathExists(paths.chunksDir)).resolves.toBe(true);
    await expect(pathExists(paths.exportsDir)).resolves.toBe(true);
    await expect(pathExists(paths.logsDir)).resolves.toBe(true);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("persists meeting metadata as JSON", async () => {
  const baseDirectory = await createTempMeetingDirectory();

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "meeting-456",
      title: "Planning",
      outputLanguage: "en"
    });

    const updatedMetadata = {
      ...meeting,
      title: "Planning Follow-up",
      status: "completed" as const,
      timestamps: {
        ...meeting.timestamps,
        updatedAt: "2026-05-27T06:00:00.000Z",
        completedAt: "2026-05-27T06:00:00.000Z"
      }
    };

    await store.writeMetadata(updatedMetadata);

    await expect(store.readMetadata("meeting-456")).resolves.toEqual(updatedMetadata);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});
