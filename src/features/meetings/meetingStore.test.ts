import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
      outputLanguage: "bilingual"
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
      diarizationPath: join(baseDirectory, "meeting-123", "diarization.json"),
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

test("lists persisted meetings newest first and ignores non-meeting folders", async () => {
  const baseDirectory = await createTempMeetingDirectory();

  try {
    const store = createMeetingStore(baseDirectory);
    const olderMeeting = await store.createMeeting({
      id: "older-meeting",
      title: "Older Meeting",
      outputLanguage: "en"
    });
    const newerMeeting = await store.createMeeting({
      id: "newer-meeting",
      title: "Newer Meeting",
      outputLanguage: "zh"
    });
    await store.writeMetadata({
      ...olderMeeting,
      timestamps: {
        ...olderMeeting.timestamps,
        updatedAt: "2026-05-27T06:00:00.000Z"
      }
    });
    await store.writeMetadata({
      ...newerMeeting,
      timestamps: {
        ...newerMeeting.timestamps,
        updatedAt: "2026-05-28T06:00:00.000Z"
      }
    });
    await writeFile(join(baseDirectory, "README.txt"), "not a meeting", "utf8");

    await expect(store.listMeetings()).resolves.toEqual([
      expect.objectContaining({ id: "newer-meeting", title: "Newer Meeting" }),
      expect.objectContaining({ id: "older-meeting", title: "Older Meeting" })
    ]);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("lists no meetings when the meetings root has not been created yet", async () => {
  const baseDirectory = join(await createTempMeetingDirectory(), "missing");

  await expect(createMeetingStore(baseDirectory).listMeetings()).resolves.toEqual([]);
});

test.each(["../outside", "..\\outside", "nested/id", ""])(
  "rejects unsafe meeting id %j without creating files outside the meetings root",
  async (unsafeId) => {
    const baseDirectory = await createTempMeetingDirectory();
    const outsidePath = join(dirname(baseDirectory), "outside");

    try {
      const store = createMeetingStore(baseDirectory);

      expect(() => store.getMeetingPaths(unsafeId)).toThrow("Invalid meeting id");
      await expect(
        store.createMeeting({
          id: unsafeId,
          title: "Unsafe",
          outputLanguage: "bilingual"
        })
      ).rejects.toThrow("Invalid meeting id");
      await expect(store.readMetadata(unsafeId)).rejects.toThrow("Invalid meeting id");
      await expect(
        store.writeMetadata({
          id: unsafeId,
          title: "Unsafe",
          status: "setup",
          outputLanguage: "bilingual",
          timestamps: {
            createdAt: "2026-05-27T06:00:00.000Z",
            updatedAt: "2026-05-27T06:00:00.000Z"
          },
          audioTracks: {},
          transcriptPath: null,
          structurePath: null,
          exportPaths: {
            wordSummaryPath: null,
            htmlMeetingMapPath: null
          }
        })
      ).rejects.toThrow("Invalid meeting id");

      await expect(pathExists(outsidePath)).resolves.toBe(false);
    } finally {
      await rm(baseDirectory, { force: true, recursive: true });
      await rm(outsidePath, { force: true, recursive: true });
    }
  }
);
