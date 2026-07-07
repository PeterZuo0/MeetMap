import { dialog, ipcMain, shell } from "electron";
import type { WorkspaceManager, WorkspaceState } from "../workspaceManager.js";

export type WorkspaceIpcContext = {
  workspaceManager: WorkspaceManager;
};

export function registerWorkspaceIpc({
  workspaceManager
}: WorkspaceIpcContext): void {
  ipcMain.handle("workspace:get", async (): Promise<WorkspaceState> => {
    return workspaceManager.getState();
  });

  ipcMain.handle("workspace:choose-folder", async (): Promise<WorkspaceState> => {
    const result = await dialog.showOpenDialog({
      buttonLabel: "Use this folder",
      properties: ["openDirectory", "createDirectory"],
      title: "Choose MeetMap workspace folder"
    });

    if (result.canceled || !result.filePaths[0]) {
      return workspaceManager.getState();
    }

    return workspaceManager.setCurrentWorkspace(result.filePaths[0]);
  });

  ipcMain.handle("workspace:use-folder", async (_event, folderPath: unknown): Promise<WorkspaceState> => {
    if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
      throw new Error("Invalid workspace folder");
    }

    return workspaceManager.setCurrentWorkspace(folderPath);
  });

  ipcMain.handle("workspace:reveal-folder", async (): Promise<void> => {
    const state = await workspaceManager.getState();
    if (!state.currentPath) {
      throw new Error("Workspace folder is required");
    }

    const openResult = await shell.openPath(state.currentPath);
    if (openResult) {
      throw new Error(openResult);
    }
  });
}
