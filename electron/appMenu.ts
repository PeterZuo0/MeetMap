import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import { sendIfAlive } from "./ipc/sendIfAlive.js";

export const OPEN_SETTINGS_CHANNEL = "app:open-settings";

export function createApplicationMenuTemplate(
  openSettings: () => void
): MenuItemConstructorOptions[] {
  return [
    {
      label: "File",
      submenu: [{ role: "quit" }]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          accelerator: "Ctrl+,",
          click: openSettings,
          label: "Settings…"
        }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    }
  ];
}

export function installApplicationMenu(): void {
  const template = createApplicationMenuTemplate(() => {
    const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (targetWindow && !targetWindow.isDestroyed()) sendIfAlive(targetWindow.webContents, OPEN_SETTINGS_CHANNEL);
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
