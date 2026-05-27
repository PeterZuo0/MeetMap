import type { AudioTrackId } from "../meetings/meetingTypes.js";

export type VoiceActivityOutcome =
  | "both-active"
  | "system-only"
  | "microphone-only"
  | "no-audio";

export type VoiceActivityReason =
  | "both-tracks-contain-speech"
  | "system-track-contains-speech"
  | "microphone-track-contains-speech"
  | "no-tracks-contain-speech";

export type VoiceActivityTrackInput<TrackId extends AudioTrackId = AudioTrackId> = {
  id: TrackId;
  hasSpeech: boolean;
  durationMs?: number;
  speechDurationMs?: number;
  peakLevel?: number;
  rmsLevel?: number;
};

export type VoiceActivityInput = {
  tracks: {
    [TrackId in AudioTrackId]?: VoiceActivityTrackInput<TrackId>;
  };
};

export type VoiceActivityDecision = {
  tracksToProcess: AudioTrackId[];
  outcome: VoiceActivityOutcome;
  reason: VoiceActivityReason;
  message: string;
};

function trackHasSpeech(track: VoiceActivityTrackInput | undefined): boolean {
  return Boolean(track?.hasSpeech);
}

export function decideVoiceActivity(
  input: VoiceActivityInput
): VoiceActivityDecision {
  const systemHasSpeech = trackHasSpeech(input.tracks.system);
  const microphoneHasSpeech = trackHasSpeech(input.tracks.microphone);

  if (systemHasSpeech && microphoneHasSpeech) {
    return {
      tracksToProcess: ["system", "microphone"],
      outcome: "both-active",
      reason: "both-tracks-contain-speech",
      message: "System audio and microphone speech were detected."
    };
  }

  if (systemHasSpeech) {
    return {
      tracksToProcess: ["system"],
      outcome: "system-only",
      reason: "system-track-contains-speech",
      message: "System audio speech was detected without microphone speech."
    };
  }

  if (microphoneHasSpeech) {
    return {
      tracksToProcess: ["microphone"],
      outcome: "microphone-only",
      reason: "microphone-track-contains-speech",
      message: "Microphone speech was detected without system audio speech."
    };
  }

  return {
    tracksToProcess: [],
    outcome: "no-audio",
    reason: "no-tracks-contain-speech",
    message: "No speech was detected in the recorded audio."
  };
}
