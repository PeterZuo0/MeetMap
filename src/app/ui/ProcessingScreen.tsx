import type { CSSProperties } from "react";
import type { ProcessingStep } from "../../features/meetings/meetingTypes";
import type { ProcessingProgressUpdate, UiLanguage } from "../meetMapApi";
import { label, text } from "./copy";
import { Icon } from "./icons";

type ProcessingPhase = {
  step: ProcessingStep;
  en: string;
  zh: string;
  detailEn: string;
  detailZh: string;
};

const PROCESSING_PHASES: ProcessingPhase[] = [
  {
    step: "activity_detection",
    en: "Voice activity detection",
    zh: "\u8bed\u97f3\u6d3b\u52a8\u68c0\u6d4b",
    detailEn: "Checking recorded or imported tracks for speech.",
    detailZh: "\u68c0\u67e5\u5f55\u5236\u6216\u5bfc\u5165\u7684\u97f3\u8f68\u4e2d\u662f\u5426\u5305\u542b\u8bed\u97f3\u3002"
  },
  {
    step: "transcription",
    en: "Speech-to-text",
    zh: "\u8bed\u97f3\u8f6c\u5199",
    detailEn: "Transcribing audio chunks with the configured provider.",
    detailZh: "\u4f7f\u7528\u5df2\u914d\u7f6e\u7684\u4f9b\u5e94\u5546\u9010\u6bb5\u8f6c\u5199\u97f3\u9891\u3002"
  },
  {
    step: "merge",
    en: "Transcript merge",
    zh: "\u8f6c\u5199\u5408\u5e76",
    detailEn: "Ordering transcript segments from all processed tracks.",
    detailZh: "\u6309\u65f6\u95f4\u987a\u5e8f\u5408\u5e76\u6240\u6709\u5df2\u5904\u7406\u97f3\u8f68\u7684\u8f6c\u5199\u7247\u6bb5\u3002"
  },
  {
    step: "structure_extraction",
    en: "Meeting notes generation",
    zh: "\u4f1a\u8bae\u8bb0\u5f55\u751f\u6210",
    detailEn: "Generating topics, decisions, questions, and action items.",
    detailZh: "\u751f\u6210\u4e3b\u9898\u3001\u51b3\u7b56\u3001\u95ee\u9898\u548c\u5f85\u529e\u4e8b\u9879\u3002"
  },
  {
    step: "word_export",
    en: "Word export",
    zh: "Word \u5bfc\u51fa",
    detailEn: "Creating the Word meeting summary from structured data.",
    detailZh: "\u6839\u636e\u7ed3\u6784\u5316\u6570\u636e\u751f\u6210 Word \u4f1a\u8bae\u8bb0\u5f55\u3002"
  },
  {
    step: "html_map_export",
    en: "Meeting map export",
    zh: "\u4f1a\u8bae\u56fe\u5bfc\u51fa",
    detailEn: "Creating the standalone HTML meeting map.",
    detailZh: "\u751f\u6210\u72ec\u7acb HTML \u4f1a\u8bae\u56fe\u3002"
  }
];

const PHASE_INDEX_BY_STEP = new Map<ProcessingStep, number>(
  PROCESSING_PHASES.map((phase, index) => [phase.step, index])
);
const ORB_CIRCUMFERENCE = 226;

