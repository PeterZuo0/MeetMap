import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { BusyIndicator } from "./BusyIndicator";

function mockMotionPreference(reduced: boolean) {
  const matchMedia = vi.fn(() => ({
    matches: !reduced,
    addListener: vi.fn(),
    removeListener: vi.fn()
  }));
  vi.stubGlobal("matchMedia", matchMedia);
  return matchMedia;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("cleans up real GSAP styles and visibility listener after StrictMode unmount", async () => {
  mockMotionPreference(false);
  const added = vi.spyOn(document, "addEventListener");
  const removed = vi.spyOn(document, "removeEventListener");
  const view = render(<StrictMode><BusyIndicator /></StrictMode>);
  const dot = view.container.querySelector("i")!;
  await waitFor(() => expect(dot.style.transform).not.toBe(""));
  const listeners = added.mock.calls.filter(([event]) => event === "visibilitychange");
  expect(listeners).toHaveLength(1);
  view.unmount();
  expect(dot.style.transform).toBe("");
  expect(dot.style.opacity).toBe("");
  expect(removed).toHaveBeenCalledWith("visibilitychange", listeners[0][1]);
});

test("keeps decorative dots static with reduced motion", async () => {
  const matchMedia = mockMotionPreference(true);
  const view = render(<BusyIndicator />);
  await waitFor(() => expect(matchMedia).toHaveBeenCalled());
  expect(view.container.querySelector("i")?.style.transform).toBe("");
  expect(view.container.querySelector('[aria-hidden="true"]')?.children).toHaveLength(3);
  view.unmount();
});
