import { IR_VERSION } from "@sketchlab/shared";
import { describe, expect, it } from "vitest";
import { hitItem, itemsInLasso, itemsTouchedByLasso, scaleItem } from "./editing";
import { buildFreeTape, buildTape, onTape, tapeBox, TAPE_MIN_LEN } from "./tape";
import type { InkItem, ObjectItem, Point } from "./types";

const pt = (x: number, y: number): Point => ({ x, y, p: 0.5, t: 0 });
const ink = (id: string, pts: Point[]): InkItem => {
  const bbox = { minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)) };
  return { id, kind: "ink", strokes: [{ id: `${id}s`, points: pts, bbox, endedAt: 0, tool: "pen", width: 2 }], bbox };
};
const tapeItem = (id: string, a: { x: number; y: number }, b: { x: number; y: number }): ObjectItem => {
  const t = buildTape(a, b, 30, "#F2C94C");
  if (!t) throw new Error("too short");
  return { id, kind: "object", ir: { version: IR_VERSION, confidence: 1, source: "manual", kind: "tape", data: t.data }, transform: t.transform, bbox: t.bbox, sourceStrokes: [] };
};

describe("마스킹 테이프 기하", () => {
  it("가로로 끈 테이프: 상자 = 길이 × 폭", () => {
    const t = buildTape({ x: 100, y: 100 }, { x: 300, y: 103 }, 30, "#F2C94C");
    expect(t?.data.angle).toBe(0); // 거의 가로면 반듯하게
    expect(t?.bbox.minX).toBeCloseTo(100);
    expect(t?.bbox.maxX).toBeCloseTo(100 + Math.hypot(200, 3));
    expect(t?.bbox.minY).toBeCloseTo(85);
    expect(t?.bbox.maxY).toBeCloseTo(115);
  });

  it("너무 짧게 끌면 붙이지 않는다 (톡)", () => {
    expect(buildTape({ x: 0, y: 0 }, { x: TAPE_MIN_LEN - 1, y: 0 }, 30, "#000000")).toBeNull();
  });

  it("비스듬한 테이프는 몸통 위만 닿는다 (상자 구석은 아님)", () => {
    const t = buildTape({ x: 0, y: 0 }, { x: 200, y: 200 }, 20, "#000000");
    if (!t) throw new Error("null");
    expect(t.data.angle).toBeCloseTo(Math.PI / 4);
    expect(onTape(t.data, t.transform, 100, 100)).toBe(true);
    expect(onTape(t.data, t.transform, 190, 10)).toBe(false); // 상자 안이지만 테이프 밖
    const box = tapeBox(t.data, t.transform);
    expect(box.minX).toBeLessThan(0);
    expect(box.maxX).toBeGreaterThan(200);
  });

  it("톡 판정: 테이프 몸통만, 크기를 바꾸면 테이프도 같이 커진다", () => {
    const tape = tapeItem("t", { x: 0, y: 0 }, { x: 200, y: 200 });
    expect(hitItem([tape], 100, 100, 2)?.id).toBe("t");
    expect(hitItem([tape], 190, 10, 2)).toBeUndefined();
    const big = scaleItem(tape, 2, 0, 0);
    if (big.kind !== "object" || big.ir.kind !== "tape") throw new Error("kind");
    expect(onTape(big.ir.data, big.transform, 380, 380)).toBe(true);
    expect(big.bbox.maxX).toBeCloseTo(tape.bbox.maxX * 2);
  });
});

describe("올가미 두 가지", () => {
  const a = ink("a", [pt(100, 100), pt(140, 100)]);
  const b = ink("b", [pt(300, 100), pt(340, 100)]);
  const far = ink("far", [pt(600, 600), pt(640, 600)]);
  const items = [a, b, far];

  it("삼성식: 그은 선이 지나간(닿은) 것을 고른다 — 고리로 감싸지 않아도", () => {
    // a와 b를 세로로 가로지르는 열린 선 두 개를 이은 지그재그 (닫히지 않음)
    const path = [pt(120, 60), pt(120, 140), pt(320, 60), pt(320, 140)];
    expect(itemsTouchedByLasso(items, path, 6).sort()).toEqual(["a", "b"]);
  });

  it("곧게 한 번 그은 선: 삼성식은 닿은 것 모두, 애플식은 감싼 게 없어 아무것도", () => {
    const swipe = [pt(50, 101), pt(200, 100), pt(400, 99)];
    expect(itemsTouchedByLasso(items, swipe, 6).sort()).toEqual(["a", "b"]);
    expect(itemsInLasso(items, swipe)).toEqual([]);
  });

  it("삼성식: 빨리 그어 점 사이가 멀어도 사이에 있는 획이 잡힌다", () => {
    const path = [pt(120, 0), pt(120, 400)];
    expect(itemsTouchedByLasso(items, path, 6)).toEqual(["a"]);
  });

  it("삼성식: 감싼 것도 고른다, 잠근 것은 못 고른다", () => {
    const loop = [pt(80, 80), pt(360, 80), pt(360, 120), pt(80, 120)];
    expect(itemsTouchedByLasso(items, loop, 6).sort()).toEqual(["a", "b"]);
    expect(itemsTouchedByLasso([{ ...a, locked: true }], loop, 6)).toEqual([]);
  });

  it("삼성식: 테이프는 몸통을 지나야 잡힌다", () => {
    const tape = tapeItem("t", { x: 0, y: 0 }, { x: 200, y: 200 });
    expect(itemsTouchedByLasso([tape], [pt(90, 110), pt(110, 90)], 4)).toEqual(["t"]);
    expect(itemsTouchedByLasso([tape], [pt(185, 5), pt(195, 15)], 4)).toEqual([]);
  });
});

describe("자유 테이프 (그은 길을 따라)", () => {
  // ㄱ자로 그은 테이프: (100,100) → (300,100) → (300,300), 폭 20
  const path = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 300, y: 100 },
    { x: 300, y: 200 },
    { x: 300, y: 300 },
  ];
  const t = buildFreeTape(path, 20, "#F2C94C", "dots");

  it("상자 = 그은 길 + 폭의 절반, 무늬·색 그대로", () => {
    expect(t).not.toBeNull();
    if (!t) return;
    expect(t.bbox).toEqual({ minX: 90, minY: 90, maxX: 310, maxY: 310 });
    expect(t.data.pattern).toBe("dots");
    expect(t.data.pts?.[0]).toEqual([0, 0]);
  });

  it("띠 위만 닿는다 (ㄱ자 안쪽 빈 곳은 아님)", () => {
    if (!t) return;
    expect(onTape(t.data, t.transform, 200, 105)).toBe(true);
    expect(onTape(t.data, t.transform, 295, 250)).toBe(true);
    expect(onTape(t.data, t.transform, 200, 200)).toBe(false); // 상자 안이지만 띠 밖
    expect(tapeBox(t.data, t.transform)).toEqual(t.bbox);
  });

  it("크기를 바꾸면 길과 폭이 같이 커진다", () => {
    if (!t) return;
    const big = { ...t.transform, scale: 2 };
    // 가로 부분 (200,100) → 2배 자리 (300,100): 폭 40이라 15 아래는 띠 안, 25 아래는 밖
    expect(onTape(t.data, big, 300, 115)).toBe(true);
    expect(onTape(t.data, big, 300, 125)).toBe(false);
  });

  it("너무 짧게 그으면 붙이지 않는다 (톡)", () => {
    expect(buildFreeTape([{ x: 0, y: 0 }, { x: TAPE_MIN_LEN - 2, y: 0 }], 20, "#000000")).toBeNull();
  });
});
