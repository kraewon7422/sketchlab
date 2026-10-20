import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { z } from "zod";
import type { BBox, CanvasItem, Stroke } from "../ink/types";
import { buildTape } from "../ink/tape";
import { verifyAnswer } from "../math/stepCheck";
import { penStore } from "../store/pen";
import { sessionStore } from "../store/session";
import { freeSpot } from "../ui/placement";
import { textWidth, wrapText } from "./steps";

/**
 * 비슷한 문제 만들기 (8단계) — 고른 문제와 같은 유형·난이도의 새 문제를 AI가 만들고,
 * 답은 앱이 직접 확인한다 (방정식은 해를 수치로 찾아 비교, 계산 문제는 값 비교).
 * 확인해서 틀린 답이 나온 문제는 빼고, 확인할 수 없는 답에는 "AI 답 · 확인 안 됨"을 붙인다.
 * 답은 마스킹 테이프 아래에 — 톡 치면 벗겨진다.
 */

const Problems = z.object({
  problems: z.array(
    z.object({
      /** 문제 (수식이면 LaTeX, 말로 된 문제면 글) */
      question: z.string(),
      questionIsLatex: z.boolean(),
      /** 최종 답 (LaTeX). 방정식이면 "x = 2, x = -3" 꼴 */
      answer: z.string(),
    }),
  ),
});
export type PracticeProblem = z.infer<typeof Problems>["problems"][number];

const SYSTEM = `You are a math teacher for Korean high-school students, inside a notebook app.
Given one example problem (as LaTeX/text, or as a handwriting image), write NEW practice problems of the same type and difficulty with different numbers.
Rules:
- Each problem must have exactly one correct final answer. Prefer integer or simple fraction answers.
- If the problem is an equation, put just the equation in "question" (LaTeX, e.g. "2x^2-3x-2=0") and all real solutions in "answer" as "x = 2, x = -\\frac{1}{2}".
- If it is a calculation, put the expression in "question" and its exact value in "answer".
- If it is a word problem, write the question in Korean in "question" with questionIsLatex=false.
- "answer" is LaTeX without $ signs. Do not explain.`;

export type PracticeOutcome = { ok: true; summary: string } | { ok: false; message: string };

/** 고른 것 → 예시 문제 (글로 · 또는 손글씨 그림) */
function exampleOf(items: readonly CanvasItem[]): { text: string; strokes: Stroke[] } {
  const text: string[] = [];
  const strokes: Stroke[] = [];
  for (const it of [...items].sort((a, b) => a.bbox.minY - b.bbox.minY)) {
    if (it.kind === "ink") strokes.push(...it.strokes);
    else if (it.ir.kind === "formula") text.push(it.ir.data.latex);
    else if (it.ir.kind === "text") text.push(it.ir.data.text);
  }
  return { text: text.join("\n"), strokes };
}

/** 답을 확인한다 (말로 된 문제는 확인할 수 없다) */
export function judge(p: PracticeProblem): boolean | null {
  return p.questionIsLatex ? verifyAnswer(p.question, p.answer) : null;
}

