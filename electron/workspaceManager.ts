import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type WorkspaceState = {
  currentPath: string | null;
  recentPaths: string[];
};

export type WorkspaceManager = {
  getMeetingsDirectory(): string;
  getState(): Promise<WorkspaceState>;
  load(): Promise<WorkspaceState>;
  setCurrentWorkspace(folderPath: string): Promise<WorkspaceState>;
};

type WorkspaceConfig = Partial<WorkspaceState>;

const MAX_RECENT_WORKSPACES = 6;

export function createWorkspaceManager({
  configPath
}: {
  configPath: string;
}): WorkspaceManager {
  let state: WorkspaceState = {
    currentPath: null,
    recentPaths: []
  };
  let loaded = false;

  async function load(): Promise<WorkspaceState> {
    try {
      state = normalizeState(JSON.parse(await readFile(configPath, "utf8")) as WorkspaceConfig);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }

    loaded = true;
    return state;
  }

  async function getState(): Promise<WorkspaceState> {
    if (!loaded) {
      await load();
    }

    return state;
  }

  async function setCurrentWorkspace(folderPath: string): Promise<WorkspaceState> {
    const currentPath = resolve(folderPath);
    await mkdir(join(currentPath, "meetings"), { recursive: true });
    const recentPaths = [
      currentPath,
      ...state.recentPaths.filter((item) => item !== currentPath)
    ].slice(0, MAX_RECENT_WORKSPACES);

    state = { currentPath, recentPaths };
    loaded = true;
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    return state;
  }

  function getMeetingsDirectory(): string {
    if (!state.currentPath) {
      throw new Error("Workspace folder is required");
    }

    return join(state.currentPath, "meetings");
  }

  return {
    getMeetingsDirectory,
    getState,
    load,
    setCurrentWorkspace
  };
}

function normalizeState(input: WorkspaceConfig): WorkspaceState {
  const currentPath = typeof input.currentPath === "string" && input.currentPath.trim()
    ? resolve(input.currentPath)
    : null;
  const recentPaths = Array.isArray(input.recentPaths)
    ? input.recentPaths
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => resolve(item))
    : [];

  return {
    currentPath,
    recentPaths: [...new Set(currentPath ? [currentPath, ...recentPaths] : recentPaths)].slice(0, MAX_RECENT_WORKSPACES)
  };
}
