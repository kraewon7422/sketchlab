import type { CanvasItem, ObjectItem } from "../ink/types";
import { itemsKey, pagesStore } from "./pages";
import { loadItems } from "./persistence";
import { sessionStore } from "./session";

/**
 * 노트 전체에서 찾기 (8단계) — 모든 쪽의 글 상자·수식·코드·표·그래프·구조식… 의 글자를 모아 찾는다.
 * 손글씨는 ✨로 알아본 것(글·수식 객체가 된 것)만 찾을 수 있다.
 *
 *   이 기기에서: 낱말 + 수학 동의어 (적분 ↔ \int, 행렬 ↔ pmatrix …)
 *   AI로 (설정했을 때): "연쇄법칙 했던 곳" 처럼 말로 물어도 — 후보 목록을 보여 주고 고르게 한다
 */

export interface SearchEntry {
  pageId: string;
  pageTitle: string;
  pageNo: number;
  itemId: string;
  /** 무엇인지 (화면 표시용) */
  label: string;
  text: string;
  bbox: ObjectItem["bbox"];
}

export interface SearchHit extends SearchEntry {
  score: number;
  why?: string;
}

const KIND_LABEL: Record<string, string> = {
  text: "글",
  formula: "수식",
  plot2d: "그래프",
  space3d: "공간 그림",
  solid3d: "입체도형",
  chem: "구조식",
  chemEq: "반응식",
  table: "표",
  venn: "벤 다이어그램",
  code: "코드",
  tensor: "텐서",
  topology: "위상수학",
  nnet: "신경망",
  circuit: "회로",
  image: "사진",
  shape2d: "도형",
};

/** 객체 → 찾을 글자 (객체 종류 이름도 함께 — "그래프"로 찾으면 그래프가 나오게) */
export function textOf(item: CanvasItem): string | null {
  if (item.kind !== "object") return null;
  const ir = item.ir;
  const name = KIND_LABEL[ir.kind] ?? "";
  switch (ir.kind) {
    case "text":
      // 검산 표시(✓ ✗ ?)는 찾지 않는다
      return ir.source === "local" && /^[✓✗?]/.test(ir.data.text) ? null : ir.data.text;
    case "formula":
      return `${name} ${ir.data.latex}`;
    case "plot2d":
      return `${name} ${ir.data.functions.map((f) => f.latex).join(" ")} ${ir.data.caption ?? ""} ${ir.data.view.xLabel ?? ""} ${ir.data.view.yLabel ?? ""}`;
    case "space3d":
      return `${name} 3D ${ir.data.caption ?? ""} ${(ir.data.surfaces ?? []).map((s) => s.latex).join(" ")} ${(ir.data.points ?? []).map((p) => p.label ?? "").join(" ")}`;
    case "solid3d":
      return `${name} ${ir.data.solid}`;
    case "chem":
      return `${name} 분자 ${ir.data.commonName ?? ""} ${ir.data.smiles}`;
    case "chemEq":
      return `${name} 화학 ${ir.data.ce}`;
    case "table":
      return `${name} ${ir.data.rows.map((r) => r.join(" ")).join(" ")}`;
    case "venn":
      return `${name} 집합 ${ir.data.expr}`;
    case "code":
      return `${name} ${ir.data.lang === "python" ? "python 파이썬" : "javascript 자바스크립트"} ${ir.data.name} ${ir.data.source}`;
    case "tensor":
      return `${name} ${ir.data.dims.join("x")}`;
    case "topology":
      return `${name} 도넛 컵 머그잔`;
    case "nnet":
      return `${name} 뉴런 ${ir.data.layers.join("-")}`;
    case "image":
      return `${name} ${ir.data.name ?? ""}`;
    case "circuit":
      return `${name} ${ir.data.mode === "logic" ? "논리 게이트" : "전기 회로도"} ${ir.data.parts.map((p) => `${p.type} ${p.label ?? ""}`).join(" ")}`;
    default:
      return null;
  }
}

/** 수학 낱말 ↔ LaTeX·영어 (찾는 말을 넓힌다) */
const SYNONYMS: Record<string, string[]> = {
  적분: ["\\int", "integral", "∫"],
  정적분: ["\\int_"],
  미분: ["\\frac{d", "derivative", "'(", "\\prime", "d/dx"],
  극한: ["\\lim", "limit"],
  시그마: ["\\sum"],
  합: ["\\sum"],
  급수: ["\\sum"],
  행렬: ["matrix", "pmatrix", "bmatrix"],
  삼각함수: ["\\sin", "\\cos", "\\tan"],
  사인: ["\\sin"],
  코사인: ["\\cos"],
  탄젠트: ["\\tan"],
  로그: ["\\log", "\\ln"],
  루트: ["\\sqrt"],
  제곱근: ["\\sqrt"],
  분수: ["\\frac"],
  벡터: ["\\vec", "vector"],
  확률: ["P(", "probability"],
  정규분포: ["N("],
  이항분포: ["B("],
  부등식: ["<", ">", "\\le", "\\ge"],
  이차방정식: ["x^2"],
  원: ["x^2+y^2"],
  집합: ["\\cap", "\\cup"],
  교집합: ["\\cap"],
  합집합: ["\\cup"],
  파이썬: ["python"],
  코드: ["python", "javascript"],
  분자: ["chem"],
  integral: ["\\int", "적분"],
  derivative: ["미분", "\\frac{d"],
  limit: ["\\lim", "극한"],
  matrix: ["행렬", "pmatrix"],
};

