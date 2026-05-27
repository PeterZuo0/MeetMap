import {
  decideVoiceActivity,
  type VoiceActivityInput
} from "./voiceActivity";

function createInput(
  systemHasSpeech: boolean,
  microphoneHasSpeech: boolean
): VoiceActivityInput {
  return {
    tracks: {
      system: {
        id: "system",
        hasSpeech: systemHasSpeech,
        durationMs: 60_000,
        speechDurationMs: systemHasSpeech ? 42_000 : 0
      },
      microphone: {
        id: "microphone",
        hasSpeech: microphoneHasSpeech,
        durationMs: 60_000,
        speechDurationMs: microphoneHasSpeech ? 35_000 : 0
      }
    }
  };
}

test("processes system before microphone when both tracks have speech", () => {
  expect(decideVoiceActivity(createInput(true, true))).toEqual({
    tracksToProcess: ["system", "microphone"],
    outcome: "both-active",
    reason: "both-tracks-contain-speech",
    message: "System audio and microphone speech were detected."
  });
});

test("processes only the system track when microphone speech is absent", () => {
  expect(decideVoiceActivity(createInput(true, false))).toEqual({
    tracksToProcess: ["system"],
    outcome: "system-only",
    reason: "system-track-contains-speech",
    message: "System audio speech was detected without microphone speech."
  });
});

test("processes only the microphone track when system speech is absent", () => {
  expect(decideVoiceActivity(createInput(false, true))).toEqual({
    tracksToProcess: ["microphone"],
    outcome: "microphone-only",
    reason: "microphone-track-contains-speech",
    message: "Microphone speech was detected without system audio speech."
  });
});

test("returns no tracks when neither track has speech", () => {
  expect(decideVoiceActivity(createInput(false, false))).toEqual({
    tracksToProcess: [],
    outcome: "no-audio",
    reason: "no-tracks-contain-speech",
    message: "No speech was detected in the recorded audio."
  });
});
