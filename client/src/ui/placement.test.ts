import { IR_VERSION } from "@sketchlab/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { ObjectItem } from "../ink/types";
import { sessionStore } from "../store/session";
import { viewportStore } from "../store/viewport";
import { freeSpot } from "./placement";

const box = (id: string, x: number, y: number, w: number, h: number): ObjectItem => ({
  id,
  kind: "object",
  ir: { version: IR_VERSION, confidence: 1, source: "manual", kind: "formula", data: { latex: "x", evaluate: false } },
  bbox: { minX: x, minY: y, maxX: x + w, maxY: y + h },
  sourceStrokes: [],
  transform: { x, y, scale: w },
});
const area = { x: 0, y: 0, width: 800, height: 600 };
const overlaps = (a: { minX: number; minY: number; maxX: number; maxY: number }, x: number, y: number, w: number, h: number) => x < a.maxX && x + w > a.minX && y < a.maxY && y + h > a.minY;

describe("새 객체 자리 — 겹치지 않게", () => {
  beforeEach(() => {
    viewportStore.getState().setView({ tx: 0, ty: 0, k: 1 });
  });

  it("빈 화면: 왼쪽 위", () => {
    sessionStore.setState({ items: [] });
    const p = freeSpot(300, 200, area);
    expect(p.y).toBeLessThan(100);
  });

  it("옆에 자리가 있으면 옆에", () => {
    sessionStore.setState({ items: [box("a", 24, 24, 300, 500)] });
    const p = freeSpot(300, 200, area);
    expect(p.x).toBeGreaterThan(324);
    expect(overlaps(sessionStore.getState().items[0]!.bbox, p.x, p.y, 300, 200)).toBe(false);
  });

  it("화면이 꽉 찼으면 맨 아래 것 밑에 놓고, 화면을 그쪽으로 내린다", () => {
    sessionStore.setState({ items: [box("a", 24, 24, 760, 400), box("b", 24, 440, 760, 500)] });
    const p = freeSpot(300, 200, area);
    for (const it of sessionStore.getState().items) expect(overlaps(it.bbox, p.x, p.y, 300, 200)).toBe(false);
    expect(p.y).toBeGreaterThanOrEqual(940);
    // 새 자리가 보이게 화면이 내려갔다 (requestAnimationFrame이 없으면 바로)
    const v = viewportStore.getState();
    expect(-v.ty / v.k).toBeGreaterThan(800);
  });
});
