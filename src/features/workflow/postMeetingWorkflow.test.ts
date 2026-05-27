import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMeetingStore } from "../meetings/meetingStore";
import { processMeeting } from "./postMeetingWorkflow";

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

test("processes a recorded meeting with demo services and persists recoverable progress", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-workflow-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "workflow-demo",
      title: "Workflow Demo",
      outputLanguage: "en"
    });
    const paths = store.getMeetingPaths(meeting.id);

    await store.writeMetadata({
      ...meeting,
      status: "recorded",
      audioTracks: {
        system: {
          id: "system",
          filePath: join(paths.audioDir, "system.wav"),
          format: "wav",
          hasAudio: true
        },
        microphone: {
          id: "microphone",
          filePath: join(paths.audioDir, "microphone.wav"),
          format: "wav",
          hasAudio: true
        }
      }
    });

    const observedSteps: string[] = [];
    const result = await processMeeting({
      store,
      meetingId: meeting.id,
      mode: "demo",
      onStepChange: (step) => observedSteps.push(step)
    });

    expect(result.metadata.status).toBe("completed");
    expect(result.metadata.processingStep).toBe("completed");
    expect(result.metadata.transcriptPath).toBe(paths.transcriptPath);
    expect(result.metadata.structurePath).toBe(paths.structurePath);
    expect(result.metadata.exportPaths).toEqual({
      wordSummaryPath: paths.wordExportPath,
      htmlMeetingMapPath: paths.htmlMapExportPath
    });
    expect(observedSteps).toEqual([
      "activity_detection",
      "transcription",
      "merge",
      "structure_extraction",
      "word_export",
      "html_map_export",
      "completed"
    ]);
    await expect(pathExists(paths.transcriptPath)).resolves.toBe(true);
    await expect(pathExists(paths.structurePath)).resolves.toBe(true);
    await expect(pathExists(paths.wordExportPath)).resolves.toBe(true);
    await expect(pathExists(paths.htmlMapExportPath)).resolves.toBe(true);
    await expect(store.readMetadata(meeting.id)).resolves.toMatchObject({
      status: "completed",
      processingStep: "completed"
    });
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("requires explicit workflow services unless demo mode is enabled", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-workflow-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "workflow-production",
      title: "Workflow Production",
      outputLanguage: "en"
    });

    await expect(
      processMeeting({
        store,
        meetingId: meeting.id
      })
    ).rejects.toThrow("Post-meeting workflow services must be configured");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});
