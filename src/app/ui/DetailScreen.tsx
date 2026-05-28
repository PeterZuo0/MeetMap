import { useState } from "react";
import type { ReactNode } from "react";
import type { MeetingMetadata } from "../../features/meetings/meetingTypes";
import type { UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";

type DetailTab = "transcript" | "summary" | "map";
type ExportFormat = "word" | "html";

const EXPORT_OPTIONS = [
  { id: "map", en: "Structure map", zh: "\u7ed3\u6784\u56fe" },
  { id: "decisions", en: "Decisions", zh: "\u51b3\u7b56" },
  { id: "actions", en: "Action items", zh: "\u5f85\u529e\u4e8b\u9879" },
  { id: "transcript", en: "Full transcript", zh: "\u5b8c\u6574\u8f6c\u5199" },
  { id: "timestamps", en: "Timestamps", zh: "\u65f6\u95f4\u6233" },
  { id: "audio", en: "Embedded audio (HTML only)", zh: "\u5185\u5d4c\u97f3\u9891\uff08\u4ec5 HTML\uff09" }
] as const;

type ExportOptionId = (typeof EXPORT_OPTIONS)[number]["id"];

export function DetailScreen({
  lang,
  meeting,
  exportError,
  onExport
}: {
  lang: UiLanguage;
  meeting: MeetingMetadata | null;
  exportError: string | null;
  onExport(kind: "word" | "html"): void;
}) {
  const [tab, setTab] = useState<DetailTab>("transcript");
  const [showExportDialog, setShowExportDialog] = useState(false);
  const isNoAudio = meeting?.status === "no_audio";

  return (
    <section className="pane" aria-label="Meeting detail">
      <div className="screen-head">
        <div>
          <h1 className="h1">Meeting detail</h1>
          <p className="sub">{meeting?.title ?? "Q3 roadmap review"}</p>
        </div>
        <div style={{ display: isNoAudio ? "none" : "flex", gap: 8 }}>
          <button className="btn primary" onClick={() => setShowExportDialog(true)} type="button">
            <Icon name="download" size={13} />
            {label(lang, "Export", "\u5bfc\u51fa")}
          </button>
        </div>
      </div>

      {exportError ? <div className="error-box">{exportError}</div> : null}

      {isNoAudio ? (
        <div className="no-audio-result">
          <h2 className="h2">No speech was detected</h2>
          <p className="sub">
            MeetMap kept the recording metadata, but did not generate a transcript, summary, Word document, or HTML map because neither recorded track contained speech.
          </p>
        </div>
      ) : null}

      <div className="tabs" role="tablist" aria-label="Meeting detail views" hidden={isNoAudio}>
        <Tab active={tab === "transcript"} onClick={() => setTab("transcript")}>
          {label(lang, "Transcript", "文字记录")}
        </Tab>
        <Tab active={tab === "summary"} onClick={() => setTab("summary")}>
          {label(lang, "Summary", "摘要")}
        </Tab>
        <Tab active={tab === "map"} onClick={() => setTab("map")}>
          {label(lang, "Structure map", "结构图")}
        </Tab>
      </div>

      {!isNoAudio && tab === "transcript" ? <Transcript lang={lang} /> : null}
      {!isNoAudio && tab === "summary" ? <Summary lang={lang} meeting={meeting} /> : null}
      {!isNoAudio && tab === "map" ? <MapPreview lang={lang} /> : null}

      {showExportDialog ? (
        <ExportDialog
          lang={lang}
          onClose={() => setShowExportDialog(false)}
          onExport={(kind) => {
            setShowExportDialog(false);
            onExport(kind);
          }}
        />
      ) : null}
    </section>
  );
}

function Tab({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: ReactNode;
  onClick(): void;
}) {
  return (
    <button className={`tab ${active ? "active" : ""}`} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function Transcript({ lang }: { lang: UiLanguage }) {
  const turns = [
    {
      speaker: "Maya",
      time: "00:42",
      text: "We should keep the feedback widget read-only for the July MVP."
    },
    {
      speaker: "Yi",
      time: "01:18",
      text: "Logging that. Maya owns the export pipeline and Yi handles the tree layout."
    },
    {
      speaker: "Lin",
      time: "01:32",
      text: "结构图导出我已经做了原型，主要担心节点关系怎么排版。"
    }
  ];

  return (
    <div className="two-col">
      <div className="grid">
        {turns.map((turn) => (
          <div className="card" key={`${turn.speaker}-${turn.time}`}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <strong>{turn.speaker}</strong>
              <span className="sub">{turn.time}</span>
            </div>
            <p className="sub" style={{ color: "var(--text)" }}>
              {turn.text}
            </p>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="h2">{label(lang, "Placeholder data", "占位数据")}</div>
        <p className="sub">
          {label(
            lang,
            "This detail screen is connected to MVP exports, while transcript artifact loading is a follow-up.",
            "当前详情页已接入 MVP 导出；真实 transcript artifact 加载会在后续补上。"
          )}
        </p>
      </div>
    </div>
  );
}

function Summary({ lang, meeting }: { lang: UiLanguage; meeting: MeetingMetadata | null }) {
  return (
    <div className="grid">
      <div className="card">
        <h2 className="h2">{label(lang, "TL;DR", "摘要")}</h2>
        <p className="sub" style={{ color: "var(--text)" }}>
          {meeting?.status === "completed"
            ? "The current session completed processing and generated local Word and HTML map exports."
            : "Locked the July ship list and started structure-map export planning."}
        </p>
      </div>
      <div className="stats-grid">
        <div className="card">
          <div className="metric">3</div>
          <div className="sub">{label(lang, "Decisions", "决策")}</div>
        </div>
        <div className="card">
          <div className="metric">5</div>
          <div className="sub">{label(lang, "Actions", "待办")}</div>
        </div>
        <div className="card">
          <div className="metric">2</div>
          <div className="sub">{label(lang, "Questions", "问题")}</div>
        </div>
        <div className="card">
          <div className="metric">1</div>
          <div className="sub">{label(lang, "Risk", "风险")}</div>
        </div>
      </div>
    </div>
  );
}

function MapPreview({ lang }: { lang: UiLanguage }) {
  return (
    <div className="card map-preview">
      <div className="map-node" style={{ left: "42%", top: "38%" }}>
        {label(lang, "Roadmap review", "路线图评审")}
      </div>
      <div className="map-node" style={{ left: "8%", top: "15%" }}>
        {label(lang, "July scope", "七月范围")}
      </div>
      <div className="map-node" style={{ right: "8%", top: "18%" }}>
        {label(lang, "Structure export", "结构导出")}
      </div>
      <div className="map-node" style={{ left: "24%", bottom: "12%" }}>
        {label(lang, "Action items", "待办事项")}
      </div>
    </div>
  );
}

function ExportDialog({
  lang,
  onClose,
  onExport
}: {
  lang: UiLanguage;
  onClose(): void;
  onExport(kind: ExportFormat): void;
}) {
  const [format, setFormat] = useState<ExportFormat>("word");
  const [options, setOptions] = useState<Record<ExportOptionId, boolean>>({
    map: true,
    decisions: true,
    actions: true,
    transcript: true,
    timestamps: true,
    audio: false
  });

  function toggleOption(optionId: ExportOptionId, checked: boolean) {
    setOptions((current) => ({ ...current, [optionId]: checked }));
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        aria-label="Export meeting"
        aria-modal="true"
        className="export-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="export-dialog-head">
          <Icon name="download" size={16} />
          <h2 className="h2">{label(lang, "Export meeting", "\u5bfc\u51fa\u4f1a\u8bae")}</h2>
          <button aria-label="Close export dialog" className="icon-button" onClick={onClose} type="button">
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="export-dialog-body">
          <div className="field-label">{label(lang, "Format", "\u683c\u5f0f")}</div>
          <div className="export-format-grid" role="radiogroup" aria-label="Export format">
            <FormatCard
              active={format === "word"}
              extension=".docx"
              icon="file"
              onClick={() => setFormat("word")}
              subtitle={label(
                lang,
                "Summary, decisions, actions, transcript",
                "\u6458\u8981\u3001\u51b3\u7b56\u3001\u5f85\u529e\u3001\u8f6c\u5199"
              )}
              title={label(lang, "Word document", "Word \u6587\u6863")}
            />
            <FormatCard
              active={format === "html"}
              extension=".html"
              icon="spark"
              onClick={() => setFormat("html")}
              subtitle={label(lang, "Interactive single-file HTML", "\u53ef\u4ea4\u4e92\u5355\u6587\u4ef6 HTML")}
              title={label(lang, "Structure map", "\u7ed3\u6784\u56fe")}
            />
          </div>

          <div className="field-label">{label(lang, "Include", "\u5305\u542b\u5185\u5bb9")}</div>
          <div className="export-option-list">
            {EXPORT_OPTIONS.map((option) => {
              const disabled = option.id === "audio" && format === "word";
              return (
                <label className={`export-option ${disabled ? "disabled" : ""}`} key={option.id}>
                  <input
                    checked={options[option.id] && !disabled}
                    disabled={disabled}
                    onChange={(event) => toggleOption(option.id, event.target.checked)}
                    type="checkbox"
                  />
                  <span>{label(lang, option.en, option.zh)}</span>
                </label>
              );
            })}
          </div>

          <div className="field-label">{label(lang, "Output language", "\u8f93\u51fa\u8bed\u8a00")}</div>
          <div className="segmented muted" aria-label="Output language">
            <span>{label(lang, "Chinese", "\u4e2d\u6587")}</span>
            <span>English</span>
            <span className="active">{label(lang, "Bilingual", "\u53cc\u8bed")}</span>
            <span>Auto</span>
          </div>
        </div>

        <div className="export-dialog-foot">
          <div className="sub">
            {format === "word"
              ? label(lang, "~3 pages · 12 KB", "\u7ea6 3 \u9875 · 12 KB")
              : label(lang, "Single file · works offline", "\u5355\u6587\u4ef6 · \u79bb\u7ebf\u53ef\u7528")}
          </div>
          <button className="btn" onClick={onClose} type="button">
            {label(lang, "Cancel", "\u53d6\u6d88")}
          </button>
          <button className="btn primary" onClick={() => onExport(format)} type="button">
            <Icon name="download" size={12} />
            {label(lang, "Export", "\u5bfc\u51fa")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormatCard({
  active,
  extension,
  icon,
  onClick,
  subtitle,
  title
}: {
  active: boolean;
  extension: string;
  icon: "file" | "spark";
  onClick(): void;
  subtitle: ReactNode;
  title: ReactNode;
}) {
  return (
    <button
      aria-checked={active}
      className={`export-format-card ${active ? "active" : ""}`}
      onClick={onClick}
      role="radio"
      type="button"
    >
      <span className="export-format-icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="export-format-copy">
        <strong>{title}</strong>
        <span className="mono">{extension}</span>
        <span>{subtitle}</span>
      </span>
      {active ? (
        <span className="export-format-check">
          <Icon name="check" size={10} />
        </span>
      ) : null}
    </button>
  );
}
