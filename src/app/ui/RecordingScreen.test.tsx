import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { RecordingScreen } from "./RecordingScreen";

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
  [{ system: true, microphone: true }, /Both tracks live/],
  [{ system: true, microphone: false }, /System audio only/],
  [{ system: false, microphone: true }, /Microphone only/],
  [{ system: false, microphone: false }, /No audio detected/]
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

  expect(screen.getByText(expectedText)).toBeInTheDocument();
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
      onStop={vi.fn()}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Tag moment/ }));

  expect(screen.getByText(/Marked moment 1/)).toBeInTheDocument();
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
