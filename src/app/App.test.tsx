import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { MeetingMetadata } from "../features/meetings/meetingTypes";
import { DEFAULT_APP_SETTINGS } from "../features/settings/appSettings";
import type { MeetMapApi, MeetingDetailData } from "./meetMapApi";
import { App } from "./App";

function metadata(overrides: Partial<MeetingMetadata> = {}): MeetingMetadata {
  return {
    id: "meeting-1",
    title: "季度设计讨论",
    status: "setup",
    outputLanguage: "bilingual",
    timestamps: {
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T00:00:00.000Z"
    },
    audioTracks: {},
    transcriptPath: null,
    structurePath: null,
    exportPaths: {
      wordSummaryPath: null,
      htmlMeetingMapPath: null
    },
    ...overrides
  };
}

function completedMeeting(): MeetingMetadata {
  return metadata({
    status: "completed",
    processingStep: "completed",
    transcriptPath: "C:\\MeetMapWorkspace\\meetings\\meeting-1\\transcript.json",
    audioTracks: {
      system: {
        id: "system",
        filePath: "C:\\MeetMapWorkspace\\meetings\\meeting-1\\audio\\system.wav",
        format: "wav",
        hasAudio: true,
        durationMs: 72_000
      }
    }
  });
}

function detailFixture(): MeetingDetailData {
  return {
    structure: {
      metadata: {
        meetingId: "meeting-1",
        title: "季度设计讨论",
        startedAt: "2026-08-07T00:00:00.000Z",
        sourceLanguage: "zh",
        outputLanguage: "bilingual"
      },
      summary: "团队确认了语音转写功能的发布范围。",
      purposeAnalysis: "确认本次发布所需的转写能力与交付边界。",
      technicalSummary: "系统先验证音频并生成带时间戳的文字稿，再使用结构化输出生成会议分析。",
      analysisByLanguage: {
        zh: {
          overview: ["团队确认了语音转写功能的发布范围。", "分析将在文字稿完成后由用户手动启动。"],
          purpose: ["确认本次发布所需的转写能力与交付边界。"],
          topics: [
            {
              title: "转写流程",
              paragraphs: ["系统先检查音频，再生成带时间戳的文字稿。"]
            },
            {
              title: "分析触发方式",
              paragraphs: ["文字分析保持独立，由用户在结果页手动开始。"]
            }
          ],
          technicalSummary: ["结构化输出将内容按语言、主题和段落保存。"]
        },
        en: {
          overview: ["The team confirmed the release scope for audio transcription.", "Analysis starts only after the user requests it."],
          purpose: ["The meeting defined the transcription capabilities and delivery boundary for this release."],
          topics: [
            {
              title: "Transcription workflow",
              paragraphs: ["The system validates audio before producing a timestamped transcript."]
            },
            {
              title: "Manual analysis",
              paragraphs: ["Text analysis remains a separate action initiated from the results page."]
            }
          ],
          technicalSummary: ["Structured output stores content by language, topic, and paragraph."]
        }
      },
      topics: [],
      points: [],
      decisions: [],
      actionItems: [],
      openQuestions: [],
      risks: [],
      relations: []
    },
    audio: {
      tracks: [{
        track: "system",
        audioUrl: "file:///C:/MeetMapWorkspace/meetings/meeting-1/audio/system.wav",
        durationMs: 72_000,
        peaks: [0.2, 0.5, 0.72, 0.4]
      }]
    },
    transcript: {
      segments: [{
        id: "segment-1",
        trackId: "system",
        startTimeMs: 12_000,
        endTimeMs: 18_000,
        text: "我们先确认这次发布需要完成的转写功能。",
        language: "zh",
        confidence: 0.94
      }]
    }
  };
}

