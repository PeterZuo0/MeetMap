import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { RecordingScreen } from "./RecordingScreen";
import type { RecordingAudioLevel } from "../meetMapApi";

const meeting = {
  id: "meeting-1",
  title: "Q3 roadmap review",
  status: "recording" as const,
  outputLanguage: "bilingual" as const,
  timestamps: {
    createdAt: "2026-05-28T00:00:00.000Z",
    updatedAt: "2026-05-28T00:00:00.000Z"
  },
  audioTracks: {},
  transcriptPath: null,
  structurePath: null,
  exportPaths: {
    wordSummaryPath: null,
    htmlMeetingMapPath: null
  }
};

test.each([
  [{ system: true, microphone: true }, /Recording system \+ microphone/],
  [{ system: true, microphone: false }, /Recording system audio/],
  [{ system: false, microphone: true }, /Recording microphone/],
  [{ system: false, microphone: false }, /Recording silence/]
] as const)("renders recording audio state %#", (audioSources, expectedText) => {
  render(
    <RecordingScreen
      audioSources={audioSources}
      error={null}
      isPaused={false}
      isPauseChanging={false}
      isStopping={false}
      lang="en"
      meeting={meeting}
      onOpenAudioSettings={vi.fn()}
      onPauseChange={vi.fn()}
      onStop={vi.fn()}
    />
  );

  expect(screen.getAllByText(expectedText).length).toBeGreaterThan(0);
  expect(screen.queryByText(/No audio detected/)).not.toBeInTheDocument();
});

test("adds tagged moments from the recording controls", () => {
  render(
    <RecordingScreen
      audioSources={{ system: true, microphone: true }}
      error={null}
      isPaused={false}
      isPauseChanging={false}
      isStopping={false}
      lang="en"
      meeting={meeting}
      onOpenAudioSettings={vi.fn()}
      onPauseChange={vi.fn()}
      recordingLevels={{
        system: [
          {
            track: "system",
            level: 0.72,
            occurredAt: "2026-05-28T00:00:01.000Z",
            source: "recording"
          }
        ]
      }}
      onStop={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Tag moment/ }));

  expect(screen.getByText(/System audio - 72% input/)).toBeInTheDocument();
});

test("does not render mock tagged moments before the user tags", () => {
  render(
    <RecordingScreen
      audioSources={{ system: true, microphone: false }}
      error={null}
      isPaused={false}
      isPauseChanging={false}
      isStopping={false}
      lang="en"
      meeting={meeting}
      onOpenAudioSettings={vi.fn()}
      onPauseChange={vi.fn()}
      onStop={vi.fn()}
    />
  );

  expect(screen.getByText(/No tagged moments yet/)).toBeInTheDocument();
  expect(screen.queryByText(/Maya owns export pipeline/)).not.toBeInTheDocument();
});

test("renders live activity from recording level samples", () => {
  const levels: RecordingAudioLevel[] = [
    {
      track: "system",
      level: 0.8,
      occurredAt: "2026-05-28T00:00:01.000Z",
      source: "recording"
    },
    {
      track: "system",
      level: 0.1,
      occurredAt: "2026-05-28T00:00:02.000Z",
      source: "recording"
    }
  ];

  render(
    <RecordingScreen
      audioSources={{ system: true, microphone: false }}
      error={null}
      isPaused={false}
      isPauseChanging={false}
      isStopping={false}
      lang="en"
      meeting={meeting}
      onOpenAudioSettings={vi.fn()}
      onPauseChange={vi.fn()}
      recordingLevels={{ system: levels }}
      onStop={vi.fn()}
    />
  );

  expect(screen.getByLabelText(/System input level 10%/)).toBeInTheDocument();
  expect(screen.getByText("Quiet")).toBeInTheDocument();
  expect(screen.getAllByText("00:00:01").length).toBeGreaterThan(0);
});

test("requests real pause and resume from the recording controls", () => {
  const onPauseChange = vi.fn();
  const { rerender } = render(
    <RecordingScreen
      audioSources={{ system: true, microphone: true }}
      error={null}
      isPaused={false}
      isPauseChanging={false}
      isStopping={false}
      lang="en"
      meeting={meeting}
      onOpenAudioSettings={vi.fn()}
      onPauseChange={onPauseChange}
      onStop={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Pause/ }));
  expect(onPauseChange).toHaveBeenCalledWith(true);

  rerender(
    <RecordingScreen
      audioSources={{ system: true, microphone: true }}
      error={null}
      isPaused
      isPauseChanging={false}
      isStopping={false}
      lang="en"
      meeting={meeting}
      onOpenAudioSettings={vi.fn()}
      onPauseChange={onPauseChange}
      onStop={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Resume/ }));
  expect(onPauseChange).toHaveBeenCalledWith(false);
});
