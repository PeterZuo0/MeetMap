import type { ProcessingStep } from "../../features/meetings/meetingTypes";
import type { UiLanguage } from "../meetMapApi";
import { label } from "./copy";

const STEPS: { id: ProcessingStep; en: string; zh: string }[] = [
  { id: "activity_detection", en: "Activity detection", zh: "语音活动检测" },
  { id: "transcription", en: "Transcription", zh: "转写" },
  { id: "merge", en: "Transcript merge", zh: "文字合并" },
  { id: "structure_extraction", en: "Structure extraction", zh: "结构提取" },
  { id: "word_export", en: "Word export", zh: "Word 导出" },
  { id: "html_map_export", en: "HTML map export", zh: "HTML 结构图导出" },
  { id: "completed", en: "Completed", zh: "已完成" }
];

export function ProcessingScreen({
  lang,
  activeStep,
  error,
  onRetry,
  onBack
}: {
  lang: UiLanguage;
  activeStep?: ProcessingStep;
  error: string | null;
  onRetry(): void;
  onBack(): void;
}) {
  const activeIndex = activeStep
    ? Math.max(
        0,
        STEPS.findIndex((step) => step.id === activeStep)
      )
    : 0;

  return (
    <section className="pane" aria-label="Processing">
      <div className="screen-head">
        <div>
          <h1 className="h1">{label(lang, "Processing", "处理中")}</h1>
          <p className="sub">{label(lang, "MeetMap is turning the recording into a transcript, summary, and map.", "MeetMap 正在把录音处理成文字记录、摘要和结构图。")}</p>
        </div>
      </div>

      {error ? (
        <div className="grid">
          <div className="error-box">{error}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn primary" onClick={onRetry} type="button">
              {label(lang, "Retry", "重试")}
            </button>
            <button className="btn" onClick={onBack} type="button">
              {label(lang, "Back to library", "返回资料库")}
            </button>
          </div>
        </div>
      ) : (
        <div className="phase-list">
          {STEPS.map((step, index) => (
            <div
              className={`phase-row ${index < activeIndex ? "done" : ""} ${
                index === activeIndex ? "active" : ""
              }`}
              key={step.id}
            >
              <span className="phase-dot" />
              <span>{label(lang, step.en, step.zh)}</span>
              <span className="sub">
                {index < activeIndex
                  ? label(lang, "Done", "完成")
                  : index === activeIndex
                    ? label(lang, "Running", "运行中")
                    : label(lang, "Waiting", "等待")}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
