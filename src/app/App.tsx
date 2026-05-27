import { useState } from "react";
import type { MeetingMetadata, ProcessingStep } from "../features/meetings/meetingTypes";
import { LANGUAGE_OPTIONS, type LanguageOptionValue } from "../features/settings/languageOptions";

type MeetMapApi = {
  platform: string;
  createMeeting(input: {
    title: string;
    outputLanguage: LanguageOptionValue;
  }): Promise<MeetingMetadata>;
  startRecording(meetingId: string): Promise<MeetingMetadata>;
  stopRecording(): Promise<MeetingMetadata>;
  processMeeting(meetingId: string): Promise<MeetingMetadata>;
  openExport(input: { meetingId: string; kind: "word" | "html" }): Promise<void>;
};

declare global {
  interface Window {
    meetMap?: MeetMapApi;
  }
}

const PROCESSING_STEPS: { value: ProcessingStep; label: string }[] = [
  { value: "activity_detection", label: "Activity detection" },
  { value: "transcription", label: "Transcription" },
  { value: "merge", label: "Transcript merge" },
  { value: "structure_extraction", label: "Structure extraction" },
  { value: "word_export", label: "Word export" },
  { value: "html_map_export", label: "HTML map export" },
  { value: "completed", label: "Completed" }
];

type WorkflowPhase = "setup" | "recording" | "processing" | "results" | "error";

