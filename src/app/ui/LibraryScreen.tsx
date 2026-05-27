import type { MeetingMetadata } from "../../features/meetings/meetingTypes";
import type { ReactNode } from "react";
import type { UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";

const SAMPLE_MEETINGS = [
  {
    id: "m1",
    title: "Q3 roadmap review",
    zh: "Q3 路线图评审",
    date: "Today · 10:30",
    dur: "52m",
    tag: "Product weekly",
    snippet: "Locked July ship list and discussed the structure-map exporter."
  },
  {
    id: "m2",
    title: "Tencent STT pricing",
    zh: "腾讯语音价格沟通",
    date: "Yesterday · 15:00",
    dur: "38m",
    tag: "Client calls",
    snippet: "Batch pricing, upload limits, and retry behavior remain open."
  },
  {
    id: "m3",
    title: "1:1 with Maya",
    zh: "Maya 一对一",
    date: "Yesterday · 11:00",
    dur: "27m",
    tag: "1:1s",
    snippet: "Maya wants to lead the export pipeline scope."
  }
];

export function LibraryScreen({
  lang,
  currentMeeting,
  onOpenCurrent,
  onNew
}: {
  lang: UiLanguage;
  currentMeeting: MeetingMetadata | null;
  onOpenCurrent(): void;
  onNew(): void;
}) {
  return (
    <section className="pane" aria-label="Meeting library">
      <div className="screen-head">
        <div>
          <h1 className="h1">{label(lang, "All meetings", "全部会议")}</h1>
          <p className="sub">{label(lang, "Browse recordings, transcripts, summaries, and maps.", "浏览录音、文字记录、摘要和结构图。")}</p>
        </div>
        <button className="btn primary" onClick={onNew} type="button">
          <Icon name="record" size={14} />
          {label(lang, "New recording", "新建录制")}
        </button>
      </div>

      <div className="stats-grid">
        <Stat label={label(lang, "Meetings", "会议")} value="142" />
        <Stat label={label(lang, "This week", "本周")} value="8" />
        <Stat label={label(lang, "Actions", "待办")} value="37" />
        <Stat label={label(lang, "Exports", "导出")} value="64" />
      </div>

      <div className="grid">
        {currentMeeting ? (
          <button className="meeting-row current" onClick={onOpenCurrent} type="button">
            <div>
              <div className="h2">{currentMeeting.title}</div>
              <div className="sub">
                {currentMeeting.status} · {currentMeeting.outputLanguage}
              </div>
            </div>
            <span className="chip">{label(lang, "Current session", "当前会话")}</span>
          </button>
        ) : null}

        {SAMPLE_MEETINGS.map((meeting) => (
          <div className="meeting-row" key={meeting.id}>
            <div>
              <div className="h2">{lang === "zh" ? meeting.zh : meeting.title}</div>
              <div className="sub">{meeting.snippet}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <span className="chip">{meeting.date}</span>
                <span className="chip">{meeting.dur}</span>
                <span className="chip">{meeting.tag}</span>
              </div>
            </div>
            <Icon name="file" size={18} style={{ color: "var(--text-faint)" }} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label: statLabel, value }: { label: ReactNode; value: string }) {
  return (
    <div className="card">
      <div className="metric">{value}</div>
      <div className="sub">{statLabel}</div>
    </div>
  );
}
