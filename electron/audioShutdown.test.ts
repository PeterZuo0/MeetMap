import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { registerAudioShutdown } from "./audioShutdown";

test("waits for audio cleanup once before allowing exit", async () => {
  const application = Object.assign(new EventEmitter(), { quit: vi.fn() });
  let finish!: () => void;
  const shutdown = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  registerAudioShutdown(application, shutdown);
  const event = { preventDefault: vi.fn() };
  application.emit("before-quit", event);
  application.emit("before-quit", event);
  await vi.waitFor(() => expect(shutdown).toHaveBeenCalledTimes(1));
  expect(application.quit).not.toHaveBeenCalled();
  expect(event.preventDefault).toHaveBeenCalledTimes(2);
  finish();
  await vi.waitFor(() => expect(application.quit).toHaveBeenCalledTimes(1));
  event.preventDefault.mockClear();
  application.emit("before-quit", event);
  expect(event.preventDefault).not.toHaveBeenCalled();
});

test("handles cleanup failure without an unhandled rejection or a quit loop", async () => {
  const application = Object.assign(new EventEmitter(), { quit: vi.fn() });
  const report = vi.fn();
  registerAudioShutdown(application, async () => { throw new Error("stop failed"); }, report);
  application.emit("before-quit", { preventDefault: vi.fn() });
  await vi.waitFor(() => expect(application.quit).toHaveBeenCalledTimes(1));
  expect(report).toHaveBeenCalledTimes(1);
});
