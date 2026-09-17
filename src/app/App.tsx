import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioPreflightLevelSample } from "../features/audio-analysis/audioPreflight";
import { createAudioPreflightState } from "../features/audio-analysis/audioPreflight";
import type { MeetingMetadata, ProcessingStep } from "../features/meetings/meetingTypes";
import type { LocalizedMeetingAnalysis } from "../features/intelligence/meetingStructure";
import type { LanguageOptionValue } from "../features/settings/languageOptions";
import { LANGUAGE_OPTIONS } from "../features/settings/languageOptions";
import type { ProcessingPreferences } from "../features/settings/processingPreferences";
import { DEFAULT_APP_SETTINGS } from "../features/settings/appSettings";
import { buildModelOptions } from "../features/providers/llmModelCatalog";
import type {
  LlmProviderState,
  SaveLlmProviderInput
} from "../features/providers/llmProviderConfig";
import type {
  AppSettings,
  MeetingDetailData,
  ProcessingProgressUpdate,
  RecordingAudioDevice,
  RecordingAudioSources,
  SettingsRuntimeStatus,
  WorkspaceState
} from "./meetMapApi";
import type { LiveLevelStream } from "../features/recording/liveLevelStream";
import { createLiveLevelStream } from "../features/recording/liveLevelStream";
import { LiveWaveform } from "./ui/LiveWaveform";
import { BusyIndicator } from "./ui/BusyIndicator";
import { usePageMotion } from "./ui/usePageMotion";
import { formatError } from "./errorMessage";
import "./ui/transcriptionApp.css";
import "./ui/motion.css";
import "./ui/recordingWidget.css";

type AppView =
  | "home"
  | "live-setup"
  | "recording"
  | "import"
  | "processing"
  | "transcript";

type AudioTrack = "system" | "microphone";

/** Minimum gap between preflight meter re-renders, per track. */
const PREFLIGHT_LEVEL_INTERVAL_MS = 100;
type ProcessingMode = "transcription" | "analysis";

