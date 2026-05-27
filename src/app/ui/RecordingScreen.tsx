import { useEffect, useState } from "react";
import type { MeetingMetadata } from "../../features/meetings/meetingTypes";
import type { UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";

export function RecordingScreen({
  lang,
  meeting,
  error,
  isStopping,
  onStop
}: {
  lang: UiLanguage;
  meeting: MeetingMetadata | null;
  error: string | null;
  isStopping: boolean;
  onStop(): void;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="pane" aria-label="Recording">
      <div className="screen-head">
        <div>
          <h1 className="h1">Recording</h1>
          <p className="sub">{meeting?.title ?? "Untitled meeting"}</p>
        </div>
        <button className="btn danger" disabled={isStopping} onClick={onStop} type="button">
          <Icon name="stop" size={13} />
          {isStopping ? label(lang, "Stopping...", "正在停止...") : label(lang, "Stop and process", "停止并处理")}
        </button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="recording-hero">
        <div>
          <p className="sub">
            <span className="record-dot" /> {label(lang, "Recording in progress", "正在录制")}
          </p>
          <div className="timer">{formatElapsed(elapsed)}</div>
          <p className="sub">{label(lang, "System and microphone tracks are captured separately when available.", "系统音频和麦克风可用时会分轨捕获。")}</p>
        </div>
      </div>
    </section>
  );
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}