function installApi(overrides: Partial<MeetMapApi> = {}): MeetMapApi {
  const api = {
    platform: "win32",
    getWorkspace: vi.fn(async () => ({
      currentPath: "C:\\MeetMapWorkspace",
      recentPaths: ["C:\\MeetMapWorkspace"]
    })),
    chooseWorkspaceFolder: vi.fn(async () => ({
      currentPath: "C:\\SelectedWorkspace",
      recentPaths: ["C:\\SelectedWorkspace"]
    })),
    revealWorkspaceFolder: vi.fn(async () => undefined),
    getSettings: vi.fn(async () => DEFAULT_APP_SETTINGS),
    updateSettings: vi.fn(async (nextSettings) => nextSettings),
    getSettingsRuntimeStatus: vi.fn(async () => ({
      openAi: {
        configured: true,
        source: ".env",
        structureModel: "gpt-4.1-mini",
        transcriptionModel: "gpt-4o-mini-transcribe"
      }
    })),
    listMeetings: vi.fn(async () => []),
    listAudioDevices: vi.fn(async () => [
      { id: "windows-default-system", label: "默认系统声音", track: "system" },
      { id: "microphone:0", label: "桌面麦克风", track: "microphone" }
    ]),
    startAudioProbe: vi.fn(async () => undefined),
    stopAudioProbe: vi.fn(async () => undefined),
    createMeeting: vi.fn(async () => metadata()),
    renameMeeting: vi.fn(async (meetingId: string, title: string) => metadata({
      id: meetingId,
      title,
      timestamps: {
        createdAt: "2026-08-07T00:00:00.000Z",
        updatedAt: "2026-08-10T04:30:00.000Z"
      }
    })),
    startRecording: vi.fn(async () => metadata({
      status: "recording",
      timestamps: {
        createdAt: "2026-08-07T00:00:00.000Z",
        updatedAt: "2026-08-07T00:00:00.000Z",
        recordingStartedAt: new Date().toISOString()
      }
    })),
    pauseRecording: vi.fn(async () => metadata({ status: "recording" })),
    resumeRecording: vi.fn(async () => metadata({ status: "recording" })),
    stopRecording: vi.fn(async () => metadata({ status: "recorded" })),
    importAudio: vi.fn(async () => metadata({
      status: "recorded",
      audioTracks: {
        system: {
          id: "system",
          filePath: "C:\\MeetMapWorkspace\\meetings\\meeting-1\\audio\\system.wav",
          format: "wav",
          hasAudio: true,
          durationMs: 72_000,
          byteLength: 2_304_000
        }
      }
    })),
    processMeeting: vi.fn(async () => completedMeeting()),
    analyzeMeeting: vi.fn(async () => completedMeeting()),
    getMeetingDetailData: vi.fn(async () => detailFixture()),
    revealMeetingFolder: vi.fn(async () => undefined),
    saveLlmProvider: vi.fn(async () => ({ activeProviderId: null, providers: [] })),
    ...overrides
  } as MeetMapApi;

  window.meetMap = api;
  return api;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete window.meetMap;
});

test("opens directly to the two transcription modules without a navigation bar", async () => {
  installApi();
  const { container } = render(<App />);

  expect(await screen.findByRole("heading", { name: /把会议声音/ })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "即时会议" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "导入音频" })).toBeInTheDocument();
  expect(screen.getByText("C:\\MeetMapWorkspace")).toBeInTheDocument();
  expect(container.querySelector("nav")).not.toBeInTheDocument();
  expect(screen.queryByText(/结构图|会议图|Structure map|Meeting map/)).not.toBeInTheDocument();
});

test("opens user settings from the Edit menu event and saves custom content", async () => {
  let openSettings = () => undefined;
  const api = installApi({
    onOpenSettings: vi.fn((callback) => {
      openSettings = callback;
      return () => undefined;
    })
  });
  render(<App />);

  await screen.findByRole("heading", { name: /把会议声音/ });
  await waitFor(() => expect(api.onOpenSettings).toHaveBeenCalled());
  act(() => openSettings());

  expect(await screen.findByRole("heading", { name: "偏好与模型连接" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("默认输出语言"), { target: { value: "zh" } });
  fireEvent.change(screen.getByLabelText("自定义词表"), {
    target: { value: "MeetMap\nPowerApps\n张怡" }
  });
  fireEvent.change(screen.getByLabelText("自定义要求"), {
    target: { value: "优先总结客户反馈和明确负责人。" }
  });
  fireEvent.click(screen.getByRole("button", { name: "保存设置" }));

  await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
    customVocabulary: ["MeetMap", "PowerApps", "张怡"],
    defaultOutputLanguage: "zh",
    summaryInstructions: "优先总结客户反馈和明确负责人。"
  })));
  expect(await screen.findByText("设置已保存到本地。")).toBeInTheDocument();
});

