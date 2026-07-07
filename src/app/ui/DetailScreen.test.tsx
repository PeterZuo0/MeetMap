import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { DetailScreen } from "./DetailScreen";
import type { MeetingDetailData } from "../meetMapApi";
import type { MeetingMetadata } from "../../features/meetings/meetingTypes";

const meeting: MeetingMetadata = {
  id: "meeting-1",
  title: "Playback meeting",
  status: "completed",
  outputLanguage: "bilingual",
  timestamps: {
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:10.000Z"
  },
  audioTracks: {},
  transcriptPath: "transcript.json",
  structurePath: "structure.json",
  exportPaths: {
    wordSummaryPath: null,
    htmlMeetingMapPath: null
  }
};

const detailData: MeetingDetailData = {
  audio: {
    tracks: [
      {
        track: "system",
        audioUrl: "file:///C:/meetings/meeting-1/audio/system.wav",
        durationMs: 10_000,
        peaks: [0.1, 0.8, 0.3, 1]
      }
    ]
  },
  transcript: {
    segments: [
      {
        id: "seg-1",
        trackId: "system",
        startTimeMs: 0,
        endTimeMs: 5_000,
        text: "First playback segment.",
        language: "en",
        confidence: 0.96,
        speakerLabel: "Speaker 1"
      },
      {
        id: "seg-2",
        trackId: "system",
        startTimeMs: 5_000,
        endTimeMs: 10_000,
        text: "Second playback segment.",
        language: "en",
        confidence: 0.94
      }
    ]
  },
  structure: {
    metadata: {
      meetingId: "meeting-1",
      title: "Playback meeting",
      startedAt: "2026-05-29T00:00:00.000Z",
      endedAt: "2026-05-29T00:00:10.000Z",
      sourceLanguage: "en",
      outputLanguage: "bilingual"
    },
    summary: "Playback should sync audio and transcript.",
    topics: [],
    decisions: [],
    actionItems: [],
    openQuestions: [],
    risks: [],
    relations: []
  }
};

test("renders real audio waveform peaks and seeks transcript playback", () => {
  render(
    <DetailScreen
      detailData={detailData}
      detailError={null}
      exportDefaults={{ includeTimestamps: true, includeTranscriptAppendix: true }}
      exportError={null}
      lang="en"
      meeting={meeting}
      onExport={vi.fn()}
      onDownloadAudio={vi.fn()}
    />
  );

  expect(screen.getAllByTestId("audio-wave-bar")).toHaveLength(4);
  expect(screen.getByText("Speaker 1")).toBeInTheDocument();
  expect(screen.getByLabelText("Meeting audio")).toHaveAttribute(
    "src",
    "file:///C:/meetings/meeting-1/audio/system.wav"
  );

  fireEvent.change(screen.getByRole("slider", { name: /Seek recording/ }), {
    target: { value: "6500" }
  });

  expect(screen.getByText("Second playback segment.").closest(".turn-row")).toHaveAttribute(
    "aria-current",
    "true"
  );
  expect(screen.getByText("First playback segment.").closest(".turn-row")).not.toHaveAttribute(
    "aria-current",
    "true"
  );
});

test("calls the meeting audio download action", () => {
  const onDownloadAudio = vi.fn();

  render(
    <DetailScreen
      detailData={detailData}
      detailError={null}
      exportDefaults={{ includeTimestamps: true, includeTranscriptAppendix: true }}
      exportError={null}
      lang="en"
      meeting={meeting}
      onExport={vi.fn()}
      onDownloadAudio={onDownloadAudio}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Download meeting audio/ }));
  expect(onDownloadAudio).toHaveBeenCalled();
});
