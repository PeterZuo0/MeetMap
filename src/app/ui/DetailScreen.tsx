import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { gsap } from "gsap";
import type { MeetingActionItem, MeetingDecision, MeetingOpenQuestion, MeetingRisk, SourceReference } from "../../features/intelligence/meetingStructure";
import type { MeetingMetadata } from "../../features/meetings/meetingTypes";
import type { ExportOptions, MeetingDetailData, UiLanguage } from "../meetMapApi";
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
  id: string;
  speaker: string;
  role: string;
  track: "system" | "mic";
  time: string;
  startTimeMs: number;
  endTimeMs: number;
  text: string;
  translation?: string;
  tag?: "decision" | "action";
};

type SpeakerSummary = {
  initials: string;
  name: string;
  track: string;
  duration: string;
};

type TopicJump = {
  time: string;
  startTimeMs: number;
  title: string;
};

type MapTopic = {
  title: string;
  time: string;
  children: Array<{
    kind: "decision" | "action" | "question" | "risk";
    text: string;
  }>;
};

const EXPORT_OPTIONS = [
  { id: "map", en: "Structure map", zh: "\u7ed3\u6784\u56fe" },
  { id: "decisions", en: "Decisions", zh: "\u51b3\u7b56" },
  { id: "actions", en: "Action items", zh: "\u5f85\u529e\u4e8b\u9879" },
  { id: "transcript", en: "Full transcript", zh: "\u5b8c\u6574\u8f6c\u5199" },
  { id: "timestamps", en: "Timestamps", zh: "\u65f6\u95f4\u6233" },
  { id: "audio", en: "Embedded audio (HTML only)", zh: "\u5185\u5d4c\u97f3\u9891\uff08\u4ec5 HTML\uff09" }
] as const;

type ExportOptionId = (typeof EXPORT_OPTIONS)[number]["id"];
type AudioPlaybackTrack = NonNullable<MeetingDetailData["audio"]>["tracks"][number];

