import { useState } from "react";
import type { ReactNode } from "react";
import type { MeetingMetadata } from "../../features/meetings/meetingTypes";
import type { ExportOptions, UiLanguage } from "../meetMapApi";
import { label, text } from "./copy";
import { Icon } from "./icons";

type DetailTab = "transcript" | "summary" | "map";
type ExportFormat = "word" | "html";
type TrackFilter = "both" | "system" | "mic";
type ExportDefaults = {
  includeTimestamps: boolean;
  includeTranscriptAppendix: boolean;
};

type TranscriptTurn = {
  speaker: string;
  role: string;
  track: "system" | "mic";
  time: string;
  text: string;
  translation?: string;
  tag?: "decision" | "action";
};

const EXPORT_OPTIONS = [
  { id: "map", en: "Structure map", zh: "\u7ed3\u6784\u56fe" },
  { id: "decisions", en: "Decisions", zh: "\u51b3\u7b56" },
  { id: "actions", en: "Action items", zh: "\u5f85\u529e\u4e8b\u9879" },
  { id: "transcript", en: "Full transcript", zh: "\u5b8c\u6574\u8f6c\u5199" },
  { id: "timestamps", en: "Timestamps", zh: "\u65f6\u95f4\u6233" },
  { id: "audio", en: "Embedded audio (HTML only)", zh: "\u5185\u5d4c\u97f3\u9891\uff08\u4ec5 HTML\uff09" }
] as const;

const TRANSCRIPT_TURNS: TranscriptTurn[] = [
  {
    speaker: "Sarah Chen",
    role: "PM",
    track: "system",
    time: "00:12",
    text: "Before we get into roadmap items, I want to lock the July cuts."
  },
  {
    speaker: "Maya Khoury",
    role: "Eng lead",
    track: "system",
    time: "01:18",
    text: "Maya owns the export pipeline; Yi handles the tree layout.",
    tag: "action"
  },
  {
    speaker: "Yi Zhang",
    role: "Designer",
    track: "mic",
    time: "01:32",
    text: "I want the map to be a draggable tree with topics as nodes.",
    translation: "\u6211\u60f3\u628a\u7ed3\u6784\u56fe\u505a\u6210\u53ef\u62d6\u62fd\u7684\u6811\u72b6\u56fe\u3002",
    tag: "decision"
  },
  {
    speaker: "David Park",
    role: "PM",
    track: "system",
    time: "12:40",
    text: "Tencent STT pricing is still open for batch jobs."
  },
  {
    speaker: "Li Wei",
    role: "Engineer",
    track: "system",
    time: "28:10",
    text: "The hiring update can move after export validation."
  }
];

const SPEAKERS = [
  { initials: "SC", name: "Sarah Chen", track: "system", duration: "12:04" },
  { initials: "MK", name: "Maya Khoury", track: "system", duration: "9:51" },
  { initials: "YZ", name: "Yi Zhang", track: "mic", duration: "8:33" },
  { initials: "DP", name: "David Park", track: "system", duration: "7:18" }
];

const TOPIC_JUMPS = [
  { time: "00:00", title: "Ship list cuts", active: true },
  { time: "01:18", title: "Structure map export" },
  { time: "12:40", title: "Tencent STT pricing" }
];

const DECISIONS = [
  "Keep feedback widget read-only for July MVP.",
  "Cut async digest from the July release.",
  "Decide structure-map layout next Monday."
];

const ACTIONS = [
  "Maya owns the export pipeline.",
  "Yi spikes the draggable tree layout.",
  "Sarah drafts the fallback feedback channel.",
  "Follow up on Tencent STT batch pricing."
];

const TOPIC_OUTLINE = [
  "Ship list cuts: feedback widget stays, async digest is removed.",
  "Structure-map export: tree layout spike, export pipeline owner confirmed.",
  "Pricing follow-up: Tencent STT batch processing remains open."
];

const MAP_TOPICS = [
  {
    title: "Ship list cuts",
    time: "00:00",
    children: [
      { kind: "decision", text: "Keep widget read-only" },
      { kind: "decision", text: "Cut async digest" }
    ]
  },
  {
    title: "Structure map export",
    time: "01:18",
    children: [
      { kind: "action", text: "Maya owns pipeline" },
      { kind: "question", text: "Tree layout spike" }
    ]
  },
  {
    title: "Tencent STT pricing",
    time: "12:40",
    children: [
      { kind: "action", text: "Vendor follow-up" },
      { kind: "question", text: "Batch limits" }
    ]
  }
];

