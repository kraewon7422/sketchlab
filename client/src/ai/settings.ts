/**
 * AI 설정 (기기에만 저장) — zod 없이 가벼운 파일이라 첫 화면 번들에 들어가도 된다.
 * 실제 호출은 client.ts (필요할 때 불러온다).
 */

export type Provider = "openrouter" | "ollama";

export interface AiSettings {
  provider: Provider;
  openrouterKey: string;
  openrouterModel: string;
  ollamaUrl: string;
  ollamaModel: string;
}

/** 설정 화면의 추천 모델 (모두 그림을 읽을 수 있다) */
export const OPENROUTER_MODELS: Array<{ id: string; label: string }> = [
  { id: "google/gemma-4-31b-it:free", label: "Gemma 4 31B · 무료" },
  { id: "nvidia/nemotron-3.5-super-vl:free", label: "Nemotron 3.5 VL · 무료" },
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5 · 가장 정확 (아주 저렴)" },
  { id: "qwen/qwen3.8-flash", label: "Qwen 3.8 Flash · 저렴" },
];

export const DEFAULT_SETTINGS: AiSettings = {
  provider: "openrouter",
  openrouterKey: "",
  openrouterModel: "google/gemma-4-31b-it:free",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen3.5:9b",
};

const KEY = "sketchlab.ai";

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const v = JSON.parse(raw) as Partial<AiSettings>;
    return {
      provider: v.provider === "ollama" ? "ollama" : "openrouter",
      openrouterKey: typeof v.openrouterKey === "string" ? v.openrouterKey : "",
      openrouterModel: v.openrouterModel || DEFAULT_SETTINGS.openrouterModel,
      ollamaUrl: v.ollamaUrl || DEFAULT_SETTINGS.ollamaUrl,
      ollamaModel: v.ollamaModel || DEFAULT_SETTINGS.ollamaModel,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAiSettings(s: AiSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 저장이 막힌 브라우저 — 이번 세션 동안만 쓴다 */
  }
}

/** 키·주소가 채워져 있는지 (✨가 AI로 넘어갈지 정할 때) */
export function aiConfigured(s: AiSettings = loadAiSettings()): boolean {
  return s.provider === "openrouter" ? s.openrouterKey.trim().length > 0 : s.ollamaUrl.trim().length > 0;
}

export function modelName(s: AiSettings = loadAiSettings()): string {
  return s.provider === "openrouter" ? s.openrouterModel : s.ollamaModel;
}
