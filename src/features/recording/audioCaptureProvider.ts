import type {
  AudioTrackId,
  AudioTrackMetadata,
  MeetingAudioTracks,
  MeetingId
} from "../meetings/meetingTypes";

export type AudioCaptureDevice = {
  id: string;
  label: string;
  track: AudioTrackId;
  isDefault?: boolean;
};

export type AudioCaptureTrackRequest<TrackId extends AudioTrackId = AudioTrackId> = {
  filePath: string;
  deviceId?: string;
  track: TrackId;
};

export type AudioCaptureStartRequest = {
  meetingId: MeetingId;
  tracks: {
    [TrackId in AudioTrackId]?: Omit<AudioCaptureTrackRequest<TrackId>, "track">;
  };
};

export type AudioCaptureStopResult = {
  tracks: MeetingAudioTracks;
};

export type AudioLevelUpdate = {
  track: AudioTrackId;
  level: number;
  occurredAt: string;
};

export type AudioCaptureError = {
  track?: AudioTrackId;
  error: Error;
};

export type AudioCaptureUnsubscribe = () => void;

export type AudioCaptureProvider = {
  listDevices(): Promise<AudioCaptureDevice[]>;
  start(request: AudioCaptureStartRequest): Promise<void>;
  stop(): Promise<AudioCaptureStopResult>;
  onLevel(callback: (update: AudioLevelUpdate) => void): AudioCaptureUnsubscribe;
  onError(callback: (error: AudioCaptureError) => void): AudioCaptureUnsubscribe;
};

export type RecordingTrackSnapshot<TrackId extends AudioTrackId = AudioTrackId> = {
  id: TrackId;
  filePath: string;
  status: "pending" | "recording" | "stopped";
  deviceId?: string;
};

export type RecordingTrackSnapshots = {
  [TrackId in AudioTrackId]?: RecordingTrackSnapshot<TrackId>;
};

export function createRecordingTrackMetadata<TrackId extends AudioTrackId>(
  track: RecordingTrackSnapshot<TrackId>,
  hasAudio: boolean
): AudioTrackMetadata<TrackId> {
  return {
    id: track.id,
    filePath: track.filePath,
    format: "wav",
    hasAudio
  };
}