export function ProcessingScreen({
  lang,
  activeStep,
  progress,
  error,
  canPreview = false,
  onPreview = () => undefined,
  onRetry,
  onBack
}: {
  lang: UiLanguage;
  activeStep?: ProcessingStep;
  progress: ProcessingProgressUpdate | null;
  error: string | null;
  canPreview?: boolean;
  onPreview?(): void;
  onRetry(): void;
  onBack(): void;
}) {
  const percent = normalizePercent(progress?.percent ?? (activeStep === "completed" ? 100 : 0));
  const displayedStep = progress?.step ?? activeStep ?? "activity_detection";
  const activeIndex = getActivePhaseIndex(displayedStep);
  const completed = displayedStep === "completed";
  const currentStep = progress?.currentStep ?? (completed ? PROCESSING_PHASES.length : activeIndex + 1);
  const totalSteps = progress?.totalSteps ?? PROCESSING_PHASES.length;
  const strokeDashoffset = ORB_CIRCUMFERENCE - (ORB_CIRCUMFERENCE * percent) / 100;
  const progressStyle = {
    strokeDasharray: ORB_CIRCUMFERENCE,
    strokeDashoffset
  } satisfies CSSProperties;

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
        <button className="btn primary" disabled={!canPreview} onClick={onPreview} type="button">
          {label(lang, "Preview available work", "\u67e5\u770b\u5df2\u6709\u9884\u89c8")}
        </button>
      </div>

      <div className="processing-status">
        <div className="processing-orb" aria-label={`${percent}% complete`}>
          <Icon name="spark" size={28} />
          <svg viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="36" />
            <circle className="progress" cx="40" cy="40" r="36" style={progressStyle} />
          </svg>
        </div>
        <h1 className="h1">{label(lang, "Processing your meeting...", "\u6b63\u5728\u5904\u7406\u4f1a\u8bae...")}</h1>
        <p className="sub">
          {label(
            lang,
            "Progress is based on completed workflow steps and transcription chunks.",
            "\u8fdb\u5ea6\u6765\u81ea\u5df2\u5b8c\u6210\u7684\u5de5\u4f5c\u6d41\u6b65\u9aa4\u548c\u8bed\u97f3\u8f6c\u5199\u5206\u5757\u3002"
          )}
        </p>
        <div className="processing-progress-line">
          {percent}% - {formatStepCount(lang, currentStep, totalSteps)}{progress?.transcription ? ` - ${formatChunkCount(lang, progress.transcription)}` : ""}
        </div>
      </div>

      <div className="processing-phase-card">
        {PROCESSING_PHASES.map((phase, index) => (
          <PhaseRow
            key={phase.step}
            lang={lang}
            phase={phase}
            state={completed || index < activeIndex ? "done" : index === activeIndex ? "running" : "queued"}
            status={formatPhaseStatus({ completed, index, activeIndex, lang, phase, progress })}
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
  state,
  status
}: {
  lang: UiLanguage;
  phase: ProcessingPhase;
  state: "done" | "running" | "queued";
  status: string;
}) {
  return (
    <div className={`processing-phase-row ${state}`}>
      <div className="processing-phase-icon">
        {state === "done" ? <Icon name="check" size={13} /> : state === "running" ? <span className="spinner" /> : <span className="queued-dot" />}
      </div>
      <div>
        <div className="processing-phase-title">{label(lang, phase.en, phase.zh)}</div>
        <div className="sub">{label(lang, phase.detailEn, phase.detailZh)}</div>
      </div>
      <div className="processing-phase-time">{status}</div>
    </div>
  );
}

function getActivePhaseIndex(step: ProcessingStep): number {
  if (step === "completed") {
    return PROCESSING_PHASES.length - 1;
  }

  if (step === "failed" || step === "no_audio") {
    return 0;
  }

  return PHASE_INDEX_BY_STEP.get(step) ?? 0;
}

function normalizePercent(percent: number): number {
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function formatStepCount(lang: UiLanguage, currentStep: number, totalSteps: number): string {
  return text(lang, `${currentStep} of ${totalSteps} steps`, `${currentStep} / ${totalSteps} \u6b65\u9aa4`);
}

function formatChunkCount(
  lang: UiLanguage,
  transcription: NonNullable<ProcessingProgressUpdate["transcription"]>
): string {
  return text(
    lang,
    `${transcription.completedChunks} of ${transcription.totalChunks} chunks`,
    `${transcription.completedChunks} / ${transcription.totalChunks} \u5206\u5757`
  );
}

function formatPhaseStatus({
  completed,
  index,
  activeIndex,
  lang,
  phase,
  progress
}: {
  completed: boolean;
  index: number;
  activeIndex: number;
  lang: UiLanguage;
  phase: ProcessingPhase;
  progress: ProcessingProgressUpdate | null;
}): string {
  if (completed || index < activeIndex) {
    return text(lang, "done", "\u5b8c\u6210");
  }

  if (index > activeIndex) {
    return text(lang, "queued", "\u7b49\u5f85\u4e2d");
  }

  if (phase.step === "transcription" && progress?.transcription) {
    return formatChunkCount(lang, progress.transcription);
  }

  return text(lang, "running", "\u8fdb\u884c\u4e2d");
}
