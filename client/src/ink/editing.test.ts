import { IR_VERSION } from "@sketchlab/shared";
import { describe, expect, it } from "vitest";
import { canRecolor, canTransformFreely, cloneItem, hitItem, itemsInLasso, pointInPolygon, recolorItem, rotationAbout, scaleAbout, scaleItem, selectionBox, transformItem, translateItem } from "./editing";
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

describe("다시 칠하기", () => {
  it("손글씨: 색과 굵기, 형광펜은 색만", () => {
    const a = ink("a", [pt(0, 0), pt(10, 0)]);
    const withHl = { ...a, strokes: [...a.strokes, { ...a.strokes[0]!, id: "h", tool: "highlighter" as const, width: 18 }] };
    const r = recolorItem(withHl, "#DC2626", 5);
    expect(r.strokes.map((s) => [s.color, s.width])).toEqual([
      ["#DC2626", 5],
      ["#DC2626", 18],
    ]);
  });

  it("수식·그래프는 다시 칠하지 않는다", () => {
    const g = graph("g", 0, 0);
    expect(canRecolor(g)).toBe(false);
    expect(recolorItem(g, "#DC2626", undefined)).toBe(g);
  });
});

describe("크기 바꾸기", () => {
  it("손글씨: 고정점 기준으로 점·굵기가 함께 커진다", () => {
    const a = ink("a", [pt(10, 10), pt(30, 10)]);
    const r = scaleItem(a, 2, 10, 10);
    expect(r.strokes[0]?.points.map((p) => [p.x, p.y])).toEqual([
      [10, 10],
      [50, 10],
    ]);
    expect(r.strokes[0]?.width).toBeCloseTo(5.2);
    expect(r.bbox).toEqual({ minX: 10, minY: 10, maxX: 50, maxY: 10 });
  });

  it("수식: 글자 크기가 커지고 모양(한 줄/가운데)은 그대로", () => {
    const g = graph("f", 100, 100); // formula, fontSize 없음 = 가운데 정렬 모양
    const r = scaleItem(g, 1.5, 100, 100);
    expect(r.ir).toMatchObject({ kind: "formula", data: { fontSize: 33, inline: false } });
    expect(r.transform).toMatchObject({ x: 100, y: 100, scale: 100 });
    expect(r.bbox).toEqual({ minX: 100, minY: 100, maxX: 250, maxY: 175 });
  });

  it("그래프·구조식 등은 transform.scale이 커진다", () => {
    const plot = { ...graph("p", 0, 0), ir: { version: "4.0", confidence: 1, source: "manual", kind: "chem", data: { smiles: "C", style: "skeletal", aromaticCircle: false } } } as ObjectItem;
    const r = scaleItem(plot, 0.5, 0, 0);
    expect(r.transform.scale).toBe(50);
  });

  it("글 상자: 글자 크기·폭·글 속 px 크기까지", () => {
    const t = { ...graph("t", 0, 0), ir: { version: "4.0", confidence: 1, source: "manual", kind: "text", data: { text: "a", html: '<span style="font-size:24px">a</span>', width: 200 } } } as ObjectItem;
    const r = scaleItem(t, 2, 0, 0);
    expect(r.ir).toMatchObject({ data: { fontSize: 40, width: 400, html: '<span style="font-size:48px">a</span>' } });
  });
});

describe("돌리기·늘이기 (선택 상자 손잡이)", () => {
  const shape = (data: object): ObjectItem =>
    ({ ...graph("s", 0, 0), ir: { version: "4.0", confidence: 1, source: "manual", kind: "shape2d", data }, transform: { x: 100, y: 100, scale: 1 } }) as ObjectItem;

  it("손글씨를 90° 돌린다 (중심 기준)", () => {
    const a = ink("a", [pt(0, 0), pt(10, 0)]);
    const r = transformItem(a, rotationAbout(Math.PI / 2, 5, 0));
    const [p0, p1] = r.strokes[0]?.points ?? [];
    expect(p0?.x).toBeCloseTo(5);
    expect(p0?.y).toBeCloseTo(-5);
    expect(p1?.y).toBeCloseTo(5);
  });

  it("원을 가로로 2배 늘이면 진짜 타원", () => {
    const c = shape({ primitives: [{ t: "circle", c: [20, 20], r: 20 }] });
    const r = transformItem(c, scaleAbout(2, 1, 100, 100));
    const p = r.ir.kind === "shape2d" ? r.ir.data.primitives[0] : undefined;
    expect(p?.t).toBe("ellipse");
    if (p?.t !== "ellipse") return;
    expect(Math.max(p.rx, p.ry)).toBeCloseTo(40);
    expect(Math.min(p.rx, p.ry)).toBeCloseTo(20);
    expect(r.bbox.maxX - r.bbox.minX).toBeCloseTo(80, 0);
  });

  it("직선을 돌리면 정확한 직선 그대로 (새 자리 상자)", () => {
    const l = shape({ primitives: [{ t: "line", a: [0, 0], b: [100, 0] }] });
    const r = transformItem(l, rotationAbout(Math.PI / 2, 150, 100));
    expect(r.ir.kind === "shape2d" && r.ir.data.primitives[0]?.t).toBe("line");
    expect(r.bbox.maxY - r.bbox.minY).toBeCloseTo(100);
    expect(r.bbox.maxX - r.bbox.minX).toBeCloseTo(0);
  });

  it("포물선은 베지어 제어점까지 같이 돈다", () => {
    const pb = shape({ primitives: [{ t: "parabola", p0: [0, 0], c: [50, 100], p1: [100, 0] }] });
    const r = transformItem(pb, rotationAbout(Math.PI, 150, 100));
    const p = r.ir.kind === "shape2d" ? r.ir.data.primitives[0] : undefined;
    expect(p?.t).toBe("parabola");
    // 180° 돌리면 꼭짓점 쪽 제어점이 위로 간다
    if (p?.t === "parabola") expect(p.c[1]).toBeLessThan(p.p0[1]);
  });

  it("한쪽으로 늘여 직각이 아니게 되면 직각 표시를 뗀다", () => {
    const s45 = Math.SQRT1_2;
    const tri = shape({ primitives: [{ t: "polygon", pts: [[0, 0], [50, 50], [100, 0]], closed: true }], marks: [{ t: "rightAngle", at: [50, 50], dirs: [[-s45, -s45], [s45, -s45]] }] });
    const r = transformItem(tri, scaleAbout(2, 1, 100, 100));
    expect(r.ir.kind === "shape2d" && r.ir.data.marks).toEqual([]);
  });

  it("그래프·수식은 돌리지 않는다", () => {
    const g = graph("g", 0, 0);
    expect(canTransformFreely(g)).toBe(false);
    expect(transformItem(g, rotationAbout(1, 0, 0))).toBe(g);
  });
});
