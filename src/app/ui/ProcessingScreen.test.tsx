import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { ProcessingScreen } from "./ProcessingScreen";

test("renders the template processing status, phase details, and background action", () => {
  const onBack = vi.fn();
  const onRetry = vi.fn();

  render(
    <ProcessingScreen
      activeStep="transcription"
      error={null}
      lang="en"
      onBack={onBack}
      onRetry={onRetry}
    />
  );

  expect(screen.getByRole("heading", { name: /Processing your meeting/ })).toBeInTheDocument();
  expect(screen.getByText(/42%/)).toBeInTheDocument();
  expect(screen.getByText(/4 of 8 steps/)).toBeInTheDocument();
  expect(screen.getByText(/ETA 00:48/)).toBeInTheDocument();
  expect(screen.getByText(/Encoding local audio/)).toBeInTheDocument();
  expect(screen.getByText(/Uploading tracks to cloud/)).toBeInTheDocument();
  expect(screen.getByText(/Speech-to-text/)).toBeInTheDocument();
  expect(screen.getByText(/Summary & action items/)).toBeInTheDocument();
  expect(screen.getByText(/Tracks uploaded encrypted/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Run in background/ }));
  expect(onBack).toHaveBeenCalled();
});

test("supports skipping processing preview and keeps retry controls for errors", () => {
  const onBack = vi.fn();
  const onRetry = vi.fn();

  const { rerender } = render(
    <ProcessingScreen
      activeStep="structure_extraction"
      error={null}
      lang="en"
      onBack={onBack}
      onRetry={onRetry}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Skip to preview/ }));
  expect(onRetry).toHaveBeenCalled();

  rerender(
    <ProcessingScreen
      activeStep="failed"
      error="Cloud processing failed"
      lang="en"
      onBack={onBack}
      onRetry={onRetry}
    />
  );

  expect(screen.getByText(/Cloud processing failed/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Retry$/ }));
  expect(onRetry).toHaveBeenCalledTimes(2);
});
