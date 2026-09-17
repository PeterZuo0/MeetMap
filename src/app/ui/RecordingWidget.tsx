import { useEffect, useState } from "react";
import type { RecordingWidgetState } from "../meetMapApi";
import "./recordingWidget.css";

export function RecordingWidget() {
  const [state, setState] = useState<RecordingWidgetState | null>(null);
  useEffect(() => {
    document.body.style.margin = "0";
    return window.meetMap?.onRecordingWidgetState?.(setState);
  }, []);
  if (!state) return null;
  return <aside className="desktop-recording-widget" aria-label="录音小窗">
    <header>{state.paused ? "已暂停" : "● 正在录制"}<span>{state.elapsed}</span></header>
    <strong title={state.title}>{state.title}</strong>
    <div>
      <button onClick={() => window.meetMap?.recordingWidgetAction?.("open")}>打开</button>
      <button disabled={state.busy} onClick={() => window.meetMap?.recordingWidgetAction?.("pause")}>{state.paused ? "继续" : "暂停"}</button>
      <button disabled={state.busy} onClick={() => window.meetMap?.recordingWidgetAction?.("stop")}>结束并转写</button>
    </div>
  </aside>;
}
