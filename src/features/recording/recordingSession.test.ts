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
    return this.stopResult;
  }

  onLevel() {
    return () => undefined;
  }

  onError() {
    return () => undefined;
  }
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
