import type { AudioTrackId } from "../meetings/meetingTypes.js";

export type AudioPreflightTrackStatus =
  | "detecting"
  | "detected"
  | "quiet"
  | "stale"
  | "off"
  | "unavailable";

export type AudioPreflightLevelSample = {
  level: number;
  occurredAt: string;
};

export type AudioPreflightInput = {
  enabledSources: Record<AudioTrackId, boolean>;
  now: string;
  samples: Partial<Record<AudioTrackId, AudioPreflightLevelSample[]>>;
  unavailableTracks?: Partial<Record<AudioTrackId, string>>;
};

export type AudioPreflightTrackState = {
  track: AudioTrackId;
  enabled: boolean;
  status: AudioPreflightTrackStatus;
  level: number;
  peakLevel: number;
  lastHeardAt: string | null;
  message: string;
};

export type AudioPreflightSummary =
  | "both-detected"
  | "system-only"
  | "microphone-only"
  | "waiting"
  | "none-selected"
  | "unavailable";

export type AudioPreflightState = {
  canStart: boolean;
  blockingReason: string | null;
  summary: AudioPreflightSummary;
  tracks: Record<AudioTrackId, AudioPreflightTrackState>;
};

const DETECTED_LEVEL_THRESHOLD = 0.18;
const FRESHNESS_WINDOW_MS = 2000;
const PEAK_WINDOW_MS = 5000;

const TRACK_LABELS: Record<AudioTrackId, string> = {
  system: "system audio",
  microphone: "microphone input"
};

export function createAudioPreflightState(
  input: AudioPreflightInput
): AudioPreflightState {
  const nowMs = Date.parse(input.now);
  const tracks = {
    system: createTrackState("system", input, nowMs),
    microphone: createTrackState("microphone", input, nowMs)
  };
  const selectedCount = Number(input.enabledSources.system) + Number(input.enabledSources.microphone);
  const unavailableSelected = tracks.system.status === "unavailable" || tracks.microphone.status === "unavailable";
  const canStart = selectedCount > 0 && !unavailableSelected;
  const systemDetected = tracks.system.status === "detected";
  const microphoneDetected = tracks.microphone.status === "detected";

  return {
    canStart,
    blockingReason: createBlockingReason({ canStart, selectedCount, tracks }),
    summary: createSummary({ selectedCount, systemDetected, microphoneDetected, tracks }),
    tracks
  };
}

function createTrackState(
  track: AudioTrackId,
  input: AudioPreflightInput,
  nowMs: number
): AudioPreflightTrackState {
  const enabled = input.enabledSources[track];

  if (!enabled) {
    return {
      track,
      enabled,
      status: "off",
      level: 0,
      peakLevel: 0,
      lastHeardAt: null,
      message: `${formatTrackLabel(track)} is off.`
    };
  }

  const unavailableMessage = input.unavailableTracks?.[track];
  if (unavailableMessage) {
    return {
      track,
      enabled,
      status: "unavailable",
      level: 0,
      peakLevel: 0,
      lastHeardAt: null,
      message: unavailableMessage
    };
  }

  const samples = input.samples[track] ?? [];
  const latestSample = latest(samples);
  if (!latestSample) {
    return {
      track,
      enabled,
      status: "detecting",
      level: 0,
      peakLevel: 0,
      lastHeardAt: null,
      message: `Checking ${TRACK_LABELS[track]}...`
    };
  }

  const latestAgeMs = nowMs - Date.parse(latestSample.occurredAt);
  if (latestAgeMs > FRESHNESS_WINDOW_MS) {
    return {
      track,
      enabled,
      status: "stale",
      level: 0,
      peakLevel: 0,
      lastHeardAt: latestSample.occurredAt,
      message: `${formatTrackLabel(track)} level has not updated recently.`
    };
  }

  const level = clampLevel(latestSample.level);
  const status: AudioPreflightTrackStatus =
    level >= DETECTED_LEVEL_THRESHOLD ? "detected" : "quiet";

  return {
    track,
    enabled,
    status,
    level,
    peakLevel: peakLevel(samples, nowMs),
    lastHeardAt: status === "detected" ? latestSample.occurredAt : null,
    message:
      status === "detected"
        ? `${formatTrackLabel(track)} detected.`
        : `No ${TRACK_LABELS[track]} detected yet.`
  };
}

function createBlockingReason({
  canStart,
  selectedCount,
  tracks
}: {
  canStart: boolean;
  selectedCount: number;
  tracks: Record<AudioTrackId, AudioPreflightTrackState>;
}): string | null {
  if (selectedCount === 0) {
    return "No audio source selected. Enable system audio or microphone to start recording.";
  }

  if (canStart) {
    return null;
  }

  if (tracks.system.status === "unavailable" || tracks.microphone.status === "unavailable") {
    return "Audio probe is unavailable. Check Windows audio permissions or device availability.";
  }

  return null;
}

function createSummary({
  selectedCount,
  systemDetected,
  microphoneDetected,
  tracks
}: {
  selectedCount: number;
  systemDetected: boolean;
  microphoneDetected: boolean;
  tracks: Record<AudioTrackId, AudioPreflightTrackState>;
}): AudioPreflightSummary {
  if (selectedCount === 0) {
    return "none-selected";
  }

  if (systemDetected && microphoneDetected) {
    return "both-detected";
  }

  if (systemDetected) {
    return "system-only";
  }

  if (microphoneDetected) {
    return "microphone-only";
  }

  if (tracks.system.status === "unavailable" || tracks.microphone.status === "unavailable") {
    return "unavailable";
  }

  return "waiting";
}

function latest(samples: AudioPreflightLevelSample[]): AudioPreflightLevelSample | undefined {
  return samples.at(-1);
}

function peakLevel(samples: AudioPreflightLevelSample[], nowMs: number): number {
  return samples.reduce((peak, sample) => {
    const ageMs = nowMs - Date.parse(sample.occurredAt);
    if (ageMs > PEAK_WINDOW_MS) {
      return peak;
    }

    return Math.max(peak, clampLevel(sample.level));
  }, 0);
}

function clampLevel(level: number): number {
  return Math.max(0, Math.min(1, level));
}

function formatTrackLabel(track: AudioTrackId): string {
  return track === "system" ? "System audio" : "Microphone";
}
