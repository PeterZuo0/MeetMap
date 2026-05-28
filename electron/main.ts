import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMeetingStore } from "../src/features/meetings/meetingStore.js";
import { registerMeetingIpc } from "./ipc/meetingIpc.js";
import { registerRecordingIpc } from "./ipc/recordingIpc.js";
import { loadDotEnvFile } from "./envFile.js";
import { resolveMainRuntimeConfig } from "./mainConfig.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const meetingStore = createMeetingStore(path.join(app.getPath("userData"), "meetings"));

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 860,
    minHeight: 560,
    title: "MeetMap",
    backgroundColor: "#f7f8fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  void window.loadFile(path.join(__dirname, "../../dist/index.html"));
}

app.whenReady().then(async () => {
  await loadDotEnvFile({
    filePath: path.join(process.cwd(), ".env"),
    env: process.env
  });

  const runtimeConfig = resolveMainRuntimeConfig({
    env: process.env,
    argv: process.argv,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged
  });

  if (runtimeConfig.demoMode) {
    console.warn(
      "MeetMap demo mode is enabled; demo workflow and audio providers will create fake local artifacts."
    );
  }

  registerMeetingIpc({
    store: meetingStore,
    ...runtimeConfig.meetingIpc
  });
  registerRecordingIpc({
    store: meetingStore,
    ...runtimeConfig.recordingIpc
  });
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
