import { z } from "zod";

/**
 * AI 연결 (P3b) — 두 가지 길, 같은 입구.
 *   openrouter: 클라우드의 여러 모델 (Gemma·Qwen·Claude…) — 키 하나, 노트북이 꺼져 있어도 된다
 *   ollama:     내 PC의 로컬 모델 — 무료·비공개, PC가 켜져 있어야 한다
 *
 * 답은 항상 JSON 스키마로 받고 zod로 한 번 더 검사한다 (모델이 형식을 어기면 실패로 처리 — 추측하지 않는다).
 * 키·주소는 이 기기의 localStorage에만 둔다. 저장소에도, 다른 곳에도 보내지 않는다.
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

export class AiError extends Error {}

export interface AskOptions<T> {
  system: string;
  prompt: string;
  /** PNG data URL — 손글씨 인식 */
  image?: string;
  schema: z.ZodType<T>;
  /** 스키마 이름 (영문·숫자) */
  name: string;
  signal?: AbortSignal;
  settings?: AiSettings;
}

const TIMEOUT_MS = 90_000;

/** 모델에게 묻고, 스키마에 맞는 JSON으로 답을 받는다 */
export async function askJson<T>(opt: AskOptions<T>): Promise<T> {
  const s = opt.settings ?? loadAiSettings();
  const jsonSchema = z.toJSONSchema(opt.schema, { target: "draft-7" }) as Record<string, unknown>;
  // 구조화 출력을 지원하지 않는 모델도 있으니 형식을 글로도 알려 준다
  const system = `${opt.system}\n\nReply with only a JSON object matching this JSON Schema, no prose, no code fences:\n${JSON.stringify(jsonSchema)}`;

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = opt.signal ? AbortSignal.any([opt.signal, timeout]) : timeout;

  let text: string;
  try {
    text = s.provider === "openrouter" ? await viaOpenRouter(s, system, opt, jsonSchema, signal) : await viaOllama(s, system, opt, jsonSchema, signal);
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof DOMException && e.name === "TimeoutError") throw new AiError("AI 응답이 너무 늦어요 (90초) · 다시 시도해 주세요");
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new AiError(s.provider === "ollama" ? "PC의 Ollama에 연결하지 못했어요 · 주소와 PC 전원을 확인해 주세요" : "AI 서버에 연결하지 못했어요 · 인터넷 연결을 확인해 주세요");
  }

  const parsed = opt.schema.safeParse(parseJsonLoose(text));
  if (!parsed.success) throw new AiError("AI 답의 형식이 맞지 않아요 · 다른 모델로 바꿔 보세요");
  return parsed.data;
}

/** ```json … ``` 으로 감싸거나 앞뒤에 말을 붙여도 JSON 부분만 꺼낸다 */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function viaOpenRouter(s: AiSettings, system: string, opt: AskOptions<unknown>, schema: Record<string, unknown>, signal: AbortSignal): Promise<string> {
  if (!s.openrouterKey.trim()) throw new AiError("OpenRouter 키가 없어요 · AI 설정에서 넣어 주세요");
  const content: unknown[] = [{ type: "text", text: opt.prompt }];
  if (opt.image) content.push({ type: "image_url", image_url: { url: opt.image } });
  const body = (format: unknown) =>
    JSON.stringify({
      model: s.openrouterModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      response_format: format,
      temperature: 0,
    });
  const send = (format: unknown) =>
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${s.openrouterKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": location.origin,
        "X-Title": "SketchLab",
      },
      body: body(format),
    });

  let res = await send({ type: "json_schema", json_schema: { name: opt.name, strict: true, schema } });
  // 엄격한 스키마를 못 받는 모델 → JSON 모드로 한 번 더
  if (res.status === 400) res = await send({ type: "json_object" });
  if (!res.ok) throw new AiError(await openRouterError(res));
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new AiError(data.error?.message ? `AI 오류: ${data.error.message}` : "AI가 빈 답을 보냈어요");
  return text;
}

async function openRouterError(res: Response): Promise<string> {
  let detail = "";
  try {
    detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
  } catch {
    /* 본문 없음 */
  }
  if (res.status === 401) return "OpenRouter 키가 맞지 않아요 · AI 설정에서 다시 넣어 주세요";
  if (res.status === 402) return "OpenRouter 크레딧이 부족해요 · 무료 모델로 바꾸거나 충전해 주세요";
  if (res.status === 429) return "무료 사용 한도에 걸렸어요 · 잠시 뒤에 다시 하거나 다른 모델을 골라 주세요";
  return `AI 오류 (${res.status})${detail ? `: ${detail}` : ""}`;
}

async function viaOllama(s: AiSettings, system: string, opt: AskOptions<unknown>, schema: Record<string, unknown>, signal: AbortSignal): Promise<string> {
  const base = s.ollamaUrl.trim().replace(/\/+$/, "");
  const user: Record<string, unknown> = { role: "user", content: opt.prompt };
  if (opt.image) user.images = [opt.image.replace(/^data:[^,]*,/, "")];
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: s.ollamaModel,
      stream: false,
      think: false, // 생각 과정은 끈다 — 손글씨 읽기에 필요 없고 몇 배 느려진다
      format: schema,
      options: { temperature: 0 },
      messages: [{ role: "system", content: system }, user],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    if (res.status === 404) throw new AiError(`PC에 ${s.ollamaModel} 모델이 없어요 · ollama pull ${s.ollamaModel}`);
    throw new AiError(`Ollama 오류 (${res.status}) ${t.slice(0, 120)}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  const text = data.message?.content;
  if (!text) throw new AiError("Ollama가 빈 답을 보냈어요");
  return text;
}

/** 연결 테스트 — 아주 짧은 질문 하나 */
export async function testConnection(settings: AiSettings): Promise<{ ms: number; reply: string }> {
  const t0 = performance.now();
  const r = await askJson({
    settings,
    name: "ping",
    system: "You are a connectivity check.",
    prompt: 'Return {"ok": true, "word": "벤젠"} exactly.',
    schema: z.object({ ok: z.boolean(), word: z.string() }),
  });
  return { ms: Math.round(performance.now() - t0), reply: r.word };
}

/** PC의 Ollama에 설치된 모델 이름들 */
export async function ollamaModels(url: string): Promise<string[]> {
  const res = await fetch(`${url.trim().replace(/\/+$/, "")}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new AiError(`Ollama 오류 (${res.status})`);
  const data = (await res.json()) as { models?: Array<{ name: string }> };
  return (data.models ?? []).map((m) => m.name).filter((n) => !n.includes("cloud"));
}
