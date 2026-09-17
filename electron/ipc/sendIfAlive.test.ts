import { expect, test, vi } from "vitest";
import { sendIfAlive } from "./sendIfAlive";

test("does not send audio notifications to a destroyed window", () => {
  const send = vi.fn();
  expect(sendIfAlive({ isDestroyed: () => true, send }, "recording:level", {})).toBe(false);
  expect(send).not.toHaveBeenCalled();
});

test("handles destruction between the liveness check and sending", () => {
  expect(sendIfAlive({
    isDestroyed: () => false,
    send() { throw new TypeError("Object has been destroyed"); }
  }, "recording:level", {})).toBe(false);
});

test("still delivers notifications to a live renderer", () => {
  const send = vi.fn();
  expect(sendIfAlive({ isDestroyed: () => false, send }, "meeting:processing-progress", { step: "done" })).toBe(true);
  expect(send).toHaveBeenCalledWith("meeting:processing-progress", { step: "done" });
});
