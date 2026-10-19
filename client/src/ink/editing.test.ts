import { IR_VERSION } from "@sketchlab/shared";
import { describe, expect, it } from "vitest";
import { cloneItem, hitItem, itemsInLasso, pointInPolygon, selectionBox, translateItem } from "./editing";
import type { InkItem, ObjectItem, Point, Stroke } from "./types";

const pt = (x: number, y: number): Point => ({ x, y, p: 0.5, t: 0 });
const stroke = (pts: Point[]): Stroke => ({
  id: "s1",
  points: pts,
  bbox: { minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)) },
  endedAt: 0,
  tool: "pen",
});
const ink = (id: string, pts: Point[]): InkItem => {
  const s = stroke(pts);
  return { id, kind: "ink", strokes: [s], bbox: s.bbox };
};
const graph = (id: string, x: number, y: number): ObjectItem => ({
  id,
  kind: "object",
  ir: { version: IR_VERSION, confidence: 1, source: "manual", kind: "formula", data: { latex: "x", evaluate: false } },
  bbox: { minX: x, minY: y, maxX: x + 100, maxY: y + 50 },
  sourceStrokes: [],
  transform: { x, y, scale: 100 },
});

describe("옮기기·복제", () => {
  it("잉크: 모든 점과 상자가 함께 움직인다", () => {
    const m = translateItem(ink("a", [pt(0, 0), pt(10, 5)]), 20, -3);
    expect(m.strokes[0]?.points.map((p) => [p.x, p.y])).toEqual([
      [20, -3],
      [30, 2],
    ]);
    expect(m.bbox).toEqual({ minX: 20, minY: -3, maxX: 30, maxY: 2 });
  });

  it("객체: 놓인 자리·상자가 움직인다", () => {
    const m = translateItem(graph("g", 100, 100), 5, 7);
    expect(m.transform).toMatchObject({ x: 105, y: 107, scale: 100 });
    expect(m.bbox.minX).toBe(105);
  });

  it("복제는 새 id, 원본은 그대로", () => {
    let n = 0;
    const src = ink("a", [pt(0, 0), pt(10, 10)]);
    const c = cloneItem(src, (p) => `${p}-${++n}`, 24, 24);
    expect(c.id).not.toBe(src.id);
    expect(c.strokes[0]?.id).not.toBe(src.strokes[0]?.id);
    expect(c.bbox.minX).toBe(24);
    expect(src.bbox.minX).toBe(0);
  });
});

describe("올가미", () => {
  const square = [pt(0, 0), pt(100, 0), pt(100, 100), pt(0, 100)];

  it("점이 안인지 밖인지", () => {
    expect(pointInPolygon(50, 50, square)).toBe(true);
    expect(pointInPolygon(150, 50, square)).toBe(false);
  });

  it("잉크는 절반 이상 안에 있어야, 객체는 가운데가 안에 있어야 잡힌다", () => {
    const items = [
      ink("in", [pt(10, 10), pt(40, 40)]),
      ink("half-out", [pt(90, 50), pt(200, 50), pt(300, 50)]),
      graph("g-in", 20, 20), // 가운데 (70, 45)
      graph("g-out", 80, 80), // 가운데 (130, 105)
    ];
    expect(itemsInLasso(items, square)).toEqual(["in", "g-in"]);
  });

  it("올가미가 너무 작으면(점 2개) 아무것도 안 잡는다", () => {
    expect(itemsInLasso([ink("a", [pt(1, 1)])], [pt(0, 0), pt(5, 5)])).toEqual([]);
  });
});

describe("톡 쳐서 고르기", () => {
  it("획 위를 누르면 그 묶음, 글씨 사이 빈 곳은 아무것도", () => {
    const items = [ink("L", [pt(0, 0), pt(0, 100)])];
    expect(hitItem(items, 3, 50, 8)?.id).toBe("L");
    expect(hitItem(items, 40, 50, 8)).toBeUndefined();
  });

  it("겹치면 위에 있는 것(나중 것)", () => {
    const items = [graph("under", 0, 0), graph("over", 10, 10)];
    expect(hitItem(items, 50, 30, 4)?.id).toBe("over");
  });

  it("여러 개를 감싸는 상자", () => {
    const items = [graph("a", 0, 0), graph("b", 200, 300)];
    expect(selectionBox(items, ["a", "b"])).toEqual({ minX: 0, minY: 0, maxX: 300, maxY: 350 });
    expect(selectionBox(items, [])).toBeNull();
  });
});