test("opens settings over an active recording instead of blocking them", async () => {
  let openSettings = () => undefined;
  installApi({
    onOpenSettings: vi.fn((callback) => {
      openSettings = callback;
      return () => undefined;
    })
  });
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /即时会议/ }));
  fireEvent.click(await screen.findByRole("button", { name: "开始录制" }));
  expect(await screen.findByText("正在录制")).toBeInTheDocument();

  act(() => openSettings());

  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "偏好与模型连接" })).toBeInTheDocument();
  expect(screen.queryByText("录音或处理期间暂时不能打开设置。")).not.toBeInTheDocument();
  // The recording keeps running behind the dialog.
  expect(screen.getByText("正在录制")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

test("keeps the recorded audio reachable when transcription is not configured", async () => {
  const recorded = metadata({
    status: "recorded",
    audioTracks: {
      microphone: {
        id: "microphone",
        filePath: "C:\\MeetMapWorkspace\\meetings\\meeting-1\\audio\\microphone.wav",
        format: "wav",
        hasAudio: true,
        durationMs: 72_000
      }
    }
  });
  const api = installApi({
    stopRecording: vi.fn(async () => recorded),
    processMeeting: vi.fn(async () => {
      throw new Error("音频转写尚未配置。");
    }),
    saveMeetingAudio: vi.fn(async () => "C:\\Users\\me\\Desktop\\meeting.wav"),
    listMeetings: vi.fn(async () => [recorded])
  });
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /即时会议/ }));
  fireEvent.click(await screen.findByRole("button", { name: "开始录制" }));
  fireEvent.click(await screen.findByRole("button", { name: "结束并转写" }));

  expect(await screen.findByText(/音频转写尚未配置/)).toBeInTheDocument();
  expect(await screen.findByText(/录音已完整保存在本地工作区/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "打开文件夹" }));
  await waitFor(() => expect(api.revealMeetingFolder).toHaveBeenCalledWith("meeting-1"));

  fireEvent.click(screen.getByRole("button", { name: "另存音频" }));
  await waitFor(() => expect(api.saveMeetingAudio).toHaveBeenCalledWith("meeting-1"));
  expect(await screen.findByText(/音频已另存到/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
});

test("offers transcription for a stored recording that never produced a transcript", async () => {
  const recorded = metadata({
    status: "failed",
    audioTracks: {
      system: {
        id: "system",
        filePath: "C:\\MeetMapWorkspace\\meetings\\meeting-1\\audio\\system.wav",
        format: "wav",
        hasAudio: true,
        durationMs: 72_000
      }
    }
  });
  const api = installApi({ listMeetings: vi.fn(async () => [recorded]) });
  render(<App />);

  expect(await screen.findByText("处理失败")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "转写" }));

  await waitFor(() => expect(api.processMeeting).toHaveBeenCalledWith("meeting-1", expect.anything()));
});

