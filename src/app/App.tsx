import { useEffect, useMemo, useState } from "react";
import type { MeetingMetadata, ProcessingStep } from "../features/meetings/meetingTypes";
import type { LanguageOptionValue } from "../features/settings/languageOptions";
import type {
  AppSettings,
  RecordingAudioDevice,
  RecordingAudioSources,
  WorkflowPhase
} from "./meetMapApi";
import { DetailScreen } from "./ui/DetailScreen";
import { LibraryScreen } from "./ui/LibraryScreen";
import { MeetMapShell } from "./ui/MeetMapShell";
import { PreRecordingScreen } from "./ui/PreRecordingScreen";
import { ProcessingScreen } from "./ui/ProcessingScreen";
import { RecordingScreen } from "./ui/RecordingScreen";
import { SettingsScreen } from "./ui/SettingsScreen";
import { DEFAULT_APP_SETTINGS } from "./ui/theme";

export function App() {
  const api = window.meetMap;
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [phase, setPhase] = useState<WorkflowPhase>("library");
  const [meeting, setMeeting] = useState<MeetingMetadata | null>(null);
  const [draftTitle, setDraftTitle] = useState("Untitled meeting");
  const [draftOutputLanguage, setDraftOutputLanguage] = useState<LanguageOptionValue>(
    settings.defaultOutputLanguage
  );
  const [draftAudioSources, setDraftAudioSources] = useState<RecordingAudioSources>({
    system: true,
    microphone: true
  });
  const [audioDevices, setAudioDevices] = useState<RecordingAudioDevice[]>([]);
  const [selectedAudioDeviceIds, setSelectedAudioDeviceIds] = useState<Partial<Record<"system" | "microphone", string>>>({});
  const [activeAudioSources, setActiveAudioSources] = useState<RecordingAudioSources>({
    system: true,
    microphone: true
  });
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [activeStep, setActiveStep] = useState<ProcessingStep>("activity_detection");
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.toggle("theme-dark", settings.theme === "dark");
    document.body.classList.toggle("theme-light", settings.theme !== "dark");
    document.documentElement.style.setProperty("--accent", settings.accent);
    document.documentElement.style.setProperty("--accent-text", settings.accent);
    document.documentElement.style.setProperty("--accent-soft", `${settings.accent}1f`);
  }, [settings]);

  useEffect(() => {
    if (phase !== "pre" || !api?.listAudioDevices) {
      return;
    }

    let cancelled = false;
    void api.listAudioDevices().then((devices) => {
      if (cancelled) {
        return;
      }

      setAudioDevices(devices);
      setSelectedAudioDeviceIds((current) => ({
        system: current.system ?? devices.find((device) => device.track === "system")?.id,
        microphone: current.microphone ?? devices.find((device) => device.track === "microphone")?.id
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [api, phase]);

  const crumbs = useMemo(() => {
    switch (phase) {
      case "library":
        return ["MeetMap", "All meetings"];
      case "pre":
        return ["MeetMap", "New recording"];
      case "recording":
        return ["MeetMap", "Recording"];
      case "processing":
        return ["MeetMap", "Processing"];
      case "detail":
        return ["MeetMap", "Meeting detail"];
      case "settings":
        return ["MeetMap", "Settings"];
    }
  }, [phase]);

  function navigate(nextPhase: WorkflowPhase) {
    setError(null);
    setExportError(null);
    setPhase(nextPhase);
    if (nextPhase === "pre") {
      setDraftOutputLanguage(settings.defaultOutputLanguage);
      setDraftAudioSources({ system: true, microphone: true });
    }
  }

  async function startRecording() {
    if (!api) {
      setError("MeetMap desktop API is unavailable");
      return;
    }

    const title = draftTitle.trim() || `Untitled meeting · ${new Date().toLocaleDateString()}`;

    setIsStarting(true);
    setError(null);
    try {
      const createdMeeting = await api.createMeeting({
        title,
        outputLanguage: draftOutputLanguage
      });
      const recordingMeeting = await api.startRecording(createdMeeting.id, {
        audioSources: draftAudioSources,
        deviceIds: selectedAudioDeviceIds
      });
      setActiveAudioSources(draftAudioSources);
      setMeeting(recordingMeeting);
      setPhase("recording");
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsStarting(false);
    }
  }

  async function stopRecording() {
    if (!api) {
      setError("MeetMap desktop API is unavailable");
      return;
    }

    setIsStopping(true);
    setError(null);
    try {
      const recordedMeeting = await api.stopRecording();
      setMeeting(recordedMeeting);
      setActiveStep("activity_detection");
      setPhase("processing");
      void processCurrentMeeting(recordedMeeting.id);
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsStopping(false);
    }
  }

  async function processCurrentMeeting(meetingId: string) {
    if (!api) {
      setError("MeetMap desktop API is unavailable");
      return;
    }

    const stagedSteps: ProcessingStep[] = [
      "activity_detection",
      "transcription",
      "merge",
      "structure_extraction",
      "word_export",
      "html_map_export"
    ];
    let stageIndex = 0;
    const interval = window.setInterval(() => {
      stageIndex = Math.min(stageIndex + 1, stagedSteps.length - 1);
      setActiveStep(stagedSteps[stageIndex]);
    }, 120);

    try {
      const processedMeeting = await api.processMeeting(meetingId);
      window.clearInterval(interval);
      setMeeting(processedMeeting);
      setActiveStep(processedMeeting.processingStep ?? "completed");
      setPhase("detail");
    } catch (caughtError) {
      window.clearInterval(interval);
      setError(formatError(caughtError));
    }
  }

  async function openExport(kind: "word" | "html") {
    if (!api || !meeting) {
      setExportError("Export is not available yet");
      return;
    }

    setExportError(null);
    try {
      await api.openExport({ meetingId: meeting.id, kind });
    } catch (caughtError) {
      setExportError(formatError(caughtError));
    }
  }

  function updateSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
    if (phase === "pre") {
      setDraftOutputLanguage(nextSettings.defaultOutputLanguage);
    }
  }

  return (
    <div className="meetmap-root">
      <MeetMapShell
        crumbs={crumbs}
        current={phase}
        lang={settings.uiLanguage}
        onNav={(target) => navigate(target)}
        recording={phase === "recording"}
      >
        {phase === "library" ? (
          <LibraryScreen
            currentMeeting={meeting}
            lang={settings.uiLanguage}
            onNew={() => navigate("pre")}
            onOpenCurrent={() => meeting && navigate("detail")}
          />
        ) : null}
        {phase === "pre" ? (
          <PreRecordingScreen
            error={error}
            isStarting={isStarting}
            lang={settings.uiLanguage}
            onCancel={() => navigate("library")}
            onOutputLanguageChange={setDraftOutputLanguage}
            onAudioSourcesChange={setDraftAudioSources}
            onDeviceChange={(track, deviceId) =>
              setSelectedAudioDeviceIds((current) => ({ ...current, [track]: deviceId }))
            }
            onStart={() => void startRecording()}
            onTitleChange={setDraftTitle}
            audioSources={draftAudioSources}
            devices={audioDevices}
            selectedDeviceIds={selectedAudioDeviceIds}
            outputLanguage={draftOutputLanguage}
            title={draftTitle}
          />
        ) : null}
        {phase === "recording" ? (
          <RecordingScreen
            error={error}
            isStopping={isStopping}
            audioSources={activeAudioSources}
            lang={settings.uiLanguage}
            meeting={meeting}
            onStop={() => void stopRecording()}
          />
        ) : null}
        {phase === "processing" ? (
          <ProcessingScreen
            activeStep={activeStep}
            error={error}
            lang={settings.uiLanguage}
            onBack={() => navigate("library")}
            onRetry={() => {
              if (meeting) {
                setError(null);
                void processCurrentMeeting(meeting.id);
              }
            }}
          />
        ) : null}
        {phase === "detail" ? (
          <DetailScreen
            exportError={exportError}
            lang={settings.uiLanguage}
            meeting={meeting}
            onExport={(kind) => void openExport(kind)}
          />
        ) : null}
        {phase === "settings" ? (
          <SettingsScreen onChange={updateSettings} settings={settings} />
        ) : null}
      </MeetMapShell>
    </div>
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
