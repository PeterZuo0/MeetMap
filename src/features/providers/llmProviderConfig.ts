export const LLM_API_STYLES = ["responses", "chat_completions"] as const;

export type LlmApiStyle = (typeof LLM_API_STYLES)[number];

export type LlmProviderProfile = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  /** Speech-to-text model on the same endpoint; empty when the service has none. */
  transcriptionModel: string;
  apiStyle: LlmApiStyle;
  apiKeyRequired: boolean;
  apiKeyConfigured: boolean;
};

export type LlmProviderState = {
  activeProviderId: string | null;
  providers: LlmProviderProfile[];
};

export type SaveLlmProviderInput = {
  id?: string;
  name: string;
  baseUrl: string;
  model: string;
  transcriptionModel?: string;
  apiStyle: LlmApiStyle;
  apiKeyRequired: boolean;
  apiKey?: string;
};

export type LlmProviderWithSecret = Omit<LlmProviderProfile, "apiKeyConfigured"> & {
  apiKey: string;
};