test("fills the model dropdown from the provider's own model list", async () => {
  let openSettings = () => undefined;
  const api = installApi({
    onOpenSettings: vi.fn((callback) => {
      openSettings = callback;
      return () => undefined;
    }),
    getLlmProviders: vi.fn(async () => ({ activeProviderId: null, providers: [] })),
    listLlmModels: vi.fn(async () => ["gpt-4.1", "gpt-4o-mini"])
  });
  render(<App />);

  await screen.findByRole("heading", { name: /把会议声音/ });
  await waitFor(() => expect(api.onOpenSettings).toHaveBeenCalled());
  act(() => openSettings());

  // The preset default is offered before anything is fetched.
  const modelField = await screen.findByLabelText("分析模型");
  expect(modelField).toHaveValue("gpt-4.1-mini");

  fireEvent.click(screen.getByRole("button", { name: "获取模型列表" }));
  await waitFor(() => expect(api.listLlmModels).toHaveBeenCalledWith({
    baseUrl: "https://api.openai.com/v1",
    apiKey: undefined,
    providerId: undefined
  }));

  expect(await screen.findByText("读取到 2 个可用模型。")).toBeInTheDocument();
  expect(within(screen.getByLabelText("分析模型")).getByRole("option", { name: "gpt-4o-mini" }))
    .toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("分析模型"), { target: { value: "gpt-4o-mini" } });
  expect(screen.getByLabelText("分析模型")).toHaveValue("gpt-4o-mini");

  fireEvent.click(screen.getByRole("button", { name: "保存提供商" }));
  await waitFor(() => expect(api.saveLlmProvider).toHaveBeenCalledWith(expect.objectContaining({
    model: "gpt-4o-mini"
  })));
});

test("keeps a custom model id available when the service does not list it", async () => {
  let openSettings = () => undefined;
  installApi({
    onOpenSettings: vi.fn((callback) => {
      openSettings = callback;
      return () => undefined;
    }),
    getLlmProviders: vi.fn(async () => ({ activeProviderId: null, providers: [] }))
  });
  render(<App />);

  await screen.findByRole("heading", { name: /把会议声音/ });
  act(() => openSettings());

  fireEvent.change(await screen.findByLabelText("分析模型"), { target: { value: "__custom__" } });
  fireEvent.change(screen.getByLabelText("分析模型"), { target: { value: "my-azure-deployment" } });

  expect(screen.getByLabelText("分析模型")).toHaveValue("my-azure-deployment");
});

test("a local preset fills the form and loads its models without an API key", async () => {
  let openSettings = () => undefined;
  const api = installApi({
    onOpenSettings: vi.fn((callback) => {
      openSettings = callback;
      return () => undefined;
    }),
    getLlmProviders: vi.fn(async () => ({ activeProviderId: null, providers: [] })),
    listLlmModels: vi.fn(async () => ["llama3.1:8b", "qwen3:8b"])
  });
  render(<App />);

  await screen.findByRole("heading", { name: /把会议声音/ });
  act(() => openSettings());
  fireEvent.click(await screen.findByRole("button", { name: "Ollama" }));

  expect(screen.getByLabelText("名称")).toHaveValue("Ollama（本地）");
  expect(screen.getByLabelText("API Base URL")).toHaveValue("http://localhost:11434/v1");
  expect(screen.getByLabelText("本地服务，不需要 API Key")).toBeChecked();
  expect(screen.getByLabelText("API Key")).toHaveValue("");

  await waitFor(() => expect(api.listLlmModels).toHaveBeenCalledWith({
    baseUrl: "http://localhost:11434/v1",
    apiKey: undefined,
    providerId: undefined
  }));
  expect(await screen.findByText("读取到 2 个可用模型。")).toBeInTheDocument();
  // The preset default is still offered by the service, so it stays selected.
  expect(screen.getByLabelText("分析模型")).toHaveValue("qwen3:8b");
  expect(within(screen.getByLabelText("分析模型")).getByRole("option", { name: "llama3.1:8b" }))
    .toBeInTheDocument();
  // A local runtime has no speech-to-text endpoint, so transcription stays unset.
  expect(screen.getByLabelText("转写模型")).toHaveValue("");
});

