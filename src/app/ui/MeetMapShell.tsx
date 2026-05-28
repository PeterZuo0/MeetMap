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
  right,
  children,
  onNav
}: {
  current: WorkflowPhase;
  lang: UiLanguage;
  recording: boolean;
  crumbs: string[];
  right?: ReactNode;
  children: ReactNode;
  onNav(target: NavTarget): void;
}) {
  return (
    <div className="win-window">
      <div className="app-body">
        <Sidebar current={current} lang={lang} recording={recording} onNav={onNav} />
        <main className="main">
          <Topbar crumbs={crumbs} lang={lang} right={right} />
          {children}
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  current,
  lang,
  recording,
  onNav
}: {
  current: WorkflowPhase;
  lang: UiLanguage;
  recording: boolean;
  onNav(target: NavTarget): void;
}) {
  const items = [
    { id: "library" as const, icon: "list" as const, en: "All meetings", zh: "全部会议", count: 142 },
    { id: "pinned" as const, icon: "pin" as const, en: "Pinned", zh: "已置顶", count: 4 },
    { id: "recent" as const, icon: "clock" as const, en: "Recent", zh: "最近", count: 8 },
    { id: "shared" as const, icon: "users" as const, en: "Shared", zh: "共享", count: 12 }
  ];
  const folders = [
    { en: "Product weekly", zh: "产品周会", count: 24 },
    { en: "1:1s", zh: "一对一", count: 41 },
    { en: "Client calls", zh: "客户沟通", count: 18 }
  ];

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="brand-mark" />
        <div className="brand-name">
          MeetMap<span className="zh">会图</span>
        </div>
      </div>
      <button className="sb-record-btn" onClick={() => onNav(recording ? "recording" : "pre")}>
        {recording ? (
          <>
            <span className="record-dot" /> {label(lang, "Recording", "录制中")}
          </>
        ) : (
          <>
            <Icon name="record" size={14} /> {label(lang, "New recording", "新建录制")}
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

      <div className="sb-section">{label(lang, "Folders", "文件夹")}</div>
      <div className="sb-folder-list">
        {folders.map((folder) => (
          <div className="sb-item" key={folder.en}>
            <span className="icon">
              <Icon name="folder" size={15} />
            </span>
            <span>{label(lang, folder.en, folder.zh)}</span>
            <span className="count">{folder.count}</span>
          </div>
        ))}
      </div>

      <div className="sb-foot">
        <div className="avatar">YZ</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--text)", fontSize: 12.5, fontWeight: 650 }}>Yi Zhang</div>
          <div style={{ fontSize: 10.5 }}>Pro · 9.4 GB</div>
        </div>
        <button className="btn" onClick={() => onNav("settings")} type="button">
          <Icon name="settings" size={15} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}

function Topbar({
  crumbs,
  lang,
  right
}: {
  crumbs: string[];
  lang: UiLanguage;
  right?: ReactNode;
}) {
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((crumb, index) => (
          <span className={index === crumbs.length - 1 ? "now" : ""} key={crumb}>
            {index > 0 ? <Icon name="chevronRight" size={12} /> : null}
            {crumb}
          </span>
        ))}
      </div>
      <div className="search">
        <Icon name="search" size={13} />
        <span>{text(lang, "Search meetings, transcripts, action items...", "搜索会议、文字记录、待办...")}</span>
        <span className="kbd">Ctrl K</span>
      </div>
      <div>{right}</div>
    </div>
  );
}
