import { BrowserWindow, ipcMain, screen } from "electron";
import type { RecordingWidgetState } from "../src/features/recording/recordingWidget.js";

export function registerRecordingWidget(main: BrowserWindow, preload: string, indexFile: string, devUrl?: string) {
  let widget: BrowserWindow | null = null;
  let state: RecordingWidgetState | null = null;
  const close = () => { widget?.destroy(); widget = null; };
  const update = (event: Electron.IpcMainEvent, next: RecordingWidgetState | null) => {
    if (event.sender !== main.webContents) return;
    state = next;
    if (!state) { close(); return; }
    if (!widget) {
      const area = screen.getDisplayMatching(main.getBounds()).workArea;
      widget = new BrowserWindow({ width: 320, height: 150, x: area.x + area.width - 336, y: area.y + area.height - 166,
        frame: false, resizable: false, closable: false, alwaysOnTop: true, skipTaskbar: true, show: false,
        webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: false } });
      widget.setMenu(null);
      if (devUrl) { const url = new URL(devUrl); url.searchParams.set("recording-widget", "1"); void widget.loadURL(url.toString()); }
      else void widget.loadFile(indexFile, { query: { "recording-widget": "1" } });
    } else widget.webContents.send("recording-widget:state", state);
  };
  const ready = (event: Electron.IpcMainEvent) => {
    if (event.sender !== widget?.webContents || !state) return;
    widget.webContents.send("recording-widget:state", state);
    widget.showInactive();
  };
  const action = (event: Electron.IpcMainEvent, command: string) => {
    if (event.sender !== widget?.webContents || !state || !["open", "pause", "stop"].includes(command)) return;
    if (command === "open" || command === "stop") { main.restore(); main.show(); main.focus(); }
    main.webContents.send("recording-widget:command", command);
  };
  ipcMain.on("recording-widget:update", update);
  ipcMain.on("recording-widget:ready", ready);
  ipcMain.on("recording-widget:action", action);
  main.on("closed", () => {
    close();
    ipcMain.removeListener("recording-widget:update", update);
    ipcMain.removeListener("recording-widget:ready", ready);
    ipcMain.removeListener("recording-widget:action", action);
  });
}