export function App() {
  const api = window.meetMap;
  const [title, setTitle] = useState("Untitled meeting");
  const [outputLanguage, setOutputLanguage] = useState<LanguageOptionValue>("auto");
  const [phase, setPhase] = useState<WorkflowPhase>("setup");
  const [meeting, setMeeting] = useState<MeetingMetadata | null>(null);
  const [activeStep, setActiveStep] = useState<ProcessingStep | undefined>();
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (caughtError) {
      setPhase("error");
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  async function startMeeting() {
    await runAction(async () => {
      if (!api) {
        throw new Error("MeetMap desktop API is unavailable");
      }

      const createdMeeting = await api.createMeeting({ title, outputLanguage });
      const recordingMeeting = await api.startRecording(createdMeeting.id);
      setMeeting(recordingMeeting);
      setPhase("recording");
    });
  }

  async function stopAndProcessMeeting() {
    await runAction(async () => {
      if (!api || !meeting) {
        throw new Error("No meeting is recording");
      }

      const recordedMeeting = await api.stopRecording();
      setMeeting(recordedMeeting);
      setActiveStep("activity_detection");
      setPhase("processing");
      const processedMeeting = await api.processMeeting(recordedMeeting.id);
      setMeeting(processedMeeting);
      setActiveStep(processedMeeting.processingStep);
      setPhase("results");
    });
  }

  async function openExport(kind: "word" | "html") {
    await runAction(async () => {
      if (!api || !meeting) {
        return;
      }

      await api.openExport({ meetingId: meeting.id, kind });
    });
  }

  function resetWorkflow() {
    setMeeting(null);
    setActiveStep(undefined);
    setError(null);
    setPhase("setup");
  }

  return (
    <main style={styles.shell}>
      <section aria-label="MeetMap workflow" style={styles.panel}>
        <header style={styles.header}>
          <p style={styles.eyebrow}>MeetMap MVP</p>
          <h1 style={styles.heading}>Post-meeting workflow</h1>
          <p style={styles.subtle}>
            Setup, record, process, and export a meeting summary and map.
          </p>
        </header>

        {phase === "setup" ? (
          <section aria-label="Meeting setup" style={styles.stack}>
            <label style={styles.label}>
              Meeting title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              Output language
              <select
                value={outputLanguage}
                onChange={(event) =>
                  setOutputLanguage(event.target.value as LanguageOptionValue)
                }
                style={styles.input}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={!api} onClick={startMeeting} style={styles.primaryButton}>
              Start recording
            </button>
          </section>
        ) : null}

        {phase === "recording" && meeting ? (
          <section aria-label="Recording status" style={styles.stack}>
            <StatusRow label="Meeting" value={meeting.title} />
            <StatusRow label="Status" value="Recording demo audio" />
            <button onClick={stopAndProcessMeeting} style={styles.primaryButton}>
              Stop and process
            </button>
          </section>
        ) : null}

        {phase === "processing" ? (
          <section aria-label="Processing progress" style={styles.stack}>
            <ProgressList activeStep={activeStep} />
          </section>
        ) : null}

        {phase === "results" && meeting ? (
          <section aria-label="Results" style={styles.stack}>
            <ProgressList activeStep={meeting.processingStep} />
            <StatusRow label="Status" value={meeting.status} />
            <div style={styles.actions}>
              <button
                onClick={() => void openExport("word")}
                style={styles.secondaryButton}
              >
                Open Word summary
              </button>
              <button
                onClick={() => void openExport("html")}
                style={styles.secondaryButton}
              >
                Open HTML map
              </button>
              <button onClick={resetWorkflow} style={styles.secondaryButton}>
                New meeting
              </button>
            </div>
          </section>
        ) : null}

        {phase === "error" ? (
          <section aria-label="Workflow error" style={styles.stack}>
            <p role="alert" style={styles.error}>
              {error}
            </p>
            <button onClick={resetWorkflow} style={styles.secondaryButton}>
              Back to setup
            </button>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function ProgressList({ activeStep }: { activeStep?: ProcessingStep }) {
  const activeIndex = PROCESSING_STEPS.findIndex((step) => step.value === activeStep);

  return (
    <ol style={styles.progressList}>
      {PROCESSING_STEPS.map((step, index) => {
        const isComplete = activeIndex >= index;
        const isActive = activeStep === step.value;
        return (
          <li key={step.value} style={styles.progressItem}>
            <span
              aria-hidden="true"
              style={{
                ...styles.progressDot,
                background: isComplete ? "#2563eb" : "#d7deea"
              }}
            />
            <span style={isActive ? styles.activeStep : undefined}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.statusRow}>
      <span style={styles.statusLabel}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

const styles = {
  shell: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f7f8fb",
    color: "#1d2433",
    fontFamily:
      "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    padding: "32px"
  },
  panel: {
    width: "min(680px, 100%)",
    padding: "32px",
    border: "1px solid #d9dfeb",
    borderRadius: "8px",
    background: "#ffffff",
    boxShadow: "0 18px 50px rgba(29, 36, 51, 0.08)"
  },
  header: {
    marginBottom: "28px"
  },
  eyebrow: {
    margin: "0 0 10px",
    color: "#3766d5",
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0"
  },
  heading: {
    margin: "0 0 10px",
    fontSize: "34px",
    lineHeight: 1.1,
    letterSpacing: "0"
  },
  subtle: {
    margin: 0,
    color: "#536073",
    lineHeight: 1.55
  },
  stack: {
    display: "grid",
    gap: "18px"
  },
  label: {
    display: "grid",
    gap: "8px",
    color: "#344054",
    fontWeight: 700
  },
  input: {
    minHeight: "42px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    padding: "0 12px",
    color: "#111827",
    font: "inherit"
  },
  primaryButton: {
    minHeight: "44px",
    border: 0,
    borderRadius: "6px",
    background: "#2563eb",
    color: "#ffffff",
    font: "inherit",
    fontWeight: 700,
    cursor: "pointer"
  },
  secondaryButton: {
    minHeight: "40px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#ffffff",
    color: "#1d2433",
    font: "inherit",
    fontWeight: 700,
    cursor: "pointer"
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px"
  },
  statusRow: {
    display: "grid",
    gridTemplateColumns: "130px 1fr",
    gap: "12px",
    alignItems: "baseline"
  },
  statusLabel: {
    color: "#536073",
    fontWeight: 700
  },
  progressList: {
    display: "grid",
    gap: "12px",
    margin: 0,
    padding: 0,
    listStyle: "none"
  },
  progressItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px"
  },
  progressDot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%"
  },
  activeStep: {
    fontWeight: 700
  },
  error: {
    margin: 0,
    color: "#b42318",
    fontWeight: 700
  }
} satisfies Record<string, React.CSSProperties>;
