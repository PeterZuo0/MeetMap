import { useState } from "react";
import type { ReactNode } from "react";
import type { MeetingMetadata } from "../../features/meetings/meetingTypes";
import type { UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";

type DetailTab = "transcript" | "summary" | "map";

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
  const isNoAudio = meeting?.status === "no_audio";

  return (
    <section className="pane" aria-label="Meeting detail">
      <div className="screen-head">
        <div>
          <h1 className="h1">Meeting detail</h1>
          <p className="sub">{meeting?.title ?? "Q3 roadmap review"}</p>
        </div>
        <div style={{ display: isNoAudio ? "none" : "flex", gap: 8 }}>
          <button className="btn" onClick={() => onExport("word")} type="button">
            <Icon name="download" size={13} />
            Open Word summary
          </button>
          <button className="btn primary" onClick={() => onExport("html")} type="button">
            <Icon name="spark" size={13} />
            Open HTML map
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
