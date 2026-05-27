import type { MeetingAudioTracks } from "./meetingTypes";

test("allows audio track metadata ids to match their keys", () => {
  const tracks: MeetingAudioTracks = {
    system: {
      id: "system",
      filePath: "meetings/meeting-1/audio/system.wav",
      format: "wav",
      hasAudio: true
    },
    microphone: {
      id: "microphone",
      filePath: "meetings/meeting-1/audio/microphone.wav",
      format: "wav",
      hasAudio: true
    }
  };

  expect(tracks.system?.id).toBe("system");
  expect(tracks.microphone?.id).toBe("microphone");
});

test("allows audio track metadata to be partially available", () => {
  const tracks: MeetingAudioTracks = {
    system: {
      id: "system",
      filePath: "meetings/meeting-1/audio/system.wav",
      format: "wav",
      hasAudio: true
    }
  };

  expect(tracks.microphone).toBeUndefined();
});

const mismatchedAudioTracks: MeetingAudioTracks = {
  system: {
    // @ts-expect-error system track metadata must keep the system id.
    id: "microphone",
    filePath: "meetings/meeting-1/audio/system.wav",
    format: "wav",
    hasAudio: true
  }
};

void mismatchedAudioTracks;
