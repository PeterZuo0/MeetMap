import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspaceManager } from "./workspaceManager";

test("persists the current workspace and keeps recent paths newest first", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-workspace-manager-"));

  try {
    const manager = createWorkspaceManager({
      configPath: join(baseDirectory, "workspace.json")
    });
    const firstWorkspace = join(baseDirectory, "First");
    const secondWorkspace = join(baseDirectory, "Second");

    await expect(manager.getState()).resolves.toEqual({
      currentPath: null,
      recentPaths: []
    });

    await manager.setCurrentWorkspace(firstWorkspace);
    await manager.setCurrentWorkspace(secondWorkspace);
    await manager.setCurrentWorkspace(firstWorkspace);

    await expect(manager.getState()).resolves.toEqual({
      currentPath: firstWorkspace,
      recentPaths: [firstWorkspace, secondWorkspace]
    });
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});

test("creates a meetings directory inside the selected workspace", async () => {
  const baseDirectory = await mkdtemp(join(tmpdir(), "meetmap-workspace-manager-"));

  try {
    const manager = createWorkspaceManager({
      configPath: join(baseDirectory, "workspace.json")
    });
    const workspacePath = join(baseDirectory, "Workspace");

    await manager.setCurrentWorkspace(workspacePath);

    expect(manager.getMeetingsDirectory()).toBe(join(workspacePath, "meetings"));
  } finally {
    await rm(baseDirectory, { force: true, recursive: true });
  }
});
