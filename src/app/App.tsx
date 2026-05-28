import { useEffect, useMemo, useState } from "react";
import type { MeetingMetadata, ProcessingStep, SummaryStyle } from "../features/meetings/meetingTypes";
import type { LanguageOptionValue } from "../features/settings/languageOptions";
import type { ProcessingPreferences } from "../features/settings/processingPreferences";
import type {
  AppSettings,
  ExportOptions,
  RecordingAudioDevice,
  RecordingAudioLevel,
  RecordingAudioSources,
  WorkflowPhase
} from "./meetMapApi";
import { DetailScreen } from "./ui/DetailScreen";
import { LibraryScreen } from "./ui/LibraryScreen";
import { MeetMapShell } from "./ui/MeetMapShell";
import { PreRecordingScreen } from "./ui/PreRecordingScreen";
import { ProcessingScreen } from "./ui/ProcessingScreen";
import { RecordingScreen } from "./ui/RecordingScreen";
import { SettingsScreen, type SettingsSectionId } from "./ui/SettingsScreen";
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
  const [draftSummaryStyle, setDraftSummaryStyle] = useState<SummaryStyle>("decisions_actions");
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
  const [liveAudioLevels, setLiveAudioLevels] = useState<Partial<Record<"system" | "microphone", RecordingAudioLevel>>>({});
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [isPauseChanging, setIsPauseChanging] = useState(false);
  const [activeStep, setActiveStep] = useState<ProcessingStep>("activity_detection");
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSectionId>("general");
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

  useEffect(() => {
    if (!api?.onAudioLevel) {
      return;
    }

    return api.onAudioLevel((update) => {
      setLiveAudioLevels((current) => ({
        ...current,
        [update.track]: update
      }));
    });
  }, [api]);

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

  const recordingActive = meeting?.status === "recording";
  const displayedAudioSources = api?.onAudioLevel
    ? deriveDetectedAudioSources(activeAudioSources, liveAudioLevels)
    : activeAudioSources;

  function navigate(nextPhase: WorkflowPhase) {
    setError(null);
    setExportError(null);
    setPhase(nextPhase);
    if (nextPhase === "pre") {
      setDraftOutputLanguage(settings.defaultOutputLanguage);
      setDraftAudioSources({ system: true, microphone: true });
    }
    if (nextPhase === "settings") {
      setSettingsInitialSection("general");
    }
  }

  function openSettings(section: SettingsSectionId = "general") {
    setSettingsInitialSection(section);
    setError(null);
    setExportError(null);
    setPhase("settings");
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
        outputLanguage: draftOutputLanguage,
        summaryStyle: draftSummaryStyle
      });
      const recordingMeeting = await api.startRecording(createdMeeting.id, {
        audioSources: draftAudioSources,
        deviceIds: selectedAudioDeviceIds
      });
      setActiveAudioSources(draftAudioSources);
      setLiveAudioLevels({});
      setIsRecordingPaused(false);
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
      setIsRecordingPaused(false);
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
      const processedMeeting = await api.processMeeting(meetingId, buildProcessingPreferences(settings));
      window.clearInterval(interval);
      setMeeting(processedMeeting);
      setActiveStep(processedMeeting.processingStep ?? "completed");
      setPhase("detail");
    } catch (caughtError) {
      window.clearInterval(interval);
      setError(formatError(caughtError));
    }
  }

  async function setRecordingPaused(nextPaused: boolean) {
    if (!api) {
      setError("MeetMap desktop API is unavailable");
      return;
    }

    const pauseAction = nextPaused ? api.pauseRecording : api.resumeRecording;
    if (!pauseAction) {
      setError("Recording pause is not available in this runtime");
      return;
    }

    setIsPauseChanging(true);
    setError(null);
    try {
      await pauseAction();
      setIsRecordingPaused(nextPaused);
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsPauseChanging(false);
    }
  }

  async function openExport(kind: "word" | "html", options?: ExportOptions) {
    if (!api || !meeting) {
      setExportError("Export is not available yet");
      return;
    }

    setExportError(null);
    try {
      await api.openExport({ meetingId: meeting.id, kind, options });
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
        recording={recordingActive}
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
            onSummaryStyleChange={setDraftSummaryStyle}
            onAudioSourcesChange={setDraftAudioSources}
            onDeviceChange={(track, deviceId) =>
              setSelectedAudioDeviceIds((current) => ({ ...current, [track]: deviceId }))
            }
            onOpenPrivacySettings={() => openSettings("privacy")}
            onStart={() => void startRecording()}
            onTitleChange={setDraftTitle}
            audioSources={draftAudioSources}
            devices={audioDevices}
            selectedDeviceIds={selectedAudioDeviceIds}
            outputLanguage={draftOutputLanguage}
            summaryStyle={draftSummaryStyle}
            title={draftTitle}
          />
        ) : null}
        {phase === "recording" ? (
          <RecordingScreen
            error={error}
            isStopping={isStopping}
            isPaused={isRecordingPaused}
            isPauseChanging={isPauseChanging}
            audioSources={displayedAudioSources}
            lang={settings.uiLanguage}
            meeting={meeting}
            onOpenAudioSettings={() => openSettings("audio")}
            onPauseChange={(paused) => void setRecordingPaused(paused)}
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
            exportDefaults={{
              includeTimestamps: settings.includeTimestamps,
              includeTranscriptAppendix: settings.includeTranscriptAppendix
            }}
            lang={settings.uiLanguage}
            meeting={meeting}
            onExport={(kind, options) => void openExport(kind, options)}
          />
        ) : null}
        {phase === "settings" ? (
          <SettingsScreen
            initialSection={settingsInitialSection}
            key={settingsInitialSection}
            onChange={updateSettings}
            settings={settings}
          />
        ) : null}
      </MeetMapShell>
    </div>
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildProcessingPreferences(settings: AppSettings): ProcessingPreferences {
  return {
    autoDeleteCloudCopies: settings.autoDeleteCloudCopies,
    preserveTranscriptLanguage: settings.preserveTranscriptLanguage,
    recognitionLanguages: {
      cantonese: settings.cantonese,
      englishGB: settings.englishGB,
      englishUS: settings.englishUS,
      mandarin: settings.mandarin,
      mixedCodeSwitching: settings.mixedCodeSwitching
    },
    speakerDiarization: settings.speakerDiarization,
    uploadRecordedAudio: settings.uploadRecordedAudio,
    uploadSeparateTracks: settings.uploadSeparateTracks,
    useOutputLanguage: settings.useOutputLanguage
  };
}

function deriveDetectedAudioSources(
  activeAudioSources: RecordingAudioSources,
  levels: Partial<Record<"system" | "microphone", RecordingAudioLevel>>
): RecordingAudioSources {
  return {
    system: Boolean(activeAudioSources.system && levels.system && levels.system.level > 0.02),
    microphone: Boolean(activeAudioSources.microphone && levels.microphone && levels.microphone.level > 0.02)
  };
}
