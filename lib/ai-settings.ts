export interface AiSettings {
  apiKey: string;
  analysisModel: string;
  chatModel: string;
}

export const AI_SETTINGS_KEY = "toolkit:ai-settings";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  apiKey: "",
  analysisModel: "deepseek-chat",
  chatModel: "deepseek-chat",
};

export function readAiSettings(): AiSettings {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;

  try {
    const raw = window.localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      analysisModel:
        typeof parsed.analysisModel === "string" && parsed.analysisModel.trim()
          ? parsed.analysisModel.trim()
          : DEFAULT_AI_SETTINGS.analysisModel,
      chatModel:
        typeof parsed.chatModel === "string" && parsed.chatModel.trim()
          ? parsed.chatModel.trim()
          : DEFAULT_AI_SETTINGS.chatModel,
    };
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function writeAiSettings(settings: AiSettings): void {
  window.localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
}

export function clearAiSettings(): void {
  window.localStorage.removeItem(AI_SETTINGS_KEY);
}

export function aiRequestHeaders(settings: AiSettings): Record<string, string> {
  const apiKey = settings.apiKey.trim();
  return apiKey ? { "X-DeepSeek-API-Key": apiKey } : {};
}