export async function makePractice(ids: readonly string[], count = 3, signal?: AbortSignal): Promise<PracticeOutcome> {
  const items = sessionStore.getState().items.filter((i) => ids.includes(i.id));
  const ex = exampleOf(items);
  if (!ex.text && ex.strokes.length === 0) return { ok: false, message: "예시 문제(수식·글·손글씨)를 골라 주세요" };
  const [{ askJson }, katex, { measureKatex }] = await Promise.all([import("./client"), import("katex").then((m) => m.default), import("../math/measure")]);
  let image: string | undefined;
  if (ex.strokes.length) {
    const [{ strokesToSvg }, { svgToPngDataUrl }] = await Promise.all([import("./inkImage"), import("../export/exportImage")]);
    const svg = strokesToSvg(ex.strokes, 1200);
    if (svg) image = await svgToPngDataUrl(svg, 1);
  }
  let res: z.infer<typeof Problems>;
  try {
    res = await askJson({
      name: "practice",
      system: SYSTEM,
      prompt: `Example problem:\n${ex.text || "(see the handwriting image)"}\n\nWrite ${count + 1} new problems.`,
      schema: Problems,
      ...(image ? { image } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false, message: e instanceof Error ? e.message : "문제를 만들지 못했어요" };
  }

  // 답 확인: 틀린 것은 빼고, 하나 더 받은 것으로 채운다
  const judged = res.problems.filter((p) => p.question.trim() && p.answer.trim()).map((p) => ({ p, ok: judge(p) }));
  const wrong = judged.filter((j) => j.ok === false).length;
  const keep = judged.filter((j) => j.ok !== false).slice(0, count);
  if (keep.length === 0) return { ok: false, message: wrong ? "AI가 만든 답이 모두 틀려서 넣지 않았어요 · 다시 해 보세요" : "문제를 만들지 못했어요" };

  // 놓기: 고른 것 아래 빈 곳에 "비슷한 문제" + 문제마다 (번호 · 문제 · 답 위에 테이프)
  const sel = items.reduce<BBox>((u, i) => ({ minX: Math.min(u.minX, i.bbox.minX), minY: Math.min(u.minY, i.bbox.minY), maxX: Math.max(u.maxX, i.bbox.maxX), maxY: Math.max(u.maxY, i.bbox.maxY) }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  const W = Math.max(360, Math.min(560, (typeof window === "undefined" ? 1024 : window.innerWidth) - 80));
  const rows = keep.map(({ p, ok }) => {
    // 말로 된 문제는 폭에 맞춰 줄을 바꿔 넣는다 (글 상자는 스스로 줄을 바꾸지 않는다)
    const wrapped = p.questionIsLatex ? p.question : wrapText(p.question, W - 40, 16);
    if (!p.questionIsLatex) p.question = wrapped;
    const q = p.questionIsLatex ? measureKatex(katex, p.question, 20, true) : { width: Math.min(W - 30, Math.max(...wrapped.split("\n").map((l) => textWidth(l, 16)))), height: wrapped.split("\n").length * 24 };
    const a = measureKatex(katex, p.answer, 18, false);
    return { p, ok, q: { width: Math.min(q.width, W - 30), height: q.height }, a: { width: Math.min(a.width + 8, W - 60), height: Math.max(a.height, 28) } };
  });
  const H = 34 + rows.reduce((s, r) => s + r.q.height + r.a.height + 30, 0);
  const spot = freeSpot(W, H, { x: sel.minX - 8, y: sel.maxY + 8, width: Math.max(W + 32, sel.maxX - sel.minX + 32), height: 20000 });

  const meta = { version: IR_VERSION, confidence: 0.8, source: "vlm" } as const;
  const out: Array<{ ir: SceneIR; transform: { x: number; y: number; scale: number }; bbox: BBox }> = [];
  const text = (t: string, x: number, y: number, w: number, h: number, color = "#5F6368", fontSize = 15) =>
    out.push({ ir: { ...meta, kind: "text", data: { text: t, width: w, fontSize, color } }, transform: { x, y, scale: 1 }, bbox: { minX: x, minY: y, maxX: x + w, maxY: y + h } });
  let y = spot.y;
  text("비슷한 문제 (AI) · 답은 테이프를 톡 치면 보여요", spot.x, y, W, 24);
  y += 34;
  const { tapeColor } = penStore.getState();
  rows.forEach((r, i) => {
    const x = spot.x;
    text(`${i + 1}.`, x, y + 2, 26, 26, "#202124", 17);
    if (r.p.questionIsLatex) out.push({ ir: { ...meta, kind: "formula", data: { latex: r.p.question, evaluate: false } }, transform: { x: x + 28, y, scale: r.q.width }, bbox: { minX: x + 28, minY: y, maxX: x + 28 + r.q.width, maxY: y + r.q.height } });
    else text(r.p.question, x + 28, y, r.q.width, r.q.height, "#202124", 16);
    y += r.q.height + 6;
    text(r.ok ? "답" : "답 (AI · 확인 안 됨)", x + 28, y + 4, r.ok ? 26 : 130, 22, r.ok ? "#1E8E3E" : "#B06000", 13);
    const ax = x + 28 + (r.ok ? 30 : 134);
    out.push({ ir: { ...meta, kind: "formula", data: { latex: r.p.answer, evaluate: false, fontSize: 18, inline: true } }, transform: { x: ax, y, scale: r.a.width }, bbox: { minX: ax, minY: y, maxX: ax + r.a.width, maxY: y + r.a.height } });
    const tape = buildTape({ x: ax - 8, y: y + r.a.height / 2 }, { x: ax + r.a.width + 8, y: y + r.a.height / 2 }, r.a.height + 10, tapeColor, "stripes");
    if (tape) out.push({ ir: { ...meta, kind: "tape", data: tape.data }, transform: tape.transform, bbox: tape.bbox });
    y += r.a.height + 24;
  });
  sessionStore.getState().addObjects(out, "비슷한 문제");
  const checked = rows.filter((r) => r.ok).length;
  return { ok: true, summary: `문제 ${rows.length}개를 만들었어요 · 답 확인 ${checked}개${wrong ? ` · 틀린 답이 나온 ${wrong}개는 뺐어요` : ""}` };
}
