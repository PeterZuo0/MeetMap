import { useMemo, useState } from "react";
import type { MeetingMetadata } from "../../features/meetings/meetingTypes";
import type { ReactNode } from "react";
import type { UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";

type LibraryFilter = "all" | "today" | "week" | "processing";
type LibraryView = "list" | "grid";

type LibraryMeeting = {
  id: string;
  title: string;
  zh: string;
  date: string;
  dur: string;
  lang: "zh" | "en" | "mix";
  speakers: number;
  tag: string;
  status: "ready" | "processing";
  pinned?: boolean;
  snippet: string;
};

const SAMPLE_MEETINGS: LibraryMeeting[] = [
  {
    id: "m1",
    title: "Q3 roadmap review",
    zh: "Q3 \u8def\u7ebf\u56fe\u8bc4\u5ba1",
    date: "Today - 10:30",
    dur: "52m",
    lang: "mix",
    speakers: 5,
    tag: "Product weekly",
    status: "ready",
    pinned: true,
    snippet: "Locking the ship list for July. Discussed cuts to async digest and the structure-map exporter."
  },
  {
    id: "m2",
    title: "Acme Corp - onboarding kickoff",
    zh: "Acme \u5408\u4f5c\u542f\u52a8\u4f1a",
    date: "Today - 09:00",
    dur: "1h 14m",
    lang: "en",
    speakers: 4,
    tag: "Client calls",
    status: "ready",
    snippet: "Kickoff with David and team. They want SSO in phase 1; mock promised by Friday."
  },
  {
    id: "m3",
    title: "Design review - recording workflow",
    zh: "\u8bbe\u8ba1\u8bc4\u5ba1 - \u5f55\u97f3\u8f6c\u5199\u65b0\u6d41\u7a0b",
    date: "Yesterday - 16:00",
    dur: "38m",
    lang: "zh",
    speakers: 3,
    tag: "Design",
    status: "ready",
    snippet: "Discussed waveform visualization and keeping dual-track display."
  },
  {
    id: "m4",
    title: "1:1 with Maya",
    zh: "Maya \u4e00\u5bf9\u4e00",
    date: "Yesterday - 11:00",
    dur: "27m",
    lang: "en",
    speakers: 2,
    tag: "1:1s",
    status: "ready",
    snippet: "Career conversation. Maya wants to lead the export pipeline."
  },
  {
    id: "m5",
    title: "User interview - sales manager",
    zh: "\u7528\u6237\u8bbf\u8c08 - \u9500\u552e\u7ecf\u7406",
    date: "Mon - 14:20",
    dur: "44m",
    lang: "zh",
    speakers: 2,
    tag: "Research",
    status: "ready",
    snippet: "Pain point: meeting cleanup still takes 4.5 hours per week."
  },
  {
    id: "m6",
    title: "Eng all-hands",
    zh: "\u5de5\u7a0b\u5168\u5458\u4f1a",
    date: "Mon - 10:00",
    dur: "1h 03m",
    lang: "mix",
    speakers: 12,
    tag: "All-hands",
    status: "ready",
    snippet: "Quarterly review and reliability numbers."
  },
  {
    id: "m7",
    title: "Vendor sync - Tencent Cloud STT",
    zh: "\u4f9b\u5e94\u5546\u5bf9\u63a5 - \u817e\u8baf\u4e91\u8bed\u97f3",
    date: "Fri - 15:00",
    dur: "33m",
    lang: "mix",
    speakers: 3,
    tag: "Vendors",
    status: "processing",
    snippet: "Discussing rate limits for batch jobs. Vendor proposal due next week."
  },
  {
    id: "m8",
    title: "Customer call - overseas feedback",
    zh: "\u5ba2\u6237\u7535\u8bdd - \u6d77\u5916\u7528\u6237\u53cd\u9988",
    date: "Fri - 09:30",
    dur: "21m",
    lang: "mix",
    speakers: 2,
    tag: "Client calls",
    status: "ready",
    snippet: "System-audio recognition is accurate, but microphone noise needs diagnosis."
  },
  {
    id: "m9",
    title: "Hiring debrief - Senior PM",
    zh: "\u62db\u8058\u8ba8\u8bba - \u9ad8\u7ea7 PM",
    date: "Thu - 17:00",
    dur: "29m",
    lang: "en",
    speakers: 4,
    tag: "Hiring",
    status: "ready",
    snippet: "Two strong yeses on Priya. Reference check needed."
  }
];

const STATS = [
  { labelEn: "TOTAL MEETINGS", labelZh: "\u4f1a\u8bae\u603b\u6570", value: "142", trend: "+12 this week" },
  { labelEn: "HOURS CAPTURED", labelZh: "\u5f55\u5236\u65f6\u957f", value: "87.4h", trend: "+9.1h this week" },
  { labelEn: "ACTION ITEMS", labelZh: "\u5f85\u529e\u4e8b\u9879", value: "38", trend: "12 open" },
  { labelEn: "STORAGE USED", labelZh: "\u5b58\u50a8\u5df2\u7528", value: "9.4 GB", trend: "of 100 GB" }
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
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [folderFilter, setFolderFilter] = useState<"all" | "client">("all");
  const [dateFilter, setDateFilter] = useState<"any" | "week">("any");
  const [view, setView] = useState<LibraryView>("list");

  const meetings = useMemo(
    () =>
      SAMPLE_MEETINGS.filter((meeting) => {
        const matchesStatus =
          filter === "all" ||
          (filter === "today" && meeting.date.startsWith("Today")) ||
          (filter === "week" && ["Today", "Yesterday", "Mon", "Fri", "Thu"].some((day) => meeting.date.startsWith(day))) ||
          (filter === "processing" && meeting.status === "processing");
        const matchesFolder = folderFilter === "all" || meeting.tag === "Client calls";
        const matchesDate = dateFilter === "any" || !meeting.date.startsWith("Thu");
        return matchesStatus && matchesFolder && matchesDate;
      }),
    [dateFilter, filter, folderFilter]
  );

  return (
    <section className="pane" aria-label="Meeting library">
      <div className="screen-head">
        <div>
          <h1 className="h1">{label(lang, "All meetings", "\u5168\u90e8\u4f1a\u8bae")}</h1>
          <p className="sub">{label(lang, "Browse recordings, transcripts, summaries, and maps.", "\u6d4f\u89c8\u5f55\u97f3\u3001\u8f6c\u5199\u3001\u6458\u8981\u548c\u7ed3\u6784\u56fe\u3002")}</p>
        </div>
        <button className="btn primary" onClick={onNew} type="button">
          <Icon name="record" size={14} />
          {label(lang, "New recording", "\u65b0\u5efa\u5f55\u5236")}
        </button>
      </div>

      <div className="stats-grid library-stats">
        {STATS.map((stat) => (
          <Stat key={stat.labelEn} label={label(lang, stat.labelEn, stat.labelZh)} trend={stat.trend} value={stat.value} />
        ))}
      </div>

      <LibraryControls
        dateFilter={dateFilter}
        filter={filter}
        folderFilter={folderFilter}
        lang={lang}
        onDateFilterChange={() => setDateFilter((current) => (current === "any" ? "week" : "any"))}
        onFilterChange={setFilter}
        onFolderFilterChange={() => setFolderFilter((current) => (current === "all" ? "client" : "all"))}
        onViewChange={setView}
        view={view}
      />

      {currentMeeting ? (
        <button className="meeting-row current" onClick={onOpenCurrent} type="button">
          <div>
            <div className="h2">{currentMeeting.title}</div>
            <div className="sub">
              {currentMeeting.status} - {currentMeeting.outputLanguage}
            </div>
          </div>
          <span className="chip">{label(lang, "Current session", "\u5f53\u524d\u4f1a\u8bdd")}</span>
        </button>
      ) : null}

      {view === "list" ? <MeetingTable lang={lang} meetings={meetings} /> : <MeetingGrid lang={lang} meetings={meetings} />}

      <div className="library-footnote">
        {label(lang, `Showing ${meetings.length} of 142 - older meetings auto-archive after 90 days`, `\u663e\u793a ${meetings.length} / 142 - 90 \u5929\u524d\u7684\u4f1a\u8bae\u4f1a\u81ea\u52a8\u5f52\u6863`)}
      </div>
    </section>
  );
}

function LibraryControls({
  dateFilter,
  filter,
  folderFilter,
  lang,
  onDateFilterChange,
  onFilterChange,
  onFolderFilterChange,
  onViewChange,
  view
}: {
  dateFilter: "any" | "week";
  filter: LibraryFilter;
  folderFilter: "all" | "client";
  lang: UiLanguage;
  onDateFilterChange(): void;
  onFilterChange(filter: LibraryFilter): void;
  onFolderFilterChange(): void;
  onViewChange(view: LibraryView): void;
  view: LibraryView;
}) {
  const filterOptions: Array<{ id: LibraryFilter; en: string; zh: string; count: number }> = [
    { id: "all", en: "All", zh: "\u5168\u90e8", count: 142 },
    { id: "today", en: "Today", zh: "\u4eca\u5929", count: 2 },
    { id: "week", en: "This week", zh: "\u672c\u5468", count: 9 },
    { id: "processing", en: "Processing", zh: "\u5904\u7406\u4e2d", count: 1 }
  ];

  return (
    <div className="library-controls">
      <div className="filter-tabs" role="group" aria-label="Meeting filters">
        {filterOptions.map((option) => (
          <button
            className={filter === option.id ? "active" : ""}
            key={option.id}
            onClick={() => onFilterChange(option.id)}
            type="button"
          >
            {label(lang, option.en, option.zh)}
            <span>{option.count}</span>
          </button>
        ))}
      </div>
      <button className={`btn ${folderFilter === "client" ? "soft-active" : ""}`} onClick={onFolderFilterChange} type="button">
        <Icon name="filter" size={12} />
        {folderFilter === "client" ? "Filter: Client calls" : label(lang, "Filter", "\u7b5b\u9009")}
      </button>
      <button className={`btn ${dateFilter === "week" ? "soft-active" : ""}`} onClick={onDateFilterChange} type="button">
        <Icon name="calendar" size={12} />
        {dateFilter === "week" ? "Date: This week" : label(lang, "Any date", "\u4efb\u610f\u65f6\u95f4")}
      </button>
      <div className="view-toggle">
        <button aria-label="List view" className={view === "list" ? "active" : ""} onClick={() => onViewChange("list")} type="button">
          <Icon name="list" size={14} />
        </button>
        <button aria-label="Grid view" className={view === "grid" ? "active" : ""} onClick={() => onViewChange("grid")} type="button">
          <Icon name="grid" size={14} />
        </button>
      </div>
    </div>
  );
}

function MeetingTable({ lang, meetings }: { lang: UiLanguage; meetings: LibraryMeeting[] }) {
  return (
    <div className="meeting-table" role="table" aria-label="Meetings">
      <div className="meeting-table-head" role="row">
        <div role="columnheader">{label(lang, "Meeting", "\u4f1a\u8bae")}</div>
        <div role="columnheader">{label(lang, "Folder", "\u5f52\u5c5e")}</div>
        <div role="columnheader">{label(lang, "Lang", "\u8bed\u8a00")}</div>
        <div role="columnheader">{label(lang, "Speakers", "\u4eba\u6570")}</div>
        <div role="columnheader">{label(lang, "Date", "\u65f6\u95f4")}</div>
        <div />
      </div>
      {meetings.map((meeting) => (
        <div className="meeting-table-row" key={meeting.id} role="row">
          <div className="meeting-title-cell" role="cell">
            <div>
              {meeting.pinned ? <Icon name="pin" size={11} style={{ color: "var(--accent)" }} /> : null}
              <strong>{lang === "zh" ? meeting.zh : meeting.title}</strong>
              {meeting.status === "processing" ? <span className="chip status-chip">{label(lang, "Processing", "\u5904\u7406\u4e2d")}</span> : null}
            </div>
            <span>{meeting.snippet}</span>
          </div>
          <div role="cell">{meeting.tag}</div>
          <div role="cell"><LanguageChip value={meeting.lang} /></div>
          <div className="speaker-cell" role="cell">
            <Icon name="users" size={12} />
            {meeting.speakers}
            <span>{meeting.dur}</span>
          </div>
          <div role="cell">{meeting.date}</div>
          <div role="cell"><Icon name="more" size={15} style={{ color: "var(--text-faint)" }} /></div>
        </div>
      ))}
    </div>
  );
}

function MeetingGrid({ lang, meetings }: { lang: UiLanguage; meetings: LibraryMeeting[] }) {
  return (
    <div className="meeting-card-grid" role="list" aria-label="Meeting grid">
      {meetings.map((meeting) => (
        <article className="meeting-card" key={meeting.id} role="listitem">
          <div className="meeting-card-head">
            <LanguageChip value={meeting.lang} />
            {meeting.status === "processing" ? <span className="chip status-chip">{label(lang, "Processing", "\u5904\u7406\u4e2d")}</span> : null}
          </div>
          <h2 className="h2">{lang === "zh" ? meeting.zh : meeting.title}</h2>
          <p className="sub">{meeting.snippet}</p>
          <div className="meeting-card-meta">
            <span>{meeting.tag}</span>
            <span>{meeting.date}</span>
            <span>{meeting.dur}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function LanguageChip({ value }: { value: LibraryMeeting["lang"] }) {
  const labelText = value === "zh" ? "\u4e2d" : value === "en" ? "EN" : "\u4e2d/EN";
  return <span className={`chip lang-chip ${value}`}>{labelText}</span>;
}

function Stat({ label: statLabel, trend, value }: { label: ReactNode; trend: string; value: string }) {
  return (
    <div className="card library-stat">
      <div className="stat-label">{statLabel}</div>
      <div className="metric">{value}</div>
      <div className="sub">{trend}</div>
    </div>
  );
}
