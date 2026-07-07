import { useEffect } from "react";
import type { ReactNode } from "react";
import type { UiLanguage, WorkflowPhase } from "../meetMapApi";
import { label, text } from "./copy";
import { Icon } from "./icons";

type NavTarget = "library" | "pre" | "recording" | "settings";

export function MeetMapShell({
  current,
  lang,
  recording,
  crumbs,
  meetingCount,
  onChooseWorkspace,
  right,
  workspacePath,
  children,
  onNav,
  onRevealWorkspace,
  onSearchRequest
}: {
  current: WorkflowPhase;
  lang: UiLanguage;
  recording: boolean;
  crumbs: string[];
  meetingCount: number;
  workspacePath: string | null;
  right?: ReactNode;
  children: ReactNode;
  onNav(target: NavTarget): void;
  onChooseWorkspace(): void;
  onRevealWorkspace(): void;
  onSearchRequest(): void;
}) {
  return (
    <div className="win-window">
      <div className="app-body">
        <Sidebar
          current={current}
          lang={lang}
          meetingCount={meetingCount}
          onChooseWorkspace={onChooseWorkspace}
          onNav={onNav}
          onRevealWorkspace={onRevealWorkspace}
          recording={recording}
          workspacePath={workspacePath}
        />
        <main className="main">
          <Topbar crumbs={crumbs} lang={lang} onNav={onNav} onSearchRequest={onSearchRequest} right={right} />
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  current,
  lang,
  meetingCount,
  onChooseWorkspace,
  recording,
  workspacePath,
  onNav,
  onRevealWorkspace
}: {
  current: WorkflowPhase;
  lang: UiLanguage;
  meetingCount: number;
  recording: boolean;
  workspacePath: string | null;
  onNav(target: NavTarget): void;
  onChooseWorkspace(): void;
  onRevealWorkspace(): void;
}) {
  const items = [
    {
      id: "library" as const,
      icon: "list" as const,
      en: "All meetings",
      zh: "\u5168\u90e8\u4f1a\u8bae",
      count: meetingCount
    }
  ];

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="brand-mark" />
        <div className="brand-name">
          MeetMap<span className="zh">{"\u4f1a\u56fe"}</span>
        </div>
      </div>
      <button className="sb-record-btn" onClick={() => onNav(recording ? "recording" : "pre")}>
        {recording ? (
          <>
            <span className="record-dot" /> {label(lang, "Recording", "\u5f55\u5236\u4e2d")}
          </>
        ) : (
          <>
            <Icon name="record" size={14} /> {label(lang, "New recording", "\u65b0\u5efa\u5f55\u5236")}
          </>
        )}
      </button>

      <div className="sb-folder-list">
        {items.map((item) => (
          <button
            className={`sb-item ${current === item.id ? "active" : ""}`}
            key={item.id}
            onClick={() => item.id === "library" && onNav("library")}
            type="button"
          >
            <span className="icon">
              <Icon name={item.icon} size={15} />
            </span>
            <span>{label(lang, item.en, item.zh)}</span>
            <span className="count">{item.count}</span>
          </button>
        ))}
      </div>

      <div className="sb-section">{label(lang, "Workspace", "\u5de5\u4f5c\u533a")}</div>
      <div className="sb-folder-list">
        <button className="sb-item" onClick={onChooseWorkspace} type="button">
          <span className="icon">
            <Icon name="folder" size={15} />
          </span>
          <span>{workspacePath ? shortPath(workspacePath) : label(lang, "Choose folder", "\u9009\u62e9\u6587\u4ef6\u5939")}</span>
        </button>
        {workspacePath ? (
          <button className="sb-item" onClick={onRevealWorkspace} type="button">
            <span className="icon">
              <Icon name="file" size={15} />
            </span>
            <span>{label(lang, "Open folder", "\u6253\u5f00\u6587\u4ef6\u5939")}</span>
          </button>
        ) : null}
      </div>

      <div className="sb-foot">
        <button className="btn" onClick={() => onNav("settings")} type="button">
          <Icon name="settings" size={15} />
          <span>{label(lang, "Settings", "\u8bbe\u7f6e")}</span>
        </button>
      </div>
    </aside>
  );
}

function shortPath(folderPath: string): string {
  const normalized = folderPath.replaceAll("\\", "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? folderPath;
}

function Topbar({
  crumbs,
  lang,
  onNav,
  onSearchRequest,
  right
}: {
  crumbs: string[];
  lang: UiLanguage;
  onNav(target: NavTarget): void;
  onSearchRequest(): void;
  right?: ReactNode;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onSearchRequest();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSearchRequest]);

  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((crumb, index) => {
          const crumbText = localizeCrumb(crumb, lang);
          const isCurrent = index === crumbs.length - 1;
          return (
            <span className={isCurrent ? "now" : ""} key={`${crumb}-${index}`}>
              {index > 0 ? <Icon name="chevronRight" size={12} /> : null}
              {isCurrent ? (
                crumbText
              ) : (
                <button className="crumb-button" onClick={() => onNav("library")} type="button">
                  {crumbText}
                </button>
              )}
            </span>
          );
        })}
      </div>
      <button
        aria-label={text(lang, "Search meetings", "\u641c\u7d22\u4f1a\u8bae")}
        className="search"
        onClick={onSearchRequest}
        type="button"
      >
        <Icon name="search" size={13} />
        <span>{text(lang, "Search meetings, transcripts, action items...", "\u641c\u7d22\u4f1a\u8bae\u3001\u6587\u5b57\u8bb0\u5f55\u3001\u5f85\u529e...")}</span>
        <span className="kbd">Ctrl K</span>
      </button>
      <div>{right}</div>
    </div>
  );
}

function localizeCrumb(crumb: string, lang: UiLanguage): string {
  switch (crumb) {
    case "All meetings":
      return text(lang, "All meetings", "\u5168\u90e8\u4f1a\u8bae");
    case "New recording":
      return text(lang, "New recording", "\u65b0\u5efa\u5f55\u5236");
    case "Recording":
      return text(lang, "Recording", "\u5f55\u5236\u4e2d");
    case "Processing":
      return text(lang, "Processing", "\u5904\u7406\u4e2d");
    case "Meeting detail":
      return text(lang, "Meeting detail", "\u4f1a\u8bae\u8be6\u60c5");
    case "Settings":
      return text(lang, "Settings", "\u8bbe\u7f6e");
    case "Workspace":
      return text(lang, "Workspace", "\u5de5\u4f5c\u533a");
    default:
      return crumb;
  }
}
