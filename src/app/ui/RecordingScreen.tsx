import { useEffect, useMemo, useState } from "react";
import type { MeetingMetadata } from "../../features/meetings/meetingTypes";
import type { RecordingAudioSources, UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";

export type RecordingAudioState = "both" | "system-only" | "microphone-only" | "none";

export function RecordingScreen({
  lang,
  meeting,
  audioSources,
  error,
  isStopping,
  isPaused,
  isPauseChanging,
  onStop,
  onOpenAudioSettings,
  onPauseChange
}: {
  lang: UiLanguage;
  meeting: MeetingMetadata | null;
  audioSources: RecordingAudioSources;
  error: string | null;
  isStopping: boolean;
  isPaused: boolean;
  isPauseChanging: boolean;
  onStop(): void;
  onOpenAudioSettings(): void;
  onPauseChange(paused: boolean): void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [taggedMoments, setTaggedMoments] = useState<Array<{ time: string; text: string }>>([]);
  const audioState = getRecordingAudioState(audioSources);
  const title = meeting?.title ?? "Untitled meeting";

  useEffect(() => {
    if (isPaused) {
      return;
    }

    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isPaused]);

  const elapsedText = formatElapsed(elapsed);

  return (
    <section className="pane recording-pane" aria-label="Recording">
      <div className="recording-header">
        <div>
          <div className="recording-title-line">
            <h1 className="h1">{title}</h1>
            <span className="chip">Auto-titled</span>
          </div>
          <p className="sub">
            Started 10:30 · <span className="mono-text">{elapsedText}</span> · autosaving every 30s
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
              onClick={() =>
                setTaggedMoments((current) => [
                  ...current,
                  { time: elapsedText, text: `Marked moment ${current.length + 1}` }
                ])
              }
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
              {isStopping ? label(lang, "Stopping...", "正在停止...") : label(lang, "Stop & process", "停止并处理")}
            </button>
          </div>
        </div>

        <DualTrackWaveform audioState={audioState} paused={isPaused} />
      </div>

      <div className="recording-bottom-grid">
        <LiveActivity audioState={audioState} paused={isPaused} />
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
  switch (audioState) {
    case "both":
      return "Listening on both tracks";
    case "system-only":
      return "Listening on system audio";
    case "microphone-only":
      return "Listening on microphone";
    case "none":
      return "Recording silence — no audio detected";
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
        <span className="state-symbol">✓</span>
        <strong>Both tracks live</strong>
        <span>System + microphone detected</span>
      </div>
    );
  }

  if (audioState === "system-only") {
    return (
      <div className="state-banner warn">
        <span className="state-symbol">!</span>
        <strong>System audio only</strong>
        <span>Microphone is silent or disabled · one-sided transcript</span>
        <button className="link-button" onClick={onOpenAudioSettings} type="button">Fix</button>
      </div>
    );
  }

  if (audioState === "microphone-only") {
    return (
      <div className="state-banner warn">
        <span className="state-symbol">!</span>
        <strong>Microphone only</strong>
        <span>No system audio · voice memo style processing</span>
        <button className="link-button" onClick={onOpenAudioSettings} type="button">Fix</button>
      </div>
    );
  }

  return (
    <div className="state-banner danger">
      <span className="state-symbol">!</span>
      <strong>No audio detected</strong>
      <span>Both tracks are silent · check devices</span>
      <button className="link-button" onClick={onOpenAudioSettings} type="button">Devices</button>
    </div>
  );
}

function DualTrackWaveform({ audioState, paused }: { audioState: RecordingAudioState; paused: boolean }) {
  const systemActive = !paused && (audioState === "both" || audioState === "system-only");
  const microphoneActive = !paused && (audioState === "both" || audioState === "microphone-only");

  return (
    <div className="dual-waveform">
      <TrackWave icon="monitor" label="System" sub="Realtek HD" active={systemActive} tone="system" />
      <TrackWave icon="mic" label="Microphone" sub="Shure MV7" active={microphoneActive} tone="microphone" />
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
  tone
}: {
  icon: "monitor" | "mic";
  label: string;
  sub: string;
  active: boolean;
  tone: "system" | "microphone";
}) {
  const bars = useMemo(
    () =>
      Array.from({ length: 92 }, (_, index) => {
        const value = Math.abs(Math.sin(index * 0.31) + Math.sin(index * 0.17) * 0.7) / 1.7;
        const isGap = Math.sin(index * 0.13) < -0.45;
        return isGap ? value * 0.12 : value;
      }),
    []
  );

  return (
    <div className={`track-wave ${active ? "" : "muted"} ${tone}`}>
      <div className="track-wave-label">
        <Icon name={icon} size={13} />
        <div>
          <strong>{label}</strong>
          <span>{sub}</span>
        </div>
      </div>
      <div className="wave-canvas">
        <div className="wave-center" />
        <div className="wave-bars">
          {bars.map((value, index) => (
            <span key={index} style={{ height: `${Math.max(2, value * 36)}px` }} />
          ))}
        </div>
        {!active ? <div className="no-signal">No signal</div> : <div className="live-cursor" />}
      </div>
    </div>
  );
}

function LiveActivity({ audioState, paused }: { audioState: RecordingAudioState; paused: boolean }) {
  const systemActive = !paused && (audioState === "both" || audioState === "system-only");
  const microphoneActive = !paused && (audioState === "both" || audioState === "microphone-only");

  return (
    <div className="recording-panel">
      <div className="panel-title-row">
        <h2 className="h2">Live activity</h2>
        <span className="sub">Speech detection runs locally</span>
        <span className="chip">No transcription yet</span>
      </div>
      <ActivityRow icon="monitor" label="System audio" active={systemActive} stats={systemActive ? ["7m 04s", "1m 12s", "EN 92%"] : ["—", "—", "—"]} />
      <div className="panel-divider" />
      <ActivityRow icon="mic" label="Microphone" active={microphoneActive} stats={microphoneActive ? ["4m 18s", "3m 50s", "中 86%"] : ["—", "—", "—"]} />
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
  stats: string[];
}) {
  return (
    <div className={`activity-row ${active ? "" : "muted"}`}>
      <div className="activity-icon">
        <Icon name={icon} size={15} />
      </div>
      <div>
        <strong>{label}</strong>
        <span className="activity-status">{active ? "Speaking" : "Muted"}</span>
      </div>
      {["Speech", "Silence", "Detected lang"].map((key, index) => (
        <div className="activity-stat" key={key}>
          <span>{key}</span>
          <strong>{stats[index]}</strong>
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
  taggedMoments: Array<{ time: string; text: string }>;
}) {
  const defaultMoments =
    taggedMoments.length > 0
      ? taggedMoments
      : [
          { time: "02:14", text: "Decision · ship list" },
          { time: "05:38", text: "Action · Maya owns export pipeline" },
          { time: "09:51", text: "Question · pricing for batch" }
        ];

  return (
    <div className="recording-panel">
      <div className="panel-title-row">
        <h2 className="h2">Tagged moments</h2>
        <span className="sub">Press M to tag</span>
      </div>
      {audioState === "none" ? (
        <div className="empty-tags">No tags yet · current recording has no audio</div>
      ) : (
        <div className="tag-list">
          {defaultMoments.map(({ time, text }, index) => (
            <div className="tag-row" key={time}>
              <span className="mono-text">{time}</span>
              <span className={`tag-dot dot-${index}`} />
              <span>{text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}
