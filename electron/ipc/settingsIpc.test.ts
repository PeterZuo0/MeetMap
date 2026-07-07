import { beforeEach, expect, test, vi } from "vitest";
import { DEFAULT_APP_SETTINGS } from "../../src/features/settings/appSettings";
import { registerSettingsIpc } from "./settingsIpc";

const electronMock = vi.hoisted(() => ({
  ipcMainHandle: vi.fn()
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: electronMock.ipcMainHandle
  }
}));

type IpcHandler = (event: unknown, ...args: never[]) => Promise<unknown>;

const handlers = new Map<string, IpcHandler>();

beforeEach(() => {
  handlers.clear();
  electronMock.ipcMainHandle.mockReset();
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

test("returns and updates persisted application settings", async () => {
  const settingsManager = {
    get: vi.fn(async () => DEFAULT_APP_SETTINGS),
    getRuntimeStatus: vi.fn(async () => ({
      openAi: {
        configured: true,
        source: ".env or process environment",
        structureModel: "gpt-4.1-mini",
        transcriptionModel: "gpt-4o-mini-transcribe"
      }
    })),
    update: vi.fn(async (settings) => settings)
  };
  registerSettingsIpc({ settingsManager });

  await expect(getHandler("settings:get")(null)).resolves.toEqual(DEFAULT_APP_SETTINGS);
  await expect(
    getHandler("settings:update")(null, {
      ...DEFAULT_APP_SETTINGS,
      uiLanguage: "zh"
    } as never)
  ).resolves.toEqual(expect.objectContaining({ uiLanguage: "zh" }));
});

test("rejects malformed settings updates at the IPC boundary", async () => {
  const settingsManager = {
    get: vi.fn(async () => DEFAULT_APP_SETTINGS),
    getRuntimeStatus: vi.fn(),
    update: vi.fn()
  };
  registerSettingsIpc({ settingsManager });

  await expect(getHandler("settings:update")(null, { uiLanguage: "fr" } as never)).rejects.toThrow(
    "Invalid application settings"
  );
});

test("returns real API runtime status", async () => {
  const status = {
    openAi: {
      configured: false,
      source: "missing OPENAI_API_KEY",
      structureModel: "gpt-4.1-mini",
      transcriptionModel: "gpt-4o-mini-transcribe"
    }
  };
  const settingsManager = {
    get: vi.fn(async () => DEFAULT_APP_SETTINGS),
    getRuntimeStatus: vi.fn(async () => status),
    update: vi.fn()
  };
  registerSettingsIpc({ settingsManager });

  await expect(getHandler("settings:runtime-status")(null)).resolves.toEqual(status);
});
