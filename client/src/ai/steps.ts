import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { z } from "zod";
import type { BBox, CanvasItem, Stroke } from "../ink/types";
import { checkSteps, type StepResult } from "../math/stepCheck";
import { sessionStore } from "../store/session";
import { aiConfigured } from "./settings";

/**
 * 검산 (8단계) — 고른 풀이를 줄마다 확인해 오른쪽에 ✓ / ✗(이유) / ? 를 붙인다 (Undo 1단계로 한꺼번에).
 *
 *   수식 객체·글 상자: 바로 (AI 필요 없음)
 *   손글씨: AI가 줄마다 LaTeX로 읽고 → 앱이 직접 검산한다 (맞고 틀림의 판단은 AI가 아니라 계산으로).
 *           틀리거나 못 읽은 줄에는 AI가 읽은 식도 함께 적어 둔다 (잘못 읽었는지 알 수 있게).
 */

export interface Line {
  latex: string;
  /** 줄의 세로 가운데 (월드 좌표) */
  y: number;
  /** AI가 손글씨에서 읽은 줄 */
  read?: boolean;
}

export type CheckOutcome = { ok: true; summary: string; results: StepResult[] } | { ok: false; message: string };

const COLORS = { ok: "#1E8E3E", bad: "#C5221F", unknown: "#80868B" };

/** 획들을 줄로 묶는다 — 세로로 많이 겹치면 같은 줄 */
export function clusterLines(strokes: readonly Stroke[]): BBox[] {
  const boxes = strokes.filter((s) => s.tool !== "highlighter").map((s) => s.bbox).sort((a, b) => (a.minY + a.maxY) / 2 - (b.minY + b.maxY) / 2);
  const lines: BBox[] = [];
  for (const b of boxes) {
    const last = lines[lines.length - 1];
    const h = b.maxY - b.minY;
    const overlap = last ? Math.min(last.maxY, b.maxY) - Math.max(last.minY, b.minY) : -1;
    // 점·작은 기호(=, −)는 높이가 작다 → 겹침 기준을 작은 쪽 높이로
    if (last && overlap > 0.35 * Math.min(h || 1, last.maxY - last.minY || 1)) {
      last.minX = Math.min(last.minX, b.minX);
      last.maxX = Math.max(last.maxX, b.maxX);
      last.minY = Math.min(last.minY, b.minY);
      last.maxY = Math.max(last.maxY, b.maxY);
    } else lines.push({ ...b });
  }
  return lines;
}

/** 여러 줄 LaTeX (aligned·cases …) → 줄들 */
export function splitLatexLines(latex: string): string[] {
  const m = /^\s*\\begin\{(aligned|align\*?|gathered|cases|array|split)\}(?:\{[^}]*\})?([\s\S]*)\\end\{\1\}\s*$/.exec(latex);
  const body = m ? (m[2] as string) : latex;
  return body
    .split(/\\\\/)
    .map((l) => l.replace(/&/g, "").trim())
    .filter(Boolean);
}

const spread = (box: BBox, n: number, i: number) => box.minY + ((i + 0.5) * (box.maxY - box.minY)) / Math.max(1, n);

/** 고른 것들 → 검산할 줄 (손글씨 제외) + 손글씨 획 */
export function collectLines(items: readonly CanvasItem[]): { lines: Line[]; strokes: Stroke[] } {
  const lines: Line[] = [];
  const strokes: Stroke[] = [];
  for (const it of items) {
    if (it.kind === "ink") {
      strokes.push(...it.strokes);
      continue;
    }
    const ir = it.ir;
    const parts = ir.kind === "formula" ? splitLatexLines(ir.data.latex) : ir.kind === "text" ? ir.data.text.split("\n").map((t) => t.trim()).filter(Boolean) : [];
    parts.forEach((latex, i) => lines.push({ latex, y: spread(it.bbox, parts.length, i) }));
  }
  return { lines, strokes };
}

const Transcript = z.object({
  lines: z.array(z.object({ latex: z.string() })),
});

const SYSTEM = `You read a student's handwritten math working from a tablet notebook.
Transcribe it line by line, top to bottom, exactly as written — do NOT fix mistakes, do NOT solve or simplify.
Each line becomes one LaTeX string without $ signs. Keep a leading "=" if the line starts with one.
Skip words that are not math (like "풀이", "답"). If a line is unreadable, give "".`;

/** 손글씨를 AI로 줄마다 읽는다 */
async function readInk(strokes: Stroke[], signal?: AbortSignal): Promise<Line[]> {
  const [{ askJson }, { strokesToSvg }, { svgToPngDataUrl }] = await Promise.all([import("./client"), import("./inkImage"), import("../export/exportImage")]);
  const svg = strokesToSvg(strokes, 1400);
  if (!svg) return [];
  const image = await svgToPngDataUrl(svg, 1);
  const a = await askJson({ name: "working", system: SYSTEM, prompt: "Transcribe each line of this working.", image, schema: Transcript, ...(signal ? { signal } : {}) });
  const clusters = clusterLines(strokes);
  const all: BBox = clusters.reduce((u, b) => ({ minX: Math.min(u.minX, b.minX), minY: Math.min(u.minY, b.minY), maxX: Math.max(u.maxX, b.maxX), maxY: Math.max(u.maxY, b.maxY) }), clusters[0] ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 });
  const read = a.lines.map((l) => l.latex.trim());
  // 줄 수가 같으면 그 줄 자리에, 다르면 고르게 나눠서
  return read.map((latex, i) => ({ latex, read: true, y: clusters.length === read.length ? ((clusters[i] as BBox).minY + (clusters[i] as BBox).maxY) / 2 : spread(all, read.length, i) }));
}

