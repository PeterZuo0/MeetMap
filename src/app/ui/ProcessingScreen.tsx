import type { ProcessingStep } from "../../features/meetings/meetingTypes";
import type { UiLanguage } from "../meetMapApi";
import { label } from "./copy";
import { Icon } from "./icons";

type TemplatePhaseId =
  | "save"
  | "upload"
  | "vad"
  | "stt"
  | "diar"
  | "translate"
  | "summary"
  | "map";

type TemplatePhase = {
  id: TemplatePhaseId;
  en: string;
  zh: string;
  detail: string;
  time: string | null;
};

const TEMPLATE_PHASES: TemplatePhase[] = [
  {
    id: "save",
    en: "Encoding local audio",
    zh: "\u672c\u5730\u97f3\u9891\u7f16\u7801",
    detail: "WAV - 2 tracks - 14.6 MB",
    time: "3s"
  },
  {
    id: "upload",
    en: "Uploading tracks to cloud",
    zh: "\u4e0a\u4f20\u97f3\u9891\u5230\u4e91\u7aef",
    detail: "TLS 1.3 - region: local provider setting",
    time: "8s"
  },
  {
    id: "vad",
    en: "Voice activity detection",
    zh: "\u8bed\u97f3\u6d3b\u52a8\u68c0\u6d4b",
    detail: "System and microphone tracks are checked independently",
    time: "2s"
  },
  {
    id: "stt",
    en: "Speech-to-text (bilingual)",
    zh: "\u8bed\u97f3\u8f6c\u5199\uff08\u53cc\u8bed\uff09",
    detail: "MeetMap Cloud - 23/56 chunks",
    time: "0:42"
  },
  {
    id: "diar",
    en: "Speaker diarization",
    zh: "\u8bb2\u8bdd\u4eba\u5206\u79bb",
    detail: "5 voices detected",
    time: null
  },
  {
    id: "translate",
    en: "Bilingual alignment",
    zh: "\u4e2d\u82f1\u5bf9\u7167\u5bf9\u9f50",
    detail: "Auto-align untranslated turns",
    time: null
  },
  {
    id: "summary",
    en: "Summary & action items",
    zh: "\u6458\u8981\u4e0e\u5f85\u529e\u751f\u6210",
    detail: "Topic outline, decisions, and actions",
    time: null
  },
  {
    id: "map",
    en: "Structure map",
    zh: "\u7ed3\u6784\u56fe\u6784\u5efa",
    detail: "Topic tree and relationships",
    time: null
  }
];

const PROCESSING_STEP_TO_PHASE: Partial<Record<ProcessingStep, TemplatePhaseId>> = {
  activity_detection: "vad",
  transcription: "stt",
  merge: "diar",
  structure_extraction: "summary",
  word_export: "map",
  html_map_export: "map",
  completed: "map"
};

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
  const activePhaseId = activeStep ? PROCESSING_STEP_TO_PHASE[activeStep] : "stt";
  const activeIndex = Math.max(
    0,
    TEMPLATE_PHASES.findIndex((phase) => phase.id === activePhaseId)
  );

  if (error) {
    return (
      <section className="pane processing-pane" aria-label="Processing">
        <div className="screen-head">
          <div>
            <h1 className="h1">{label(lang, "Processing needs attention", "\u5904\u7406\u9700\u8981\u5904\u7406")}</h1>
            <p className="sub">{label(lang, "The recording artifacts were kept locally so this step can be retried.", "\u5f55\u97f3\u4e2d\u95f4\u4ea7\u7269\u5df2\u4fdd\u7559\u5728\u672c\u5730\uff0c\u53ef\u4ee5\u91cd\u8bd5\u6b64\u6b65\u9aa4\u3002")}</p>
          </div>
        </div>
        <div className="grid">
          <div className="error-box">{error}</div>
          <div className="processing-actions">
            <button className="btn primary" onClick={onRetry} type="button">
              {label(lang, "Retry", "\u91cd\u8bd5")}
            </button>
            <button className="btn" onClick={onBack} type="button">
              {label(lang, "Back to library", "\u8fd4\u56de\u8d44\u6599\u5e93")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pane processing-pane" aria-label="Processing">
      <div className="processing-actions top">
        <button className="btn" onClick={onBack} type="button">
          {label(lang, "Run in background", "\u540e\u53f0\u5904\u7406")}
        </button>
        <button className="btn primary" onClick={onRetry} type="button">
          {label(lang, "Skip to preview", "\u67e5\u770b\u9884\u89c8")}
        </button>
      </div>

      <div className="processing-status">
        <div className="processing-orb" aria-label="42% complete">
          <Icon name="spark" size={28} />
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="36" />
            <circle className="progress" cx="40" cy="40" r="36" />
          </svg>
        </div>
        <h1 className="h1">{label(lang, "Processing your meeting...", "\u6b63\u5728\u5904\u7406\u4f1a\u8bae...")}</h1>
        <p className="sub">
          {label(
            lang,
            "Estimated 1-2 minutes for a 52-minute meeting. You can close this window and come back later; processing keeps running.",
            "52 \u5206\u949f\u4f1a\u8bae\u9884\u8ba1\u9700\u8981 1-2 \u5206\u949f\u3002\u4f60\u53ef\u4ee5\u5173\u95ed\u6b64\u7a97\u53e3\uff0c\u5904\u7406\u4f1a\u5728\u540e\u53f0\u7ee7\u7eed\u3002"
          )}
        </p>
        <div className="processing-progress-line">
          42% - {label(lang, "4 of 8 steps", "4 / 8 \u6b65\u9aa4")} - ETA 00:48
        </div>
      </div>

      <div className="processing-phase-card">
        {TEMPLATE_PHASES.map((phase, index) => (
          <PhaseRow
            key={phase.id}
            lang={lang}
            phase={phase}
            state={index < activeIndex ? "done" : index === activeIndex ? "running" : "queued"}
          />
        ))}
      </div>

      <div className="processing-privacy-note">
        {label(
          lang,
          "Tracks upload encrypted. Cloud copy deletion is requested when the provider supports it; local retry artifacts stay on this PC.",
          "\u97f3\u9891\u4ee5\u52a0\u5bc6\u65b9\u5f0f\u4e0a\u4f20\u3002\u4f9b\u5e94\u5546\u652f\u6301\u65f6\u4f1a\u8bf7\u6c42\u5220\u9664\u4e91\u7aef\u526f\u672c\uff1b\u672c\u5730\u91cd\u8bd5\u4ea7\u7269\u4fdd\u7559\u5728\u6b64\u7535\u8111\u3002"
        )}
      </div>
    </section>
  );
}

function PhaseRow({
  lang,
  phase,
  state
}: {
  lang: UiLanguage;
  phase: TemplatePhase;
  state: "done" | "running" | "queued";
}) {
  return (
    <div className={`processing-phase-row ${state}`}>
      <div className="processing-phase-icon">
        {state === "done" ? <Icon name="check" size={13} /> : state === "running" ? <span className="spinner" /> : <span className="queued-dot" />}
      </div>
      <div>
        <div className="processing-phase-title">{label(lang, phase.en, phase.zh)}</div>
        <div className="sub">{phase.detail}</div>
      </div>
      <div className="processing-phase-time">{phase.time ?? label(lang, "queued", "\u7b49\u5f85\u4e2d")}</div>
    </div>
  );
}
