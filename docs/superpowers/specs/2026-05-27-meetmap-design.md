# MeetMap Product and Technical Design

Date: 2026-05-27
Status: Draft v1

## Product Summary

MeetMap is a cross-platform meeting assistant that captures both system audio and microphone input, transcribes bilingual conversations, and turns meetings into structured Word summaries and interactive visual meeting maps.

The product differentiator is not only transcription or summarization. MeetMap should help users understand the structure of a meeting: topics, decisions, action items, unresolved questions, and how those ideas relate to each other.

## Goals

### Phase 1 MVP

- Ship a Windows-first desktop app while keeping the architecture ready for macOS and Linux.
- Capture two audio sources at the same time:
  - system audio from the computer
  - microphone input from the user
- Record audio locally first, then process after the meeting ends.
- Detect whether each audio track contains useful speech.
- If only one side has useful audio, generate the meeting summary from that side only.
- Support Chinese, English, and mixed Chinese-English meetings.
- Ask the user before recording which output language they want:
  - Chinese only
  - English only
  - bilingual Chinese and English
  - automatic language selection
- Use cloud APIs for transcription, structuring, and summarization in the first version.
- Export two primary artifacts:
  - a Word meeting summary
  - an HTML meeting structure map

### Later Phases

- Add real-time transcription during the meeting.
- Add real-time topic and action item extraction.
- Update the meeting map progressively while the meeting is still running.
- Reprocess the full transcript after the meeting to generate a more accurate final summary.
- Add macOS and Linux audio capture adapters.
- Add optional local/offline processing for sensitive meetings.

## Non-Goals for Phase 1

- Real-time transcription.
- Real-time meeting map updates.
- Speaker diarization across many individual speakers.
- Calendar integration.
- Team workspace collaboration.
- Cloud storage and sync.
- Mobile apps.
- Fully local model inference.

## Recommended Technical Direction

Use a cross-platform desktop shell with a platform-specific audio capture adapter.

Two viable options are Electron and Tauri. The recommended starting point is Electron because it has mature desktop packaging, a strong UI ecosystem, straightforward local file workflows, and fits the HTML meeting map requirement naturally. Tauri remains a strong alternative if app size and Rust-native integration become higher priorities.

The important architectural decision is to isolate system audio capture behind an adapter interface. Most of the application can be shared across platforms, but system audio capture must be implemented differently per operating system.

```text
MeetMap Desktop App
├─ Shared UI
├─ Meeting workflow
├─ Recording session manager
├─ Cloud transcription client
├─ Meeting intelligence pipeline
├─ Word export generator
├─ HTML meeting map generator
└─ Audio Capture Adapter
   ├─ Windows: WASAPI loopback + microphone
   ├─ macOS: ScreenCaptureKit or virtual audio strategy
   └─ Linux: PipeWire or PulseAudio monitor source
```

## Platform Audio Strategy

### Windows Phase 1

- Use WASAPI loopback to capture system output audio.
- Use the selected microphone input device for local user audio.
- Record the two sources as separate tracks.
- Normalize both tracks to a consistent sample rate, preferably 48 kHz.
- Store track metadata with start time, duration, sample rate, channel count, and device name.

### macOS Later

Potential approaches:

- ScreenCaptureKit for application or display audio capture where available.
- Audio Capture Extension if deeper system integration is required.
- Virtual audio device strategy if system-level capture is constrained by OS permissions.

macOS will require careful permission handling and user education because system audio capture is more constrained than Windows.

### Linux Later

Potential approaches:

- PipeWire capture where available.
- PulseAudio monitor source fallback.

Linux support should be treated as an adapter implementation, not a product rewrite.

## Phase 1 User Flow

```text
Open app
→ Create new meeting
→ Select output language
→ Select microphone device
→ Confirm system audio capture availability
→ Start recording
→ Show recording status, duration, and audio levels
→ Stop recording
→ Detect active audio tracks
→ Upload valid audio chunks for transcription
→ Merge transcript segments
→ Extract meeting structure JSON
→ Generate Word summary
→ Generate HTML meeting map
→ Save artifacts to local meeting history
```

## Audio Handling

### Track Model

Each meeting can have up to two primary tracks:

- `system`: computer audio from meeting software, browser, or other apps.
- `microphone`: local user audio from the selected input device.

The app should avoid assuming both tracks contain speech. A meeting may have only system audio, only microphone audio, both, or neither.

### Voice Activity Detection

After recording stops, run speech/activity detection on each track.

Rules:

- If both tracks contain speech, process both tracks.
- If only the system track contains speech, process the system track only.
- If only the microphone track contains speech, process the microphone track only.
- If neither track contains useful speech, do not call transcription or summarization APIs. Show a clear no-audio result.

### Chunking

Long recordings should be split into chunks before upload.

Suggested chunk size:

- 30 to 120 seconds per chunk for MVP.
- Keep overlap optional. If used, a 1 to 2 second overlap can reduce boundary losses.

Chunk metadata should include:

- meeting id
- track id
- chunk index
- start offset
- duration
- local file path
- upload/transcription status

## Cloud Processing Pipeline

### Step 1: Transcription

Send each valid chunk to a cloud transcription API.

Transcription should preserve the original spoken language instead of translating every segment. This keeps mixed Chinese-English meetings accurate and allows later summarization to choose the final output language.

Each transcript segment should include:

- segment id
- track id
- start time
- end time
- text
- detected language if available
- confidence if available

### Step 2: Transcript Merge

Merge transcript segments from both tracks by timestamp.

If speaker identity is not available in Phase 1, label segments by source:

- System audio
- Microphone

This is less precise than diarization, but it is reliable and clear for MVP.