export function expand(token: string): string[] {
  const t = token.toLowerCase();
  return [t, ...(SYNONYMS[t] ?? SYNONYMS[token] ?? []).map((s) => s.toLowerCase())];
}

/** 이 기기에서 찾기: 낱말마다 (그대로 2점 · 동의어 1.5점), 쪽 이름도 1점. 하나도 안 맞으면 뺀다 */
export function localSearch(entries: readonly SearchEntry[], query: string): SearchHit[] {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/(?:을|를|이|가|은|는|에서|에|의|했던|한|곳|부분|찾기|어디)$/u, ""))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const e of entries) {
    const hay = e.text.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      const [self, ...syn] = expand(t);
      if (self && hay.includes(self)) score += 2;
      else if (syn.some((s) => hay.includes(s))) score += 1.5;
      if (e.pageTitle.toLowerCase().includes(t.toLowerCase())) score += 1;
    }
    if (score > 0) hits.push({ ...e, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.pageNo - b.pageNo).slice(0, 50);
}

/** 노트의 모든 쪽 → 찾을 항목들 (지금 쪽은 화면의 것 그대로) */
export async function buildIndex(): Promise<SearchEntry[]> {
  const { pages, currentId } = pagesStore.getState();
  const out: SearchEntry[] = [];
  for (const [i, p] of pages.entries()) {
    const items = p.id === currentId ? sessionStore.getState().items : ((await loadItems(itemsKey(p.id))) ?? []);
    for (const it of items) {
      const text = textOf(it)?.replace(/\s+/g, " ").trim();
      if (!text || it.kind !== "object") continue;
      out.push({ pageId: p.id, pageTitle: p.title, pageNo: i + 1, itemId: it.id, label: KIND_LABEL[it.ir.kind] ?? it.ir.kind, text: text.slice(0, 2000), bbox: it.bbox });
    }
  }
  return out;
}

/** AI로 찾기 — 말로 한 질문과 가장 관련된 항목들 (번호로 답하게 해서 없는 것을 지어내지 못하게) */
export async function aiSearch(entries: readonly SearchEntry[], query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const [{ askJson }, { z }] = await Promise.all([import("../ai/client"), import("zod")]);
  const list = entries.slice(0, 150);
  const schema = z.object({ matches: z.array(z.object({ n: z.number().int(), why: z.string() })) });
  const prompt = `Question: ${query}\n\nNotebook items (number | page | kind | content):\n${list.map((e, i) => `${i} | p${e.pageNo} | ${e.label} | ${e.text.slice(0, 180)}`).join("\n")}`;
  const a = await askJson({
    name: "search",
    system: "You help a student find things in their own math/science notebook. Pick up to 6 items most relevant to the question, best first. Only use numbers from the list. \"why\" is a very short Korean reason (under 25 characters).",
    prompt,
    schema,
    ...(signal ? { signal } : {}),
  });
  const seen = new Set<number>();
  return a.matches.flatMap((m, rank) => {
    const e = list[m.n];
    if (!e || seen.has(m.n)) return [];
    seen.add(m.n);
    return [{ ...e, score: 100 - rank, why: m.why.slice(0, 40) }];
  });
}

/** 찾은 곳으로: 그 쪽으로 넘기고, 화면 가운데에 오게 하고, 골라 둔다 */
export async function jumpTo(hit: SearchEntry): Promise<void> {
  const [{ switchPage }, { viewportStore }] = await Promise.all([import("./pageActions"), import("./viewport")]);
  if (pagesStore.getState().currentId !== hit.pageId) await switchPage(hit.pageId);
  const v = viewportStore.getState();
  const k = v.k;
  const cx = (hit.bbox.minX + hit.bbox.maxX) / 2;
  const cy = (hit.bbox.minY + hit.bbox.maxY) / 2;
  const W = typeof window === "undefined" ? 1024 : window.innerWidth;
  const H = typeof window === "undefined" ? 768 : window.innerHeight;
  v.setView({ k, tx: W / 2 - cx * k, ty: H * 0.4 - cy * k });
  if (sessionStore.getState().items.some((i) => i.id === hit.itemId)) sessionStore.getState().setSelection([hit.itemId]);
}
