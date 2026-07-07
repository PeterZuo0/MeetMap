import { useMemo, useState } from "react";
import type { MeetingMetadata, MeetingStatus } from "../../features/meetings/meetingTypes";
import type { KeyboardEvent, ReactNode } from "react";
import type { UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";

type LibraryFilter = "all" | "today" | "week" | "processing";
type LibraryView = "list" | "grid";
type LibraryLanguage = "zh" | "en" | "mix";

type LibraryMeeting = {
  id: string;
  title: string;
  date: string;
  duration: string;
  lang: LibraryLanguage;
  status: MeetingStatus;
  tracks: string;
  snippet: string;
  updatedAtMs: number;
  isToday: boolean;
  isThisWeek: boolean;
  byteLength: number;
  durationMs: number;
};

export function LibraryScreen({
  lang,
  currentMeeting,
  isImportingAudio,
  meetings,
  workspacePath,
  onChooseWorkspace,
  onImportAudio,
  onOpenCurrent,
  onOpenMeeting,
  onRevealMeeting,
  onReprocessMeeting,
  onExportMeeting,
  onNew,
  onRevealWorkspace
}: {
  lang: UiLanguage;
  currentMeeting: MeetingMetadata | null;
  isImportingAudio: boolean;
  meetings: MeetingMetadata[];
  workspacePath: string | null;
  onChooseWorkspace(): void;
  onImportAudio(): void;
  onOpenCurrent(): void;
  onOpenMeeting(meetingId: string): void;
  onRevealMeeting(meetingId: string): void;
  onReprocessMeeting(meetingId: string): void;
  onExportMeeting(meetingId: string, kind: "word" | "html"): void;
  onNew(): void;
  onRevealWorkspace(): void;
}) {
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [view, setView] = useState<LibraryView>("list");
  const libraryMeetings = useMemo(() => meetings.map(toLibraryMeeting), [meetings]);
  const filteredMeetings = useMemo(
    () =>
      libraryMeetings.filter((meeting) => {
        if (filter === "today") {
          return meeting.isToday;
        }

        if (filter === "week") {
          return meeting.isThisWeek;
        }

        if (filter === "processing") {
          return isProcessingStatus(meeting.status);
        }

        return true;
      }),
    [filter, libraryMeetings]
  );
  const stats = createStats(libraryMeetings, lang);
  const filterCounts = createFilterCounts(libraryMeetings);

  return (
    <section className="pane" aria-label="Meeting library">
      <div className="screen-head">
        <div>
          <h1 className="h1">{label(lang, "All meetings", "\u5168\u90e8\u4f1a\u8bae")}</h1>
          <p className="sub">
            {workspacePath
              ? label(lang, "Browse recordings, transcripts, summaries, and maps from this workspace.", "\u6d4f\u89c8\u6b64\u5de5\u4f5c\u533a\u7684\u5f55\u97f3\u3001\u8f6c\u5199\u3001\u6458\u8981\u548c\u7ed3\u6784\u56fe\u3002")
              : label(lang, "Choose a workspace folder before recording meetings.", "\u5f55\u5236\u4f1a\u8bae\u524d\u8bf7\u5148\u9009\u62e9\u5de5\u4f5c\u533a\u6587\u4ef6\u5939\u3002")}
          </p>
        </div>
        <div className="screen-actions">
          {workspacePath ? (
            <button className="btn" onClick={onRevealWorkspace} type="button">
              <Icon name="folder" size={14} />
              {label(lang, "Open folder", "\u6253\u5f00\u6587\u4ef6\u5939")}
            </button>
          ) : null}
          <button className="btn" onClick={onChooseWorkspace} type="button">
            <Icon name="file" size={14} />
            {label(lang, "Change folder", "\u66f4\u6362\u6587\u4ef6\u5939")}
          </button>
          <button className="btn" disabled={isImportingAudio} onClick={onImportAudio} type="button">
            <Icon name="download" size={14} />
            {isImportingAudio
              ? label(lang, "Importing...", "\u6b63\u5728\u5bfc\u5165...")
              : label(lang, "Import audio", "\u5bfc\u5165\u97f3\u9891")}
          </button>
          <button className="btn primary" onClick={onNew} type="button">
            <Icon name="record" size={14} />
            {label(lang, "New recording", "\u65b0\u5efa\u5f55\u5236")}
          </button>
        </div>
      </div>

      <div className="stats-grid library-stats">
        {stats.map((stat) => (
          <Stat key={stat.id} label={stat.labelText} trend={stat.trend} value={stat.value} />
        ))}
      </div>

      <LibraryControls
        counts={filterCounts}
        filter={filter}
        lang={lang}
        onFilterChange={setFilter}
        onViewChange={setView}
        view={view}
      />

      {currentMeeting ? (
        <button className="meeting-row current" onClick={onOpenCurrent} type="button">
          <div>
            <div className="h2">{currentMeeting.title}</div>
            <div className="sub">
              {formatStatus(currentMeeting.status)} - {formatOutputLanguage(currentMeeting.outputLanguage)}
            </div>
          </div>
          <span className="chip">{label(lang, "Current session", "\u5f53\u524d\u4f1a\u8bdd")}</span>
        </button>
      ) : null}

      {view === "list" ? (
        <MeetingTable
          lang={lang}
          meetings={filteredMeetings}
          onExportMeeting={onExportMeeting}
          onOpenMeeting={onOpenMeeting}
          onRevealMeeting={onRevealMeeting}
          onReprocessMeeting={onReprocessMeeting}
        />
      ) : (
        <MeetingGrid lang={lang} meetings={filteredMeetings} onOpenMeeting={onOpenMeeting} />
      )}

      {filteredMeetings.length === 0 ? (
        <div className="empty-state">
          {meetings.length === 0
            ? label(lang, "No meetings in this workspace yet.", "\u6b64\u5de5\u4f5c\u533a\u8fd8\u6ca1\u6709\u4f1a\u8bae\u3002")
            : label(lang, "No meetings match this filter.", "\u6ca1\u6709\u7b26\u5408\u7b5b\u9009\u6761\u4ef6\u7684\u4f1a\u8bae\u3002")}
        </div>
      ) : null}

      <div className="library-footnote">
        {label(
          lang,
          `Showing ${filteredMeetings.length} of ${meetings.length} meetings from the selected workspace`,
          `\u663e\u793a\u9009\u5b9a\u5de5\u4f5c\u533a\u4e2d\u7684 ${filteredMeetings.length} / ${meetings.length} \u4e2a\u4f1a\u8bae`
        )}
      </div>
    </section>
  );
}

function LibraryControls({
  counts,
  filter,
  lang,
  onFilterChange,
  onViewChange,
  view
}: {
  counts: Record<LibraryFilter, number>;
  filter: LibraryFilter;
  lang: UiLanguage;
  onFilterChange(filter: LibraryFilter): void;
  onViewChange(view: LibraryView): void;
  view: LibraryView;
}) {
  const filterOptions: Array<{ id: LibraryFilter; en: string; zh: string }> = [
    { id: "all", en: "All", zh: "\u5168\u90e8" },
    { id: "today", en: "Today", zh: "\u4eca\u5929" },
    { id: "week", en: "This week", zh: "\u672c\u5468" },
    { id: "processing", en: "Processing", zh: "\u5904\u7406\u4e2d" }
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
            <span>{counts[option.id]}</span>
          </button>
        ))}
      </div>
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

