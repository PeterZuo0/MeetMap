import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import type { MeetingMetadata } from "../../features/meetings/meetingTypes";
import type { RecordingAudioLevel, RecordingAudioSources, TaggedMomentInput, UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";

export type RecordingAudioState = "both" | "system-only" | "microphone-only" | "none";
type RecordingTrack = "system" | "microphone";
type RecordingLevelSeries = Partial<Record<RecordingTrack, RecordingAudioLevel[]>>;
type TaggedMoment = {
  id: string;
  elapsedSeconds: number;
  time: string;
  text: string;
  level: number;
  track: RecordingTrack | "none";
};
type TrackActivityStats = {
  currentLevel: number;
  silenceSeconds: number;
  speechSeconds: number;
  status: "Listening" | "Quiet" | "Speaking";
};

const WAVE_BAR_COUNT = 92;
const SPEECH_THRESHOLD = 0.18;

export function RecordingScreen({
  lang,
  meeting,
  audioSources,
  error,
  isStopping,
  isPaused,
  isPauseChanging,
  recordingLevels = {},
  onStop,
  onOpenAudioSettings,
  onPauseChange,
  onTagMoment = () => undefined
}: {
  lang: UiLanguage;
  meeting: MeetingMetadata | null;
  audioSources: RecordingAudioSources;
  error: string | null;
  isStopping: boolean;
  isPaused: boolean;
  isPauseChanging: boolean;
  recordingLevels?: RecordingLevelSeries;
  onStop(): void;
  onOpenAudioSettings(): void;
  onPauseChange(paused: boolean): void;
  onTagMoment?(moment: TaggedMomentInput): void;
}) {
  const currentMeetingId = meeting?.id ?? null;
  const [elapsedState, setElapsedState] = useState(() => ({
    meetingId: currentMeetingId,
    value: getInitialElapsedSeconds(meeting)
  }));
  const [taggedMomentState, setTaggedMomentState] = useState<{
    meetingId: string | null;
    moments: TaggedMoment[];
  }>(() => ({
    meetingId: currentMeetingId,
    moments: []
  }));
  const audioState = getRecordingAudioState(audioSources);
  const title = meeting?.title ?? "Untitled meeting";
  const systemStats = useMemo(() => createTrackStats(recordingLevels.system ?? []), [recordingLevels.system]);
  const microphoneStats = useMemo(() => createTrackStats(recordingLevels.microphone ?? []), [recordingLevels.microphone]);
  const elapsed = elapsedState.meetingId === currentMeetingId
    ? elapsedState.value
    : getInitialElapsedSeconds(meeting);
  const taggedMoments = taggedMomentState.meetingId === currentMeetingId
    ? taggedMomentState.moments
    : [];

  useEffect(() => {
    if (isPaused) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedState((current) => {
        if (current.meetingId !== currentMeetingId) {
          return {
            meetingId: currentMeetingId,
            value: getInitialElapsedSeconds(meeting)
          };
        }

        return {
          meetingId: current.meetingId,
          value: current.value + 1
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [currentMeetingId, isPaused, meeting]);

  const elapsedText = formatElapsed(elapsed);
  const startedAtText = formatStartedAt(meeting);
  const addTaggedMoment = useCallback(() => {
    const nextMoment = createTaggedMoment({
      elapsedSeconds: elapsed,
      elapsedText,
      id: `${Date.now()}-${taggedMoments.length}`,
      microphoneStats,
      systemStats
    });
    setTaggedMomentState((current) => ({
      meetingId: currentMeetingId,
      moments: current.meetingId === currentMeetingId
        ? [...current.moments, nextMoment]
        : [nextMoment]
    }));
    onTagMoment({
      elapsedMs: elapsed * 1000,
      level: nextMoment.level,
      text: nextMoment.text,
      time: nextMoment.time,
      track: nextMoment.track
    });
  }, [currentMeetingId, elapsed, elapsedText, microphoneStats, onTagMoment, systemStats, taggedMoments.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "m" || event.repeat) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        return;
      }

      addTaggedMoment();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addTaggedMoment]);

  return (
    <section className="pane recording-pane" aria-label="Recording">
      <div className="recording-header">
        <div>
          <div className="recording-title-line">
            <h1 className="h1">{title}</h1>
            {isAutoTitled(title) ? <span className="chip">Auto-titled</span> : null}
          </div>
          <p className="sub">
            Started {startedAtText} - <span className="mono-text">{elapsedText}</span> - saving local tracks
          </p>
        </div>
        <StateBanner audioState={audioState} onOpenAudioSettings={onOpenAudioSettings} />
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="recording-console">
        <div className="recording-console-top">
          <div className="recording-clock-wrap">
            <div className={`big-record-control ${isPaused ? "paused" : ""}`}>
              <Icon name={isPaused ? "pause" : "stop"} size={18} />
            </div>
            <div>
              <div className="recording-clock">{elapsedText}</div>
              <div className="sub">{isPaused ? "Paused" : stateListeningCopy(audioState)}</div>
            </div>
          </div>
          <div className="recording-actions">
            <button
              className="btn"
              onClick={addTaggedMoment}
              type="button"
            >
              <Icon name="pin" size={13} />
              Tag moment <span className="kbd">M</span>
            </button>
            <button
              className="btn"
              disabled={isPauseChanging}
              onClick={() => onPauseChange(!isPaused)}
              type="button"
            >
              <Icon name={isPaused ? "play" : "pause"} size={13} />
              {isPauseChanging ? "Updating..." : isPaused ? "Resume" : "Pause"}
            </button>
            <button className="btn danger" disabled={isStopping} onClick={onStop} type="button">
              <Icon name="stop" size={13} />
              {isStopping ? label(lang, "Stopping...", "æ­£åœ¨åœæ­¢...") : label(lang, "Stop & process", "åœæ­¢å¹¶å¤„ç†")}
            </button>
          </div>
        </div>

        <DualTrackWaveform audioState={audioState} paused={isPaused} recordingLevels={recordingLevels} />
      </div>

      <div className="recording-bottom-grid">
        <LiveActivity audioState={audioState} microphoneStats={microphoneStats} paused={isPaused} systemStats={systemStats} />
        <TaggedMoments audioState={audioState} taggedMoments={taggedMoments} />
      </div>
    </section>
  );
}

function getRecordingAudioState(audioSources: RecordingAudioSources): RecordingAudioState {
  if (audioSources.system && audioSources.microphone) {
    return "both";
  }

  if (audioSources.system) {
    return "system-only";
  }

  if (audioSources.microphone) {
    return "microphone-only";
  }

  return "none";
}

function stateListeningCopy(audioState: RecordingAudioState): string {
  if (audioState === "none") {
    return "Recording silence";
  }

  switch (audioState) {
    case "both":
      return "Recording system + microphone";
    case "system-only":
      return "Recording system audio";
    case "microphone-only":
      return "Recording microphone";
  }
}

function StateBanner({
  audioState,
  onOpenAudioSettings
}: {
  audioState: RecordingAudioState;
  onOpenAudioSettings: () => void;
}) {
  if (audioState === "both") {
    return (
      <div className="state-banner positive">
        <span className="state-symbol"><Icon name="check" size={12} /></span>
        <strong>Recording system + microphone</strong>
        <span>Audio is being saved even during quiet moments</span>
      </div>
    );
  }

  if (audioState === "system-only") {
    return (
      <div className="state-banner positive">
        <span className="state-symbol"><Icon name="check" size={12} /></span>
        <strong>Recording system audio</strong>
        <span>Microphone track is disabled for this recording</span>
        <button className="link-button" onClick={onOpenAudioSettings} type="button">Devices</button>
      </div>
    );
  }

  if (audioState === "microphone-only") {
    return (
      <div className="state-banner positive">
        <span className="state-symbol"><Icon name="check" size={12} /></span>
        <strong>Recording microphone</strong>
        <span>System audio track is disabled for this recording</span>
        <button className="link-button" onClick={onOpenAudioSettings} type="button">Devices</button>
      </div>
    );
  }

  return (
    <div className="state-banner positive">
      <span className="state-symbol"><Icon name="check" size={12} /></span>
      <strong>Recording silence</strong>
      <span>Recording can continue without detected input</span>
      <button className="link-button" onClick={onOpenAudioSettings} type="button">Devices</button>
    </div>
  );
}

function DualTrackWaveform({
  audioState,
  paused,
  recordingLevels
}: {
  audioState: RecordingAudioState;
  paused: boolean;
  recordingLevels: RecordingLevelSeries;
}) {
  const systemActive = !paused && (audioState === "both" || audioState === "system-only");
  const microphoneActive = !paused && (audioState === "both" || audioState === "microphone-only");

  return (
    <div className="dual-waveform">
      <TrackWave
        icon="monitor"
        label="System"
        sub="System mix"
        active={systemActive}
        samples={recordingLevels.system ?? []}
        tone="system"
      />
      <TrackWave
        icon="mic"
        label="Microphone"
        sub="Selected input"
        active={microphoneActive}
        samples={recordingLevels.microphone ?? []}
        tone="microphone"
      />
      <div className="wave-ruler">
        {["00:00", "02:30", "05:00", "07:30", "10:00", "12:30", "14:07"].map((time) => (
          <span key={time}>{time}</span>
        ))}
      </div>
    </div>
  );
}

function TrackWave({
  icon,
  label,
  sub,
  active,
  samples,
  tone
}: {
  icon: "monitor" | "mic";
  label: string;
  sub: string;
  active: boolean;
  samples: RecordingAudioLevel[];
  tone: "system" | "microphone";
}) {
  const barRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const bars = useMemo(() => createWaveBars(samples), [samples]);
  const currentLevel = samples.at(-1)?.level ?? 0;
  const hasSamples = samples.length > 0;

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    gsap.to(barRefs.current.filter(Boolean), {
      duration: reduceMotion ? 0 : 0.22,
      ease: "power2.out",
      overwrite: "auto",
      scaleY: (index) => Math.max(0.08, bars[index] ?? 0.02),
      stagger: reduceMotion ? 0 : { amount: 0.05, from: "end" },
      transformOrigin: "50% 50%"
    });
  }, [bars]);

  return (
    <div className={`track-wave ${active ? "" : "muted"} ${tone}`}>
      <div className="track-wave-label">
        <Icon name={icon} size={13} />
        <div>
          <strong>{label}</strong>
          <span>{sub}</span>
        </div>
      </div>
      <div className="wave-canvas" aria-label={`${label} input level ${Math.round(currentLevel * 100)}%`}>
        <div className="wave-center" />
        <div className="wave-bars">
          {bars.map((value, index) => (
            <span
              key={index}
              ref={(element) => {
                barRefs.current[index] = element;
              }}
              style={{ transform: `scaleY(${Math.max(0.08, value)})` }}
            />
          ))}
        </div>
        {!active ? <div className="no-signal">Disabled</div> : null}
        {active && !hasSamples ? <div className="no-signal soft">Listening</div> : null}
        {active ? <div className="live-cursor" /> : null}
      </div>
    </div>
  );
}

function LiveActivity({
  audioState,
  microphoneStats,
  paused,
  systemStats
}: {
  audioState: RecordingAudioState;
  microphoneStats: TrackActivityStats;
  paused: boolean;
  systemStats: TrackActivityStats;
}) {
  const systemActive = !paused && (audioState === "both" || audioState === "system-only");
  const microphoneActive = !paused && (audioState === "both" || audioState === "microphone-only");

  return (
    <div className="recording-panel">
      <div className="panel-title-row">
        <h2 className="h2">Live activity</h2>
        <span className="sub">Speech detection runs locally</span>
        <span className="chip">No live transcription</span>
      </div>
      <ActivityRow icon="monitor" label="System audio" active={systemActive} stats={systemStats} />
      <div className="panel-divider" />
      <ActivityRow icon="mic" label="Microphone" active={microphoneActive} stats={microphoneStats} />
    </div>
  );
}

function ActivityRow({
  icon,
  label,
  active,
  stats
}: {
  icon: "monitor" | "mic";
  label: string;
  active: boolean;
  stats: TrackActivityStats;
}) {
  const status = active ? stats.status : "Muted";
  const values = active
    ? [formatPercent(stats.currentLevel), formatElapsed(stats.speechSeconds), formatElapsed(stats.silenceSeconds)]
    : ["-", "-", "-"];

  return (
    <div className={`activity-row ${active ? "" : "muted"}`}>
      <div className="activity-icon">
        <Icon name={icon} size={15} />
      </div>
      <div>
        <strong>{label}</strong>
        <span className="activity-status">{status}</span>
      </div>
      {["Input", "Speech", "Silence"].map((key, index) => (
        <div className="activity-stat" key={key}>
          <span>{key}</span>
          <strong>{values[index]}</strong>
        </div>
      ))}
    </div>
  );
}

function TaggedMoments({
  audioState,
  taggedMoments
}: {
  audioState: RecordingAudioState;
  taggedMoments: TaggedMoment[];
}) {
  return (
    <div className="recording-panel">
      <div className="panel-title-row">
        <h2 className="h2">Tagged moments</h2>
        <span className="sub">Press M to tag</span>
      </div>
      {taggedMoments.length === 0 ? (
        <div className="empty-tags">
          {audioState === "none" ? "No tagged moments yet - recording silence" : "No tagged moments yet"}
        </div>
      ) : (
        <div className="tag-list">
          {taggedMoments.map(({ id, level, time, text, track }, index) => (
            <div className="tag-row" key={id}>
              <span className="mono-text">{time}</span>
              <span className={`tag-dot ${track === "microphone" ? "dot-1" : track === "none" ? "dot-2" : `dot-${index % 3}`}`} />
              <span>{text}</span>
              <span className="tag-level">{formatPercent(level)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function createWaveBars(samples: RecordingAudioLevel[]): number[] {
  const recent = samples.slice(-WAVE_BAR_COUNT).map((sample) => clampLevel(sample.level));
  const padding = Array.from({ length: Math.max(0, WAVE_BAR_COUNT - recent.length) }, () => 0.02);
  return [...padding, ...recent];
}

function createTrackStats(samples: RecordingAudioLevel[]): TrackActivityStats {
  if (samples.length === 0) {
    return {
      currentLevel: 0,
      silenceSeconds: 0,
      speechSeconds: 0,
      status: "Listening"
    };
  }

  const sorted = [...samples].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  let speechMs = 0;
  let silenceMs = 0;

  sorted.forEach((sample, index) => {
    const nextSample = sorted[index + 1];
    const durationMs = nextSample
      ? Math.max(0, Math.min(5000, Date.parse(nextSample.occurredAt) - Date.parse(sample.occurredAt)))
      : 1000;

    if (sample.level >= SPEECH_THRESHOLD) {
      speechMs += durationMs;
    } else {
      silenceMs += durationMs;
    }
  });

  const currentLevel = clampLevel(sorted.at(-1)?.level ?? 0);
  return {
    currentLevel,
    silenceSeconds: Math.round(silenceMs / 1000),
    speechSeconds: Math.round(speechMs / 1000),
    status: currentLevel >= SPEECH_THRESHOLD ? "Speaking" : "Quiet"
  };
}

function createTaggedMoment({
  elapsedSeconds,
  elapsedText,
  id,
  microphoneStats,
  systemStats
}: {
  elapsedSeconds: number;
  elapsedText: string;
  id: string;
  microphoneStats: TrackActivityStats;
  systemStats: TrackActivityStats;
}): TaggedMoment {
  const systemLevel = systemStats.currentLevel;
  const microphoneLevel = microphoneStats.currentLevel;
  const track = Math.max(systemLevel, microphoneLevel) === 0
    ? "none"
    : systemLevel >= microphoneLevel
      ? "system"
      : "microphone";
  const level = track === "system" ? systemLevel : track === "microphone" ? microphoneLevel : 0;
  const labelText = track === "system" ? "System audio" : track === "microphone" ? "Microphone" : "Quiet moment";

  return {
    id,
    elapsedSeconds,
    level,
    text: `${labelText} - ${formatPercent(level)} input`,
    time: elapsedText,
    track
  };
}

function getInitialElapsedSeconds(meeting: MeetingMetadata | null): number {
  const startedAt = meeting?.timestamps.recordingStartedAt;
  if (!startedAt) {
    return 0;
  }

  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
}

function formatStartedAt(meeting: MeetingMetadata | null): string {
  const startedAt = meeting?.timestamps.recordingStartedAt;
  if (!startedAt) {
    return "now";
  }

  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return "now";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isAutoTitled(title: string): boolean {
  return title.trim().length === 0 || /^Untitled meeting/i.test(title);
}

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }

  return Math.max(0, Math.min(1, level));
}

function formatPercent(level: number): string {
  return `${Math.round(clampLevel(level) * 100)}%`;
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}