test("waits for the API key before loading models for a hosted preset", async () => {
  let openSettings = () => undefined;
  const api = installApi({
    onOpenSettings: vi.fn((callback) => {
      openSettings = callback;
      return () => undefined;
    }),
    getLlmProviders: vi.fn(async () => ({ activeProviderId: null, providers: [] })),
    listLlmModels: vi.fn(async () => ["gpt-4.1", "gpt-4o-mini"])
  });
  render(<App />);

  await screen.findByRole("heading", { name: /把会议声音/ });
  act(() => openSettings());
  fireEvent.click(await screen.findByRole("button", { name: "OpenAI" }));

  expect(api.listLlmModels).not.toHaveBeenCalled();
  expect(screen.getByText("填写 API Key 后会自动读取该服务的模型列表。")).toBeInTheDocument();

  const apiKeyField = screen.getByLabelText("API Key");
  fireEvent.change(apiKeyField, { target: { value: "sk-live" } });
  fireEvent.blur(apiKeyField);

  await waitFor(() => expect(api.listLlmModels).toHaveBeenCalledWith({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-live",
    providerId: undefined
  }));
  expect(await screen.findByText("读取到 2 个可用模型。")).toBeInTheDocument();
});

test("reports an automatic model lookup failure as a note, not an error", async () => {
  let openSettings = () => undefined;
  installApi({
    onOpenSettings: vi.fn((callback) => {
      openSettings = callback;
      return () => undefined;
    }),
    getLlmProviders: vi.fn(async () => ({ activeProviderId: null, providers: [] })),
    listLlmModels: vi.fn(async () => {
      throw new Error("Error invoking remote method 'llm-provider:list-models': Error: 连接被拒绝。");
    })
  });
  render(<App />);

  await screen.findByRole("heading", { name: /把会议声音/ });
  act(() => openSettings());
  fireEvent.click(await screen.findByRole("button", { name: "LM Studio" }));

  // The Electron IPC wrapper is stripped and the tone stays advisory.
  const note = await screen.findByText("未能自动获取模型列表：连接被拒绝。可以手动填写模型 ID。");
  expect(note).toHaveClass("settings-note");
  expect(screen.getByLabelText("分析模型")).toHaveValue("local-model");
});

test("requires a workspace and lets the user choose the save location", async () => {
  const api = installApi({
    getWorkspace: vi.fn(async () => ({ currentPath: null, recentPaths: [] }))
  });
  render(<App />);

  const liveModule = await screen.findByRole("button", { name: /即时会议/ });
  expect(liveModule).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "选择位置" }));

  await waitFor(() => expect(api.chooseWorkspaceFolder).toHaveBeenCalled());
  expect(await screen.findByText("C:\\SelectedWorkspace")).toBeInTheDocument();
  expect(liveModule).not.toBeDisabled();
});

test("keeps audio setup before starting a live recording", async () => {
  const api = installApi();
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /即时会议/ }));
  expect(await screen.findByRole("heading", { name: /先确认声音/ })).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "音频设置" })).toBeInTheDocument();
  expect(screen.getByRole("switch", { name: "系统声音开关" })).toHaveAttribute("aria-checked", "true");
  expect(screen.getByRole("switch", { name: "麦克风开关" })).toHaveAttribute("aria-checked", "true");

  fireEvent.click(screen.getByRole("button", { name: "开始录制" }));

  await waitFor(() => expect(api.createMeeting).toHaveBeenCalled());
  expect(api.startRecording).toHaveBeenCalledWith("meeting-1", expect.objectContaining({
    audioSources: { system: true, microphone: true }
  }));
  expect(await screen.findByText("正在录制")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "结束并转写" })).toBeInTheDocument();
});

