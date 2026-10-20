import { IR_VERSION, SceneIRSchema, type SceneIR } from "@sketchlab/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Stroke } from "../ink/types";
import { sessionStore } from "../store/session";

// AI는 흉내 낸다 — 문제 4개 중 하나는 답이 틀렸다 (앱이 걸러야 한다)
vi.mock("./client", () => ({
  askJson: vi.fn(async () => ({
    problems: [
      { question: "3x-5=10", questionIsLatex: true, answer: "x=5" },
      { question: "2x+7=1", questionIsLatex: true, answer: "x=4" },
      { question: "x^2-5x+6=0", questionIsLatex: true, answer: "x=2, x=3" },
      { question: "사과 3개와 배 2개의 값은?", questionIsLatex: false, answer: "1200" },
    ],
  })),
}));

const formula = (latex: string): SceneIR => ({ version: IR_VERSION, kind: "formula", source: "manual", confidence: 1, data: { latex, evaluate: false } });
const add = (latex: string, y: number) => sessionStore.getState().addObject(formula(latex), { x: 0, y, scale: 200 }, { minX: 0, minY: y, maxX: 200, maxY: y + 40 });
const texts = () => sessionStore.getState().items.flatMap((i) => (i.kind === "object" && i.ir.kind === "text" ? [i.ir.data] : []));

describe("검산 (선택 → ✓/✗ 표시)", () => {
  beforeEach(() => sessionStore.getState().hydrate([]));

  it("수식 객체 세 줄: 두 번째 줄 실수 → ✗ 하나, 이유는 해", async () => {
    const { checkSelection } = await import("./steps");
    const ids = [add("2x+3=7", 0), add("2x=10", 60), add("x=5", 120)];
    const r = await checkSelection(ids);
    expect(r.ok && r.summary).toBe("검산: ✓ 1 · ✗ 1");
    const marks = texts();
    expect(marks).toHaveLength(2);
    expect(marks[0]?.text).toMatch(/^✗ .*x\s=\s2/);
    expect(marks[0]?.color).toBe("#C5221F");
    expect(marks[1]?.text).toBe("✓");
    // 표시는 줄 오른쪽에, 한 번에 되돌린다
    sessionStore.getState().undo();
    expect(texts()).toHaveLength(0);
  });

  it("여러 줄 수식(aligned)도 줄마다", async () => {
    const { checkSelection } = await import("./steps");
    const r = await checkSelection([add("\\begin{aligned}(x+1)^2&=x^2+2x+1\\\\&=x(x+2)+1\\end{aligned}", 0)]);
    expect(r.ok).toBe(true);
    expect(texts().every((t) => t.text === "✓")).toBe(true);
  });

  it("손글씨만 있고 AI 설정이 없으면 알려 준다", async () => {
    const { checkSelection } = await import("./steps");
    const stroke: Stroke = { id: "s", points: [{ x: 0, y: 0, t: 0, p: 0.5 }, { x: 10, y: 10, t: 1, p: 0.5 }] as Stroke["points"], bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, endedAt: 0, tool: "pen" };
    sessionStore.getState().hydrate([{ id: "ink1", kind: "ink", strokes: [stroke], bbox: stroke.bbox }]);
    const r = await checkSelection(["ink1"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("AI 설정");
  });

  it("손글씨 줄 묶기: 같은 높이의 획은 한 줄", async () => {
    const { clusterLines } = await import("./steps");
    const s = (y: number, h: number, x = 0): Stroke => ({ id: `${x},${y}`, points: [], bbox: { minX: x, minY: y, maxX: x + 10, maxY: y + h }, endedAt: 0, tool: "pen" });
    // 첫 줄: 글자 + '=' (낮은 획), 둘째 줄
    expect(clusterLines([s(0, 30), s(12, 4, 20), s(2, 28, 40), s(60, 30), s(62, 26, 30)])).toHaveLength(2);
  });
});

describe("표시 글 줄바꿈", () => {
  it("폭을 넘으면 띄어쓰기에서 줄을 바꾸고, 한글은 넓게 잰다", async () => {
    const { textWidth, wrapText } = await import("./steps");
    expect(textWidth("가나", 10)).toBe(20);
    expect(textWidth("ab", 10)).toBeCloseTo(11.6);
    const w = wrapText("✗ 앞 줄의 해 x = 2가 이 줄에서 성립하지 않아요", 140, 17);
    expect(w.split("\n").length).toBeGreaterThan(1);
    for (const l of w.split("\n")) expect(textWidth(l, 17)).toBeLessThanOrEqual(140);
  });
});

describe("비슷한 문제", () => {
  beforeEach(() => sessionStore.getState().hydrate([]));

  it("틀린 AI 답은 빼고, 말로 된 문제는 '확인 안 됨', 답마다 테이프", async () => {
    const { makePractice } = await import("./practice");
    const r = await makePractice([add("2x+1=9", 0)]);
    expect(r.ok && r.summary).toBe("문제 3개를 만들었어요 · 답 확인 2개 · 틀린 답이 나온 1개는 뺐어요");
    const objs = sessionStore.getState().items.filter((i) => i.kind === "object");
    const kinds = objs.map((o) => (o.kind === "object" ? o.ir.kind : ""));
    expect(kinds.filter((k) => k === "tape")).toHaveLength(3);
    expect(texts().some((t) => t.text === "답 (AI · 확인 안 됨)")).toBe(true);
    expect(JSON.stringify(objs)).not.toContain("2x+7=1");
    for (const o of objs) if (o.kind === "object") expect(SceneIRSchema.safeParse(o.ir).success).toBe(true);
    // 한 번에 되돌린다 (예시 문제만 남는다)
    sessionStore.getState().undo();
    expect(sessionStore.getState().items).toHaveLength(1);
  });
});