export function DetailScreen({
  detailData,
  detailError,
  lang,
  meeting,
  exportError,
  exportDefaults,
  onExport,
  onDownloadAudio,
  onRegenerate = () => undefined,
  onShare = async () => undefined
}: {
  detailData: MeetingDetailData | null;
  detailError: string | null;
  lang: UiLanguage;
  meeting: MeetingMetadata | null;
  exportError: string | null;
  exportDefaults: ExportDefaults;
  onExport(kind: "word" | "html", options?: ExportOptions): void;
  onDownloadAudio(): void;
  onRegenerate?(): void;
  onShare?(): Promise<void>;
}) {
  const [tab, setTab] = useState<DetailTab>("transcript");
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");
  const isNoAudio = meeting?.status === "no_audio";
  const outputLanguage = meeting?.outputLanguage ?? "bilingual";
  const transcriptTurns = buildTranscriptTurns(detailData);
  const speakers = buildSpeakers(transcriptTurns);
  const topicJumps = buildTopicJumps(detailData);
  const summary = detailData?.structure?.summary ?? "";
  const decisions = detailData?.structure?.decisions.map((decision) => decision.text) ?? [];
  const actions = detailData?.structure?.actionItems.map(formatActionItem) ?? [];
  const topicOutline = detailData?.structure?.topics.map((topic) => `${topic.title}: ${topic.summary}`) ?? [];
  const mapTopics = buildMapTopics(detailData);

  return (
    <section className="pane" aria-label="Meeting detail">
      <div className="screen-head">
        <div>
          <h1 className="h1">Meeting detail</h1>
          <p className="sub">{meeting?.title ?? "Untitled meeting"}</p>
        </div>
        <div style={{ display: isNoAudio ? "none" : "flex", gap: 8 }}>
          <button
            aria-label={text(lang, "Share meeting", "\u5206\u4eab\u4f1a\u8bae")}
            className="btn"
            onClick={() => {
              void onShare().then(() => setShareStatus("copied")).catch(() => setShareStatus("failed"));
            }}
            type="button"
          >
            <Icon name="share" size={13} />
            {label(lang, "Share", "\u5206\u4eab")}
          </button>
          <button aria-label={text(lang, "Download meeting audio", "\u4e0b\u8f7d\u4f1a\u8bae\u97f3\u9891")} className="btn" onClick={onDownloadAudio} type="button">
            <Icon name="download" size={13} />
            {label(lang, "Audio", "\u97f3\u9891")}
          </button>
          <button className="btn primary" onClick={() => setShowExportDialog(true)} type="button">
            <Icon name="download" size={13} />
            {label(lang, "Export", "\u5bfc\u51fa")}
          </button>
        </div>
      </div>

      {exportError ? <div className="error-box">{exportError}</div> : null}
      {detailError ? <div className="error-box">{detailError}</div> : null}
      {shareStatus === "copied" ? (
        <div className="status-note positive">{label(lang, "Share link copied", "\u5206\u4eab\u94fe\u63a5\u5df2\u590d\u5236")}</div>
      ) : null}
      {shareStatus === "failed" ? (
        <div className="error-box">{label(lang, "Share failed. The meeting path could not be copied.", "\u5206\u4eab\u5931\u8d25\uff0c\u65e0\u6cd5\u590d\u5236\u4f1a\u8bae\u8def\u5f84\u3002")}</div>
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

      {!isNoAudio && tab === "transcript" ? (
        <Transcript
          audioTracks={detailData?.audio?.tracks ?? []}
          lang={lang}
          speakers={speakers}
          topicJumps={topicJumps}
          turns={transcriptTurns}
        />
      ) : null}
      {!isNoAudio && tab === "summary" ? (
        <Summary actions={actions} decisions={decisions} lang={lang} onRegenerate={onRegenerate} summary={summary} topicOutline={topicOutline} />
      ) : null}
      {!isNoAudio && tab === "map" ? (
        <MapPreview lang={lang} mapTopics={mapTopics} meeting={meeting} onOpenHtml={() => onExport("html")} />
      ) : null}

      {showExportDialog ? (
        <ExportDialog
          exportDefaults={exportDefaults}
          hasAudio={Boolean(detailData?.audio?.tracks.length)}
          lang={lang}
          onClose={() => setShowExportDialog(false)}
          outputLanguage={outputLanguage}
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

function Transcript({
  audioTracks,
  lang,
  speakers,
  topicJumps,
  turns
}: {
  audioTracks: AudioPlaybackTrack[];
  lang: UiLanguage;
  speakers: SpeakerSummary[];
  topicJumps: TopicJump[];
  turns: TranscriptTurn[];
}) {
  const [query, setQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("both");
  const [playbackTimeMs, setPlaybackTimeMs] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const normalizedQuery = query.trim().toLowerCase();
  const activeTurnId = findActiveTurnId(turns, playbackTimeMs);
  const activeTopic = findActiveTopic(topicJumps, playbackTimeMs);
  const visibleTurns = turns.filter((turn) => {
    const matchesTrack = trackFilter === "both" || turn.track === trackFilter;
    const matchesQuery =
      !normalizedQuery ||
      `${turn.speaker} ${turn.role} ${turn.text} ${turn.translation ?? ""}`.toLowerCase().includes(normalizedQuery);
    return matchesTrack && matchesQuery;
  });

  useEffect(() => {
    if (!activeTurnId) {
      return;
    }

    const row = rowRefs.current.get(activeTurnId);
    if (!row) {
      return;
    }

    row.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    gsap.fromTo(
      row,
      { backgroundColor: "rgba(98, 102, 232, 0.18)" },
      {
        backgroundColor: "rgba(98, 102, 232, 0.08)",
        clearProps: "backgroundColor",
        duration: reduceMotion ? 0 : 0.45,
        ease: "power2.out",
        overwrite: "auto"
      }
    );
  }, [activeTurnId]);

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
                {visibleTurns.length} / {turns.length}
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
              visibleTurns.map((turn) => (
                <TranscriptTurnRow
                  active={turn.id === activeTurnId}
                  key={turn.id}
                  refCallback={(element) => {
                    if (element) {
                      rowRefs.current.set(turn.id, element);
                    } else {
                      rowRefs.current.delete(turn.id);
                    }
                  }}
                  turn={turn}
                />
              ))
            ) : (
              <div className="empty-state">
                {turns.length === 0
                  ? label(lang, "Transcript is not available yet.", "\u8f6c\u5199\u6682\u4e0d\u53ef\u7528\u3002")
                  : label(lang, "No transcript turns match", "\u6ca1\u6709\u5339\u914d\u7684\u8f6c\u5199\u7247\u6bb5")}
              </div>
            )}
          </div>
        </div>

        <aside className="detail-side-panel">
          <SectionTitle>{label(lang, "Speakers", "\u53d1\u8a00\u4eba")}</SectionTitle>
          <div className="speaker-list">
            {speakers.length > 0 ? speakers.map((speaker) => (
              <div className="speaker-row" key={speaker.name}>
                <span className="speaker-avatar">{speaker.initials}</span>
                <span>
                  <strong>{speaker.name}</strong>
                  <span className="sub">
                    {speaker.track} - {speaker.duration}
                  </span>
                </span>
              </div>
            )) : <div className="empty-state">{label(lang, "No speaker data", "\u6682\u65e0\u53d1\u8a00\u4eba\u6570\u636e")}</div>}
          </div>
          <SectionTitle>{label(lang, "Jump to topic", "\u8df3\u5230\u4e3b\u9898")}</SectionTitle>
          <div className="topic-jump-list">
            {topicJumps.length > 0 ? topicJumps.map((topic) => (
              <button
                className={topic === activeTopic ? "active" : ""}
                key={`${topic.time}-${topic.title}`}
                onClick={() => setPlaybackTimeMs(topic.startTimeMs)}
                type="button"
              >
                <span className="mono">{topic.time}</span>
                {topic.title}
              </button>
            )) : <div className="empty-state">{label(lang, "No topics yet", "\u6682\u65e0\u4e3b\u9898")}</div>}
          </div>
        </aside>
      </div>
      <AudioPlayer
        durationMs={getPlaybackDurationMs(turns, audioTracks)}
        lang={lang}
        onTimeChange={setPlaybackTimeMs}
        timeMs={playbackTimeMs}
        tracks={audioTracks}
      />
    </div>
  );
}

function Summary({
  actions,
  decisions,
  lang,
  onRegenerate,
  summary,
  topicOutline
}: {
  actions: string[];
  decisions: string[];
  lang: UiLanguage;
  onRegenerate(): void;
  summary: string;
  topicOutline: string[];
}) {
  const summaryText = summary || label(lang, "Summary is not available yet.", "\u6458\u8981\u6682\u4e0d\u53ef\u7528\u3002");

  return (
    <div className="summary-grid">
      <div className="summary-hero">
        <div className="summary-hero-head">
          <h2 className="h2">TL;DR</h2>
          <button className="btn small" onClick={onRegenerate} type="button">
            <Icon name="spark" size={11} />
            {label(lang, "Regenerate", "\u91cd\u65b0\u751f\u6210")}
          </button>
        </div>
        <p className="sub" style={{ color: "var(--text)" }}>
          {summaryText}
        </p>
      </div>
      <div className="summary-columns">
        <SummarySection count={decisions.length} emptyText={label(lang, "No decisions", "\u6682\u65e0\u51b3\u7b56")} items={decisions} title={label(lang, "Decisions", "\u51b3\u7b56")} />
        <SummarySection count={actions.length} emptyText={label(lang, "No action items", "\u6682\u65e0\u5f85\u529e")} items={actions} title={label(lang, "Action items", "\u5f85\u529e\u4e8b\u9879")} />
      </div>
      <SummarySection count={topicOutline.length} emptyText={label(lang, "No topic outline", "\u6682\u65e0\u4e3b\u9898\u5927\u7eb2")} items={topicOutline} title={label(lang, "Topic outline", "\u4e3b\u9898\u5927\u7eb2")} />
    </div>
  );
}

function MapPreview({
  lang,
  mapTopics,
  meeting,
  onOpenHtml
}: {
  lang: UiLanguage;
  mapTopics: MapTopic[];
  meeting: MeetingMetadata | null;
  onOpenHtml(): void;
}) {
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
        <div className="map-root-node">{meeting?.title ?? label(lang, "Meeting", "\u4f1a\u8bae")}</div>
        <div className="map-branch-grid">
          {mapTopics.length > 0 ? mapTopics.map((topic) => (
            <div className="map-topic" key={topic.title}>
              <strong>{topic.title}</strong>
              <span className="mono">{topic.time}</span>
              {topic.children.map((child) => (
                <span className={`map-child ${child.kind}`} key={child.text}>
                  {child.text}
                </span>
              ))}
            </div>
          )) : <div className="empty-state">{label(lang, "Structure map is not available yet.", "\u7ed3\u6784\u56fe\u6682\u4e0d\u53ef\u7528\u3002")}</div>}
        </div>
      </div>
    </div>
  );
}

function ExportDialog({
  exportDefaults,
  hasAudio,
  lang,
  onClose,
  outputLanguage,
  onExport
}: {
  exportDefaults: ExportDefaults;
  hasAudio: boolean;
  lang: UiLanguage;
  onClose(): void;
  outputLanguage: MeetingMetadata["outputLanguage"];
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

  function changeFormat(nextFormat: ExportFormat) {
    setFormat(nextFormat);
    if (nextFormat === "word") {
      setOptions((current) => ({ ...current, audio: false }));
    }
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
              onClick={() => changeFormat("word")}
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
              onClick={() => changeFormat("html")}
              subtitle={label(lang, "Interactive single-file HTML", "\u53ef\u4ea4\u4e92\u5355\u6587\u4ef6 HTML")}
              title={label(lang, "Structure map", "\u7ed3\u6784\u56fe")}
            />
          </div>

          <div className="field-label">{label(lang, "Include", "\u5305\u542b\u5185\u5bb9")}</div>
          <div className="export-option-list">
            {EXPORT_OPTIONS.map((option) => {
              const disabled = option.id === "audio" && (format !== "html" || !hasAudio);
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
            <span className={outputLanguage === "zh" ? "active" : ""}>{label(lang, "Chinese", "\u4e2d\u6587")}</span>
            <span className={outputLanguage === "en" ? "active" : ""}>{label(lang, "English", "\u82f1\u6587")}</span>
            <span className={outputLanguage === "bilingual" ? "active" : ""}>{label(lang, "Bilingual", "\u53cc\u8bed")}</span>
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
          <button className="btn primary" onClick={() => onExport(format, format === "word" ? { ...options, audio: false } : options)} type="button">
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

function TranscriptTurnRow({
  active,
  refCallback,
  turn
}: {
  active: boolean;
  refCallback(element: HTMLElement | null): void;
  turn: TranscriptTurn;
}) {
  return (
    <article
      aria-current={active ? "true" : undefined}
      className={`turn-row ${active ? "active" : ""}`}
      ref={refCallback}
    >
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

function SummarySection({
  count,
  emptyText,
  items,
  title
}: {
  count: number;
  emptyText: ReactNode;
  items: string[];
  title: ReactNode;
}) {
  return (
    <section className="summary-section">
      <div className="summary-section-head">
        <h3>{title}</h3>
        <span className="chip">{count}</span>
      </div>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">{emptyText}</div>
      )}
    </section>
  );
}

function AudioPlayer({
  durationMs,
  lang,
  onTimeChange,
  timeMs,
  tracks
}: {
  durationMs: number;
  lang: UiLanguage;
  onTimeChange(timeMs: number): void;
  timeMs: number;
  tracks: AudioPlaybackTrack[];
}) {
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selectedTrackId, setSelectedTrackId] = useState<AudioPlaybackTrack["track"] | null>(
    tracks[0]?.track ?? null
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const activeTrack = tracks.find((track) => track.track === selectedTrackId) ?? tracks[0] ?? null;
  const activeTrackId = activeTrack?.track ?? null;
  const peaks = useMemo(() => activeTrack?.peaks.length ? activeTrack.peaks : [], [activeTrack]);
  const safeDurationMs = Math.max(0, activeTrack?.durationMs ?? durationMs);
  const progress = safeDurationMs > 0 ? Math.max(0, Math.min(1, timeMs / safeDurationMs)) : 0;
  const playbackRates = [1, 1.25, 1.5, 2];

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, activeTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const nextSeconds = timeMs / 1000;
    if (Math.abs(audio.currentTime - nextSeconds) > 0.4) {
      audio.currentTime = nextSeconds;
    }
  }, [timeMs, activeTrack]);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const bars = barRefs.current.filter(Boolean);
    if (bars.length === 0) {
      return;
    }

    gsap.to(bars, {
      duration: reduceMotion ? 0 : 0.18,
      ease: "power2.out",
      overwrite: "auto",
      scaleY: (index) => Math.max(0.08, peaks[index] ?? 0.02),
      stagger: reduceMotion ? 0 : { amount: 0.04, from: "start" },
      transformOrigin: "50% 50%"
    });
  }, [peaks]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    setPlaying(true);
    const playResult = audio.play();
    if (playResult && typeof playResult.catch === "function") {
      void playResult.catch(() => setPlaying(false));
    }
  }

  function seek(nextTimeMs: number) {
    const boundedTimeMs = Math.max(0, Math.min(safeDurationMs, nextTimeMs));
    if (audioRef.current) {
      audioRef.current.currentTime = boundedTimeMs / 1000;
    }
    onTimeChange(boundedTimeMs);
  }

  function selectTrack(track: AudioPlaybackTrack["track"]) {
    setSelectedTrackId(track);
    setPlaying(false);
    onTimeChange(0);
  }

  return (
    <div className="audio-player">
      {activeTrack ? (
        <audio
          aria-label={text(lang, "Meeting audio", "\u4f1a\u8bae\u97f3\u9891")}
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
          onPlay={() => setPlaying(true)}
          onTimeUpdate={(event) => onTimeChange(event.currentTarget.currentTime * 1000)}
          preload="metadata"
          ref={audioRef}
          src={activeTrack.audioUrl}
        />
      ) : null}
      <button
        aria-label={playing ? text(lang, "Pause recording", "\u6682\u505c\u5f55\u97f3") : text(lang, "Play recording", "\u64ad\u653e\u5f55\u97f3")}
        className="audio-play-button"
        disabled={!activeTrack}
        onClick={togglePlayback}
        type="button"
      >
        <Icon name={playing ? "pause" : "play"} size={15} />
      </button>
      <span className="mono">{formatDurationMs(timeMs)}</span>
      <div className="audio-wave-wrap">
        <div className="audio-wave" aria-label={text(lang, "Recording waveform", "\u5f55\u97f3\u6ce2\u5f62")}>
          {peaks.length > 0 ? peaks.map((peak, index) => (
            <span
              className={index / peaks.length <= progress ? "played" : ""}
              data-testid="audio-wave-bar"
              key={`${peak}-${index}`}
              ref={(element) => {
                barRefs.current[index] = element;
              }}
              style={{ transform: `scaleY(${Math.max(0.08, peak)})` }}
            />
          )) : <span className="audio-empty-wave">{label(lang, "No audio waveform", "\u6682\u65e0\u97f3\u9891\u6ce2\u5f62")}</span>}
        </div>
        <input
          aria-label={text(lang, "Seek recording", "\u62d6\u52a8\u64ad\u653e\u4f4d\u7f6e")}
          className="audio-seek"
          disabled={!activeTrack}
          max={safeDurationMs}
          min={0}
          onChange={(event) => seek(Number(event.target.value))}
          step={100}
          type="range"
          value={Math.round(timeMs)}
        />
      </div>
      <span className="mono">{formatDurationMs(safeDurationMs)}</span>
      {tracks.length > 1 ? (
        <select
          aria-label={text(lang, "Audio track", "\u97f3\u9891\u8f68\u9053")}
          className="audio-track-select"
          onChange={(event) => selectTrack(event.target.value as AudioPlaybackTrack["track"])}
          value={activeTrackId ?? ""}
        >
          {tracks.map((track) => (
            <option key={track.track} value={track.track}>
              {track.track === "system" ? label(lang, "System", "\u7cfb\u7edf") : label(lang, "Mic", "\u9ea6\u514b\u98ce")}
            </option>
          ))}
        </select>
      ) : null}
      <button
        aria-label={text(lang, "Playback speed", "\u64ad\u653e\u901f\u5ea6")}
        className="btn small"
        onClick={() => {
          const currentIndex = playbackRates.indexOf(playbackRate);
          setPlaybackRate(playbackRates[(currentIndex + 1) % playbackRates.length]);
        }}
        type="button"
      >
        {playbackRate.toFixed(playbackRate % 1 === 0 ? 1 : 2)}x
      </button>
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

function buildTranscriptTurns(detailData: MeetingDetailData | null): TranscriptTurn[] {
  const segments = detailData?.transcript?.segments ?? [];
  const decisionSegmentIds = new Set(
    detailData?.structure?.decisions.flatMap((decision) => decision.sourceRefs.map((ref) => ref.segmentId)) ?? []
  );
  const actionSegmentIds = new Set(
    detailData?.structure?.actionItems.flatMap((action) => action.sourceRefs.map((ref) => ref.segmentId)) ?? []
  );

  return [...segments]
    .sort((left, right) => left.startTimeMs - right.startTimeMs)
    .map((segment) => ({
      id: segment.id,
      speaker: segment.speakerLabel ?? (segment.trackId === "microphone" ? "Microphone" : "System audio"),
      role: segment.language.toUpperCase(),
      track: segment.trackId === "microphone" ? "mic" : "system",
      time: formatDurationMs(segment.startTimeMs),
      startTimeMs: segment.startTimeMs,
      endTimeMs: segment.endTimeMs,
      text: segment.text,
      tag: decisionSegmentIds.has(segment.id) ? "decision" : actionSegmentIds.has(segment.id) ? "action" : undefined
    }));
}

function buildSpeakers(turns: TranscriptTurn[]): SpeakerSummary[] {
  const byTrack = new Map<TranscriptTurn["track"], { name: string; durationMs: number }>();

  for (const turn of turns) {
    const current = byTrack.get(turn.track) ?? {
      name: turn.track === "mic" ? "Microphone" : "System audio",
      durationMs: 0
    };
    current.durationMs = Math.max(current.durationMs, turn.endTimeMs);
    byTrack.set(turn.track, current);
  }

  return [...byTrack.entries()].map(([track, item]) => ({
    initials: track === "mic" ? "MIC" : "SYS",
    name: item.name,
    track: track === "mic" ? "mic" : "system",
    duration: formatDurationMs(item.durationMs)
  }));
}

function buildTopicJumps(detailData: MeetingDetailData | null): TopicJump[] {
  return (detailData?.structure?.topics ?? []).map((topic) => ({
    time: formatDurationMs(firstSourceStart(topic.sourceRefs)),
    startTimeMs: firstSourceStart(topic.sourceRefs),
    title: topic.title
  }));
}

function buildMapTopics(detailData: MeetingDetailData | null): MapTopic[] {
  const structure = detailData?.structure;
  if (!structure) {
    return [];
  }

  return structure.topics.map((topic) => ({
    title: topic.title,
    time: formatDurationMs(firstSourceStart(topic.sourceRefs)),
    children: [
      ...structure.decisions.filter((decision) => sameTopic(decision, topic.id)).map((decision) => ({
        kind: "decision" as const,
        text: decision.text
      })),
      ...structure.actionItems.filter((action) => sameTopic(action, topic.id)).map((action) => ({
        kind: "action" as const,
        text: formatActionItem(action)
      })),
      ...structure.openQuestions.filter((question) => sameTopic(question, topic.id)).map((question) => ({
        kind: "question" as const,
        text: question.text
      })),
      ...structure.risks.filter((risk) => sameTopic(risk, topic.id)).map((risk) => ({
        kind: "risk" as const,
        text: risk.text
      }))
    ]
  }));
}

function sameTopic(
  item: MeetingActionItem | MeetingDecision | MeetingOpenQuestion | MeetingRisk,
  topicId: string
): boolean {
  return item.topicId === topicId;
}

function formatActionItem(action: MeetingActionItem): string {
  return action.owner ? `${action.owner}: ${action.text}` : action.text;
}

function firstSourceStart(sourceRefs: SourceReference[]): number {
  const earliest = sourceRefs.reduce((current, ref) => Math.min(current, ref.startTimeMs), Number.POSITIVE_INFINITY);
  return earliest === Number.POSITIVE_INFINITY ? 0 : earliest;
}

function getTranscriptDurationMs(turns: TranscriptTurn[]): number {
  return turns.reduce((duration, turn) => Math.max(duration, turn.endTimeMs), 0);
}

function getPlaybackDurationMs(turns: TranscriptTurn[], tracks: AudioPlaybackTrack[]): number {
  return Math.max(
    getTranscriptDurationMs(turns),
    ...tracks.map((track) => track.durationMs)
  );
}

function findActiveTurnId(turns: TranscriptTurn[], playbackTimeMs: number): string | null {
  const active = turns.find(
    (turn) => playbackTimeMs >= turn.startTimeMs && playbackTimeMs < turn.endTimeMs
  );
  return active?.id ?? null;
}

function findActiveTopic(topicJumps: TopicJump[], playbackTimeMs: number): TopicJump | null {
  const sorted = [...topicJumps].sort((left, right) => left.startTimeMs - right.startTimeMs);
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (playbackTimeMs >= sorted[index].startTimeMs) {
      return sorted[index];
    }
  }

  return sorted[0] ?? null;
}

function formatDurationMs(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function outputLanguageLabel(outputLanguage: MeetingMetadata["outputLanguage"], lang: UiLanguage) {
  if (outputLanguage === "zh") {
    return label(lang, "Chinese", "\u4e2d\u6587");
  }

  if (outputLanguage === "en") {
    return label(lang, "English", "\u82f1\u6587");
  }

  return label(lang, "Bilingual", "\u53cc\u8bed");
}