test("validates an imported audio file and waits for Start before transcription", async () => {
  const transcriptOnlyDetail: MeetingDetailData = {
    ...detailFixture(),
    structure: null
  };
  const api = installApi({
    getMeetingDetailData: vi.fn()
      .mockResolvedValueOnce(transcriptOnlyDetail)
      .mockResolvedValue(detailFixture())
  });
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /导入音频/ }));
  expect(await screen.findByRole("heading", { name: /把已有录音/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "选择音频文件" }));

  await waitFor(() => expect(api.importAudio).toHaveBeenCalled());
  expect(await screen.findByText("音频文件检查通过")).toBeInTheDocument();
  expect(api.processMeeting).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Start 转写" }));
  await waitFor(() => expect(api.processMeeting).toHaveBeenCalledWith("meeting-1", expect.objectContaining({
    transcriptOnly: true
  })));
  expect(await screen.findByRole("heading", { name: "季度设计讨论" })).toBeInTheDocument();
  expect(await screen.findByText("我们先确认这次发布需要完成的转写功能。")).toBeInTheDocument();
  expect(await screen.findByText("文字稿已经准备好。")).toBeInTheDocument();
  expect(api.analyzeMeeting).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "开始 AI 分析" }));
  await waitFor(() => expect(api.analyzeMeeting).toHaveBeenCalledWith("meeting-1", expect.objectContaining({
    transcriptOnly: false
  })));
  expect(await screen.findByText("团队确认了语音转写功能的发布范围。")).toBeInTheDocument();
  expect(await screen.findByText("确认本次发布所需的转写能力与交付边界。")).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "转写流程" })).toBeInTheDocument();
  expect(screen.queryByText("The team confirmed the release scope for audio transcription.")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "English" }));
  expect(await screen.findByText("The team confirmed the release scope for audio transcription.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Manual analysis" })).toBeInTheDocument();
  expect(screen.queryByText("确认本次发布所需的转写能力与交付边界。")).not.toBeInTheDocument();
  expect(screen.queryByText(/结构图|会议图/)).not.toBeInTheDocument();
});

test("keeps transcript searchable while analysis is pending and after failure", async () => {
  let rejectAnalysis!: (reason: Error) => void;
  const api = installApi({
    listMeetings: vi.fn(async () => [completedMeeting()]),
    getMeetingDetailData: vi.fn(async () => ({ ...detailFixture(), structure: null })),
    analyzeMeeting: vi.fn(() => new Promise<MeetingMetadata>((_resolve, reject) => { rejectAnalysis = reject; }))
  });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /季度设计讨论/ }));
  fireEvent.click(await screen.findByRole("button", { name: "开始 AI 分析" }));
  expect(screen.getByLabelText("AI 会议分析")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("我们先确认这次发布需要完成的转写功能。")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索文字稿" }), { target: { value: "不存在的文字" } });
  expect(screen.queryByText("我们先确认这次发布需要完成的转写功能。")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索文字稿" }), { target: { value: "" } });
  await act(async () => rejectAnalysis(new Error("模型暂不可用")));
  expect(screen.getByText("我们先确认这次发布需要完成的转写功能。")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "开始 AI 分析" })).toBeEnabled();
  expect(api.analyzeMeeting).toHaveBeenCalledTimes(1);
});

test("keeps recording across navigation and controls the same session from the dock", async () => {
  const api = installApi({ listMeetings: vi.fn(async () => [completedMeeting()]) });
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /即时会议/ }));
  fireEvent.click(await screen.findByRole("button", { name: "开始录制" }));
  await screen.findByText("正在录制");
  fireEvent.click(screen.getByRole("button", { name: "主页" }));
  expect(api.stopRecording).not.toHaveBeenCalled();
  expect(screen.getByLabelText("录音小窗")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /季度设计讨论/ }));
  await screen.findByText("我们先确认这次发布需要完成的转写功能。");
  fireEvent.click(within(screen.getByLabelText("录音小窗")).getByRole("button", { name: "暂停" }));
  await waitFor(() => expect(api.pauseRecording).toHaveBeenCalledTimes(1));
  fireEvent.click(await screen.findByRole("button", { name: "继续录制" }));
  await waitFor(() => expect(api.resumeRecording).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "返回录音" }));
  expect(api.startRecording).toHaveBeenCalledTimes(1);
  expect(api.stopRecording).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "结束并转写" }));
  await waitFor(() => expect(api.stopRecording).toHaveBeenCalledTimes(1));
  expect(screen.queryByLabelText("录音小窗")).not.toBeInTheDocument();
});

test("shows completed transcripts on the home screen", async () => {
  installApi({ listMeetings: vi.fn(async () => [completedMeeting()]) });
  render(<App />);

  expect(await screen.findByRole("heading", { name: /把会议声音/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /季度设计讨论/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /季度设计讨论/ }));
  expect(await screen.findByText("我们先确认这次发布需要完成的转写功能。")).toBeInTheDocument();
});

