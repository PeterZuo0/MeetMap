import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { ProcessingScreen } from "./ProcessingScreen";

test("renders real workflow progress, phase details, and background action", () => {
  const onBack = vi.fn();
  const onRetry = vi.fn();

  render(
    <ProcessingScreen
      activeStep="transcription"
      error={null}
      lang="en"
      progress={{
        meetingId: "meeting-1",
        step: "transcription",
        currentStep: 2,
        totalSteps: 6,
        percent: 25,
        updatedAt: "2026-05-28T00:00:00.000Z",
        transcription: {
          completedChunks: 2,
          totalChunks: 6
        }
      }}
      onBack={onBack}
      onRetry={onRetry}
    />
  );

  expect(screen.getByRole("heading", { name: /Processing your meeting/ })).toBeInTheDocument();
  expect(screen.getByLabelText("25% complete")).toBeInTheDocument();
  expect(screen.getByText(/25% - 2 of 6 steps - 2 of 6 chunks/)).toBeInTheDocument();
  expect(screen.queryByText(/ETA/)).not.toBeInTheDocument();
  expect(screen.queryByText(/52-minute meeting/)).not.toBeInTheDocument();
  expect(screen.getByText(/Voice activity detection/)).toBeInTheDocument();
  expect(screen.getByText(/Speech-to-text/)).toBeInTheDocument();
  expect(screen.getByText(/Transcript merge/)).toBeInTheDocument();
  expect(screen.getByText(/Meeting notes generation/)).toBeInTheDocument();
  expect(screen.getByText(/Word export/)).toBeInTheDocument();
  expect(screen.getByText(/Meeting map export/)).toBeInTheDocument();
  expect(screen.getByText(/Cloud copy deletion is requested when the provider supports it/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Run in background/ }));
  expect(onBack).toHaveBeenCalled();
});

test("supports available preview and keeps retry controls for errors", () => {
  const onBack = vi.fn();
  const onPreview = vi.fn();
  const onRetry = vi.fn();

  const { rerender } = render(
    <ProcessingScreen
      activeStep="structure_extraction"
      error={null}
      lang="en"
      progress={{
        meetingId: "meeting-1",
        step: "structure_extraction",
        currentStep: 4,
        totalSteps: 6,
        percent: 50,
        updatedAt: "2026-05-28T00:00:00.000Z"
      }}
      canPreview
      onBack={onBack}
      onPreview={onPreview}
      onRetry={onRetry}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Preview available work/ }));
  expect(onPreview).toHaveBeenCalled();
  expect(onRetry).not.toHaveBeenCalled();

  rerender(
    <ProcessingScreen
      activeStep="failed"
      error="Cloud processing failed"
      lang="en"
      progress={null}
      onBack={onBack}
      onRetry={onRetry}
    />
  );

  expect(screen.getByText(/Cloud processing failed/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Retry$/ }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
