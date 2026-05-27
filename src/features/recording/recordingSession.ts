import type {
  AudioCaptureProvider,
  AudioCaptureStartRequest,
  AudioCaptureStopResult,
  AudioCaptureUnsubscribe,
  RecordingTrackSnapshots
} from "./audioCaptureProvider";
import type { MeetingAudioTracks, MeetingId } from "../meetings/meetingTypes";

export type IdleRecordingSessionState = {
  status: "idle";
};

export type RecordingSessionActiveState = {
  status: "recording";
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
  | RecordingSessionActiveState
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
  dispose(): void;
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
  const subscriptions: AudioCaptureUnsubscribe[] = [];

  function setState(nextState: RecordingSessionState): void {
    state = nextState;
    onStateChange?.(nextState);
  }

  subscriptions.push(
    provider.onError((captureError) => {
      const meetingId =
        state.status === "recording" ||
        state.status === "stopped" ||
        state.status === "processing-ready"
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
        await provider.start(request);
        setState({
          status: "recording",
          meetingId: request.meetingId,
          tracks: createRecordingTracks(request)
        });
      } catch (error) {
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

      try {
        const result = await provider.stop();
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

    dispose(): void {
      for (const unsubscribe of subscriptions.splice(0)) {
        unsubscribe();
      }
    }
  };
}