/** 글 폭 어림 — 한글·한자는 글자 크기만큼, 나머지는 0.58배 */
export function textWidth(s: string, fs: number): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ㄰-㆏가-힯一-鿿✓✗]/.test(ch) ? fs : fs * 0.58;
  return w;
}

/** 폭에 맞춰 띄어쓰기에서 줄을 바꾼다 (글 상자는 스스로 줄을 바꾸지 않는다) */
export function wrapText(text: string, maxWidth: number, fs: number): string {
  return text
    .split("\n")
    .map((para) => {
      const lines: string[] = [];
      let cur = "";
      for (const word of para.split(" ")) {
        const next = cur ? `${cur} ${word}` : word;
        if (cur && textWidth(next, fs) > maxWidth) {
          lines.push(cur);
          cur = word;
        } else cur = next;
      }
      lines.push(cur);
      return lines.join("\n");
    })
    .join("\n");
}

const textIR = (text: string, color: string, width: number, fontSize: number): SceneIR => ({ version: IR_VERSION, confidence: 1, source: "local", kind: "text", data: { text, color, width, fontSize } });

/** 결과 → 표시 객체들 (줄 오른쪽) */
export function marksFor(lines: readonly Line[], results: readonly StepResult[], right: number, screenRight = Infinity): Array<{ ir: SceneIR; transform: { x: number; y: number; scale: number }; bbox: BBox }> {
  const out: Array<{ ir: SceneIR; transform: { x: number; y: number; scale: number }; bbox: BBox }> = [];
  const x = right + 14;
  // 화면 오른쪽 끝까지만 (좁은 폰에서 글이 화면 밖으로 나가지 않게 줄을 바꾼다)
  const maxW = Math.max(140, Math.min(340, screenRight - x - 12));
  results.forEach((r, i) => {
    const line = lines[i];
    if (!line || r.status === "start") return;
    const fs = 17;
    const text = r.status === "ok" ? "✓" : r.status === "bad" ? `✗ ${r.note}` : `? ${r.note}`;
    const full = wrapText(line.read && r.status !== "ok" ? `${text}\n(읽은 식: ${line.latex || "—"})` : text, maxW, fs);
    const rows = full.split("\n");
    const width = Math.min(maxW, Math.max(24, ...rows.map((l) => textWidth(l, fs))));
    const h = rows.length * fs * 1.45;
    // 줄 높이에 맞추되, 앞 표시가 여러 줄로 길면 그 아래로 (겹치지 않게)
    const prev = out[out.length - 1];
    const y = Math.max(line.y - (fs * 1.45) / 2, prev ? prev.bbox.maxY + 2 : -Infinity);
    out.push({ ir: textIR(full, COLORS[r.status], width, r.status === "ok" ? 22 : fs), transform: { x, y, scale: 1 }, bbox: { minX: x, minY: y, maxX: x + width, maxY: y + h } });
  });
  return out;
}

/** 고른 항목들을 검산하고 표시를 붙인다 */
export async function checkSelection(ids: readonly string[], signal?: AbortSignal): Promise<CheckOutcome> {
  const items = sessionStore.getState().items.filter((i) => ids.includes(i.id));
  if (items.length === 0) return { ok: false, message: "검산할 풀이를 올가미로 골라 주세요" };
  const { lines, strokes } = collectLines(items);
  if (strokes.length > 0) {
    if (!aiConfigured()) {
      if (lines.length === 0) return { ok: false, message: "손글씨 풀이는 AI 설정이 있어야 읽을 수 있어요 · 수식·글 상자는 바로 검산돼요" };
    } else {
      try {
        lines.push(...(await readInk(strokes, signal)));
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        return { ok: false, message: e instanceof Error ? e.message : "손글씨를 읽지 못했어요" };
      }
    }
  }
  const usable = lines.filter((l) => l.latex).sort((a, b) => a.y - b.y);
  if (usable.length < 2) return { ok: false, message: usable.length ? "검산하려면 두 줄 이상이 필요해요 (앞 줄과 비교해요)" : "식을 찾지 못했어요" };
  const results = checkSteps(usable.map((l) => l.latex));
  const right = Math.max(...items.map((i) => i.bbox.maxX));
  // 지금 화면의 오른쪽 끝 (월드 좌표) — 오른쪽 도구 막대만큼 비우고
  const { viewportStore } = await import("../store/viewport");
  const v = viewportStore.getState();
  const screenRight = typeof window === "undefined" ? Infinity : (window.innerWidth - (window.innerWidth > 700 ? 64 : 0) - v.tx) / v.k;
  const marks = marksFor(usable, results, right, screenRight);
  if (marks.length) sessionStore.getState().addObjects(marks, "검산");
  const n = (s: StepResult["status"]) => results.filter((r) => r.status === s).length;
  const parts = [`✓ ${n("ok")}`, n("bad") ? `✗ ${n("bad")}` : "", n("unknown") ? `? ${n("unknown")}` : ""].filter(Boolean);
  return { ok: true, summary: `검산: ${parts.join(" · ")}`, results };
}
