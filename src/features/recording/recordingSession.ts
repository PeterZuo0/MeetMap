import type {
  AudioCaptureProvider,
  AudioCaptureStartRequest,
  AudioCaptureStopResult,
  AudioCaptureUnsubscribe,
  RecordingTrackSnapshots
} from "./audioCaptureProvider.js";
import type { MeetingAudioTracks, MeetingId } from "../meetings/meetingTypes.js";

export type IdleRecordingSessionState = {
  status: "idle";
};

export type StartingRecordingSessionState = {
  status: "starting";
  meetingId: MeetingId;
  tracks: RecordingTrackSnapshots;
};

export type RecordingSessionActiveState = {
  status: "recording";
  meetingId: MeetingId;
  tracks: RecordingTrackSnapshots;
};

export type StoppingRecordingSessionState = {
  status: "stopping";
  meetingId: MeetingId;
  tracks: RecordingTrackSnapshots;
};

export type StoppedRecordingSessionState = {
  status: "stopped";
  meetingId: MeetingId;
  tracks: RecordingTrackSnapshots;
};

export type ProcessingReadyRecordingSessionState = {
  status: "processing-ready";
  meetingId: MeetingId;
  tracks: MeetingAudioTracks;
};

export type FailedRecordingSessionState = {
  status: "failed";
  meetingId?: MeetingId;
  error: Error;
};

export type RecordingSessionState =
  | IdleRecordingSessionState
  | StartingRecordingSessionState
  | RecordingSessionActiveState
  | StoppingRecordingSessionState
  | StoppedRecordingSessionState
  | ProcessingReadyRecordingSessionState
  | FailedRecordingSessionState;

export type RecordingSessionOptions = {
  provider: AudioCaptureProvider;
  onStateChange?: (state: RecordingSessionState) => void;
};

export type RecordingSession = {
  readonly state: RecordingSessionState;
  start(request: AudioCaptureStartRequest): Promise<void>;
  stop(): Promise<AudioCaptureStopResult>;
  dispose(): Promise<void>;
};

function createRecordingTracks(
  request: AudioCaptureStartRequest
): RecordingTrackSnapshots {
  return {
    system: request.tracks.system
      ? {
          id: "system",
          filePath: request.tracks.system.filePath,
          status: "recording",
          deviceId: request.tracks.system.deviceId
        }
      : undefined,
    microphone: request.tracks.microphone
      ? {
          id: "microphone",
          filePath: request.tracks.microphone.filePath,
          status: "recording",
          deviceId: request.tracks.microphone.deviceId
        }
      : undefined
  };
}

function createStoppedTracks(
  tracks: RecordingTrackSnapshots
): RecordingTrackSnapshots {
  return {
    system: tracks.system ? { ...tracks.system, status: "stopped" } : undefined,
    microphone: tracks.microphone
      ? { ...tracks.microphone, status: "stopped" }
      : undefined
  };
}

function hasRequestedTracks(request: AudioCaptureStartRequest): boolean {
  return Boolean(request.tracks.system || request.tracks.microphone);
}

export function createRecordingSession({
  provider,
  onStateChange
}: RecordingSessionOptions): RecordingSession {
  let state: RecordingSessionState = { status: "idle" };
  let activeCaptureError: Error | undefined;
  let startPromise: Promise<void> | undefined;
  const subscriptions: AudioCaptureUnsubscribe[] = [];

  function setInternalState(nextState: RecordingSessionState): void {
    state = nextState;
  }

  function setState(nextState: RecordingSessionState): void {
    state = nextState;
    onStateChange?.(nextState);
  }

  subscriptions.push(
    provider.onError((captureError) => {
      if (state.status !== "recording" && state.status !== "stopping") {
        return;
      }

      activeCaptureError = captureError.error;
      const meetingId =
        state.status === "recording" || state.status === "stopping"
          ? state.meetingId
          : undefined;
      setState({
        status: "failed",
        meetingId,
        error: captureError.error
      });
    })
  );

  return {
    get state() {
      return state;
    },

    async start(request: AudioCaptureStartRequest): Promise<void> {
      if (state.status !== "idle") {
        throw new Error(`Cannot start recording from ${state.status}`);
      }

      if (!hasRequestedTracks(request)) {
        throw new Error("Cannot start recording without audio tracks");
      }

      try {
        activeCaptureError = undefined;
        setInternalState({
          status: "starting",
          meetingId: request.meetingId,
          tracks: createRecordingTracks(request)
        });
        const pendingStart = provider.start(request);
        startPromise = pendingStart;
        await pendingStart;
        if (startPromise === pendingStart) {
          startPromise = undefined;
        }
        setState({
          status: "recording",
          meetingId: request.meetingId,
          tracks: createRecordingTracks(request)
        });
      } catch (error) {
        startPromise = undefined;
        setState({
          status: "failed",
          meetingId: request.meetingId,
          error: error instanceof Error ? error : new Error(String(error))
        });
        throw error;
      }
    },

    async stop(): Promise<AudioCaptureStopResult> {
      if (state.status !== "recording") {
        throw new Error(`Cannot stop recording from ${state.status}`);
      }

      const recordingState = state;
      setInternalState({
        status: "stopping",
        meetingId: recordingState.meetingId,
        tracks: recordingState.tracks
      });

      try {
        const result = await provider.stop();
        if (activeCaptureError) {
          throw activeCaptureError;
        }

        setState({
          status: "stopped",
          meetingId: recordingState.meetingId,
          tracks: createStoppedTracks(recordingState.tracks)
        });
        setState({
          status: "processing-ready",
          meetingId: recordingState.meetingId,
          tracks: result.tracks
        });
        return result;
      } catch (error) {
        setState({
          status: "failed",
          meetingId: recordingState.meetingId,
          error: error instanceof Error ? error : new Error(String(error))
        });
        throw error;
      }
    },

    async dispose(): Promise<void> {
      try {
        const pendingStart = startPromise;
        if (pendingStart) {
          try {
            await pendingStart;
          } catch {
            // start() records the failure state and propagates the original error.
          }
        }

        if (state.status === "recording") {
          await this.stop();
        }
      } finally {
        for (const unsubscribe of subscriptions.splice(0)) {
          unsubscribe();
        }
      }
    }
  };
}