test("renames a completed recording project inline and updates the recent list", async () => {
  const api = installApi({
    listMeetings: vi.fn(async () => [completedMeeting()]),
    renameMeeting: vi.fn(async (_meetingId: string, title: string) => ({
      ...completedMeeting(),
      title,
      timestamps: {
        ...completedMeeting().timestamps,
        updatedAt: "2026-08-10T04:30:00.000Z"
      }
    }))
  });
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /季度设计讨论/ }));
  fireEvent.click(await screen.findByRole("button", { name: "重命名" }));

  const titleInput = screen.getByRole("textbox", { name: "录音项目名称" });
  fireEvent.change(titleInput, { target: { value: "客户季度复盘" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => expect(api.renameMeeting).toHaveBeenCalledWith(
    "meeting-1",
    "客户季度复盘"
  ));
  expect(await screen.findByRole("heading", { name: "客户季度复盘" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "主页" }));
  expect(await screen.findByRole("button", { name: /客户季度复盘/ })).toBeInTheDocument();
});

test("keeps rename mode open and shows an inline validation error for an empty title", async () => {
  installApi({ listMeetings: vi.fn(async () => [completedMeeting()]) });
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /季度设计讨论/ }));
  fireEvent.click(await screen.findByRole("button", { name: "重命名" }));
  const titleInput = screen.getByRole("textbox", { name: "录音项目名称" });
  fireEvent.change(titleInput, { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByText("项目名称不能为空。")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "录音项目名称" })).toBeInTheDocument();
});

test("replaces legacy mixed-language analysis with an explicit AI quick-summary action", async () => {
  const legacyDetail: MeetingDetailData = {
    ...detailFixture(),
    structure: {
      ...detailFixture().structure!,
      analysisByLanguage: undefined,
      summary: "【决策与行动项】 Decisions and Action Items (Segment system-0001)"
    }
  };
  const api = installApi({
    listMeetings: vi.fn(async () => [completedMeeting()]),
    getMeetingDetailData: vi.fn()
      .mockResolvedValueOnce(legacyDetail)
      .mockResolvedValue(detailFixture())
  });
  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: /季度设计讨论/ }));

  expect(await screen.findByRole("button", { name: "用 AI 快速总结" })).toBeInTheDocument();
  expect(screen.queryByText(/Decisions and Action Items/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "用 AI 快速总结" }));

  await waitFor(() => expect(api.analyzeMeeting).toHaveBeenCalledWith(
    "meeting-1",
    expect.objectContaining({ transcriptOnly: false })
  ));
  expect(await screen.findByText("团队确认了语音转写功能的发布范围。")).toBeInTheDocument();
});

test("waits for device enumeration and starts only one preflight with the resolved devices", async () => {
  type Devices = Awaited<ReturnType<NonNullable<MeetMapApi["listAudioDevices"]>>>;
  let resolveDevices!: (devices: Devices) => void;
  const api = installApi({
    listAudioDevices: vi.fn(() => new Promise<Devices>((resolve) => { resolveDevices = resolve; }))
  });
  const view = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /即时会议/ }));
  expect(screen.getByRole("button", { name: "正在识别音频设备..." })).toBeDisabled();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 180)); });
  expect(api.startAudioProbe).not.toHaveBeenCalled();
  await act(async () => resolveDevices([
    { id: "windows-default-system", label: "System", track: "system" },
    { id: "microphone:1", label: "Microphone", track: "microphone" }
  ]));
  await waitFor(() => expect(api.startAudioProbe).toHaveBeenCalledTimes(1));
  expect(api.startAudioProbe).toHaveBeenCalledWith({
    audioSources: { system: true, microphone: true },
    deviceIds: { system: "windows-default-system", microphone: "microphone:1" }
  });
  view.unmount();
  expect(api.stopAudioProbe).toHaveBeenCalledTimes(1);
});
