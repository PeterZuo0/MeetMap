import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerMeetingIpc } from "./ipc/meetingIpc.js";
import { registerRecordingIpc } from "./ipc/recordingIpc.js";
import { registerSettingsIpc } from "./ipc/settingsIpc.js";
import { registerWorkspaceIpc } from "./ipc/workspaceIpc.js";
import { loadDotEnvFile } from "./envFile.js";
import { resolveMainRuntimeConfig } from "./mainConfig.js";
import { createWorkspaceManager } from "./workspaceManager.js";
import { createWorkspaceMeetingStore } from "./workspaceMeetingStore.js";
import { createSettingsManager } from "./settingsManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

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

  const workspaceManager = createWorkspaceManager({
    configPath: path.join(app.getPath("userData"), "workspace.json")
  });
  await workspaceManager.load();
  const settingsManager = createSettingsManager({
    applyOpenAtStartup: (openAtStartup) => app.setLoginItemSettings({ openAtLogin: openAtStartup }),
    configPath: path.join(app.getPath("userData"), "settings.json"),
    env: process.env
  });
  await settingsManager.load();
  const meetingStore = createWorkspaceMeetingStore(workspaceManager);

  registerSettingsIpc({ settingsManager });
  registerWorkspaceIpc({ workspaceManager });
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
