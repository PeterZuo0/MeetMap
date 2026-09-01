import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