function MeetingTable({
  lang,
  meetings,
  onExportMeeting,
  onOpenMeeting,
  onRevealMeeting,
  onReprocessMeeting
}: {
  lang: UiLanguage;
  meetings: LibraryMeeting[];
  onExportMeeting(meetingId: string, kind: "word" | "html"): void;
  onOpenMeeting(meetingId: string): void;
  onRevealMeeting(meetingId: string): void;
  onReprocessMeeting(meetingId: string): void;
}) {
  const [openMenuMeetingId, setOpenMenuMeetingId] = useState<string | null>(null);

  return (
    <div className="meeting-table" role="table" aria-label="Meetings">
      <div className="meeting-table-head" role="row">
        <div role="columnheader">{label(lang, "Meeting", "\u4f1a\u8bae")}</div>
        <div role="columnheader">{label(lang, "Status", "\u72b6\u6001")}</div>
        <div role="columnheader">{label(lang, "Lang", "\u8bed\u8a00")}</div>
        <div role="columnheader">{label(lang, "Tracks", "\u8f68\u9053")}</div>
        <div role="columnheader">{label(lang, "Updated", "\u66f4\u65b0")}</div>
        <div />
      </div>
      {meetings.map((meeting) => (
        <div aria-label={`Open ${meeting.title}`} className="meeting-table-row interactive" key={meeting.id} onClick={() => onOpenMeeting(meeting.id)} onKeyDown={(event) => openMeetingFromKeyboard(event, meeting.id, onOpenMeeting)} role="row" tabIndex={0}>
          <div className="meeting-title-cell" role="cell">
            <div>
              <strong>{meeting.title}</strong>
              {isProcessingStatus(meeting.status) ? <span className="chip status-chip">{label(lang, "Processing", "\u5904\u7406\u4e2d")}</span> : null}
            </div>
            <span>{meeting.snippet}</span>
          </div>
          <div role="cell">{formatStatus(meeting.status)}</div>
          <div role="cell"><LanguageChip value={meeting.lang} /></div>
          <div className="speaker-cell" role="cell">
            <Icon name="audio" size={12} />
            {meeting.tracks}
            <span>{meeting.duration}</span>
          </div>
          <div role="cell">{meeting.date}</div>
          <div className="meeting-more-cell" role="cell">
            <button
              aria-label={`More actions for ${meeting.title}`}
              className="icon-button"
              onClick={(event) => {
                event.stopPropagation();
                setOpenMenuMeetingId((current) => current === meeting.id ? null : meeting.id);
              }}
              type="button"
            >
              <Icon name="more" size={15} />
            </button>
            {openMenuMeetingId === meeting.id ? (
              <MeetingMoreMenu
                lang={lang}
                onClose={() => setOpenMenuMeetingId(null)}
                onExportHtml={() => onExportMeeting(meeting.id, "html")}
                onExportWord={() => onExportMeeting(meeting.id, "word")}
                onOpen={() => onOpenMeeting(meeting.id)}
                onReveal={() => onRevealMeeting(meeting.id)}
                onReprocess={() => onReprocessMeeting(meeting.id)}
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function MeetingMoreMenu({
  lang,
  onClose,
  onExportHtml,
  onExportWord,
  onOpen,
  onReveal,
  onReprocess
}: {
  lang: UiLanguage;
  onClose(): void;
  onExportHtml(): void;
  onExportWord(): void;
  onOpen(): void;
  onReveal(): void;
  onReprocess(): void;
}) {
  function run(action: () => void) {
    action();
    onClose();
  }

  return (
    <div className="meeting-more-menu" onClick={(event) => event.stopPropagation()} role="menu">
      <button onClick={() => run(onOpen)} role="menuitem" type="button">{label(lang, "Open", "\u6253\u5f00")}</button>
      <button onClick={() => run(onReveal)} role="menuitem" type="button">{label(lang, "Show in folder", "\u5728\u6587\u4ef6\u5939\u4e2d\u663e\u793a")}</button>
      <button onClick={() => run(onReprocess)} role="menuitem" type="button">{label(lang, "Reprocess", "\u91cd\u65b0\u5904\u7406")}</button>
      <button onClick={() => run(onExportWord)} role="menuitem" type="button">{label(lang, "Export Word", "\u5bfc\u51fa Word")}</button>
      <button onClick={() => run(onExportHtml)} role="menuitem" type="button">{label(lang, "Export HTML", "\u5bfc\u51fa HTML")}</button>
    </div>
  );
}

function MeetingGrid({ lang, meetings, onOpenMeeting }: { lang: UiLanguage; meetings: LibraryMeeting[]; onOpenMeeting(meetingId: string): void }) {
  return (
    <div className="meeting-card-grid" role="list" aria-label="Meeting grid">
      {meetings.map((meeting) => (
        <article aria-label={`Open ${meeting.title}`} className="meeting-card interactive" key={meeting.id} onClick={() => onOpenMeeting(meeting.id)} onKeyDown={(event) => openMeetingFromKeyboard(event, meeting.id, onOpenMeeting)} role="listitem" tabIndex={0}>
          <div className="meeting-card-head">
            <LanguageChip value={meeting.lang} />
            <span className="chip">{formatStatus(meeting.status)}</span>
          </div>
          <h2 className="h2">{meeting.title}</h2>
          <p className="sub">{meeting.snippet}</p>
          <div className="meeting-card-meta">
            <span>{meeting.tracks}</span>
            <span>{meeting.date}</span>
            <span>{meeting.duration}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function openMeetingFromKeyboard(
  event: KeyboardEvent<HTMLElement>,
  meetingId: string,
  onOpenMeeting: (meetingId: string) => void
): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  onOpenMeeting(meetingId);
}

function toLibraryMeeting(meeting: MeetingMetadata): LibraryMeeting {
  const audioTracks = Object.values(meeting.audioTracks);
  const durationMs = audioTracks.reduce((total, track) => total + (track?.durationMs ?? 0), 0);
  const byteLength = audioTracks.reduce((total, track) => total + (track?.byteLength ?? 0), 0);
  const updatedAtMs = Date.parse(meeting.timestamps.updatedAt);

  return {
    id: meeting.id,
    title: meeting.title || "Untitled meeting",
    date: formatUpdatedAt(meeting.timestamps.updatedAt),
    duration: formatDuration(durationMs),
    lang: formatLibraryLanguage(meeting.outputLanguage),
    status: meeting.status,
    tracks: formatTracks(meeting),
    snippet: createSnippet(meeting),
    updatedAtMs,
    isToday: isSameLocalDate(updatedAtMs, Date.now()),
    isThisWeek: Date.now() - updatedAtMs <= 7 * 24 * 60 * 60 * 1000,
    byteLength,
    durationMs
  };
}

function createStats(meetings: LibraryMeeting[], lang: UiLanguage): Array<{ id: string; labelText: ReactNode; value: string; trend: ReactNode }> {
  const totalDurationMs = meetings.reduce((total, meeting) => total + meeting.durationMs, 0);
  const totalBytes = meetings.reduce((total, meeting) => total + meeting.byteLength, 0);
  const processingCount = meetings.filter((meeting) => isProcessingStatus(meeting.status)).length;
  const completedCount = meetings.filter((meeting) => meeting.status === "completed").length;

  return [
    {
      id: "total",
      labelText: label(lang, "TOTAL MEETINGS", "\u4f1a\u8bae\u603b\u6570"),
      value: String(meetings.length),
      trend: label(lang, "in this workspace", "\u6b64\u5de5\u4f5c\u533a")
    },
    {
      id: "hours",
      labelText: label(lang, "HOURS CAPTURED", "\u5f55\u5236\u65f6\u957f"),
      value: formatHours(totalDurationMs),
      trend: label(lang, "from recorded tracks", "\u6765\u81ea\u5df2\u5f55\u5236\u8f68\u9053")
    },
    {
      id: "processing",
      labelText: label(lang, "PROCESSING", "\u5904\u7406\u4e2d"),
      value: String(processingCount),
      trend: label(lang, `${completedCount} completed`, `${completedCount} \u4e2a\u5df2\u5b8c\u6210`)
    },
    {
      id: "storage",
      labelText: label(lang, "STORAGE USED", "\u5b58\u50a8\u5df2\u7528"),
      value: formatBytes(totalBytes),
      trend: label(lang, "local meeting files", "\u672c\u5730\u4f1a\u8bae\u6587\u4ef6")
    }
  ];
}

function createFilterCounts(meetings: LibraryMeeting[]): Record<LibraryFilter, number> {
  return {
    all: meetings.length,
    today: meetings.filter((meeting) => meeting.isToday).length,
    week: meetings.filter((meeting) => meeting.isThisWeek).length,
    processing: meetings.filter((meeting) => isProcessingStatus(meeting.status)).length
  };
}

function createSnippet(meeting: MeetingMetadata): string {
  if (meeting.status === "completed" && meeting.structurePath) {
    return "Summary and structure are ready.";
  }

  if (meeting.transcriptPath) {
    return "Transcript is ready.";
  }

  if (meeting.status === "recorded") {
    return "Recording saved locally. Processing has not completed yet.";
  }

  if (meeting.status === "failed") {
    return "Processing failed. Intermediate files were preserved.";
  }

  if (meeting.status === "no_audio") {
    return "Recording ended with no speech detected.";
  }

  return `Output: ${formatOutputLanguage(meeting.outputLanguage)}.`;
}

function formatTracks(meeting: MeetingMetadata): string {
  const tracks = Object.values(meeting.audioTracks)
    .filter((track) => track?.hasAudio)
    .map((track) => (track.id === "system" ? "System" : "Mic"));
  return tracks.length > 0 ? tracks.join(" + ") : "No audio";
}

function formatLibraryLanguage(language: MeetingMetadata["outputLanguage"]): LibraryLanguage {
  if (language === "zh") {
    return "zh";
  }

  if (language === "en") {
    return "en";
  }

  return "mix";
}

function formatOutputLanguage(language: MeetingMetadata["outputLanguage"]): string {
  switch (language) {
    case "zh":
      return "Chinese";
    case "en":
      return "English";
    case "bilingual":
      return "Bilingual";
  }
}

function formatStatus(status: MeetingStatus): string {
  return status.replaceAll("_", " ");
}

function isProcessingStatus(status: MeetingStatus): boolean {
  return status === "processing" || status === "recorded" || status === "recording";
}

function isSameLocalDate(leftMs: number, rightMs: number): boolean {
  if (!Number.isFinite(leftMs)) {
    return false;
  }

  const left = new Date(leftMs);
  const right = new Date(rightMs);
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function formatUpdatedAt(isoDate: string): string {
  const updatedAtMs = Date.parse(isoDate);
  if (!Number.isFinite(updatedAtMs)) {
    return "Unknown";
  }

  const updatedAt = new Date(updatedAtMs);
  const time = updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isSameLocalDate(updatedAtMs, Date.now())) {
    return `Today - ${time}`;
  }

  if (isSameLocalDate(updatedAtMs, Date.now() - 24 * 60 * 60 * 1000)) {
    return `Yesterday - ${time}`;
  }

  return updatedAt.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDuration(durationMs: number): string {
  if (!durationMs) {
    return "-";
  }

  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  if (minutes < 60) {
    return `${minutes}m`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatHours(durationMs: number): string {
  if (!durationMs) {
    return "0h";
  }

  return `${(durationMs / 3_600_000).toFixed(1)}h`;
}

function formatBytes(byteLength: number): string {
  if (!byteLength) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = byteLength;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function LanguageChip({ value }: { value: LibraryLanguage }) {
  const labelText = value === "zh" ? "\u4e2d" : value === "en" ? "EN" : "\u4e2d/EN";
  return <span className={`chip lang-chip ${value}`}>{labelText}</span>;
}

function Stat({ label: statLabel, trend, value }: { label: ReactNode; trend: ReactNode; value: string }) {
  return (
    <div className="card library-stat">
      <div className="stat-label">{statLabel}</div>
      <div className="metric">{value}</div>
      <div className="sub">{trend}</div>
    </div>
  );
}
