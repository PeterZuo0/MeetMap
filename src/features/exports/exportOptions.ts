export type ExportOptions = {
  actions: boolean;
  audio: boolean;
  decisions: boolean;
  map: boolean;
  timestamps: boolean;
  transcript: boolean;
};

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  actions: true,
  audio: false,
  decisions: true,
  map: true,
  timestamps: true,
  transcript: true
};

export function resolveExportOptions(options?: ExportOptions): ExportOptions {
  return options ?? DEFAULT_EXPORT_OPTIONS;
}
