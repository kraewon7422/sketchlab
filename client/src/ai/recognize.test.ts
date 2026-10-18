import { describe, expect, it } from "vitest";
import type { InkItem, Stroke } from "../ink/types";
import { strokesToSvg } from "./inkImage";
import { HandwritingAnswer, toObject } from "./recognize";

const stroke = (x0: number, y0: number, x1: number, y1: number, extra: Partial<Stroke> = {}): Stroke => ({
  id: `s${x0}${y0}`,
  points: [
    { x: x0, y: y0, p: 0.5, t: 0 },
    { x: x1, y: y1, p: 0.5, t: 10 },
  ],
  bbox: { minX: Math.min(x0, x1), minY: Math.min(y0, y1), maxX: Math.max(x0, x1), maxY: Math.max(y0, y1) },
  endedAt: 0,
  tool: "pen",
  ...extra,
});
const ink = (strokes: Stroke[]): InkItem => ({
  id: "ink-1",
  kind: "ink",
  strokes,
  bbox: {
    minX: Math.min(...strokes.map((s) => s.bbox.minX)),
    minY: Math.min(...strokes.map((s) => s.bbox.minY)),
    maxX: Math.max(...strokes.map((s) => s.bbox.maxX)),
    maxY: Math.max(...strokes.map((s) => s.bbox.maxY)),
  },
});
const answer = (a: Partial<HandwritingAnswer>): HandwritingAnswer => ({ kind: "unknown", written: "", text: "", latex: "", molecule: "", smiles: "", ce: "", ...a });

describe("손글씨 → AI에 보낼 그림", () => {
  it("형광펜은 빼고, 작은 글씨는 키운다", () => {
    const r = strokesToSvg([stroke(10, 10, 40, 20), stroke(0, 0, 200, 0, { tool: "highlighter", width: 18 })]);
    expect(r).not.toBeNull();
    expect(Math.min(r?.width ?? 0, r?.height ?? 0)).toBeGreaterThanOrEqual(160);
    expect(r?.svg.match(/<path/g)).toHaveLength(1);
  });
  it("형광펜뿐이면 보낼 그림이 없다", () => {
    expect(strokesToSvg([stroke(0, 0, 100, 0, { tool: "highlighter" })])).toBeNull();
  });
});

describe("AI 답 → 객체", () => {
  const item = ink([stroke(100, 100, 300, 140, { color: "#2563EB" })]);

  it("글자: 손글씨 크기와 색 그대로", async () => {
    const p = await toObject(answer({ kind: "text", text: "안녕하세요", written: "안녕하세요" }), item);
    expect(p?.ir.kind).toBe("text");
    if (p?.ir.kind !== "text") return;
    expect(p.ir.data.text).toBe("안녕하세요");
    expect(p.ir.data.color).toBe("#2563EB");
    expect(p.ir.data.fontSize).toBeGreaterThanOrEqual(14);
    expect(p.transform).toMatchObject({ x: 100, y: 100 });
  });

  it("수식", async () => {
    const p = await toObject(answer({ kind: "math", latex: String.raw`\int_0^1 x^2\,dx` }), item);
    expect(p?.ir).toMatchObject({ kind: "formula", data: { latex: String.raw`\int_0^1 x^2\,dx` } });
  });

  it("그래프: y=… 이면 교과서 그래프", async () => {
    const p = await toObject(answer({ kind: "graph", latex: "y=x^2-1" }), item);
    expect(p?.ir.kind).toBe("plot2d");
    expect(p?.ir.source).toBe("vlm");
  });

  it("그래프로 못 그리는 식은 수식으로", async () => {
    const p = await toObject(answer({ kind: "graph", latex: String.raw`\sum_{k=1}^{n} k` }), item);
    expect(p?.ir.kind).toBe("formula");
  });

  it("반응식", async () => {
    const p = await toObject(answer({ kind: "reaction", ce: "2H2 + O2 -> 2H2O" }), item);
    expect(p?.ir).toMatchObject({ kind: "chemEq", data: { ce: "2H2 + O2 -> 2H2O" } });
  });

  it("알아보지 못함", async () => {
    expect(await toObject(answer({ kind: "unknown" }), item)).toBeNull();
  });
});
