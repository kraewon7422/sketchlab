import { beforeEach, describe, expect, it } from "vitest";
import type { InkItem, Point } from "../ink/types";
import { snapShape } from "../ink/holdShape";
import { __resetSession, createStroke, sessionStore } from "./session";

const s = () => sessionStore.getState();
const pts = (x: number, y: number): Point[] => [
  { x, y, p: 0.5, t: 0 },
  { x: x + 20, y, p: 0.5, t: 8 },
];
const strokes = () => s().items.flatMap((i) => (i.kind === "ink" ? (i as InkItem).strokes : []));

describe("스타일 변경 도구", () => {
  beforeEach(() => __resetSession());

  it("펜 끝이 스친 획만 고른 굵기·색으로, 같은 동작은 Undo 한 번", () => {
    s().addStroke(createStroke(pts(0, 0), 1000, { tool: "pen", color: "#000000", width: 2 }));
    s().addStroke(createStroke(pts(0, 200), 99000, { tool: "pen", color: "#000000", width: 2 }));
    const g = "style-1";
    expect(s().restyleAt(10, 0, 4, "#D2B49A", 12, g)).toBe(1);
    expect(s().restyleAt(12, 0, 4, "#D2B49A", 12, g)).toBe(0); // 이미 바뀐 획
    const [a, b] = strokes();
    expect([a?.color, a?.width]).toEqual(["#D2B49A", 12]);
    expect([b?.color, b?.width]).toEqual(["#000000", 2]);
    s().undo();
    expect(strokes()[0]?.color).toBe("#000000");
  });
});

describe("스타일 변경: 멈춰서 반듯해진 도형도 닿지 않으면 그대로", () => {
  beforeEach(() => __resetSession());
  it("멀리 쓸면 원·선 도형은 바뀌지 않는다", () => {
    const circle = Array.from({ length: 81 }, (_, i) => {
      const a = (i / 80) * Math.PI * 2;
      return { x: 900 + 90 * Math.cos(a), y: 520 + 83 * Math.sin(a), p: 0.5, t: i * 8 };
    });
    const line = Array.from({ length: 41 }, (_, k) => ({ x: 760 + k * 7, y: 720 + Math.sin(k) * 4 + k * 0.3, p: 0.5, t: k * 8 }));
    for (const raw of [circle, line]) {
      const snapped = snapShape(raw);
      expect(snapped).not.toBeNull();
      s().addStroke(createStroke(snapped!.points, 1000, { tool: "pen", color: "#A35A2E", width: 3.25 }));
    }
    let changed = 0;
    for (let y = 80; y <= 700; y += 6) changed += s().restyleAt(345, y, 9, "#3E8B7B", 4.25, "far");
    expect(changed).toBe(0);
    expect(strokes().every((x) => x.color === "#A35A2E")).toBe(true);
  });
});

describe("지우개: 형광펜만 · 테이프만", () => {
  beforeEach(() => __resetSession());

  it("형광펜만 지우기를 켜면 펜 글씨는 남는다", () => {
    s().addStroke(createStroke(pts(0, 0), 1000, { tool: "pen", color: "#000000", width: 2 }));
    s().addStroke(createStroke(pts(0, 2), 1100, { tool: "highlighter", color: "#FACC15", width: 18 }));
    expect(s().eraseAt(10, 1, 6, "stroke", "e1", { highlight: true, tape: false })).toBe(1);
    expect(strokes().map((x) => x.tool)).toEqual(["pen"]);
  });
  it("테이프만 지우기를 켜면 손글씨는 하나도 지우지 않는다", () => {
    s().addStroke(createStroke(pts(0, 0), 1000, { tool: "pen", color: "#000000", width: 2 }));
    expect(s().eraseAt(10, 0, 6, "stroke", "e2", { highlight: false, tape: true })).toBe(0);
    expect(strokes()).toHaveLength(1);
  });
});