const AUDIO_WAVE = [8, 12, 18, 10, 16, 22, 14, 20, 12, 9, 26, 30, 18, 14, 10, 8, 16, 21, 24, 18, 12, 8, 15, 19, 14, 10, 22, 28, 20, 16, 11, 7];

type ExportOptionId = (typeof EXPORT_OPTIONS)[number]["id"];

export function DetailScreen({
  lang,
  meeting,
  exportError,
  exportDefaults,
  onExport
}: {
  lang: UiLanguage;
  meeting: MeetingMetadata | null;
  exportError: string | null;
  exportDefaults: ExportDefaults;
  onExport(kind: "word" | "html", options?: ExportOptions): void;
}) {
  const [tab, setTab] = useState<DetailTab>("transcript");
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied">("idle");
  const isNoAudio = meeting?.status === "no_audio";
  const outputLanguage = meeting?.outputLanguage ?? "bilingual";

  return (
    <section className="pane" aria-label="Meeting detail">
      <div className="screen-head">
        <div>
          <h1 className="h1">Meeting detail</h1>
          <p className="sub">{meeting?.title ?? "Q3 roadmap review"}</p>
        </div>
        <div style={{ display: isNoAudio ? "none" : "flex", gap: 8 }}>
          <button aria-label={text(lang, "Share meeting", "\u5206\u4eab\u4f1a\u8bae")} className="btn" onClick={() => setShareStatus("copied")} type="button">
            <Icon name="share" size={13} />
            {label(lang, "Share", "\u5206\u4eab")}
          </button>
          <button className="btn primary" onClick={() => setShowExportDialog(true)} type="button">
            <Icon name="download" size={13} />
            {label(lang, "Export", "\u5bfc\u51fa")}
          </button>
        </div>
      </div>

      {exportError ? <div className="error-box">{exportError}</div> : null}
      {shareStatus === "copied" ? (
        <div className="status-note positive">{label(lang, "Share link copied", "\u5206\u4eab\u94fe\u63a5\u5df2\u590d\u5236")}</div>
      ) : null}

      {isNoAudio ? (
        <div className="no-audio-result">
          <h2 className="h2">No speech was detected</h2>
          <p className="sub">
            MeetMap kept the recording metadata, but did not generate a transcript, summary, Word document, or HTML map because neither recorded track contained speech.
          </p>
        </div>
      ) : null}

      <div className="tabs detail-tabs" role="tablist" aria-label="Meeting detail views" hidden={isNoAudio}>
        <Tab active={tab === "transcript"} onClick={() => setTab("transcript")}>
          {label(lang, "Transcript", "\u8f6c\u5199")}
        </Tab>
        <Tab active={tab === "summary"} onClick={() => setTab("summary")}>
          {label(lang, "Summary", "\u6458\u8981")}
        </Tab>
        <Tab active={tab === "map"} onClick={() => setTab("map")}>
          {label(lang, "Structure map", "\u7ed3\u6784\u56fe")}
        </Tab>
        <div className="detail-output-chip">
          <span className="sub">{label(lang, "Output", "\u8f93\u51fa")}</span>
          <span className="chip">{outputLanguageLabel(outputLanguage, lang)}</span>
        </div>
      </div>

      {!isNoAudio && tab === "transcript" ? <Transcript lang={lang} /> : null}
      {!isNoAudio && tab === "summary" ? <Summary lang={lang} meeting={meeting} /> : null}
      {!isNoAudio && tab === "map" ? <MapPreview lang={lang} onOpenHtml={() => onExport("html")} /> : null}

      {showExportDialog ? (
        <ExportDialog
          exportDefaults={exportDefaults}
          lang={lang}
          onClose={() => setShowExportDialog(false)}
          onExport={(kind, options) => {
            setShowExportDialog(false);
            onExport(kind, options);
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
  const [query, setQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("both");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTurns = TRANSCRIPT_TURNS.filter((turn) => {
    const matchesTrack = trackFilter === "both" || turn.track === trackFilter;
    const matchesQuery =
      !normalizedQuery ||
      `${turn.speaker} ${turn.role} ${turn.text} ${turn.translation ?? ""}`.toLowerCase().includes(normalizedQuery);
    return matchesTrack && matchesQuery;
  });

  return (
    <div className="detail-with-player">
      <div className="detail-transcript-layout">
        <div className="detail-transcript-main">
          <div className="detail-toolbar">
            <label className="transcript-search">
              <Icon name="search" size={13} />
              <span className="sr-only">{text(lang, "Search transcript", "\u641c\u7d22\u8f6c\u5199")}</span>
              <input
                aria-label={text(lang, "Search transcript", "\u641c\u7d22\u8f6c\u5199")}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={text(lang, "Search transcript...", "\u641c\u7d22\u8f6c\u5199...")}
                type="search"
                value={query}
              />
              <span className="sub mono">
                {visibleTurns.length} / {TRANSCRIPT_TURNS.length}
              </span>
            </label>
            <div className="track-filter" aria-label="Transcript track filter" role="group">
              <TrackButton active={trackFilter === "both"} onClick={() => setTrackFilter("both")}>
                {label(lang, "Both", "\u53cc\u8f68")}
              </TrackButton>
              <TrackButton active={trackFilter === "system"} onClick={() => setTrackFilter("system")}>
                {label(lang, "System", "\u7cfb\u7edf")}
              </TrackButton>
              <TrackButton active={trackFilter === "mic"} onClick={() => setTrackFilter("mic")}>
                {label(lang, "Mic", "\u9ea6\u514b\u98ce")}
              </TrackButton>
            </div>
          </div>

          <div className="turn-list">
            {visibleTurns.length > 0 ? (
              visibleTurns.map((turn) => <TranscriptTurnRow key={`${turn.speaker}-${turn.time}`} turn={turn} />)
            ) : (
              <div className="empty-state">{label(lang, "No transcript turns match", "\u6ca1\u6709\u5339\u914d\u7684\u8f6c\u5199\u7247\u6bb5")}</div>
            )}
          </div>
        </div>

        <aside className="detail-side-panel">
          <SectionTitle>{label(lang, "Speakers", "\u53d1\u8a00\u4eba")}</SectionTitle>
          <div className="speaker-list">
            {SPEAKERS.map((speaker) => (
              <div className="speaker-row" key={speaker.name}>
                <span className="speaker-avatar">{speaker.initials}</span>
                <span>
                  <strong>{speaker.name}</strong>
                  <span className="sub">
                    {speaker.track} - {speaker.duration}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <SectionTitle>{label(lang, "Jump to topic", "\u8df3\u5230\u4e3b\u9898")}</SectionTitle>
          <div className="topic-jump-list">
            {TOPIC_JUMPS.map((topic) => (
              <button className={topic.active ? "active" : ""} key={topic.time} type="button">
                <span className="mono">{topic.time}</span>
                {topic.title}
              </button>
            ))}
          </div>
        </aside>
      </div>
      <AudioPlayer lang={lang} />
    </div>
  );
}

function Summary({ lang, meeting }: { lang: UiLanguage; meeting: MeetingMetadata | null }) {
  const [regenerated, setRegenerated] = useState(false);
  const summary = regenerated
    ? "Regenerated from structured meeting data: feedback widget remains read-only, async digest is cut, and structure-map export work proceeds this week."
    : meeting?.status === "completed"
      ? "Locked the July ship list: feedback widget kept read-only, async digest cut, and structure-map export work starts this week."
      : "Locked the July ship list and started structure-map export planning.";

  return (
    <div className="summary-grid">
      <div className="summary-hero">
        <div className="summary-hero-head">
          <h2 className="h2">TL;DR</h2>
          <button className="btn small" onClick={() => setRegenerated(true)} type="button">
            <Icon name="spark" size={11} />
            {label(lang, "Regenerate", "\u91cd\u65b0\u751f\u6210")}
          </button>
        </div>
        <p className="sub" style={{ color: "var(--text)" }}>{summary}</p>
      </div>
      <div className="summary-columns">
        <SummarySection count={3} items={DECISIONS} title={label(lang, "Decisions", "\u51b3\u7b56")} />
        <SummarySection count={4} items={ACTIONS} title={label(lang, "Action items", "\u5f85\u529e\u4e8b\u9879")} />
      </div>
      <SummarySection count={3} items={TOPIC_OUTLINE} title={label(lang, "Topic outline", "\u4e3b\u9898\u5927\u7eb2")} />
    </div>
  );
}

function MapPreview({ lang, onOpenHtml }: { lang: UiLanguage; onOpenHtml(): void }) {
  return (
    <div className="map-section">
      <div className="map-toolbar">
        <div>
          <h2 className="h2">{label(lang, "Meeting structure map", "\u4f1a\u8bae\u7ed3\u6784\u56fe")}</h2>
          <p className="sub">{label(lang, "Topic-by-topic skeleton linked back to transcript moments.", "\u6309\u4e3b\u9898\u7ec4\u7ec7\uff0c\u53ef\u56de\u5230\u5bf9\u5e94\u8f6c\u5199\u65f6\u523b\u3002")}</p>
        </div>
        <button className="btn" onClick={onOpenHtml} type="button">
          <Icon name="file" size={12} />
          {label(lang, "Open as HTML", "\u4ee5 HTML \u6253\u5f00")}
        </button>
      </div>
      <div className="card map-preview">
        <div className="map-root-node">{label(lang, "Q3 roadmap review", "Q3 \u8def\u7ebf\u56fe\u8bc4\u5ba1")}</div>
        <div className="map-branch-grid">
          {MAP_TOPICS.map((topic) => (
            <div className="map-topic" key={topic.title}>
              <strong>{topic.title}</strong>
              <span className="mono">{topic.time}</span>
              {topic.children.map((child) => (
                <span className={`map-child ${child.kind}`} key={child.text}>
                  {child.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExportDialog({
  exportDefaults,
  lang,
  onClose,
  onExport
}: {
  exportDefaults: ExportDefaults;
  lang: UiLanguage;
  onClose(): void;
  onExport(kind: ExportFormat, options: ExportOptions): void;
}) {
  const [format, setFormat] = useState<ExportFormat>("word");
  const [options, setOptions] = useState<Record<ExportOptionId, boolean>>({
    map: true,
    decisions: true,
    actions: true,
    transcript: exportDefaults.includeTranscriptAppendix,
    timestamps: exportDefaults.includeTimestamps,
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
              const disabled = option.id === "audio";
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
              ? label(lang, "~3 pages - 12 KB", "\u7ea6 3 \u9875 - 12 KB")
              : label(lang, "Single file - works offline", "\u5355\u6587\u4ef6 - \u79bb\u7ebf\u53ef\u7528")}
          </div>
          <button className="btn" onClick={onClose} type="button">
            {label(lang, "Cancel", "\u53d6\u6d88")}
          </button>
          <button className="btn primary" onClick={() => onExport(format, options)} type="button">
            <Icon name="download" size={12} />
            {label(lang, "Export", "\u5bfc\u51fa")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrackButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick(): void }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function TranscriptTurnRow({ turn }: { turn: TranscriptTurn }) {
  return (
    <article className="turn-row">
      <span className="mono turn-time">{turn.time}</span>
      <span className={`track-badge ${turn.track}`}>{turn.track === "mic" ? "mic" : "sys"}</span>
      <div className="turn-body">
        <div className="turn-meta">
          <strong>{turn.speaker}</strong>
          <span className="sub">{turn.role}</span>
          {turn.tag ? <span className={`status-pill ${turn.tag === "decision" ? "positive" : "warn"}`}>{turn.tag}</span> : null}
        </div>
        <p>{turn.text}</p>
        {turn.translation ? <p className="translation">{turn.translation}</p> : null}
      </div>
    </article>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="section-title">{children}</div>;
}

function SummarySection({ count, items, title }: { count: number; items: string[]; title: ReactNode }) {
  return (
    <section className="summary-section">
      <div className="summary-section-head">
        <h3>{title}</h3>
        <span className="chip">{count}</span>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function AudioPlayer({ lang }: { lang: UiLanguage }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="audio-player">
      <button
        aria-label={playing ? text(lang, "Pause recording", "\u6682\u505c\u5f55\u97f3") : text(lang, "Play recording", "\u64ad\u653e\u5f55\u97f3")}
        className="audio-play-button"
        onClick={() => setPlaying((current) => !current)}
        type="button"
      >
        <Icon name={playing ? "pause" : "play"} size={15} />
      </button>
      <span className="mono">03:42</span>
      <div className="audio-wave" aria-label={text(lang, "Recording waveform", "\u5f55\u97f3\u6ce2\u5f62")}>
        {AUDIO_WAVE.map((height, index) => (
          <span className={index < 18 ? "played" : ""} key={`${height}-${index}`} style={{ height }} />
        ))}
      </div>
      <span className="mono">52:14</span>
      <button className="btn small" type="button">1.0x</button>
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

function outputLanguageLabel(outputLanguage: MeetingMetadata["outputLanguage"], lang: UiLanguage) {
  if (outputLanguage === "zh") {
    return label(lang, "Chinese", "\u4e2d\u6587");
  }

  if (outputLanguage === "en") {
    return label(lang, "English", "\u82f1\u6587");
  }

  if (outputLanguage === "bilingual") {
    return label(lang, "Bilingual", "\u53cc\u8bed");
  }

  return label(lang, "Auto", "\u81ea\u52a8");
}
