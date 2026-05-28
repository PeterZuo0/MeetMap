export type RecognitionLanguagePreferences = {
  cantonese: boolean;
  englishGB: boolean;
  englishUS: boolean;
  mandarin: boolean;
  mixedCodeSwitching: boolean;
};

export type ProcessingPreferences = {
  autoDeleteCloudCopies: boolean;
  preserveTranscriptLanguage: boolean;
  recognitionLanguages: RecognitionLanguagePreferences;
  speakerDiarization: boolean;
  uploadRecordedAudio: boolean;
  uploadSeparateTracks: boolean;
  useOutputLanguage: boolean;
};
