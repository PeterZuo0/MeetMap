import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, expect, test, vi } from "vitest";
import { createMeetingStore } from "../../src/features/meetings/meetingStore";
import type { MeetingMetadata } from "../../src/features/meetings/meetingTypes";
import { registerMeetingIpc } from "./meetingIpc";

const electronMock = vi.hoisted(() => ({
  ipcMainHandle: vi.fn(),
  shellOpenPath: vi.fn()
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMock.ipcMainHandle
  },
  shell: {
    openPath: electronMock.shellOpenPath
  }
}));

type IpcHandler = (event: unknown, ...args: never[]) => Promise<unknown>;

const handlers = new Map<string, IpcHandler>();

beforeEach(() => {
  handlers.clear();
  electronMock.ipcMainHandle.mockReset();
  electronMock.shellOpenPath.mockReset();
  electronMock.shellOpenPath.mockResolvedValue("");
  electronMock.ipcMainHandle.mockImplementation(
    (channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    }
  );
});

function getHandler(channel: string): IpcHandler {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing IPC handler: ${channel}`);
  }

  return handler;
}

test("creates meetings with the selected summary style", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    registerMeetingIpc({ store });

    const meeting = await getHandler("meeting:create")(null, {
      title: "Planning",
      outputLanguage: "en",
      summaryStyle: "highlights"
    } as never);

    expect((meeting as MeetingMetadata).summaryStyle).toBe("highlights");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("does not process a meeting with silent demo workflow services", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "meeting-production",
      title: "Meeting Production",
      outputLanguage: "en"
    });

    registerMeetingIpc({ store });

    await expect(
      getHandler("meeting:process")(null, meeting.id as never)
    ).rejects.toThrow("Post-meeting workflow services must be configured");
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("opens the fixed export path instead of a tampered metadata path", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-meeting-ipc-"));

  try {
    const store = createMeetingStore(baseDirectory);
    const meeting = await store.createMeeting({
      id: "tampered-export",
      title: "Tampered Export",
      outputLanguage: "en"
    });
    const paths = store.getMeetingPaths(meeting.id);
    await mkdir(paths.exportsDir, { recursive: true });
    await writeFile(paths.wordExportPath, "fixed export");
    await store.writeMetadata({
      ...meeting,
      status: "completed",
      exportPaths: {
        wordSummaryPath: "C:\\Users\\peter.z\\Documents\\tampered.docx",
        htmlMeetingMapPath: null
      }
    } satisfies MeetingMetadata);

    registerMeetingIpc({ store });

    await getHandler("meeting:open-export")(null, {
      meetingId: meeting.id,
      kind: "word"
    } as never);

    expect(electronMock.shellOpenPath).toHaveBeenCalledWith(paths.wordExportPath);
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});
