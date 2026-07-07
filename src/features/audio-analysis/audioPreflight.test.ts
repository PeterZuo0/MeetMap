import { createAudioPreflightState } from "./audioPreflight";

const NOW = "2026-05-29T00:00:10.000Z";

describe("createAudioPreflightState", () => {
  test("allows start when both enabled sources have recent detected levels", () => {
    const state = createAudioPreflightState({
      enabledSources: { system: true, microphone: true },
      now: NOW,
      samples: {
        system: [{ level: 0.35, occurredAt: "2026-05-29T00:00:09.500Z" }],
        microphone: [{ level: 0.28, occurredAt: "2026-05-29T00:00:09.600Z" }]
      }
    });

    expect(state.canStart).toBe(true);
    expect(state.blockingReason).toBeNull();
    expect(state.summary).toBe("both-detected");
    expect(state.tracks.system.status).toBe("detected");
    expect(state.tracks.microphone.status).toBe("detected");
  });

  test("blocks start when no sources are selected", () => {
    const state = createAudioPreflightState({
      enabledSources: { system: false, microphone: false },
      now: NOW,
      samples: {}
    });

    expect(state.canStart).toBe(false);
    expect(state.summary).toBe("none-selected");
    expect(state.blockingReason).toBe("No audio source selected. Enable system audio or microphone to start recording.");
    expect(state.tracks.system.status).toBe("off");
    expect(state.tracks.microphone.status).toBe("off");
  });

  test("allows start while enabled sources are still detecting", () => {
    const state = createAudioPreflightState({
      enabledSources: { system: true, microphone: true },
      now: NOW,
      samples: {}
    });

    expect(state.canStart).toBe(true);
    expect(state.blockingReason).toBeNull();
    expect(state.summary).toBe("waiting");
    expect(state.tracks.system.status).toBe("detecting");
    expect(state.tracks.microphone.status).toBe("detecting");
  });

  test("allows start when enabled source samples are stale", () => {
    const state = createAudioPreflightState({
      enabledSources: { system: true, microphone: false },
      now: NOW,
      samples: {
        system: [{ level: 0.5, occurredAt: "2026-05-29T00:00:05.000Z" }]
      }
    });

    expect(state.canStart).toBe(true);
    expect(state.blockingReason).toBeNull();
    expect(state.summary).toBe("waiting");
    expect(state.tracks.system.status).toBe("stale");
    expect(state.tracks.system.peakLevel).toBe(0);
  });

  test("allows start when one selected source is detected and another is quiet", () => {
    const state = createAudioPreflightState({
      enabledSources: { system: true, microphone: true },
      now: NOW,
      samples: {
        system: [{ level: 0.42, occurredAt: "2026-05-29T00:00:09.000Z" }],
        microphone: [{ level: 0.01, occurredAt: "2026-05-29T00:00:09.000Z" }]
      }
    });

    expect(state.canStart).toBe(true);
    expect(state.summary).toBe("system-only");
    expect(state.tracks.system.status).toBe("detected");
    expect(state.tracks.microphone.status).toBe("quiet");
    expect(state.tracks.microphone.message).toBe("No microphone input detected yet.");
  });

  test("allows start with low perceptual meter levels marked as quiet", () => {
    const state = createAudioPreflightState({
      enabledSources: { system: true, microphone: false },
      now: NOW,
      samples: {
        system: [{ level: 0.14, occurredAt: "2026-05-29T00:00:09.000Z" }]
      }
    });

    expect(state.canStart).toBe(true);
    expect(state.blockingReason).toBeNull();
    expect(state.tracks.system.status).toBe("quiet");
  });

  test("blocks start when selected sources are unavailable", () => {
    const state = createAudioPreflightState({
      enabledSources: { system: false, microphone: true },
      now: NOW,
      samples: {},
      unavailableTracks: {
        microphone: "Microphone permission denied"
      }
    });

    expect(state.canStart).toBe(false);
    expect(state.summary).toBe("unavailable");
    expect(state.tracks.microphone.status).toBe("unavailable");
    expect(state.tracks.microphone.message).toBe("Microphone permission denied");
  });

  test("computes peak level from recent samples only", () => {
    const state = createAudioPreflightState({
      enabledSources: { system: true, microphone: false },
      now: NOW,
      samples: {
        system: [
          { level: 0.95, occurredAt: "2026-05-29T00:00:04.900Z" },
          { level: 0.3, occurredAt: "2026-05-29T00:00:08.500Z" },
          { level: 0.55, occurredAt: "2026-05-29T00:00:09.500Z" }
        ]
      }
    });

    expect(state.tracks.system.level).toBe(0.55);
    expect(state.tracks.system.peakLevel).toBe(0.55);
  });
});
