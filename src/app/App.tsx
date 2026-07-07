import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MeetingMetadata, ProcessingStep, SummaryStyle } from "../features/meetings/meetingTypes";
import type { LanguageOptionValue } from "../features/settings/languageOptions";
import type { ProcessingPreferences } from "../features/settings/processingPreferences";
import {
  createAudioPreflightState,
  type AudioPreflightLevelSample
} from "../features/audio-analysis/audioPreflight";
import type {
  AppSettings,
  ExportOptions,
  MeetingDetailData,
  MeetingSearchResult,
  ProcessingProgressUpdate,
  RecordingAudioDevice,
  RecordingAudioLevel,
  RecordingAudioSources,
  SettingsRuntimeStatus,
  TaggedMomentInput,
  WorkspaceState,
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
import { WorkspaceScreen } from "./ui/WorkspaceScreen";

export function App() {
  const api = window.meetMap;
  const hasWorkspaceApi = Boolean(api?.getWorkspace);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [phase, setPhase] = useState<WorkflowPhase>("library");
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(() => (
    hasWorkspaceApi
      ? null
      : {
          currentPath: "Local browser session",
          recentPaths: []
        }
  ));
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(hasWorkspaceApi);
  const [isChoosingWorkspace, setIsChoosingWorkspace] = useState(false);
  const [settingsRuntimeStatus, setSettingsRuntimeStatus] = useState<SettingsRuntimeStatus | null>(null);
  const [libraryMeetings, setLibraryMeetings] = useState<MeetingMetadata[]>([]);
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
  const [recordingLevels, setRecordingLevels] = useState<Partial<Record<"system" | "microphone", RecordingAudioLevel[]>>>({});
  const [preflightLevels, setPreflightLevels] = useState<Partial<Record<"system" | "microphone", AudioPreflightLevelSample[]>>>({});
  const [preflightUnavailableTracks, setPreflightUnavailableTracks] = useState<Partial<Record<"system" | "microphone", string>>>({});
  const [preflightNow, setPreflightNow] = useState(() => new Date().toISOString());
  const [isStarting, setIsStarting] = useState(false);
  const [isImportingAudio, setIsImportingAudio] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [isPauseChanging, setIsPauseChanging] = useState(false);
  const [activeStep, setActiveStep] = useState<ProcessingStep>("activity_detection");
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgressUpdate | null>(null);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSectionId>("general");
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MeetingSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [detailDataState, setDetailDataState] = useState<{
    meetingId: string;
    data: MeetingDetailData | null;
    error: string | null;
  } | null>(null);
  const preflightProbeActiveRef = useRef(false);
  const meetingId = meeting?.id;
  const meetingStatus = meeting?.status;

  const refreshLibraryMeetings = useCallback(async () => {
    if (!api?.listMeetings) {
      setLibraryMeetings([]);
      return;
    }

    setLibraryMeetings(await api.listMeetings());
  }, [api]);

  useEffect(() => {
    document.body.classList.toggle("theme-dark", settings.theme === "dark");
    document.body.classList.toggle("theme-light", settings.theme !== "dark");
    document.documentElement.style.setProperty("--accent", settings.accent);
    document.documentElement.style.setProperty("--accent-text", settings.accent);
    document.documentElement.style.setProperty("--accent-soft", `${settings.accent}1f`);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;

    if (api?.getSettings) {
      void api.getSettings().then((loadedSettings) => {
        if (!cancelled) {
          setSettings(loadedSettings);
          setDraftOutputLanguage(loadedSettings.defaultOutputLanguage);
          setSelectedAudioDeviceIds({
            system: loadedSettings.defaultSystemAudioDeviceId ?? undefined,
            microphone: loadedSettings.defaultMicrophoneDeviceId ?? undefined
          });
        }
      }).catch((caughtError) => {
        if (!cancelled) {
          setError(formatError(caughtError));
        }
      });
    }

    if (api?.getSettingsRuntimeStatus) {
      void api.getSettingsRuntimeStatus().then((status) => {
        if (!cancelled) {
          setSettingsRuntimeStatus(status);
        }
      }).catch((caughtError) => {
        if (!cancelled) {
          setSettingsRuntimeStatus({
            openAi: {
              configured: false,
              source: `runtime status unavailable: ${formatError(caughtError)}`,
              structureModel: "-",
              transcriptionModel: "-"
            }
          });
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!api?.getWorkspace) {
      return;
    }

    let cancelled = false;
    void api.getWorkspace().then(async (state) => {
      if (cancelled) {
        return;
      }

      setWorkspace(state);
      setPhase(state.currentPath ? "library" : "workspace");
      if (state.currentPath) {
        await refreshLibraryMeetings();
      }
    }).catch((caughtError) => {
      if (!cancelled) {
        setError(formatError(caughtError));
        setPhase("workspace");
      }
    }).finally(() => {
      if (!cancelled) {
        setIsWorkspaceLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [api, refreshLibraryMeetings]);

  useEffect(() => {
    if ((phase !== "pre" && phase !== "settings") || !api?.listAudioDevices) {
      return;
    }

    let cancelled = false;
    void api.listAudioDevices().then((devices) => {
      if (cancelled) {
        return;
      }

      setAudioDevices(devices);
      setSelectedAudioDeviceIds((current) => ({
        system: current.system ?? settings.defaultSystemAudioDeviceId ?? devices.find((device) => device.track === "system")?.id,
        microphone: current.microphone ?? settings.defaultMicrophoneDeviceId ?? devices.find((device) => device.track === "microphone")?.id
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [api, phase, settings.defaultMicrophoneDeviceId, settings.defaultSystemAudioDeviceId]);

  useEffect(() => {
    if (!api?.onAudioLevel) {
      return;
    }

    return api.onAudioLevel((update) => {
      if (update.source === "preflight") {
        setPreflightLevels((current) => appendPreflightSample(current, update));
        return;
      }

      setRecordingLevels((current) => appendRecordingLevel(current, update));
    });
  }, [api]);
  useEffect(() => {
    if (!api?.onProcessingProgress) {
      return;
    }

    return api.onProcessingProgress((update) => {
      if (meetingId && update.meetingId !== meetingId) {
        return;
      }

      setProcessingProgress(update);
      setActiveStep(update.step);
    });
  }, [api, meetingId]);

  useEffect(() => {
    if (phase !== "pre") {
      return;
    }

    const interval = window.setInterval(() => {
      setPreflightNow(new Date().toISOString());
    }, 500);

    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }

    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setIsSearching(true);
      const searchPromise = api?.searchMeetings
        ? api.searchMeetings(normalizedQuery)
        : Promise.resolve(searchLocalMeetings(libraryMeetings, normalizedQuery));

      void searchPromise.then((results) => {
        if (!cancelled) {
          setSearchResults(results);
        }
      }).catch((caughtError) => {
        if (!cancelled) {
          setError(formatError(caughtError));
          setSearchResults([]);
        }
      }).finally(() => {
        if (!cancelled) {
          setIsSearching(false);
        }
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [api, isSearchOpen, libraryMeetings, searchQuery]);

  useEffect(() => {
    if (phase !== "pre" || !api?.startAudioProbe) {
      return;
    }

    let cancelled = false;
    void api.startAudioProbe({
      audioSources: draftAudioSources,
      deviceIds: selectedAudioDeviceIds
    }).then(() => {
      if (cancelled) {
        void api.stopAudioProbe?.();
        return;
      }
      preflightProbeActiveRef.current = true;
    }).catch((caughtError) => {
      if (cancelled) {
        return;
      }

      const message = formatError(caughtError);
      setPreflightUnavailableTracks({
        system: draftAudioSources.system ? message : undefined,
        microphone: draftAudioSources.microphone ? message : undefined
      });
      setError(message);
    });

    return () => {
      cancelled = true;
      if (preflightProbeActiveRef.current) {
        preflightProbeActiveRef.current = false;
        void api.stopAudioProbe?.();
      }
    };
  }, [
    api,
    phase,
    draftAudioSources,
    selectedAudioDeviceIds
  ]);

  useEffect(() => {
    if (phase !== "detail" || !meetingId || meetingStatus === "no_audio") {
      return;
    }

    if (!api?.getMeetingDetailData) {
      return;
    }

    let cancelled = false;

    void api.getMeetingDetailData(meetingId).then((data) => {
      if (!cancelled) {
        setDetailDataState({ meetingId, data, error: null });
      }
    }).catch((caughtError) => {
      if (!cancelled) {
        setDetailDataState({ meetingId, data: null, error: formatError(caughtError) });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [api, phase, meetingId, meetingStatus]);

  const crumbs = useMemo(() => {
    switch (phase) {
      case "workspace":
        return ["MeetMap", "Workspace"];
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
  const displayedAudioSources = activeAudioSources;
  const currentDetailState = phase === "detail" && meetingId === detailDataState?.meetingId ? detailDataState : null;
  const currentDetailData = currentDetailState?.data ?? null;
  const currentDetailError = currentDetailState?.error ?? null;
  const audioPreflight = createAudioPreflightState({
    enabledSources: draftAudioSources,
    now: preflightNow,
    samples: api?.startAudioProbe ? preflightLevels : createFallbackPreflightSamples(draftAudioSources, preflightNow),
    unavailableTracks: preflightUnavailableTracks
  });
  const searchHasEnoughInput = searchQuery.trim().length >= 2;
  const visibleSearchResults = searchHasEnoughInput ? searchResults : [];
  const visibleIsSearching = searchHasEnoughInput && isSearching;

  function navigate(nextPhase: WorkflowPhase) {
    if (nextPhase !== "workspace" && !workspace?.currentPath) {
      setPhase("workspace");
      return;
    }

    setError(null);
    setExportError(null);
    setPhase(nextPhase);
    if (nextPhase === "pre") {
      setDraftOutputLanguage(settings.defaultOutputLanguage);
      setDraftAudioSources({ system: true, microphone: true });
      resetPreflightState();
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

  function openLibraryMeeting(meetingId: string) {
    const selectedMeeting = libraryMeetings.find((item) => item.id === meetingId);
    if (!selectedMeeting) {
      return;
    }

    setError(null);
    setExportError(null);
    setDetailDataState(null);
    setMeeting(selectedMeeting);
    setActiveStep(selectedMeeting.processingStep ?? "activity_detection");
    setProcessingProgress(null);

    if (selectedMeeting.status === "processing" || selectedMeeting.status === "recording" || selectedMeeting.status === "recorded") {
      setPhase("processing");
      return;
    }

    setPhase("detail");
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
      if (api.stopAudioProbe && preflightProbeActiveRef.current) {
        preflightProbeActiveRef.current = false;
        await api.stopAudioProbe();
      }
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
      setRecordingLevels({});
      setIsRecordingPaused(false);
      setMeeting(recordingMeeting);
      setPhase("recording");
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsStarting(false);
    }
  }

  async function importAudio() {
    if (!api?.importAudio) {
      setError("Audio import is not available in this runtime");
      return;
    }

    setIsImportingAudio(true);
    setError(null);
    try {
      const importedMeeting = await api.importAudio({
        outputLanguage: settings.defaultOutputLanguage,
        summaryStyle: "decisions_actions"
      });

      if (!importedMeeting) {
        return;
      }

      setMeeting(importedMeeting);
      setActiveAudioSources({ system: true, microphone: false });
      setActiveStep("activity_detection");
      setProcessingProgress(createInitialProcessingProgress(importedMeeting.id));
      setPhase("processing");
      void processCurrentMeeting(importedMeeting.id);
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsImportingAudio(false);
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
      setProcessingProgress(createInitialProcessingProgress(recordedMeeting.id));
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

    setProcessingProgress(createInitialProcessingProgress(meetingId));

    try {
      const processedMeeting = await api.processMeeting(meetingId, buildProcessingPreferences(settings));
      setMeeting(processedMeeting);
      setActiveStep(processedMeeting.processingStep ?? "completed");
      setProcessingProgress(createCompletedProcessingProgress(processedMeeting.id));
      await refreshLibraryMeetings();
      setPhase("detail");
    } catch (caughtError) {
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

  async function openMeetingExport(meetingId: string, kind: "word" | "html") {
    if (!api?.openExport) {
      setExportError("Export is not available yet");
      return;
    }

    setExportError(null);
    try {
      await api.openExport({ meetingId, kind });
    } catch (caughtError) {
      setExportError(formatError(caughtError));
    }
  }

  async function shareCurrentMeeting() {
    if (!meeting) {
      throw new Error("No meeting is selected");
    }

    const shareText = [
      `MeetMap meeting: ${meeting.title}`,
      `Status: ${meeting.status}`,
      meeting.transcriptPath ? `Transcript: ${meeting.transcriptPath}` : undefined,
      meeting.structurePath ? `Structure: ${meeting.structurePath}` : undefined,
      meeting.exportPaths.wordSummaryPath ? `Word: ${meeting.exportPaths.wordSummaryPath}` : undefined,
      meeting.exportPaths.htmlMeetingMapPath ? `HTML map: ${meeting.exportPaths.htmlMeetingMapPath}` : undefined
    ].filter((item): item is string => Boolean(item)).join("\n");

    await copyTextToClipboard(shareText);
  }

  function regenerateCurrentMeeting() {
    if (!meeting) {
      setExportError("No meeting is selected");
      return;
    }

    setError(null);
    setProcessingProgress(createInitialProcessingProgress(meeting.id));
    setActiveStep("activity_detection");
    setPhase("processing");
    void processCurrentMeeting(meeting.id);
  }

  function openProcessingPreview() {
    if (!meeting || !canPreviewMeeting(meeting)) {
      setError("Preview is not available until a transcript, structure, or completed result exists.");
      return;
    }

    setError(null);
    setDetailDataState(null);
    setPhase("detail");
  }

  async function saveMeetingAudio() {
    if (!api?.saveMeetingAudio || !meeting) {
      setExportError("Audio download is not available yet");
      return;
    }

    setExportError(null);
    try {
      await api.saveMeetingAudio(meeting.id);
    } catch (caughtError) {
      setExportError(formatError(caughtError));
    }
  }

  async function saveTaggedMoment(moment: TaggedMomentInput) {
    if (!api?.saveTaggedMoment || !meeting) {
      return;
    }

    try {
      await api.saveTaggedMoment(meeting.id, moment);
    } catch (caughtError) {
      setError(formatError(caughtError));
    }
  }

  async function revealMeetingFolder(meetingId: string) {
    if (!api?.revealMeetingFolder) {
      setError("Meeting folder reveal is not available in this runtime");
      return;
    }

    setError(null);
    try {
      await api.revealMeetingFolder(meetingId);
    } catch (caughtError) {
      setError(formatError(caughtError));
    }
  }

  function reprocessMeeting(meetingId: string) {
    const selectedMeeting = libraryMeetings.find((item) => item.id === meetingId);
    if (selectedMeeting) {
      setMeeting(selectedMeeting);
    }

    setError(null);
    setActiveStep("activity_detection");
    setProcessingProgress(createInitialProcessingProgress(meetingId));
    setPhase("processing");
    void processCurrentMeeting(meetingId);
  }

  async function chooseWorkspaceFolder() {
    if (!api?.chooseWorkspaceFolder) {
      setError("Workspace picker is unavailable in this runtime");
      return;
    }

    setIsChoosingWorkspace(true);
    setError(null);
    try {
      const nextWorkspace = await api.chooseWorkspaceFolder();
      setWorkspace(nextWorkspace);
      if (nextWorkspace.currentPath) {
        setPhase("library");
        await refreshLibraryMeetings();
      }
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsChoosingWorkspace(false);
    }
  }

  async function selectWorkspaceFolder(folderPath: string) {
    if (!api?.useWorkspaceFolder) {
      setError("Workspace picker is unavailable in this runtime");
      return;
    }

    setIsChoosingWorkspace(true);
    setError(null);
    try {
      const nextWorkspace = await api.useWorkspaceFolder(folderPath);
      setWorkspace(nextWorkspace);
      setPhase("library");
      await refreshLibraryMeetings();
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsChoosingWorkspace(false);
    }
  }

  async function revealWorkspaceFolder() {
    if (!api?.revealWorkspaceFolder) {
      return;
    }

    setError(null);
    try {
      await api.revealWorkspaceFolder();
    } catch (caughtError) {
      setError(formatError(caughtError));
    }
  }

  async function updateSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
    if (phase === "pre") {
      setDraftOutputLanguage(nextSettings.defaultOutputLanguage);
    }

    setSelectedAudioDeviceIds((current) => ({
      ...current,
      system: nextSettings.defaultSystemAudioDeviceId ?? current.system,
      microphone: nextSettings.defaultMicrophoneDeviceId ?? current.microphone
    }));

    if (api?.updateSettings) {
      try {
        setSettings(await api.updateSettings(nextSettings));
      } catch (caughtError) {
        setError(formatError(caughtError));
      }
    }
  }

  function resetPreflightState() {
    setPreflightLevels({});
    setPreflightUnavailableTracks({});
    setPreflightNow(new Date().toISOString());
  }

  return (
    <div className="meetmap-root">
      <MeetMapShell
        crumbs={crumbs}
        current={phase}
        lang={settings.uiLanguage}
        meetingCount={libraryMeetings.length}
        onNav={(target) => navigate(target)}
        onChooseWorkspace={() => void chooseWorkspaceFolder()}
        onRevealWorkspace={() => void revealWorkspaceFolder()}
        onSearchRequest={() => setIsSearchOpen(true)}
        recording={recordingActive}
        workspacePath={workspace?.currentPath ?? null}
      >
        {isWorkspaceLoading ? (
          <section className="pane" aria-label="Loading workspace">
            <div className="empty-state">Loading workspace...</div>
          </section>
        ) : null}
        {!isWorkspaceLoading && phase === "workspace" ? (
          <WorkspaceScreen
            error={error}
            isChoosing={isChoosingWorkspace}
            onChooseFolder={() => void chooseWorkspaceFolder()}
            onUseRecent={(folderPath) => void selectWorkspaceFolder(folderPath)}
            workspace={workspace}
          />
        ) : null}
        {!isWorkspaceLoading && phase === "library" ? (
          <LibraryScreen
            currentMeeting={meeting}
            isImportingAudio={isImportingAudio}
            lang={settings.uiLanguage}
            meetings={libraryMeetings}
            onImportAudio={() => void importAudio()}
            onNew={() => navigate("pre")}
            onOpenCurrent={() => meeting && navigate("detail")}
            onOpenMeeting={openLibraryMeeting}
            onRevealMeeting={(meetingId) => void revealMeetingFolder(meetingId)}
            onReprocessMeeting={reprocessMeeting}
            onExportMeeting={(meetingId, kind) => void openMeetingExport(meetingId, kind)}
            onChooseWorkspace={() => void chooseWorkspaceFolder()}
            onRevealWorkspace={() => void revealWorkspaceFolder()}
            workspacePath={workspace?.currentPath ?? null}
          />
        ) : null}
        {!isWorkspaceLoading && phase === "pre" ? (
          <PreRecordingScreen
            error={error}
            isStarting={isStarting}
            lang={settings.uiLanguage}
            onCancel={() => navigate("library")}
            onOutputLanguageChange={setDraftOutputLanguage}
            onSummaryStyleChange={setDraftSummaryStyle}
            onAudioSourcesChange={(sources) => {
              resetPreflightState();
              setDraftAudioSources(sources);
            }}
            onDeviceChange={(track, deviceId) => {
              resetPreflightState();
              setSelectedAudioDeviceIds((current) => ({ ...current, [track]: deviceId }));
            }}
            onOpenPrivacySettings={() => openSettings("privacy")}
            onStart={() => void startRecording()}
            onTitleChange={setDraftTitle}
            audioSources={draftAudioSources}
            devices={audioDevices}
            selectedDeviceIds={selectedAudioDeviceIds}
            audioPreflight={audioPreflight}
            recognitionLanguageLabel={formatRecognitionLanguages(settings)}
            outputLanguage={draftOutputLanguage}
            summaryStyle={draftSummaryStyle}
            transcriptionModelLabel={settingsRuntimeStatus?.openAi.configured ? settingsRuntimeStatus.openAi.transcriptionModel : "Provider not configured"}
            title={draftTitle}
          />
        ) : null}
        {!isWorkspaceLoading && phase === "recording" ? (
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
            recordingLevels={recordingLevels}
            onTagMoment={(moment) => void saveTaggedMoment(moment)}
            onStop={() => void stopRecording()}
          />
        ) : null}
        {!isWorkspaceLoading && phase === "processing" ? (
          <ProcessingScreen
            activeStep={activeStep}
            error={error}
            lang={settings.uiLanguage}
            progress={processingProgress}
            canPreview={Boolean(meeting && canPreviewMeeting(meeting))}
            onBack={() => navigate("library")}
            onPreview={openProcessingPreview}
            onRetry={() => {
              if (meeting) {
                setError(null);
                void processCurrentMeeting(meeting.id);
              }
            }}
          />
        ) : null}
        {!isWorkspaceLoading && phase === "detail" ? (
          <DetailScreen
            detailData={currentDetailData}
            detailError={currentDetailError}
            exportError={exportError}
            exportDefaults={{
              includeTimestamps: settings.includeTimestamps,
              includeTranscriptAppendix: settings.includeTranscriptAppendix
            }}
            lang={settings.uiLanguage}
            meeting={meeting}
            onExport={(kind, options) => void openExport(kind, options)}
            onDownloadAudio={() => void saveMeetingAudio()}
            onRegenerate={regenerateCurrentMeeting}
            onShare={shareCurrentMeeting}
          />
        ) : null}
        {!isWorkspaceLoading && phase === "settings" ? (
          <SettingsScreen
            apiStatus={settingsRuntimeStatus}
            audioDevices={audioDevices}
            initialSection={settingsInitialSection}
            key={settingsInitialSection}
            onChange={(nextSettings) => void updateSettings(nextSettings)}
            settings={settings}
          />
        ) : null}
        {isSearchOpen ? (
          <SearchOverlay
            isSearching={visibleIsSearching}
            onClose={() => setIsSearchOpen(false)}
            onOpenMeeting={(meetingId) => {
              setIsSearchOpen(false);
              openLibraryMeeting(meetingId);
            }}
            onQueryChange={setSearchQuery}
            query={searchQuery}
            results={visibleSearchResults}
          />
        ) : null}
      </MeetMapShell>
    </div>
  );
}

function SearchOverlay({
  isSearching,
  onClose,
  onOpenMeeting,
  onQueryChange,
  query,
  results
}: {
  isSearching: boolean;
  onClose(): void;
  onOpenMeeting(meetingId: string): void;
  onQueryChange(query: string): void;
  query: string;
  results: MeetingSearchResult[];
}) {
  return (
    <div className="dialog-backdrop search-backdrop" onClick={onClose}>
      <div
        aria-label="Search meetings"
        aria-modal="true"
        className="search-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <input
          autoFocus
          className="input search-dialog-input"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search meetings, transcripts, action items..."
          type="search"
          value={query}
        />
        <div className="search-results">
          {query.trim().length < 2 ? (
            <div className="empty-state compact">Type at least 2 characters</div>
          ) : isSearching ? (
            <div className="empty-state compact">Searching...</div>
          ) : results.length === 0 ? (
            <div className="empty-state compact">No results</div>
          ) : (
            results.map((result) => (
              <button className="search-result" key={result.meetingId} onClick={() => onOpenMeeting(result.meetingId)} type="button">
                <strong>{result.title}</strong>
                <span className="sub">{result.status} - {new Date(result.updatedAt).toLocaleString()}</span>
                {result.matches.map((match, index) => (
                  <span className="search-match" key={`${match.kind}-${index}`}>
                    <span className="chip">{match.kind}</span>
                    <span>{match.snippet}</span>
                  </span>
                ))}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function createInitialProcessingProgress(meetingId: string): ProcessingProgressUpdate {
  return {
    meetingId,
    step: "activity_detection",
    currentStep: 1,
    totalSteps: 6,
    percent: 0,
    updatedAt: new Date().toISOString()
  };
}

function createCompletedProcessingProgress(meetingId: string): ProcessingProgressUpdate {
  return {
    meetingId,
    step: "completed",
    currentStep: 6,
    totalSteps: 6,
    percent: 100,
    updatedAt: new Date().toISOString()
  };
}

function canPreviewMeeting(meeting: MeetingMetadata): boolean {
  return Boolean(
    meeting.transcriptPath ||
    meeting.structurePath ||
    meeting.exportPaths.htmlMeetingMapPath ||
    meeting.status === "completed" ||
    meeting.status === "no_audio"
  );
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  window.localStorage.setItem("meetmap:last-share", value);
}

function searchLocalMeetings(meetings: MeetingMetadata[], query: string): MeetingSearchResult[] {
  const normalizedQuery = query.toLowerCase();
  return meetings
    .filter((meeting) => `${meeting.title} ${meeting.status} ${meeting.outputLanguage}`.toLowerCase().includes(normalizedQuery))
    .map((meeting) => ({
      meetingId: meeting.id,
      title: meeting.title,
      status: meeting.status,
      updatedAt: meeting.timestamps.updatedAt,
      matches: [
        {
          kind: "meeting",
          label: "Meeting",
          snippet: `${meeting.title} - ${meeting.status}`
        }
      ]
    }));
}

function formatRecognitionLanguages(settings: AppSettings): string {
  const enabled = [
    settings.mandarin ? "Mandarin" : null,
    settings.cantonese ? "Cantonese" : null,
    settings.englishUS ? "English US" : null,
    settings.englishGB ? "English GB" : null,
    settings.mixedCodeSwitching ? "Code-switching" : null
  ].filter((item): item is string => Boolean(item));

  return enabled.length > 0 ? enabled.join(" / ") : "Provider auto-detect";
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
    uploadSeparateTracks: true,
    useOutputLanguage: true
  };
}

function appendPreflightSample(
  current: Partial<Record<"system" | "microphone", AudioPreflightLevelSample[]>>,
  update: RecordingAudioLevel
): Partial<Record<"system" | "microphone", AudioPreflightLevelSample[]>> {
  const sample = {
    level: update.level,
    occurredAt: update.occurredAt
  };
  const cutoffMs = Date.parse(update.occurredAt) - 5000;
  const existing = current[update.track] ?? [];

  return {
    ...current,
    [update.track]: [...existing, sample].filter(
      (item) => Date.parse(item.occurredAt) >= cutoffMs
    )
  };
}

function appendRecordingLevel(
  current: Partial<Record<"system" | "microphone", RecordingAudioLevel[]>>,
  update: RecordingAudioLevel
): Partial<Record<"system" | "microphone", RecordingAudioLevel[]>> {
  const existing = current[update.track] ?? [];

  return {
    ...current,
    [update.track]: [...existing, update].slice(-120)
  };
}

function createFallbackPreflightSamples(
  audioSources: RecordingAudioSources,
  now: string
): Partial<Record<"system" | "microphone", AudioPreflightLevelSample[]>> {
  return {
    system: audioSources.system ? [{ level: 1, occurredAt: now }] : undefined,
    microphone: audioSources.microphone ? [{ level: 1, occurredAt: now }] : undefined
  };
}
