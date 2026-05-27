import type {
  AudioCaptureProvider,
  AudioCaptureStartRequest,
  AudioCaptureStopResult
} from "./audioCaptureProvider";
import {
  createRecordingSession,
  type RecordingSessionState
} from "./recordingSession";

class FakeAudioCaptureProvider implements AudioCaptureProvider {
  readonly startedRequests: AudioCaptureStartRequest[] = [];
  stopCalls = 0;
  private readonly errorCallbacks = new Set<Parameters<AudioCaptureProvider["onError"]>[0]>();
  stopResult: AudioCaptureStopResult = {
    tracks: {
      system: {
        id: "system",
        filePath: "meetings/meeting-123/audio/system.wav",
        format: "wav",
        hasAudio: true
      },
      microphone: {
        id: "microphone",
        filePath: "meetings/meeting-123/audio/microphone.wav",
        format: "wav",
        hasAudio: true
      }
    }
  };

  async listDevices() {
    return [
      { id: "system-default", label: "Default system audio", track: "system" as const },
      { id: "microphone-default", label: "Default microphone", track: "microphone" as const }
    ];
  }

  async start(request: AudioCaptureStartRequest) {
    this.startedRequests.push(request);
  }

  async stop() {
    this.stopCalls += 1;
    return this.stopResult;
  }

  onLevel() {
    return () => undefined;
  }

  onError(callback: Parameters<AudioCaptureProvider["onError"]>[0]) {
    this.errorCallbacks.add(callback);
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }

  emitError(error: Error) {
    for (const callback of this.errorCallbacks) {
      callback({ error });
    }
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

test("moves from idle to recording with provider output paths and track metadata", async () => {
  const provider = new FakeAudioCaptureProvider();
  const session = createRecordingSession({ provider });

  await session.start({
    meetingId: "meeting-123",
    tracks: {
      system: { filePath: "meetings/meeting-123/audio/system.wav" },
      microphone: { filePath: "meetings/meeting-123/audio/microphone.wav" }
    }
  });

  expect(session.state).toEqual({
    status: "recording",
    meetingId: "meeting-123",
    tracks: {
      system: {
        id: "system",
        filePath: "meetings/meeting-123/audio/system.wav",
        status: "recording"
      },
      microphone: {
        id: "microphone",
        filePath: "meetings/meeting-123/audio/microphone.wav",
        status: "recording"
      }
    }
  });
  expect(provider.startedRequests).toEqual([
    {
      meetingId: "meeting-123",
      tracks: {
        system: { filePath: "meetings/meeting-123/audio/system.wav" },
        microphone: { filePath: "meetings/meeting-123/audio/microphone.wav" }
      }
    }
  ]);
});

test("moves from recording to stopped and then processing-ready after provider stop", async () => {
  const provider = new FakeAudioCaptureProvider();
  const observedStates: RecordingSessionState["status"][] = [];
  const session = createRecordingSession({
    provider,
    onStateChange: (state) => observedStates.push(state.status)
  });

  await session.start({
    meetingId: "meeting-123",
    tracks: {
      system: { filePath: "meetings/meeting-123/audio/system.wav" },
      microphone: { filePath: "meetings/meeting-123/audio/microphone.wav" }
    }
  });

  const stopResult = await session.stop();

  expect(stopResult).toEqual(provider.stopResult);
  expect(observedStates).toEqual(["recording", "stopped", "processing-ready"]);
  expect(session.state).toEqual({
    status: "processing-ready",
    meetingId: "meeting-123",
    tracks: provider.stopResult.tracks
  });
});

test("rejects illegal recording transitions", async () => {
  const provider = new FakeAudioCaptureProvider();
  const session = createRecordingSession({ provider });

  await expect(session.stop()).rejects.toThrow("Cannot stop recording from idle");

  await session.start({
    meetingId: "meeting-123",
    tracks: {
      microphone: { filePath: "meetings/meeting-123/audio/microphone.wav" }
    }
  });

  await expect(
    session.start({
      meetingId: "meeting-456",
      tracks: {
        system: { filePath: "meetings/meeting-456/audio/system.wav" }
      }
    })
  ).rejects.toThrow("Cannot start recording from recording");

  await session.stop();

  await expect(session.stop()).rejects.toThrow("Cannot stop recording from processing-ready");
});

test("rejects concurrent starts while provider start is in flight", async () => {
  const provider = new FakeAudioCaptureProvider();
  const startDeferred = createDeferred<void>();
  provider.start = async (request) => {
    provider.startedRequests.push(request);
    return startDeferred.promise;
  };
  const session = createRecordingSession({ provider });

  const firstStart = session.start({
    meetingId: "meeting-123",
    tracks: {
      microphone: { filePath: "meetings/meeting-123/audio/microphone.wav" }
    }
  });

  const secondStart = session.start({
    meetingId: "meeting-456",
    tracks: {
      system: { filePath: "meetings/meeting-456/audio/system.wav" }
    }
  });

  try {
    expect(provider.startedRequests).toHaveLength(1);
    await expect(secondStart).rejects.toThrow("Cannot start recording from starting");
  } finally {
    startDeferred.resolve();
    await Promise.allSettled([firstStart, secondStart]);
  }
});

test("rejects concurrent stops while provider stop is in flight", async () => {
  const provider = new FakeAudioCaptureProvider();
  const stopDeferred = createDeferred<AudioCaptureStopResult>();
  provider.stop = async () => {
    provider.stopCalls += 1;
    return stopDeferred.promise;
  };
  const session = createRecordingSession({ provider });

  await session.start({
    meetingId: "meeting-123",
    tracks: {
      microphone: { filePath: "meetings/meeting-123/audio/microphone.wav" }
    }
  });

  const firstStop = session.stop();
  const secondStop = session.stop();

  try {
    expect(provider.stopCalls).toBe(1);
    await expect(secondStop).rejects.toThrow("Cannot stop recording from stopping");
  } finally {
    stopDeferred.resolve(provider.stopResult);
    await Promise.allSettled([firstStop, secondStop]);
  }
});

test("ignores late provider errors after processing is ready", async () => {
  const provider = new FakeAudioCaptureProvider();
  const session = createRecordingSession({ provider });

  await session.start({
    meetingId: "meeting-123",
    tracks: {
      microphone: { filePath: "meetings/meeting-123/audio/microphone.wav" }
    }
  });
  await session.stop();

  provider.emitError(new Error("late capture error"));

  expect(session.state).toEqual({
    status: "processing-ready",
    meetingId: "meeting-123",
    tracks: provider.stopResult.tracks
  });
});

test("dispose stops active provider capture and unsubscribes callbacks", async () => {
  const provider = new FakeAudioCaptureProvider();
  const session = createRecordingSession({ provider });

  await session.start({
    meetingId: "meeting-123",
    tracks: {
      microphone: { filePath: "meetings/meeting-123/audio/microphone.wav" }
    }
  });

  await session.dispose();
  provider.emitError(new Error("late capture error"));

  expect(provider.stopCalls).toBe(1);
  expect(session.state).toEqual({
    status: "processing-ready",
    meetingId: "meeting-123",
    tracks: provider.stopResult.tracks
  });
});
