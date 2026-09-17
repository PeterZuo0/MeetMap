import { beforeEach, expect, test, vi } from "vitest";
const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => void>(),
  windows: [] as Array<Record<string, unknown>>,
  send: vi.fn(), destroy: vi.fn(), show: vi.fn(), loadFile: vi.fn()
}));
vi.mock("electron", () => ({
  ipcMain: {
    on: (name: string, callback: (...args: unknown[]) => void) => mock.handlers.set(name, callback),
    removeListener: (name: string) => mock.handlers.delete(name)
  },
  screen: { getDisplayMatching: () => ({ workArea: { x: 100, y: 0, width: 1200, height: 800 } }) },
  BrowserWindow: class {
    webContents = { send: mock.send };
    constructor(options: Record<string, unknown>) { mock.windows.push(options); }
    setMenu = vi.fn(); loadFile = mock.loadFile; loadURL = vi.fn();
    showInactive = mock.show; destroy = mock.destroy;
  }
}));
import { registerRecordingWidget } from "./recordingWidget";
import type { BrowserWindow } from "electron";
beforeEach(() => { vi.clearAllMocks(); mock.handlers.clear(); mock.windows.length = 0; });

test("opens a screen-edge always-on-top widget only for its owner and removes it on stop", () => {
  const owner = { webContents: { send: vi.fn() }, getBounds: vi.fn(), on: vi.fn(), restore: vi.fn(), show: vi.fn(), focus: vi.fn() };
  registerRecordingWidget(owner as unknown as BrowserWindow, "preload.js", "index.html");
  const state = { title: "会议", elapsed: "00:10", paused: false, busy: false };
  mock.handlers.get("recording-widget:update")!({ sender: {} }, state);
  expect(mock.windows).toHaveLength(0);
  mock.handlers.get("recording-widget:update")!({ sender: owner.webContents }, state);
  expect(mock.windows[0]).toMatchObject({ alwaysOnTop: true, x: 964, y: 634, frame: false });
  expect(mock.loadFile).toHaveBeenCalledWith("index.html", { query: { "recording-widget": "1" } });
  mock.handlers.get("recording-widget:action")!({ sender: {} }, "stop");
  expect(owner.webContents.send).not.toHaveBeenCalled();
  mock.handlers.get("recording-widget:update")!({ sender: owner.webContents }, null);
  expect(mock.destroy).toHaveBeenCalledTimes(1);
});
