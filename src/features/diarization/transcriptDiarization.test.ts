import { applyDiarizationToTranscript } from "./transcriptDiarization";
import type { DiarizationResult } from "./diarizationTypes";
import type { TranscriptSegment } from "../transcription/transcriptionTypes";

test("assigns the speaker with the largest time overlap to each transcript segment", () => {
  const transcript: TranscriptSegment[] = [
    {
      id: "seg-1",
      trackId: "system",
      startTimeMs: 1_000,
      endTimeMs: 4_000,
      text: "Mostly speaker one.",
      language: "en",
      confidence: 0.95
    },
    {
      id: "seg-2",
      trackId: "system",
      startTimeMs: 4_000,
      endTimeMs: 7_000,
      text: "Mostly speaker two.",
      language: "en",
      confidence: 0.94
    }
  ];
  const diarization: DiarizationResult = {
    engine: "test",
    device: "cpu",
    speakers: [
      { id: "speaker-1", label: "Speaker 1" },
      { id: "speaker-2", label: "Speaker 2" }
    ],
    segments: [
      {
        id: "turn-1",
        speakerId: "speaker-1",
        speakerLabel: "Speaker 1",
        startTimeMs: 900,
        endTimeMs: 4_500,
        confidence: 0.88
      },
      {
        id: "turn-2",
        speakerId: "speaker-2",
        speakerLabel: "Speaker 2",
        startTimeMs: 4_500,
        endTimeMs: 7_100,
        confidence: 0.86
      }
    ]
  };

  expect(applyDiarizationToTranscript(transcript, diarization)).toEqual([
    expect.objectContaining({ id: "seg-1", speakerId: "speaker-1", speakerLabel: "Speaker 1" }),
    expect.objectContaining({ id: "seg-2", speakerId: "speaker-2", speakerLabel: "Speaker 2" })
  ]);
});

test("leaves transcript segments unchanged when no speaker overlaps", () => {
  const transcript: TranscriptSegment[] = [
    {
      id: "seg-1",
      trackId: "microphone",
      startTimeMs: 10_000,
      endTimeMs: 11_000,
      text: "No speaker match.",
      language: "en",
      confidence: 0.9
    }
  ];

  expect(
    applyDiarizationToTranscript(transcript, {
      engine: "test",
      device: "cpu",
      speakers: [{ id: "speaker-1", label: "Speaker 1" }],
      segments: [
        {
          id: "turn-1",
          speakerId: "speaker-1",
          speakerLabel: "Speaker 1",
          startTimeMs: 0,
          endTimeMs: 1_000
        }
      ]
    })
  ).toEqual(transcript);
});

test("prefers diarization segments from the same audio track when track ids are available", () => {
  const transcript: TranscriptSegment[] = [
    {
      id: "system-seg",
      trackId: "system",
      startTimeMs: 0,
      endTimeMs: 5_000,
      text: "System track speech.",
      language: "en",
      confidence: 0.9
    },
    {
      id: "mic-seg",
      trackId: "microphone",
      startTimeMs: 0,
      endTimeMs: 5_000,
      text: "Microphone speech.",
      language: "en",
      confidence: 0.9
    }
  ];

  const result = applyDiarizationToTranscript(transcript, {
    engine: "track-fallback",
    device: "cpu",
    speakers: [
      { id: "speaker-system", label: "Speaker 1" },
      { id: "speaker-microphone", label: "Speaker 2" }
    ],
    segments: [
      {
        id: "turn-system",
        trackId: "system",
        speakerId: "speaker-system",
        speakerLabel: "Speaker 1",
        startTimeMs: 0,
        endTimeMs: 5_000
      },
      {
        id: "turn-microphone",
        trackId: "microphone",
        speakerId: "speaker-microphone",
        speakerLabel: "Speaker 2",
        startTimeMs: 0,
        endTimeMs: 5_000
      }
    ]
  });

  expect(result).toEqual([
    expect.objectContaining({ id: "system-seg", speakerLabel: "Speaker 1" }),
    expect.objectContaining({ id: "mic-seg", speakerLabel: "Speaker 2" })
  ]);
});
