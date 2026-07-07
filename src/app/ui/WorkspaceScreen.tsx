import type { WorkspaceState } from "../meetMapApi";
import { Icon } from "./icons";

export function WorkspaceScreen({
  error,
  isChoosing,
  onChooseFolder,
  onUseRecent,
  workspace
}: {
  error: string | null;
  isChoosing: boolean;
  onChooseFolder(): void;
  onUseRecent(folderPath: string): void;
  workspace: WorkspaceState | null;
}) {
  return (
    <section className="pane workspace-pane" aria-label="Workspace setup">
      <div className="workspace-setup">
        <div>
          <h1 className="h1">Choose a workspace folder</h1>
          <p className="sub">
            MeetMap stores meeting metadata, audio, transcripts, summaries, and exports in the folder you choose.
          </p>
        </div>
        {error ? <div className="error-box">{error}</div> : null}
        <div className="workspace-actions">
          <button className="btn primary" disabled={isChoosing} onClick={onChooseFolder} type="button">
            <Icon name="folder" size={14} />
            {isChoosing ? "Choosing..." : "Choose folder"}
          </button>
        </div>
        {workspace?.recentPaths.length ? (
          <div className="workspace-recent">
            <div className="section-title">Recent workspaces</div>
            {workspace.recentPaths.map((folderPath) => (
              <button className="workspace-path-row" key={folderPath} onClick={() => onUseRecent(folderPath)} type="button">
                <Icon name="folder" size={14} />
                <span>{folderPath}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
