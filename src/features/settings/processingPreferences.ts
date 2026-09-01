export type RecognitionLanguagePreferences = {
  cantonese: boolean;
  englishGB: boolean;
  englishUS: boolean;
  mandarin: boolean;
  mixedCodeSwitching: boolean;
};

export type ProcessingPreferences = {
  analysisOnly?: boolean;
  autoDeleteCloudCopies: boolean;
  customVocabulary?: string[];
  preserveTranscriptLanguage: boolean;
  recognitionLanguages: RecognitionLanguagePreferences;
  speakerDiarization: boolean;
  summaryInstructions?: string;
  uploadRecordedAudio: boolean;
  uploadSeparateTracks: boolean;
  transcriptOnly?: boolean;
  useOutputLanguage: boolean;
};