### Step 3: Meeting Structure Extraction

Convert the transcript into a structured JSON representation.

Core objects:

```json
{
  "meeting": {
    "title": "string",
    "date": "string",
    "durationSeconds": 0,
    "outputLanguage": "zh | en | bilingual | auto"
  },
  "summary": {
    "short": "string",
    "detailed": "string"
  },
  "topics": [],
  "decisions": [],
  "actionItems": [],
  "openQuestions": [],
  "risks": [],
  "relations": []
}
```

Recommended node types for the meeting map:

- `meeting`
- `topic`
- `point`
- `decision`
- `action`
- `question`
- `risk`

Recommended relation types:

- `contains`
- `leads_to`
- `supports`
- `blocks`
- `decides`
- `creates_action`
- `raises_question`
- `depends_on`

### Step 4: Summary Generation

Generate the final summary according to the user's selected output language.

Language behavior:

- Chinese only: final Word summary is Chinese.
- English only: final Word summary is English.
- Bilingual: each major section includes Chinese and English versions.
- Auto: choose the meeting's dominant language, but keep proper nouns and technical terms natural.

The transcript itself should remain available in original language.

## Word Export

The Word document should be the primary business artifact.

Recommended sections:

1. Meeting Overview
2. Executive Summary
3. Key Topics
4. Decisions
5. Action Items
6. Open Questions
7. Risks and Follow-ups
8. Optional Transcript Appendix

Action item fields:

- task
- owner if mentioned
- due date if mentioned
- source topic
- supporting quote or timestamp

The Word generator should read from the structured meeting JSON, not directly from raw transcript text. This keeps the export deterministic and easier to test.

## HTML Meeting Map Export

The HTML export should be a standalone file that can be opened locally.

Preferred design:

- Mind-map style as the default layout.
- The meeting title or objective is the center node.
- Major topics are first-level nodes.
- Points, decisions, actions, risks, and questions branch from topics.
- Cross-topic relation lines show dependencies, conflicts, support, or follow-up chains.
- Clicking a node opens details such as summary, timestamps, and source transcript snippets.

Recommended implementation options:

- D3.js for custom graph behavior.
- Cytoscape.js for graph layout and interaction.
- Mermaid can be considered for a simpler static first version, but it may be too limited for rich interaction.

For MVP, the HTML file can bundle a small static renderer and embedded JSON data. Later, the same graph data model can power an in-app interactive view.

## Local Data Storage

Each meeting should have a local folder:

```text
meetings/{meetingId}/
├─ metadata.json
├─ audio/
│  ├─ system.wav
│  ├─ microphone.wav
│  └─ chunks/
├─ transcript.json
├─ structure.json
├─ exports/
│  ├─ meeting-summary.docx
│  └─ meeting-map.html
└─ logs/
```

This layout keeps raw data, derived data, and exports separate.

## Privacy and Consent

Because Phase 1 uses cloud APIs, the app must clearly disclose that audio and transcript text may be uploaded for processing.

Before recording or processing, the app should communicate:

- which audio sources are captured
- where files are stored locally
- that valid audio may be uploaded to cloud services
- whether raw audio is retained after processing
- whether the user can delete meeting data

A later privacy-focused mode can add local transcription and local summarization.

## Error Handling

Important failure cases:

- microphone permission denied
- system audio capture unavailable
- selected audio device disconnected
- one track silent
- both tracks silent
- recording write failure
- cloud upload failure
- transcription failure for one or more chunks
- summary generation failure
- Word export failure
- HTML map generation failure

The app should preserve intermediate files and retry from the failed step where possible.

## Testing Strategy

### Unit Tests

- language option mapping
- audio activity detection decisions
- transcript merge by timestamp
- meeting structure JSON validation
- Word export data mapping
- HTML graph data generation

### Integration Tests

- complete processing from sample audio to transcript to Word and HTML exports
- one-sided audio scenarios
- bilingual transcript scenarios
- failed chunk retry behavior

### Manual QA

- Windows system audio capture from browser/meeting app
- microphone capture from default and non-default devices
- no-audio meeting handling
- long recording handling
- generated Word formatting
- generated HTML map interaction

## Open Decisions

- Electron vs Tauri final selection.
- Exact transcription and summarization API provider.
- Whether to keep raw audio by default after successful export.
- Whether the first HTML map should use D3.js or Cytoscape.js.
- Whether Phase 1 should include local meeting history search.

## Recommended MVP Stack

Recommended starting stack:

- Electron + TypeScript for desktop shell and app logic.
- React for UI.
- Native Windows audio capture adapter using WASAPI loopback.
- Cloud transcription API for speech-to-text.
- Cloud LLM API for meeting structure and summary generation.
- DOCX generation library for Word export.
- D3.js or Cytoscape.js for HTML meeting map.

## Implementation Milestones

1. Repository setup and app skeleton.
2. Windows audio capture proof of concept.
3. Dual-track recording session manager.
4. Post-meeting audio activity detection.
5. Cloud transcription pipeline.
6. Transcript merge and normalization.
7. Meeting structure extraction.
8. Word summary export.
9. HTML meeting map export.
10. Local meeting history and artifact management.
11. Phase 1 packaging and manual QA.

## Success Criteria for Phase 1

- A Windows user can record a meeting with system audio and microphone audio.
- The app correctly handles both-track, system-only, microphone-only, and no-audio cases.
- The app can process Chinese, English, and mixed-language meetings.
- The user can choose the final output language before recording.
- The app exports a usable Word meeting summary.
- The app exports a standalone HTML meeting map.
- The architecture allows macOS and Linux audio adapters to be added later without rewriting the core app.