export function App() {
  const api = window.meetMap;
  const [view, setView] = useState<AppView>("home");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [audioExportPath, setAudioExportPath] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [runtimeStatus, setRuntimeStatus] = useState<SettingsRuntimeStatus | null>(null);
  const [meetings, setMeetings] = useState<MeetingMetadata[]>([]);
  const [meeting, setMeeting] = useState<MeetingMetadata | null>(null);
  const [recordingMeeting, setRecordingMeeting] = useState<MeetingMetadata | null>(null);
  const [analysisIds, setAnalysisIds] = useState<string[]>([]);
  const selectedMeetingRef = useRef<string | undefined>(undefined);
  selectedMeetingRef.current = meeting?.id;
  const [detail, setDetail] = useState<MeetingDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const motionRoot = useRef<HTMLElement>(null);
  usePageMotion(motionRoot, `${isLoading ? "loading" : view}${isSettingsOpen ? ":settings" : ""}`);
  const [isChoosingWorkspace, setIsChoosingWorkspace] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const recordingElapsed = useRecordingTimer(recordingMeeting, isPaused);
  const [isPauseChanging, setIsPauseChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("未命名会议");
  const [outputLanguage, setOutputLanguage] = useState<LanguageOptionValue>("bilingual");
  const [audioSources, setAudioSources] = useState<RecordingAudioSources>({
    system: true,
    microphone: true
  });
  const [audioDevices, setAudioDevices] = useState<RecordingAudioDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Partial<Record<AudioTrack, string>>>({});
  const [preflightLevels, setPreflightLevels] = useState<Partial<Record<AudioTrack, AudioPreflightLevelSample[]>>>({});
  const liveLevels = useRef(createLiveLevelStream()).current;
  const [unavailableTracks, setUnavailableTracks] = useState<Partial<Record<AudioTrack, string>>>({});
  const [preflightNow, setPreflightNow] = useState(() => new Date().toISOString());
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgressUpdate | null>(null);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("transcription");
  const [meetingOrigin, setMeetingOrigin] = useState<"import" | "recording" | null>(null);
  const probeActiveRef = useRef(false);
  const activeViewRef = useRef<AppView>(view);

  useEffect(() => {
    activeViewRef.current = view;
  }, [view]);

  useEffect(() => {
    // Settings open over whatever is on screen, recording included: a missing
    // transcription key is usually discovered mid-session.
    return api?.onOpenSettings?.(() => setIsSettingsOpen(true));
  }, [api]);

  const refreshMeetings = useCallback(async () => {
    if (!api?.listMeetings) {
      setMeetings([]);
      return;
    }

    setMeetings(await api.listMeetings());
  }, [api]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [workspaceState, loadedSettings, providerStatus] = await Promise.all([
          api?.getWorkspace?.() ?? Promise.resolve({ currentPath: "本地浏览器会话", recentPaths: [] }),
          api?.getSettings?.() ?? Promise.resolve(DEFAULT_APP_SETTINGS),
          api?.getSettingsRuntimeStatus?.() ?? Promise.resolve(null)
        ]);
        if (cancelled) {
          return;
        }

        setWorkspace(workspaceState);
        setSettings(loadedSettings);
        setOutputLanguage(loadedSettings.defaultOutputLanguage);
        setSelectedDeviceIds({
          system: loadedSettings.defaultSystemAudioDeviceId ?? undefined,
          microphone: loadedSettings.defaultMicrophoneDeviceId ?? undefined
        });
        setRuntimeStatus(providerStatus);
        if (workspaceState.currentPath) {
          await refreshMeetings();
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(formatError(caughtError));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [api, refreshMeetings]);

  useEffect(() => {
    if (view !== "live-setup" || !api?.listAudioDevices) {
      return;
    }

    let cancelled = false;
    void api.listAudioDevices().then((devices) => {
      if (cancelled) {
        return;
      }

      setAudioDevices(devices);
      setSelectedDeviceIds((current) => {
        const select = (track: AudioTrack) => devices.some((device) => device.track === track && device.id === current[track])
          ? current[track] : devices.find((device) => device.track === track)?.id;
        const next = { system: select("system"), microphone: select("microphone") };
        return next.system === current.system && next.microphone === current.microphone ? current : next;
      });
    }).catch((caughtError) => {
      if (!cancelled) {
        setError(formatError(caughtError));
      }
    }).finally(() => { if (!cancelled) setIsLoadingDevices(false); });

    return () => {
      cancelled = true;
    };
  }, [api, view]);

  useEffect(() => {
    if (!api?.onAudioLevel) {
      return;
    }

    const lastPreflightAt: Partial<Record<AudioTrack, number>> = {};
    return api.onAudioLevel((update) => {
      if (update.source !== "preflight") {
        liveLevels.push(update.track, { level: update.level, peak: update.peak ?? update.level });
        return;
      }

      // Levels arrive fast enough to drive a waveform; the setup meters do not
      // need a re-render per sample.
      const receivedAt = Date.now();
      if (receivedAt - (lastPreflightAt[update.track] ?? 0) < PREFLIGHT_LEVEL_INTERVAL_MS) {
        return;
      }
      lastPreflightAt[update.track] = receivedAt;
      setPreflightLevels((current) => appendLevel(current, update));
    });
  }, [api, liveLevels]);

  useEffect(() => {
    if (!api?.onProcessingProgress) {
      return;
    }

    return api.onProcessingProgress((update) => {
      if (meeting?.id && update.meetingId === meeting.id) {
        setProcessingProgress(update);
      }
    });
  }, [api, meeting?.id]);

  useEffect(() => {
    if (view !== "live-setup") {
      return;
    }

    const timer = window.setInterval(() => setPreflightNow(new Date().toISOString()), 500);
    return () => window.clearInterval(timer);
  }, [view]);

  useEffect(() => {
    if (view !== "live-setup" || isLoadingDevices || isStarting || !api?.startAudioProbe || (!audioSources.system && !audioSources.microphone)) {
      return;
    }

    let cancelled = false;
    let requested = false;
    const startProbe = api.startAudioProbe;
    const timer = window.setTimeout(() => {
      requested = true;
      void startProbe({ audioSources, deviceIds: selectedDeviceIds }).then(() => {
        if (cancelled) return;
        probeActiveRef.current = true;
      }).catch((caughtError) => {
        if (cancelled) return;
        const message = formatError(caughtError);
        setUnavailableTracks({
          system: audioSources.system ? message : undefined,
          microphone: audioSources.microphone ? message : undefined
        });
        setError(message);
      });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (requested) {
        probeActiveRef.current = false;
        void api.stopAudioProbe?.().catch(() => undefined);
      }
    };
  }, [api, audioSources, selectedDeviceIds, view, isLoadingDevices, isStarting]);

  useEffect(() => {
    if (view !== "transcript" || !meeting?.id || !api?.getMeetingDetailData) {
      return;
    }

    let cancelled = false;
    void api.getMeetingDetailData(meeting.id).then((data) => {
      if (!cancelled) {
        setDetail(data);
      }
    }).catch((caughtError) => {
      if (!cancelled) {
        setError(formatError(caughtError));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [api, meeting?.id, view]);

  const preflight = useMemo(() => createAudioPreflightState({
    enabledSources: audioSources,
    now: preflightNow,
    samples: api?.startAudioProbe
      ? preflightLevels
      : createFallbackLevels(audioSources, preflightNow),
    unavailableTracks
  }), [api?.startAudioProbe, audioSources, preflightLevels, preflightNow, unavailableTracks]);

  async function chooseWorkspace() {
    if (recordingMeeting || analysisIds.length) {
      setError("请等待录音或分析结束后再切换保存位置。");
      return;
    }
    if (!api?.chooseWorkspaceFolder) {
      setError("当前运行环境无法选择保存位置。");
      return;
    }

    setIsChoosingWorkspace(true);
    setError(null);
    try {
      const nextWorkspace = await api.chooseWorkspaceFolder();
      setWorkspace(nextWorkspace);
      if (nextWorkspace.currentPath) {
        await refreshMeetings();
      }
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsChoosingWorkspace(false);
    }
  }

  async function revealWorkspace() {
    try {
      await api?.revealWorkspaceFolder?.();
    } catch (caughtError) {
      setError(formatError(caughtError));
    }
  }

  function openLiveSetup() {
    if (recordingMeeting) {
      setView("recording");
      return;
    }
    if (!workspace?.currentPath) {
      setError("请先选择文件保存位置。");
      return;
    }
    setError(null);
    setTitle(`即时会议 ${new Date().toLocaleDateString("zh-CN")}`);
    setAudioSources({ system: true, microphone: true });
    setPreflightLevels({});
    setUnavailableTracks({});
    setIsLoadingDevices(Boolean(api?.listAudioDevices));
    setView("live-setup");
  }

  async function startRecording() {
    if (!api) {
      setError("桌面录音服务不可用。");
      return;
    }

    setIsStarting(true);
    setError(null);
    try {
      probeActiveRef.current = false;
      await api.stopAudioProbe?.();
      const created = await api.createMeeting({
        title: title.trim() || "未命名会议",
        outputLanguage,
        summaryStyle: "decisions_actions"
      });
      const recording = await api.startRecording(created.id, {
        audioSources,
        deviceIds: selectedDeviceIds
      });
      setMeeting(recording);
      setRecordingMeeting(recording);
      setMeetingOrigin("recording");
      liveLevels.reset();
      setIsPaused(false);
      setView("recording");
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsStarting(false);
    }
  }

  async function changePauseState() {
    if (!api) {
      return;
    }

    setIsPauseChanging(true);
    setError(null);
    try {
      if (isPaused) {
        await api.resumeRecording?.();
      } else {
        await api.pauseRecording?.();
      }
      setIsPaused(!isPaused);
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsPauseChanging(false);
    }
  }

  async function stopRecording() {
    if (!api) {
      return;
    }

    setIsStopping(true);
    setError(null);
    try {
      const recorded = await api.stopRecording();
      setRecordingMeeting(null);
      setMeeting(recorded);
      setIsPaused(false);
      // List the finished recording before transcription runs, so a failure
      // downstream still leaves a visible project in the library.
      await refreshMeetings().catch(() => undefined);
      await processMeeting(recorded);
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsStopping(false);
    }
  }

  async function saveMeetingAudio(target: MeetingMetadata) {
    if (!api?.saveMeetingAudio) {
      setError("当前运行环境无法导出音频。");
      return;
    }

    try {
      const savedPath = await api.saveMeetingAudio(target.id);
      if (savedPath) {
        setAudioExportPath(savedPath);
      }
    } catch (caughtError) {
      setError(formatError(caughtError));
    }
  }

  async function importWithPicker() {
    if (!api?.importAudio) {
      setError("当前运行环境无法导入音频。");
      return;
    }

    setIsImporting(true);
    setError(null);
    try {
      const imported = await api.importAudio({
        outputLanguage,
        summaryStyle: "decisions_actions"
      });
      if (imported) {
        setMeeting(imported);
        setMeetingOrigin("import");
      }
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsImporting(false);
    }
  }

  async function importDroppedFile(file: File) {
    if (!api?.importDroppedAudio) {
      setError("拖放导入暂不可用，请点击选择音频文件。");
      return;
    }

    if (!/\.(wav|m4a)$/i.test(file.name)) {
      setError("目前仅支持 WAV 和 M4A 音频。");
      return;
    }

    setIsImporting(true);
    setError(null);
    try {
      const imported = await api.importDroppedAudio(file, {
        outputLanguage,
        summaryStyle: "decisions_actions"
      });
      setMeeting(imported);
      setMeetingOrigin("import");
    } catch (caughtError) {
      setError(formatError(caughtError));
    } finally {
      setIsImporting(false);
    }
  }

  async function processMeeting(target: MeetingMetadata) {
    if (!api) {
      return;
    }

    activeViewRef.current = "processing";
    setProcessingMode("transcription");
    setView("processing");
    setProcessingProgress(createInitialProgress(target.id, "transcription"));
    setError(null);
    try {
      const processed = await api.processMeeting(target.id, buildProcessingPreferences(settings));
      if (selectedMeetingRef.current !== target.id) {
        await refreshMeetings();
        return;
      }
      setMeeting(processed);
      setDetail(null);
      await refreshMeetings();
      if (activeViewRef.current === "processing") {
        activeViewRef.current = "transcript";
        setView("transcript");
      } else if (activeViewRef.current === "transcript" && api.getMeetingDetailData) {
        setDetail(await api.getMeetingDetailData(target.id));
      }
    } catch (caughtError) {
      setError(formatError(caughtError));
      // The audio is already on disk; refresh so the failed recording shows up
      // in the library and can be retried instead of looking lost.
      await refreshMeetings().catch(() => undefined);
    }
  }

  async function analyzeMeeting(target: MeetingMetadata) {
    if (!api?.analyzeMeeting) {
      setError("当前运行环境无法进行 AI 分析。");
      return;
    }

    if (analysisIds.includes(target.id)) return;
    setAnalysisIds((ids) => [...ids, target.id]);
    setError(null);
    try {
      const analyzed = await api.analyzeMeeting(target.id, buildProcessingPreferences(settings, false));
      const nextDetail = await api.getMeetingDetailData?.(target.id);
      if (selectedMeetingRef.current === target.id) {
        setMeeting(analyzed);
        if (nextDetail) setDetail(nextDetail);
      }
      await refreshMeetings();
    } catch (caughtError) {
      if (selectedMeetingRef.current === target.id) setError(formatError(caughtError));
    } finally {
      setAnalysisIds((ids) => ids.filter((id) => id !== target.id));
    }
  }

  async function renameMeetingRecord(target: MeetingMetadata, nextTitle: string) {
    if (!api?.renameMeeting) {
      throw new Error("当前运行环境无法重命名录音项目。");
    }

    const renamed = await api.renameMeeting(target.id, nextTitle);
    if (meeting?.id === renamed.id) {
      setMeeting(renamed);
    }
    setMeetings((current) => [
      renamed,
      ...current.filter((item) => item.id !== renamed.id)
    ]);
  }

  async function renameActiveMeeting(nextTitle: string) {
    if (!meeting) {
      throw new Error("当前没有可重命名的会议。");
    }
    await renameMeetingRecord(meeting, nextTitle);
  }

  async function deleteMeetingRecord(target: MeetingMetadata) {
    if (target.id === recordingMeeting?.id || analysisIds.includes(target.id)) {
      throw new Error("请等待此会议的录音或分析结束后再删除。");
    }
    if (!api?.deleteMeeting) {
      throw new Error("当前运行环境无法删除会议记录。");
    }
    await api.deleteMeeting(target.id);
    setMeetings((current) => current.filter((item) => item.id !== target.id));
    if (meeting?.id === target.id) {
      setMeeting(null);
      setDetail(null);
    }
  }

  async function saveAppSettings(nextSettings: AppSettings): Promise<AppSettings> {
    if (!api?.updateSettings) {
      throw new Error("当前运行环境无法保存设置。");
    }

    const savedSettings = await api.updateSettings(nextSettings);
    setSettings(savedSettings);
    setOutputLanguage(savedSettings.defaultOutputLanguage);
    return savedSettings;
  }

  function openTranscript(item: MeetingMetadata) {
    if (!item.transcriptPath) {
      return;
    }
    setError(null);
    setMeeting(item);
    setMeetingOrigin(null);
    setDetail(null);
    setView("transcript");
  }

  function returnHome() {
    setError(null);
    setMeeting(null);
    setDetail(null);
    setProcessingProgress(null);
    setMeetingOrigin(null);
    activeViewRef.current = "home";
    setView("home");
  }

  function returnToPreviousPage() {
    setError(null);
    setDetail(null);
    setProcessingProgress(null);
    const previousView = meetingOrigin === "import" ? "import" : "home";
    activeViewRef.current = previousView;
    setView(previousView);
  }

  function returnToTranscript() {
    setError(null);
    setProcessingProgress(null);
    activeViewRef.current = "transcript";
    setView("transcript");
  }

  useEffect(() => {
    api?.updateRecordingWidget?.(recordingMeeting ? {
      title: recordingMeeting.title,
      elapsed: formatElapsed(recordingElapsed),
      paused: isPaused,
      busy: isStopping || isPauseChanging
    } : null);
  }, [api, recordingMeeting, recordingElapsed, isPaused, isStopping, isPauseChanging]);

  useEffect(() => {
    return api?.onRecordingWidgetAction?.((action) => {
      if (!recordingMeeting) return;
      if (action === "open") setView("recording");
      if (isStopping || isPauseChanging) return;
      if (action === "pause") void changePauseState();
      if (action === "stop") void stopRecording();
    });
  });

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <main className="transcription-app" ref={motionRoot}>
      {view === "home" ? (
        <HomeScreen
          apiReady={Boolean(runtimeStatus?.openAi.configured)}
          error={error}
          isChoosingWorkspace={isChoosingWorkspace}
          meetings={meetings}
          onChooseWorkspace={() => void chooseWorkspace()}
          onImport={() => {
            if (!workspace?.currentPath) {
              setError("请先选择文件保存位置。");
              return;
            }
            setError(null);
            setView("import");
          }}
          onLive={openLiveSetup}
          onDeleteMeeting={deleteMeetingRecord}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenTranscript={openTranscript}
          onProcessMeeting={(item) => {
            setMeeting(item);
            setMeetingOrigin("recording");
            void processMeeting(item);
          }}
          onRenameMeeting={renameMeetingRecord}
          onRevealWorkspace={() => void revealWorkspace()}
          workspacePath={workspace?.currentPath ?? null}
        />
      ) : null}

      {view === "live-setup" ? (
        <LiveSetupScreen
          isLoadingDevices={isLoadingDevices}
          audioDevices={audioDevices}
          audioSources={audioSources}
          error={error}
          isStarting={isStarting}
          onBack={returnHome}
          onHome={returnHome}
          onDeviceChange={(track, deviceId) => {
            setPreflightLevels({});
            setUnavailableTracks({});
            setSelectedDeviceIds((current) => ({ ...current, [track]: deviceId }));
          }}
          onLanguageChange={setOutputLanguage}
          onSourceChange={(track, enabled) => {
            setPreflightLevels({});
            setUnavailableTracks({});
            setAudioSources((current) => ({ ...current, [track]: enabled }));
          }}
          onStart={() => void startRecording()}
          onTitleChange={setTitle}
          outputLanguage={outputLanguage}
          preflight={preflight}
          selectedDeviceIds={selectedDeviceIds}
          title={title}
        />
      ) : null}

      {view === "recording" ? (
        <RecordingView
          elapsed={recordingElapsed}
          error={error}
          isPauseChanging={isPauseChanging}
          isPaused={isPaused}
          isStopping={isStopping}
          meeting={recordingMeeting}
          onPause={() => void changePauseState()}
          onBack={returnHome}
          onHome={returnHome}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onStop={() => void stopRecording()}
          liveLevels={liveLevels}
        />
      ) : null}

      {view === "import" ? (
        <ImportScreen
          error={error}
          isImporting={isImporting}
          onBack={returnHome}
          onBrowse={() => void importWithPicker()}
          onDrop={(file) => void importDroppedFile(file)}
          onHome={returnHome}
          onLanguageChange={setOutputLanguage}
          onStart={() => meeting && void processMeeting(meeting)}
          outputLanguage={outputLanguage}
          selectedMeeting={meetingOrigin === "import" ? meeting : null}
        />
      ) : null}

      {view === "processing" ? (
        <ProcessingView
          audioExportPath={audioExportPath}
          error={error}
          meeting={meeting}
          mode={processingMode}
          onBack={processingMode === "analysis" ? returnToTranscript : returnToPreviousPage}
          onHome={returnHome}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onRetry={() => meeting && void (processingMode === "analysis" ? analyzeMeeting(meeting) : processMeeting(meeting))}
          onReveal={() => meeting && void api?.revealMeetingFolder?.(meeting.id)}
          onSaveAudio={() => meeting && void saveMeetingAudio(meeting)}
          progress={processingProgress}
        />
      ) : null}

      {view === "transcript" ? (
        <TranscriptView
          isAnalyzing={Boolean(meeting && analysisIds.includes(meeting.id))}
          detail={detail}
          error={error}
          meeting={meeting}
          onAnalyze={() => meeting && void analyzeMeeting(meeting)}
          onBack={returnToPreviousPage}
          onHome={returnHome}
          onRename={renameActiveMeeting}
          onReveal={() => meeting && void api?.revealMeetingFolder?.(meeting.id)}
        />
      ) : null}

      {recordingMeeting && view !== "recording" ? (
        <aside className="recording-dock" aria-label="录音小窗">
          <span>{isPaused ? "已暂停" : "正在录制"} · {formatElapsed(recordingElapsed)}</span>
          <strong>{recordingMeeting.title}</strong>
          <button onClick={() => setView("recording")} type="button">返回录音</button>
          <button disabled={isPauseChanging || isStopping} onClick={() => void changePauseState()} type="button">{isPaused ? "继续录制" : "暂停"}</button>
          <button disabled={isPauseChanging || isStopping} onClick={() => void stopRecording()} type="button">{isStopping ? "正在停止..." : "结束并转写"}</button>
        </aside>
      ) : null}

      {isSettingsOpen ? (
        <SettingsDialog
          onClose={() => setIsSettingsOpen(false)}
          onSave={saveAppSettings}
          settings={settings}
        />
      ) : null}
    </main>
  );
}

function SettingsDialog({
  onClose,
  onSave,
  settings
}: {
  onClose(): void;
  onSave(settings: AppSettings): Promise<AppSettings>;
  settings: AppSettings;
}) {
  const [draft, setDraft] = useState(settings);
  const [vocabularyText, setVocabularyText] = useState(settings.customVocabulary.join("\n"));
  const [sourceSettings, setSourceSettings] = useState(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (settings !== sourceSettings) {
    setSourceSettings(settings);
    setDraft(settings);
    setVocabularyText(settings.customVocabulary.join("\n"));
  }

  async function submitSettings() {
    const vocabulary = [...new Set(vocabularyText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean))];

    if (vocabulary.length > 100) {
      setFormError("常用人名与术语最多可以保存 100 项。");
      return;
    }
    if (vocabulary.some((item) => item.length > 80)) {
      setFormError("每个人名或术语不能超过 80 个字符。");
      return;
    }

    setIsSaving(true);
    setFormError(null);
    setSaveMessage(null);
    try {
      const saved = await onSave({
        ...draft,
        customVocabulary: vocabulary,
        summaryInstructions: draft.summaryInstructions.trim()
      });
      setDraft(saved);
      setVocabularyText(saved.customVocabulary.join("\n"));
      setSaveMessage("设置已保存到本地。");
    } catch (caughtError) {
      setFormError(formatError(caughtError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="settings-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-labelledby="settings-dialog-title"
        aria-modal="true"
        className="settings-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
        role="dialog"
      >
      <header className="settings-head">
        <p className="eyebrow">EDIT / SETTINGS</p>
        <h1 id="settings-dialog-title">偏好与模型连接</h1>
        <p>这些设置保存在本地。术语和总结偏好只会在你主动开始 LLM 分析时发送。录音过程中也可以随时修改。</p>
        <button aria-label="关闭设置" autoFocus className="settings-close" onClick={onClose} type="button">关闭</button>
      </header>

      <form className="settings-form" onSubmit={(event) => {
        event.preventDefault();
        void submitSettings();
      }}>
        <section className="settings-group">
          <div className="settings-group-heading">
            <span>01</span>
            <div>
              <h2>输出默认值</h2>
              <p>新录音和新导入项目会优先使用这里的语言。</p>
            </div>
          </div>
          <label className="settings-control">
            <span>默认输出语言</span>
            <LanguageSelect
              onChange={(value) => setDraft((current) => ({ ...current, defaultOutputLanguage: value }))}
              value={draft.defaultOutputLanguage}
            />
          </label>
        </section>

        <section className="settings-group">
          <div className="settings-group-heading">
            <span>02</span>
            <div>
              <h2>常用人名与术语</h2>
              <p>每行一项，例如客户名、产品名、缩写或团队成员姓名。</p>
            </div>
          </div>
          <label className="settings-control settings-control-wide">
            <span>自定义词表</span>
            <textarea
              aria-label="自定义词表"
              aria-describedby="vocabulary-help"
              onChange={(event) => {
                setVocabularyText(event.target.value);
                setFormError(null);
                setSaveMessage(null);
              }}
              placeholder={"MeetMap\nPowerApps\n张怡"}
              rows={7}
              value={vocabularyText}
            />
            <small id="vocabulary-help">最多 100 项；分析模型会优先保留这些名称的拼写。</small>
          </label>
        </section>

        <section className="settings-group">
          <div className="settings-group-heading">
            <span>03</span>
            <div>
              <h2>总结偏好</h2>
              <p>描述你希望总结重点关注的内容，不需要编写完整提示词。</p>
            </div>
          </div>
          <label className="settings-control settings-control-wide">
            <span>自定义要求</span>
            <textarea
              aria-label="自定义要求"
              maxLength={1000}
              onChange={(event) => {
                setDraft((current) => ({ ...current, summaryInstructions: event.target.value }));
                setFormError(null);
                setSaveMessage(null);
              }}
              placeholder="例如：优先列出客户反馈、最终决定和有明确负责人的行动项。"
              rows={5}
              value={draft.summaryInstructions}
            />
            <small>{draft.summaryInstructions.length}/1000</small>
          </label>
        </section>

        <LlmProviderSettings />

        <section className="settings-group settings-group-compact">
          <div className="settings-group-heading">
            <span>05</span>
            <div>
              <h2>常用行为</h2>
              <p>控制原文、导出与应用启动方式。</p>
            </div>
          </div>
          <div className="settings-checks">
            <label>
              <input
                checked={draft.preserveTranscriptLanguage}
                onChange={(event) => setDraft((current) => ({ ...current, preserveTranscriptLanguage: event.target.checked }))}
                type="checkbox"
              />
              <span>保留文字稿原始语言</span>
            </label>
            <label>
              <input
                checked={draft.includeTimestamps}
                onChange={(event) => setDraft((current) => ({ ...current, includeTimestamps: event.target.checked }))}
                type="checkbox"
              />
              <span>导出内容包含时间信息</span>
            </label>
            <label>
              <input
                checked={draft.openAtStartup}
                onChange={(event) => setDraft((current) => ({ ...current, openAtStartup: event.target.checked }))}
                type="checkbox"
              />
              <span>Windows 启动时打开 MeetMap</span>
            </label>
          </div>
        </section>

        <footer className="settings-footer">
          <div aria-live="polite">
            {formError ? <span className="settings-error">{formError}</span> : null}
            {!formError && saveMessage ? <span className="settings-saved">{saveMessage}</span> : null}
          </div>
          <div className="settings-footer-actions">
            <button onClick={onClose} type="button">关闭</button>
            <button className="settings-save" disabled={isSaving} type="submit">
              {isSaving ? <><BusyIndicator />正在保存</> : "保存设置"}
            </button>
          </div>
        </footer>
      </form>
      </div>
    </div>
  );
}

const CUSTOM_MODEL_OPTION = "__custom__";

/** Seeds the dropdown before the provider has been asked for its real list. */
const PRESET_MODELS: Record<string, string[]> = {
  "https://api.openai.com/v1": ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
  "http://localhost:11434/v1": ["qwen3:8b", "llama3.1:8b"],
  "http://localhost:1234/v1": ["local-model"]
};

/** Speech-to-text is a separate model; local runtimes usually offer none. */
const PRESET_TRANSCRIPTION_MODELS: Record<string, string[]> = {
  "https://api.openai.com/v1": ["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"]
};

const EMPTY_PROVIDER_DRAFT: SaveLlmProviderInput = {
  name: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  transcriptionModel: "gpt-4o-mini-transcribe",
  apiStyle: "responses",
  apiKeyRequired: true,
  apiKey: ""
};

function LlmProviderSettings() {
  const api = window.meetMap;
  const [state, setState] = useState<LlmProviderState>({
    activeProviderId: null,
    providers: []
  });
  const [draft, setDraft] = useState<SaveLlmProviderInput>(EMPTY_PROVIDER_DRAFT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "note" } | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [isCustomTranscriptionModel, setIsCustomTranscriptionModel] = useState(false);
  const normalizedBaseUrl = draft.baseUrl.trim().replace(/\/+$/, "");
  const modelOptions = buildModelOptions({
    current: draft.model,
    fallback: PRESET_MODELS[normalizedBaseUrl] ?? [],
    fetched: models
  });
  const transcriptionModelOptions = buildModelOptions({
    current: draft.transcriptionModel ?? "",
    fallback: PRESET_TRANSCRIPTION_MODELS[normalizedBaseUrl] ?? [],
    fetched: models
  });

  useEffect(() => {
    let cancelled = false;
    void api?.getLlmProviders?.().then((nextState) => {
      if (!cancelled) {
        setState(nextState);
      }
    }).catch((caughtError) => {
      if (!cancelled) {
        setProviderError(formatError(caughtError));
      }
    }).finally(() => {
      if (!cancelled) {
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function loadModels(
    source: Pick<SaveLlmProviderInput, "baseUrl" | "apiKey" | "id"> = draft,
    { automatic = false }: { automatic?: boolean } = {}
  ) {
    if (!api?.listLlmModels) {
      setProviderError("当前运行环境无法读取模型列表。");
      return;
    }

    setIsLoadingModels(true);
    setProviderError(null);
    setMessage(null);
    try {
      const available = await api.listLlmModels({
        baseUrl: source.baseUrl,
        apiKey: source.apiKey || undefined,
        providerId: source.id
      });
      setModels(available);
      setIsCustomModel(false);
      setMessage({
        tone: available.length > 0 ? "success" : "note",
        text: available.length > 0
          ? `读取到 ${available.length} 个可用模型。`
          : "该服务没有返回任何模型。"
      });
      setDraft((current) => available.length > 0 && !available.includes(current.model)
        ? { ...current, model: available[0] }
        : current);
    } catch (caughtError) {
      // An automatic attempt runs without the user asking, so a service that is
      // offline or still missing its key stays a note, not a red failure.
      if (automatic) {
        setMessage({
          tone: "note",
          text: `未能自动获取模型列表：${formatError(caughtError).replace(/[。.]\s*$/, "")}。可以手动填写模型 ID。`
        });
      } else {
        setProviderError(formatError(caughtError));
      }
    } finally {
      setIsLoadingModels(false);
    }
  }

  /** Only worth trying when the endpoint can actually authenticate us. */
  function canLoadModels(source: SaveLlmProviderInput): boolean {
    return Boolean(source.baseUrl.trim())
      && (!source.apiKeyRequired || Boolean(source.apiKey?.trim()) || Boolean(source.id));
  }

  function startEdit(providerId: string) {
    const provider = state.providers.find((item) => item.id === providerId);
    if (!provider) {
      return;
    }
    setModels([]);
    setIsCustomModel(false);
    setIsCustomTranscriptionModel(false);
    const next: SaveLlmProviderInput = {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      model: provider.model,
      transcriptionModel: provider.transcriptionModel,
      apiStyle: provider.apiStyle,
      apiKeyRequired: provider.apiKeyRequired,
      apiKey: ""
    };
    setDraft(next);
    setMessage(null);
    setProviderError(null);
    // The saved key lives in the main process, so an existing provider can
    // refresh its models without the user retyping anything.
    if (canLoadModels(next)) {
      void loadModels(next, { automatic: true });
    }
  }

  function applyPreset(preset: "openai" | "ollama" | "lmstudio") {
    const values: Record<typeof preset, SaveLlmProviderInput> = {
      openai: EMPTY_PROVIDER_DRAFT,
      ollama: {
        name: "Ollama（本地）",
        baseUrl: "http://localhost:11434/v1",
        model: "qwen3:8b",
        transcriptionModel: "",
        apiStyle: "chat_completions",
        apiKeyRequired: false,
        apiKey: ""
      },
      lmstudio: {
        name: "LM Studio（本地）",
        baseUrl: "http://localhost:1234/v1",
        model: "local-model",
        transcriptionModel: "",
        apiStyle: "chat_completions",
        apiKeyRequired: false,
        apiKey: ""
      }
    };
    const next = { ...values[preset] };
    setDraft(next);
    setModels([]);
    setIsCustomModel(false);
    setIsCustomTranscriptionModel(false);
    setMessage(null);
    setProviderError(null);
    // Local services need no key, so their model list can be filled in right away.
    if (canLoadModels(next)) {
      void loadModels(next, { automatic: true });
    }
  }

  async function saveProvider() {
    if (!api?.saveLlmProvider) {
      setProviderError("当前运行环境无法保存 LLM 配置。");
      return;
    }
    setIsSaving(true);
    setMessage(null);
    setProviderError(null);
    try {
      const nextState = await api.saveLlmProvider(draft);
      setState(nextState);
      setDraft(EMPTY_PROVIDER_DRAFT);
      setModels([]);
      setIsCustomModel(false);
      setIsCustomTranscriptionModel(false);
      setMessage({ tone: "success", text: "LLM 提供商已保存；密钥不会显示在界面中。" });
    } catch (caughtError) {
      setProviderError(formatError(caughtError));
    } finally {
      setIsSaving(false);
    }
  }

  async function activateProvider(providerId: string) {
    if (!api?.setActiveLlmProvider) {
      return;
    }
    try {
      setState(await api.setActiveLlmProvider(providerId));
      setMessage({ tone: "success", text: "已切换会议分析模型，下一次分析立即生效。" });
      setProviderError(null);
    } catch (caughtError) {
      setProviderError(formatError(caughtError));
    }
  }

  async function deleteProvider(providerId: string) {
    if (pendingDeleteId !== providerId) {
      setPendingDeleteId(providerId);
      return;
    }
    if (!api?.deleteLlmProvider) {
      return;
    }
    try {
      setState(await api.deleteLlmProvider(providerId));
      if (draft.id === providerId) {
        setDraft(EMPTY_PROVIDER_DRAFT);
      }
      setPendingDeleteId(null);
      setMessage({ tone: "success", text: "提供商配置和加密密钥已删除。" });
      setProviderError(null);
    } catch (caughtError) {
      setProviderError(formatError(caughtError));
    }
  }

  return (
    <section className="settings-group llm-settings-group">
      <div className="settings-group-heading">
        <span>04</span>
        <div>
          <h2>LLM 提供商</h2>
          <p>可保存多个 OpenAI-compatible API，包含 OpenAI、Ollama、LM Studio 和其他兼容服务。</p>
        </div>
      </div>

      <div className="llm-provider-layout">
        <div className="llm-provider-list" aria-label="已保存的 LLM 提供商">
          <div className="llm-provider-list-head">
            <strong>已保存</strong>
            <button onClick={() => setDraft(EMPTY_PROVIDER_DRAFT)} type="button">新增</button>
          </div>
          {isLoading ? <p className="llm-empty" role="status"><BusyIndicator />正在读取本地配置…</p> : null}
          {!isLoading && state.providers.length === 0 ? (
            <p className="llm-empty">尚未配置。可以从右侧预设开始。</p>
          ) : null}
          {state.providers.map((provider) => (
            <article className={provider.id === state.activeProviderId ? "is-active" : ""} key={provider.id}>
              <button className="llm-provider-main" onClick={() => startEdit(provider.id)} type="button">
                <span>{provider.name}</span>
                <small>
                  分析 {provider.model} · 转写 {provider.transcriptionModel || "未选择"}
                </small>
              </button>
              <div className="llm-provider-actions">
                {provider.id === state.activeProviderId ? (
                  <span className="llm-active-badge">使用中</span>
                ) : (
                  <button onClick={() => void activateProvider(provider.id)} type="button">启用</button>
                )}
                <button className={pendingDeleteId === provider.id ? "danger-confirm" : ""} onClick={() => void deleteProvider(provider.id)} type="button">
                  {pendingDeleteId === provider.id ? "确认删除" : "删除"}
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="llm-provider-editor">
          <div className="llm-presets" aria-label="LLM 配置预设">
            <button onClick={() => applyPreset("openai")} type="button">OpenAI</button>
            <button onClick={() => applyPreset("ollama")} type="button">Ollama</button>
            <button onClick={() => applyPreset("lmstudio")} type="button">LM Studio</button>
          </div>
          <div className="llm-field-grid">
            <label><span>名称</span><input onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如：公司 Azure OpenAI" value={draft.name} /></label>
            <ModelField
              hint={models.length === 0 && !canLoadModels(draft)
                ? "填写 API Key 后会自动读取该服务的模型列表。"
                : null}
              id="llm-model-field"
              isCustom={isCustomModel}
              isRefreshing={isLoadingModels}
              label="分析模型"
              onChange={(model) => setDraft((current) => ({ ...current, model }))}
              onCustomChange={setIsCustomModel}
              onRefresh={() => void loadModels(draft)}
              options={modelOptions}
              refreshDisabled={isLoadingModels || !draft.baseUrl.trim()}
              value={draft.model}
            />
            <ModelField
              emptyLabel="未选择（该服务不用于转写）"
              hint="转写会调用该服务的 /audio/transcriptions 接口；Ollama、LM Studio 等本地服务通常不提供该接口。"
              id="llm-transcription-model-field"
              isCustom={isCustomTranscriptionModel}
              label="转写模型"
              onChange={(transcriptionModel) => setDraft((current) => ({ ...current, transcriptionModel }))}
              onCustomChange={setIsCustomTranscriptionModel}
              options={transcriptionModelOptions}
              value={draft.transcriptionModel ?? ""}
            />
            <label className="llm-wide"><span>API Base URL</span><input onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" value={draft.baseUrl} /></label>
            <label><span>API 类型</span><select onChange={(event) => setDraft((current) => ({ ...current, apiStyle: event.target.value as SaveLlmProviderInput["apiStyle"] }))} value={draft.apiStyle}><option value="responses">Responses API</option><option value="chat_completions">Chat Completions</option></select></label>
            <label>
              <span>API Key</span>
              <input
                autoComplete="new-password"
                onBlur={() => {
                  if (models.length === 0 && draft.apiKey?.trim() && canLoadModels(draft)) {
                    void loadModels(draft, { automatic: true });
                  }
                }}
                onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
                placeholder={draft.id ? "留空则保留原密钥" : "sk-…"}
                type="password"
                value={draft.apiKey ?? ""}
              />
            </label>
          </div>
          <label className="llm-no-key"><input checked={!draft.apiKeyRequired} onChange={(event) => setDraft((current) => ({ ...current, apiKeyRequired: !event.target.checked }))} type="checkbox" /><span>本地服务，不需要 API Key</span></label>
          <div className="llm-editor-footer">
            <div aria-live="polite">{providerError ? <span className="settings-error">{providerError}</span> : message ? <span className={message.tone === "success" ? "settings-saved" : "settings-note"}>{message.text}</span> : <small>API Key 使用系统安全存储加密，渲染界面不会读取明文。</small>}</div>
            <button className="solid-small" disabled={isSaving} onClick={() => void saveProvider()} type="button">{isSaving ? "保存中…" : draft.id ? "更新提供商" : "保存提供商"}</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModelField({
  emptyLabel,
  hint,
  id,
  isCustom = false,
  isRefreshing = false,
  label,
  onChange,
  onCustomChange,
  onRefresh,
  options,
  refreshDisabled = false,
  value
}: {
  emptyLabel?: string;
  hint?: string | null;
  id: string;
  isCustom?: boolean;
  isRefreshing?: boolean;
  label: string;
  onChange(value: string): void;
  onCustomChange(isCustom: boolean): void;
  onRefresh?(): void;
  options: string[];
  refreshDisabled?: boolean;
  value: string;
}) {
  const showInput = isCustom || (options.length === 0 && !emptyLabel);

  return (
    <div className="llm-field">
      <span className="llm-field-label">
        <label htmlFor={id}>{label}</label>
        {onRefresh ? (
          <button
            className="llm-inline-action"
            disabled={refreshDisabled}
            onClick={onRefresh}
            type="button"
          >
            {isRefreshing ? <><BusyIndicator />读取中…</> : "获取模型列表"}
          </button>
        ) : null}
      </span>
      {showInput ? (
        <input
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder="模型 ID"
          value={value}
        />
      ) : (
        <select
          id={id}
          onChange={(event) => {
            if (event.target.value === CUSTOM_MODEL_OPTION) {
              onCustomChange(true);
              return;
            }
            onChange(event.target.value);
          }}
          value={value}
        >
          {emptyLabel ? <option value="">{emptyLabel}</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
          <option value={CUSTOM_MODEL_OPTION}>自定义模型 ID…</option>
        </select>
      )}
      {hint ? <small className="llm-field-hint">{hint}</small> : null}
    </div>
  );
}

function HomeScreen({
  apiReady,
  error,
  isChoosingWorkspace,
  meetings,
  onChooseWorkspace,
  onImport,
  onLive,
  onDeleteMeeting,
  onOpenSettings,
  onOpenTranscript,
  onProcessMeeting,
  onRenameMeeting,
  onRevealWorkspace,
  workspacePath
}: {
  apiReady: boolean;
  error: string | null;
  isChoosingWorkspace: boolean;
  meetings: MeetingMetadata[];
  onChooseWorkspace(): void;
  onImport(): void;
  onLive(): void;
  onDeleteMeeting(meeting: MeetingMetadata): Promise<void>;
  onOpenSettings(): void;
  onOpenTranscript(meeting: MeetingMetadata): void;
  onProcessMeeting(meeting: MeetingMetadata): void;
  onRenameMeeting(meeting: MeetingMetadata, title: string): Promise<void>;
  onRevealWorkspace(): void;
  workspacePath: string | null;
}) {
  const [libraryQuery, setLibraryQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const normalizedQuery = libraryQuery.trim().toLocaleLowerCase();
  const visibleMeetings = meetings.filter((item) =>
    !normalizedQuery || item.title.toLocaleLowerCase().includes(normalizedQuery)
  );

  async function saveMeetingTitle(item: MeetingMetadata) {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setLibraryError("会议名称不能为空。");
      return;
    }
    try {
      await onRenameMeeting(item, nextTitle);
      setEditingId(null);
      setLibraryError(null);
    } catch (caughtError) {
      setLibraryError(formatError(caughtError));
    }
  }

  async function requestDelete(item: MeetingMetadata) {
    if (pendingDeleteId !== item.id) {
      setPendingDeleteId(item.id);
      setLibraryError(null);
      return;
    }
    try {
      await onDeleteMeeting(item);
      setPendingDeleteId(null);
      setLibraryError(null);
    } catch (caughtError) {
      setLibraryError(formatError(caughtError));
    }
  }

  return (
    <div className="app-frame home-frame">
      <header className="home-header">
        <div className="wordmark">MeetMap</div>
        <div className="home-header-actions">
          <div className={`provider-state ${apiReady ? "ready" : ""}`}>
            <span className="state-dot" />
            {apiReady ? "转写服务已连接" : "转写服务未配置"}
          </div>
          <button className="ghost-small" onClick={onOpenSettings} type="button">设置</button>
        </div>
      </header>

      <section className="home-intro">
        <p className="eyebrow">VOICE TO TEXT / 语音转文字</p>
        <h1>把会议声音，<br />变成可以使用的文字。</h1>
        <p>录制正在进行的会议，或导入已有音频。所有原始文件和文字稿都保存在你选择的本地文件夹。</p>
      </section>

      <WorkspaceBar
        isChoosing={isChoosingWorkspace}
        onChoose={onChooseWorkspace}
        onReveal={onRevealWorkspace}
        path={workspacePath}
      />

      {error ? <InlineError message={error} /> : null}

      <section className="module-grid" aria-label="可用模块">
        <button className="module-card live-card" disabled={!workspacePath} onClick={onLive} type="button">
          <div className="module-index">01</div>
          <div className="live-visual" aria-hidden="true">
            <span className="record-core" />
            <span className="record-ring ring-one" />
            <span className="record-ring ring-two" />
          </div>
          <div className="module-copy">
            <p className="module-kicker">LIVE MEETING</p>
            <h2>即时会议</h2>
            <p>录制系统声音与麦克风，会议结束后自动生成完整文字稿。</p>
            <span className="module-action">设置并开始录制</span>
          </div>
        </button>

        <button className="module-card import-card" disabled={!workspacePath} onClick={onImport} type="button">
          <div className="module-index">02</div>
          <ImportLines />
          <div className="module-copy">
            <p className="module-kicker">AUDIO IMPORT</p>
            <h2>导入音频</h2>
            <p>拖入 WAV 或 M4A 文件，保留原始语言并生成带时间位置的文字稿。</p>
            <span className="module-action">选择本地音频</span>
          </div>
        </button>
      </section>

      <section className="recent-section meeting-library">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MEETING LIBRARY</p>
            <h2>会议记录</h2>
          </div>
          <span>{meetings.length > 0 ? `${meetings.length} 个本地项目` : "尚无记录"}</span>
        </div>
        {meetings.length > 0 ? (
          <>
          <label className="meeting-library-search">
            <span>搜索会议</span>
            <input onChange={(event) => setLibraryQuery(event.target.value)} placeholder="按会议名称查找" type="search" value={libraryQuery} />
          </label>
          {libraryError ? <InlineError message={libraryError} /> : null}
          <div className="recent-list">
            {visibleMeetings.map((item) => (
              <article className="meeting-library-row" key={item.id}>
                <div className="meeting-library-main">
                  {editingId === item.id ? (
                    <input autoFocus onChange={(event) => setTitleDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { void saveMeetingTitle(item); } if (event.key === "Escape") { setEditingId(null); } }} value={titleDraft} />
                  ) : (
                    <button disabled={!item.transcriptPath} onClick={() => onOpenTranscript(item)} type="button">
                      <span className="recent-title">{item.title}</span>
                      <span>{formatDate(item.timestamps.updatedAt)} · {formatTrackSummary(item)}</span>
                    </button>
                  )}
                </div>
                <span className={`meeting-status status-${item.status}`}>{formatMeetingStatus(item.status)}</span>
                <div className="meeting-library-actions">
                  {editingId === item.id ? (
                    <>
                      <button onClick={() => void saveMeetingTitle(item)} type="button">保存</button>
                      <button onClick={() => setEditingId(null)} type="button">取消</button>
                    </>
                  ) : (
                    <>
                      {!item.transcriptPath && hasRecordedAudio(item) ? (
                        <button className="solid-small" onClick={() => onProcessMeeting(item)} type="button">转写</button>
                      ) : null}
                      <button onClick={() => { setEditingId(item.id); setTitleDraft(item.title); setPendingDeleteId(null); }} type="button">重命名</button>
                    </>
                  )}
                  <button className={pendingDeleteId === item.id ? "danger-confirm" : ""} onClick={() => void requestDelete(item)} type="button">
                    {pendingDeleteId === item.id ? "确认移到回收站" : "删除"}
                  </button>
                </div>
              </article>
            ))}
            {visibleMeetings.length === 0 ? <div className="empty-line">没有找到匹配的会议。</div> : null}
          </div>
          </>
        ) : (
          <div className="empty-line">开始一次录制或导入后，会议项目会显示在这里。</div>
        )}
      </section>
    </div>
  );
}

function WorkspaceBar({
  isChoosing,
  onChoose,
  onReveal,
  path
}: {
  isChoosing: boolean;
  onChoose(): void;
  onReveal(): void;
  path: string | null;
}) {
  return (
    <section className={`workspace-bar ${path ? "selected" : ""}`}>
      <div className="workspace-marker" aria-hidden="true" />
      <div className="workspace-copy">
        <span>文件保存位置</span>
        <strong>{path ?? "尚未选择本地文件夹"}</strong>
      </div>
      <div className="workspace-actions">
        {path ? <button onClick={onReveal} type="button">打开文件夹</button> : null}
        <button className="solid-small" disabled={isChoosing} onClick={onChoose} type="button">
          {isChoosing ? "正在选择..." : path ? "更改位置" : "选择位置"}
        </button>
      </div>
    </section>
  );
}

function LiveSetupScreen({
  isLoadingDevices,
  audioDevices,
  audioSources,
  error,
  isStarting,
  onBack,
  onDeviceChange,
  onHome,
  onLanguageChange,
  onSourceChange,
  onStart,
  onTitleChange,
  outputLanguage,
  preflight,
  selectedDeviceIds,
  title
}: {
  isLoadingDevices: boolean;
  audioDevices: RecordingAudioDevice[];
  audioSources: RecordingAudioSources;
  error: string | null;
  isStarting: boolean;
  onBack(): void;
  onDeviceChange(track: AudioTrack, deviceId: string): void;
  onHome(): void;
  onLanguageChange(language: LanguageOptionValue): void;
  onSourceChange(track: AudioTrack, enabled: boolean): void;
  onStart(): void;
  onTitleChange(title: string): void;
  outputLanguage: LanguageOptionValue;
  preflight: ReturnType<typeof createAudioPreflightState>;
  selectedDeviceIds: Partial<Record<AudioTrack, string>>;
  title: string;
}) {
  return (
    <div className="app-frame inner-frame">
      <MinimalHeader label="即时会议" onBack={onBack} onHome={onHome} />
      <div className="setup-layout">
        <section className="setup-main">
          <p className="eyebrow">RECORD A MEETING</p>
          <h1>先确认声音，<br />然后开始录制。</h1>
          <Field label="会议名称">
            <input onChange={(event) => onTitleChange(event.target.value)} value={title} />
          </Field>
          <Field label="文字稿语言">
            <LanguageSelect onChange={onLanguageChange} value={outputLanguage} />
          </Field>
          {error ? <InlineError message={error} /> : null}
          <button
            className="primary-action"
            disabled={isLoadingDevices || isStarting || !preflight.canStart}
            onClick={onStart}
            type="button"
          >
            {isStarting || isLoadingDevices ? <BusyIndicator /> : <span className="button-record-dot" />}
            {isLoadingDevices ? "正在识别音频设备..." : isStarting ? "正在启动录音..." : "开始录制"}
          </button>
          {preflight.blockingReason ? <p className="field-error">{preflight.blockingReason}</p> : null}
        </section>

        <section className="audio-panel" aria-label="音频设置">
          <div className="panel-title">
            <div>
              <p className="eyebrow">AUDIO INPUT</p>
              <h2>音频设置</h2>
            </div>
            <span className="checking-label">实时检测</span>
          </div>
          <AudioSourceRow
            devices={audioDevices.filter((device) => device.track === "system")}
            enabled={audioSources.system}
            level={preflight.tracks.system.level}
            label="系统声音"
            message={preflight.tracks.system.message}
            onDeviceChange={(id) => onDeviceChange("system", id)}
            onToggle={(enabled) => onSourceChange("system", enabled)}
            selectedDeviceId={selectedDeviceIds.system}
          />
          <AudioSourceRow
            devices={audioDevices.filter((device) => device.track === "microphone")}
            enabled={audioSources.microphone}
            level={preflight.tracks.microphone.level}
            label="麦克风"
            message={preflight.tracks.microphone.message}
            onDeviceChange={(id) => onDeviceChange("microphone", id)}
            onToggle={(enabled) => onSourceChange("microphone", enabled)}
            selectedDeviceId={selectedDeviceIds.microphone}
          />
          <p className="privacy-note">录制停止后才会上传有效音频进行转写。本地原始录音会保留在工作区。</p>
        </section>
      </div>
    </div>
  );
}

function AudioSourceRow({
  devices,
  enabled,
  label,
  level,
  message,
  onDeviceChange,
  onToggle,
  selectedDeviceId
}: {
  devices: RecordingAudioDevice[];
  enabled: boolean;
  label: string;
  level: number;
  message: string;
  onDeviceChange(deviceId: string): void;
  onToggle(enabled: boolean): void;
  selectedDeviceId?: string;
}) {
  return (
    <div className={`audio-source ${enabled ? "enabled" : ""}`}>
      <div className="audio-source-head">
        <div>
          <strong>{label}</strong>
          <span>{enabled ? message : "已关闭"}</span>
        </div>
        <button
          aria-checked={enabled}
          aria-label={`${label}开关`}
          className="minimal-toggle"
          onClick={() => onToggle(!enabled)}
          role="switch"
          type="button"
        >
          <span />
        </button>
      </div>
      <select
        aria-label={`${label}设备`}
        disabled={!enabled}
        onChange={(event) => onDeviceChange(event.target.value)}
        value={selectedDeviceId ?? ""}
      >
        {devices.length === 0 ? <option value="">默认设备</option> : null}
        {devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}
      </select>
      <LevelMeter active={enabled} level={level} />
    </div>
  );
}

function RecordingView({
  elapsed,
  error,
  isPauseChanging,
  isPaused,
  isStopping,
  liveLevels,
  meeting,
  onBack,
  onHome,
  onOpenSettings,
  onPause,
  onStop
}: {
  elapsed: number;
  error: string | null;
  isPauseChanging: boolean;
  isPaused: boolean;
  isStopping: boolean;
  liveLevels: LiveLevelStream;
  meeting: MeetingMetadata | null;
  onBack(): void;
  onHome(): void;
  onOpenSettings(): void;
  onPause(): void;
  onStop(): void;
}) {

  return (
    <div className="recording-view">
      <div className="recording-topline">
        <PageNavigation onBack={onBack} onHome={onHome} />
        <div className="recording-topline-end">
          <button className="ghost-small" onClick={onOpenSettings} type="button">设置</button>
          <div className="recording-state"><span />{isPaused ? "录制已暂停" : "正在录制"}</div>
        </div>
      </div>
      <section className="recording-stage">
        <p className="recording-title">{meeting?.title ?? "即时会议"}</p>
        <div className="recording-time">{formatElapsed(elapsed)}</div>
        <p className="recording-save-note">音频正在保存到本地工作区</p>
        <LiveWaveform paused={isPaused} stream={liveLevels} />
        {error ? <InlineError message={error} /> : null}
        <div className="recording-controls">
          <button disabled={isPauseChanging || isStopping} onClick={onPause} type="button">
            {isPauseChanging ? "处理中..." : isPaused ? "继续录制" : "暂停"}
          </button>
          <button className="stop-action" disabled={isStopping || isPauseChanging} onClick={onStop} type="button">
            <span />
            {isStopping ? <><BusyIndicator />正在停止...</> : "结束并转写"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ImportScreen({
  error,
  isImporting,
  onBack,
  onBrowse,
  onDrop,
  onHome,
  onLanguageChange,
  onStart,
  outputLanguage,
  selectedMeeting
}: {
  error: string | null;
  isImporting: boolean;
  onBack(): void;
  onBrowse(): void;
  onDrop(file: File): void;
  onHome(): void;
  onLanguageChange(language: LanguageOptionValue): void;
  onStart(): void;
  outputLanguage: LanguageOptionValue;
  selectedMeeting: MeetingMetadata | null;
}) {
  const [dragging, setDragging] = useState(false);
  const selectedTrack = selectedMeeting?.audioTracks.system;

  return (
    <div className="app-frame inner-frame">
      <MinimalHeader label="导入音频" onBack={onBack} onHome={onHome} />
      <section className="import-layout">
        <div className="import-copy">
          <p className="eyebrow">AUDIO TO TRANSCRIPT</p>
          <h1>把已有录音，<br />整理成文字。</h1>
          <p>支持 WAV 和 M4A。选择文件后先完成格式与可读性检查，由你确认并点击 Start 才会开始转写。</p>
          <Field label="文字稿语言">
            <LanguageSelect disabled={Boolean(selectedMeeting)} onChange={onLanguageChange} value={outputLanguage} />
          </Field>
          {error ? <InlineError message={error} /> : null}
        </div>

        <div
          className={`drop-zone ${dragging ? "dragging" : ""} ${selectedMeeting ? "file-ready" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) {
              setDragging(false);
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) {
              onDrop(file);
            }
          }}
        >
          {selectedMeeting && selectedTrack ? (
            <>
              <div className="file-ready-mark" aria-hidden="true"><span /></div>
              <p className="ready-kicker">AUDIO READY</p>
              <p className="drop-title">音频文件检查通过</p>
              <p className="ready-file-name">{selectedMeeting.title}</p>
              <dl className="ready-file-meta">
                <div><dt>格式</dt><dd>{selectedTrack.format.toUpperCase()}</dd></div>
                <div><dt>时长</dt><dd>{formatAudioDuration(selectedTrack.durationMs)}</dd></div>
                <div><dt>文件大小</dt><dd>{formatByteLength(selectedTrack.byteLength)}</dd></div>
              </dl>
              <button className="primary-action start-transcription" onClick={onStart} type="button">
                Start 转写
              </button>
              <button className="replace-file-action" disabled={isImporting} onClick={onBrowse} type="button">
                {isImporting ? <><BusyIndicator />正在检查...</> : "更换音频文件"}
              </button>
              <p className="drop-privacy">点击 Start 后才会开始语音识别；完成后由你决定是否调用 AI 分析。</p>
            </>
          ) : (
            <>
              <div className="drop-mark" aria-hidden="true"><span /></div>
              <p className="drop-title">将音频拖到这里</p>
              <p className="drop-help">WAV 或 M4A · 单个文件</p>
              <button className="primary-action compact" disabled={isImporting} onClick={onBrowse} type="button">
                {isImporting ? <><BusyIndicator />正在检查音频...</> : "选择音频文件"}
              </button>
              <p className="drop-privacy">导入操作不会移动或删除原始文件，也不会自动开始转写。</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ProcessingView({
  audioExportPath,
  error,
  meeting,
  mode,
  onBack,
  onHome,
  onOpenSettings,
  onRetry,
  onReveal,
  onSaveAudio,
  progress
}: {
  audioExportPath: string | null;
  error: string | null;
  meeting: MeetingMetadata | null;
  mode: ProcessingMode;
  onBack(): void;
  onHome(): void;
  onOpenSettings(): void;
  onRetry(): void;
  onReveal(): void;
  onSaveAudio(): void;
  progress: ProcessingProgressUpdate | null;
}) {
  const stage = visibleProcessingStage(progress?.step, mode);
  const percent = visibleProgress(progress, mode);
  const hasAudio = hasRecordedAudio(meeting);
  const steps = mode === "analysis"
    ? [["读取文字稿", 18], ["AI 分析", 72], ["保存分析", 100]]
    : [["检测声音", 12], ["生成文字", 72], ["保存文字稿", 100]];

  return (
    <div className="processing-view">
      <div className="processing-navigation"><PageNavigation onBack={onBack} onHome={onHome} /></div>
      <div className="processing-content">
        <p className="eyebrow">{mode === "analysis" ? "AI ANALYSIS" : "TRANSCRIBING"}</p>
        <h1>{error ? "处理暂时中断。" : processingHeading(progress?.step, mode)}</h1>
        <p className="processing-file">{meeting?.title ?? "音频文件"}</p>
        <div className="processing-meter" data-active={!error && percent < 100}>
          <span style={{ transform: `scaleX(${percent / 100})` }} />
          {!error && percent < 100 ? <i className="processing-scan" aria-hidden="true" /> : null}
        </div>
        <div className="processing-status">
          <span className="processing-stage" role="status">{!error && percent < 100 ? <BusyIndicator /> : null}{error ? "需要处理" : stage}</span>
          <strong>{error ? "—" : `${percent}%`}</strong>
        </div>
        <div className="processing-steps" aria-label="转写步骤">
          {steps.map(([label, threshold]) => (
            <span className={percent >= Number(threshold) ? "done" : ""} key={String(label)}>{label}</span>
          ))}
        </div>
        {error ? (
          <div className="processing-error">
            <p>{error}</p>
            {hasAudio ? (
              <p className="processing-error-note">
                录音已完整保存在本地工作区（{formatTrackSummary(meeting)}），不会因为这次失败而丢失。
                你可以配置好转写服务后重新转写，或者先把音频另存为文件。
              </p>
            ) : null}
            {audioExportPath ? (
              <p className="processing-error-note">音频已另存到 {audioExportPath}</p>
            ) : null}
            <div>
              <button onClick={onBack} type="button">返回首页</button>
              <button onClick={onOpenSettings} type="button">打开设置</button>
              {hasAudio ? <button onClick={onReveal} type="button">打开文件夹</button> : null}
              {hasAudio ? <button onClick={onSaveAudio} type="button">另存音频</button> : null}
              <button className="solid-small" onClick={onRetry} type="button">重新转写</button>
            </div>
          </div>
        ) : (
          <p className="processing-note">
            {mode === "analysis"
              ? "本次只读取已保存的文字稿并发送给当前启用的模型，不会重新识别或上传原始音频。"
              : "本次只生成并保存文字稿。完成后由你决定是否开始 AI 分析。"}
          </p>
        )}
      </div>
    </div>
  );
}

function TranscriptView({
  isAnalyzing,
  detail,
  error,
  meeting,
  onAnalyze,
  onBack,
  onHome,
  onRename,
  onReveal
}: {
  isAnalyzing: boolean;
  detail: MeetingDetailData | null;
  error: string | null;
  meeting: MeetingMetadata | null;
  onAnalyze(): void;
  onBack(): void;
  onHome(): void;
  onRename(title: string): Promise<void>;
  onReveal(): void;
}) {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [analysisLanguage, setAnalysisLanguage] = useState<"zh" | "en">("zh");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(meeting?.title ?? "");
  const [titleError, setTitleError] = useState<string | null>(null);
  const segments = detail?.transcript?.segments ?? [];
  const visibleSegments = segments.filter((segment) => segment.text.toLowerCase().includes(query.trim().toLowerCase()));
  const fullText = segments.map((segment) => `[${formatTimestamp(segment.startTimeMs)}] ${segment.speakerLabel ?? trackLabel(segment.trackId)}\n${segment.text}`).join("\n\n");
  const audioTrack = detail?.audio?.tracks[0];
  const analysis = detail?.structure;

  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  async function saveTitle() {
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError("项目名称不能为空。");
      return;
    }
    if (nextTitle.length > 120) {
      setTitleError("项目名称不能超过 120 个字符。");
      return;
    }
    if (nextTitle === meeting?.title) {
      setIsEditingTitle(false);
      setTitleError(null);
      return;
    }

    setIsSavingTitle(true);
    setTitleError(null);
    try {
      await onRename(nextTitle);
      setIsEditingTitle(false);
    } catch (caughtError) {
      setTitleError(formatError(caughtError));
    } finally {
      setIsSavingTitle(false);
    }
  }

  function cancelTitleEdit() {
    setTitleDraft(meeting?.title ?? "");
    setTitleError(null);
    setIsEditingTitle(false);
  }

  return (
    <div className="app-frame transcript-frame">
      <MinimalHeader label="文字稿与分析" onBack={onBack} onHome={onHome} />
      <header className="transcript-head">
        <div>
          <p className="eyebrow">TRANSCRIPT</p>
          {isEditingTitle ? (
            <form className="transcript-title-editor" onSubmit={(event) => {
              event.preventDefault();
              void saveTitle();
            }}>
              <input
                aria-describedby={titleError ? "meeting-title-error" : undefined}
                aria-label="录音项目名称"
                autoFocus
                disabled={isSavingTitle}
                maxLength={120}
                onChange={(event) => {
                  setTitleDraft(event.target.value);
                  setTitleError(null);
                }}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelTitleEdit();
                  }
                }}
                value={titleDraft}
              />
              <div className="transcript-title-editor-actions">
                <button className="solid-small" disabled={isSavingTitle} type="submit">
                  {isSavingTitle ? "保存中" : "保存"}
                </button>
                <button disabled={isSavingTitle} onClick={cancelTitleEdit} type="button">取消</button>
              </div>
              {titleError ? <p className="transcript-title-error" id="meeting-title-error">{titleError}</p> : null}
            </form>
          ) : (
            <div className="transcript-title-row">
              <h1>{meeting?.title ?? "会议文字稿"}</h1>
              <button
                className="title-edit-trigger"
                onClick={() => {
                  setTitleDraft(meeting?.title ?? "");
                  setTitleError(null);
                  setIsEditingTitle(true);
                }}
                type="button"
              >
                重命名
              </button>
            </div>
          )}
          <p>{formatDate(meeting?.timestamps.updatedAt)} · {segments.length} 个文字片段 · 已保存到本地</p>
        </div>
        <div className="transcript-actions">
          <button onClick={onReveal} type="button">打开文件夹</button>
          <button className="solid-small" disabled={segments.length === 0} onClick={() => void copyTranscript()} type="button">
            {copied ? "已复制" : "复制全文"}
          </button>
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}

      {!detail && !error ? <AnalysisSkeleton /> : null}
      {detail ? (
        <section className="analysis-section" aria-label="AI 会议分析" aria-busy={isAnalyzing}>
          <div className="analysis-heading">
            <div>
              <p className="eyebrow">AI MEETING ANALYSIS</p>
              <h2>会议分析</h2>
            </div>
            <div className="analysis-heading-action">
              <span>{analysis?.analysisByLanguage ? "已根据完整文字稿生成" : analysis ? "检测到旧版分析格式" : "本次记录尚未生成分析"}</span>
              {analysis?.analysisByLanguage ? <button disabled={isAnalyzing} onClick={onAnalyze} type="button">重新分析</button> : null}
            </div>
          </div>
          {isAnalyzing ? <div className="analysis-pending" role="status"><BusyIndicator /><strong>AI 正在分析会议</strong><p>你可以继续阅读、搜索和复制下方文字稿。</p><AnalysisSkeleton /></div> : analysis ? (
            analysis.analysisByLanguage ? (
              <div className="localized-analysis">
                <div className="analysis-language-switch" role="tablist" aria-label="分析语言">
                  <button
                    aria-selected={analysisLanguage === "zh"}
                    className={analysisLanguage === "zh" ? "is-active" : ""}
                    onClick={() => setAnalysisLanguage("zh")}
                    role="tab"
                    type="button"
                  >
                    中文分析
                  </button>
                  <button
                    aria-selected={analysisLanguage === "en"}
                    className={analysisLanguage === "en" ? "is-active" : ""}
                    onClick={() => setAnalysisLanguage("en")}
                    role="tab"
                    type="button"
                  >
                    English
                  </button>
                </div>
                <LocalizedAnalysisContent
                  analysis={analysis.analysisByLanguage[analysisLanguage]}
                  language={analysisLanguage}
                />
              </div>
            ) : (
              <div className="analysis-legacy-refresh">
                <div>
                  <p className="analysis-label">内容总结</p>
                  <h3>把旧版内容重新整理成简洁摘要</h3>
                  <p>当前结果包含旧格式的拼接内容。快速总结会读取已保存的文字稿，生成语言分离、无 Segment 引用的新版摘要。</p>
                </div>
                <button className="analysis-start-action" disabled={segments.length === 0} onClick={onAnalyze} type="button">
                  用 AI 快速总结
                </button>
              </div>
            )
          ) : (
            <div className="analysis-empty">
              <div>
                <strong>文字稿已经准备好。</strong>
                <p>分析不会自动开始。点击后只会把已保存的文字内容发送给当前启用的模型，原始音频不会再次上传。</p>
              </div>
              <button className="analysis-start-action" disabled={segments.length === 0} onClick={onAnalyze} type="button">
                开始 AI 分析
              </button>
            </div>
          )}
        </section>
      ) : null}

      <section className="transcript-layout">
        <aside className="audio-sidebar">
          <div className="audio-sticky">
            <p className="eyebrow">SOURCE AUDIO</p>
            <h2>原始音频</h2>
            {audioTrack ? (
              <audio controls src={audioTrack.audioUrl} />
            ) : (
              <div className="audio-empty">音频预览暂不可用</div>
            )}
            <dl>
              <div><dt>音频来源</dt><dd>{formatTrackSummary(meeting)}</dd></div>
              <div><dt>识别语言</dt><dd>{formatLanguage(meeting?.outputLanguage)}</dd></div>
              <div><dt>状态</dt><dd>本地已保存</dd></div>
            </dl>
          </div>
        </aside>

        <div className="transcript-document">
          <label className="transcript-search">
            <span>搜索文字稿</span>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词" type="search" value={query} />
          </label>
          {!detail && !error ? <TranscriptSkeleton /> : null}
          {detail && visibleSegments.length === 0 ? (
            <div className="empty-transcript">{segments.length === 0 ? "没有检测到可转写的语音。" : "没有找到匹配的文字。"}</div>
          ) : null}
          <div className="segment-list">
            {visibleSegments.map((segment) => (
              <article className="transcript-segment" key={segment.id}>
                <div className="segment-meta">
                  <span>{formatTimestamp(segment.startTimeMs)}</span>
                  <strong>{segment.speakerLabel ?? trackLabel(segment.trackId)}</strong>
                </div>
                <p>{segment.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function LocalizedAnalysisContent({
  analysis,
  language
}: {
  analysis: LocalizedMeetingAnalysis;
  language: "zh" | "en";
}) {
  const labels = language === "zh"
    ? { overview: "内容总结", purpose: "会议目的", topics: "主题脉络", technical: "技术总结" }
    : { overview: "Overview", purpose: "Meeting purpose", topics: "Topic breakdown", technical: "Technical summary" };

  return (
    <div className="analysis-language-panel" lang={language === "zh" ? "zh-CN" : "en"} role="tabpanel">
      <AnalysisParagraphSection label={labels.overview} paragraphs={analysis.overview} prominent />
      <AnalysisParagraphSection label={labels.purpose} paragraphs={analysis.purpose} />

      <section className="analysis-topic-section">
        <div className="analysis-section-label">
          <span>{labels.topics}</span>
          <small>{String(analysis.topics.length).padStart(2, "0")}</small>
        </div>
        {analysis.topics.length > 0 ? (
          <div className="analysis-topic-list">
            {analysis.topics.map((topic, index) => (
              <article className="analysis-topic" key={`${topic.title}-${index}`}>
                <span className="analysis-topic-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{topic.title}</h3>
                  {topic.paragraphs.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="analysis-no-topics">{language === "zh" ? "没有识别出独立的讨论主题。" : "No distinct discussion topics were identified."}</p>
        )}
      </section>

      <AnalysisParagraphSection label={labels.technical} paragraphs={analysis.technicalSummary} />
    </div>
  );
}

function AnalysisParagraphSection({
  label,
  paragraphs,
  prominent = false
}: {
  label: string;
  paragraphs: string[];
  prominent?: boolean;
}) {
  return (
    <section className={`analysis-copy-section${prominent ? " is-prominent" : ""}`}>
      <div className="analysis-section-label"><span>{label}</span></div>
      <div className="analysis-paragraphs">
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    </section>
  );
}

function MinimalHeader({
  label,
  onBack,
  onHome
}: {
  label: string;
  onBack(): void;
  onHome(): void;
}) {
  return (
    <header className="minimal-header">
      <PageNavigation onBack={onBack} onHome={onHome} />
      <div className="wordmark">MeetMap</div>
      <span>{label}</span>
    </header>
  );
}

function PageNavigation({ onBack, onHome }: { onBack(): void; onHome(): void }) {
  return (
    <div className="page-navigation" aria-label="页面导航">
      <button className="back-button" onClick={onBack} type="button">返回上一页</button>
      <button className="home-button" onClick={onHome} type="button">主页</button>
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="form-field"><span>{label}</span>{children}</label>;
}

function LanguageSelect({
  disabled = false,
  onChange,
  value
}: {
  disabled?: boolean;
  onChange(value: LanguageOptionValue): void;
  value: LanguageOptionValue;
}) {
  return (
    <select disabled={disabled} onChange={(event) => onChange(event.target.value as LanguageOptionValue)} value={value}>
      {LANGUAGE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.value === "zh" ? "中文" : option.value === "en" ? "English" : "中英双语"}
        </option>
      ))}
    </select>
  );
}

function LevelMeter({ active, level }: { active: boolean; level: number }) {
  return (
    <div className="level-meter" aria-label={`输入音量 ${Math.round(level * 100)}%`}>
      {Array.from({ length: 18 }, (_, index) => (
        <span className={active && index / 18 <= level ? "active" : ""} key={index} />
      ))}
    </div>
  );
}

function ImportLines() {
  return (
    <div className="import-lines" aria-hidden="true">
      {[0.34, 0.68, 0.45, 0.82, 0.57, 0.28, 0.74, 0.48, 0.88, 0.62, 0.4, 0.72].map((value, index) => (
        <span key={index} style={{ transform: `scaleY(${value})` }} />
      ))}
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return <div className="inline-error" role="alert"><span />{message}</div>;
}

function LoadingScreen() {
  return (
    <main className="transcription-app loading-screen">
      <div className="loading-shell">
        <p className="loading-caption" role="status"><BusyIndicator />正在准备工作区</p>
        <div className="skeleton wordmark-skeleton" />
        <div className="skeleton title-skeleton" />
        <div className="skeleton path-skeleton" />
        <div className="loading-grid"><div className="skeleton" /><div className="skeleton" /></div>
      </div>
    </main>
  );
}

function TranscriptSkeleton() {
  return (
    <div className="transcript-skeleton" aria-label="正在加载文字稿" aria-busy="true">
      {[0, 1, 2].map((item) => <div key={item}><span /><p /></div>)}
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="analysis-skeleton" aria-label="正在加载会议分析" aria-busy="true">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

function useRecordingTimer(meeting: MeetingMetadata | null, paused: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const [timerMeetingId, setTimerMeetingId] = useState(meeting?.id);
  if (timerMeetingId !== meeting?.id) {
    setTimerMeetingId(meeting?.id);
    setElapsed(meeting ? initialElapsed(meeting) : 0);
  }

  useEffect(() => {
    if (paused || !meeting) {
      return;
    }
    const timer = window.setInterval(() => setElapsed((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [paused, meeting]);

  return elapsed;
}

function appendLevel<T extends AudioPreflightLevelSample>(
  current: Partial<Record<AudioTrack, T[]>>,
  update: T & { track: AudioTrack }
): Partial<Record<AudioTrack, T[]>> {
  return {
    ...current,
    [update.track]: [...(current[update.track] ?? []), update].slice(-96)
  };
}

function createFallbackLevels(
  sources: RecordingAudioSources,
  occurredAt: string
): Partial<Record<AudioTrack, AudioPreflightLevelSample[]>> {
  return {
    system: sources.system ? [{ level: 0.42, occurredAt }] : [],
    microphone: sources.microphone ? [{ level: 0.35, occurredAt }] : []
  };
}

function buildProcessingPreferences(
  settings: AppSettings,
  transcriptOnly = true
): ProcessingPreferences {
  return {
    autoDeleteCloudCopies: settings.autoDeleteCloudCopies,
    customVocabulary: settings.customVocabulary,
    preserveTranscriptLanguage: settings.preserveTranscriptLanguage,
    recognitionLanguages: {
      cantonese: settings.cantonese,
      englishGB: settings.englishGB,
      englishUS: settings.englishUS,
      mandarin: settings.mandarin,
      mixedCodeSwitching: settings.mixedCodeSwitching
    },
    speakerDiarization: settings.speakerDiarization,
    summaryInstructions: settings.summaryInstructions,
    transcriptOnly,
    uploadRecordedAudio: settings.uploadRecordedAudio,
    uploadSeparateTracks: true,
    useOutputLanguage: settings.useOutputLanguage
  };
}

function createInitialProgress(
  meetingId: string,
  mode: ProcessingMode
): ProcessingProgressUpdate {
  return {
    meetingId,
    step: mode === "analysis" ? "structure_extraction" : "activity_detection",
    currentStep: 1,
    totalSteps: 3,
    percent: 4,
    updatedAt: new Date().toISOString()
  };
}

function visibleProcessingStage(
  step: ProcessingStep | undefined,
  mode: ProcessingMode
): string {
  if (mode === "analysis") {
    return step === "word_export" || step === "completed"
      ? "正在保存分析结果"
      : "正在分析文字稿";
  }

  if (!step || step === "activity_detection") {
    return "正在检测有效声音";
  }
  if (step === "transcription") {
    return "正在生成文字";
  }
  if (step === "structure_extraction") {
    return "正在生成 AI 分析";
  }
  return "正在保存文字稿与总结";
}

function processingHeading(
  step: ProcessingStep | undefined,
  mode: ProcessingMode
): string {
  if (mode === "analysis") {
    return step === "word_export" || step === "completed"
      ? "正在保存分析结果。"
      : "正在理解这份文字稿。";
  }

  if (step === "structure_extraction") {
    return "正在理解这场会议。";
  }
  if (step === "word_export" || step === "completed") {
    return "正在保存最终结果。";
  }
  return "正在把声音变成文字。";
}

function visibleProgress(
  progress: ProcessingProgressUpdate | null,
  mode: ProcessingMode
): number {
  if (!progress) {
    return 4;
  }
  if (mode === "analysis") {
    if (progress.step === "structure_extraction") {
      return Math.max(24, progress.percent);
    }
    if (progress.step === "word_export") {
      return 88;
    }
    if (progress.step === "completed") {
      return 100;
    }
    return Math.max(8, progress.percent);
  }
  if (progress.step === "activity_detection") {
    return Math.max(8, Math.min(18, progress.percent));
  }
  if (progress.step === "transcription") {
    const chunkProgress = progress.transcription && progress.transcription.totalChunks > 0
      ? progress.transcription.completedChunks / progress.transcription.totalChunks
      : 0.35;
    return Math.round(20 + chunkProgress * 46);
  }
  if (progress.step === "merge") {
    return 70;
  }
  if (progress.step === "structure_extraction") {
    return 84;
  }
  if (progress.step === "word_export") {
    return 94;
  }
  if (progress.step === "completed") {
    return 100;
  }
  return 90;
}

function formatAudioDuration(durationMs: number | undefined): string {
  if (!durationMs || durationMs <= 0) {
    return "可读取";
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatByteLength(byteLength: number | undefined): string {
  if (!byteLength || byteLength <= 0) {
    return "已验证";
  }

  if (byteLength < 1024 * 1024) {
    return `${Math.max(1, Math.round(byteLength / 1024))} KB`;
  }

  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

function initialElapsed(meeting: MeetingMetadata | null): number {
  const started = meeting?.timestamps.recordingStartedAt;
  return started ? Math.max(0, Math.floor((Date.now() - Date.parse(started)) / 1000)) : 0;
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return "时间未知";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatMeetingStatus(status: MeetingMetadata["status"]): string {
  switch (status) {
    case "setup": return "准备中";
    case "recording": return "录音中";
    case "recorded": return "待处理";
    case "processing": return "处理中";
    case "completed": return "已完成";
    case "failed": return "处理失败";
    case "no_audio": return "无有效音频";
  }
}

function hasRecordedAudio(meeting: MeetingMetadata | null): boolean {
  return Boolean(meeting?.audioTracks.system?.hasAudio || meeting?.audioTracks.microphone?.hasAudio);
}

function formatTrackSummary(meeting: MeetingMetadata | null): string {
  const hasSystem = Boolean(meeting?.audioTracks.system);
  const hasMicrophone = Boolean(meeting?.audioTracks.microphone);
  if (hasSystem && hasMicrophone) {
    return "系统声音 + 麦克风";
  }
  if (hasMicrophone) {
    return "麦克风";
  }
  return "音频文件";
}

function formatLanguage(value: LanguageOptionValue | undefined): string {
  if (value === "zh") {
    return "中文";
  }
  if (value === "en") {
    return "English";
  }
  return "中英双语";
}

function trackLabel(track: AudioTrack): string {
  return track === "system" ? "系统声音" : "麦克风";
}
