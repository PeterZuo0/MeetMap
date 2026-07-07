import { createTrackDiarizationClient } from "./trackDiarizationClient";

test("creates local CPU speaker turns from active audio tracks without a model dependency", async () => {
  const client = createTrackDiarizationClient();

  await expect(
    client.diarize({
      meeting: {
        id: "meeting-1",
        title: "Meeting",
        status: "recorded",
        outputLanguage: "en",
        timestamps: {
          createdAt: "2026-05-30T00:00:00.000Z",
          updatedAt: "2026-05-30T00:00:00.000Z"
        },
        audioTracks: {
          system: {
            id: "system",
            filePath: "system.wav",
            format: "wav",
            hasAudio: true,
            durationMs: 10_000
          },
          microphone: {
            id: "microphone",
            filePath: "microphone.wav",
            format: "wav",
            hasAudio: true,
            durationMs: 8_000
          }
        },
        transcriptPath: null,
        structurePath: null,
        exportPaths: {
          wordSummaryPath: null,
          htmlMeetingMapPath: null
        }
      },
      tracksToProcess: ["system", "microphone"],
      audioTracks: {
        system: {
          id: "system",
          filePath: "system.wav",
          format: "wav",
          hasAudio: true,
          durationMs: 10_000
        },
        microphone: {
          id: "microphone",
          filePath: "microphone.wav",
          format: "wav",
          hasAudio: true,
          durationMs: 8_000
        }
      }
    })
  ).resolves.toEqual({
    engine: "meetmap-track-fallback",
    device: "cpu",
    speakers: [
      { id: "speaker-system", label: "Speaker 1" },
      { id: "speaker-microphone", label: "Speaker 2" }
    ],
    segments: [
      {
        id: "speaker-system-turn-1",
        trackId: "system",
        speakerId: "speaker-system",
        speakerLabel: "Speaker 1",
        startTimeMs: 0,
        endTimeMs: 10_000,
        confidence: 0.5
      },
      {
        id: "speaker-microphone-turn-1",
        trackId: "microphone",
        speakerId: "speaker-microphone",
        speakerLabel: "Speaker 2",
        startTimeMs: 0,
        endTimeMs: 8_000,
        confidence: 0.5
      }
    ]
  });
});
