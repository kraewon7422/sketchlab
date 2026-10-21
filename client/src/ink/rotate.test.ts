import { IR_VERSION } from "@sketchlab/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { hitItem, itemAabb, rotateItem, rotOf, scaleItem, selectionBox } from "./editing";
import type { InkItem, ObjectItem, Point } from "./types";
import { sessionStore } from "../store/session";
import { copyItems, cutItems, pasteItems, selectionUi } from "../store/selectionUi";

const pt = (x: number, y: number): Point => ({ x, y, p: 0.5, t: 0 });
const ink = (id: string, pts: Point[]): InkItem => {
  const bbox = { minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)) };
  return { id, kind: "ink", strokes: [{ id: `${id}s`, points: pts, bbox, endedAt: 0, tool: "pen" }], bbox };
};
/** 가로 100 × 세로 40 사진 (가운데 150, 120) */
const photo = (id = "p"): ObjectItem => ({
  id,
  kind: "object",
  ir: { version: IR_VERSION, confidence: 1, source: "manual", kind: "image", data: { w: 100, h: 40, src: "data:image/png;base64,AAAA" } },
  bbox: { minX: 100, minY: 100, maxX: 200, maxY: 140 },
  sourceStrokes: [],
  transform: { x: 100, y: 100, scale: 1 },
});
const D = Math.PI / 180;

describe("무엇이든 돌리기", () => {
  it("사진을 제자리에서 90° → 각도만 저장, 자리 상자는 그대로, 차지하는 상자는 세로로 길게", () => {
    const r = rotateItem(photo(), 90 * D, 150, 120);
    expect(rotOf(r)).toBe(90);
    expect(r.bbox).toEqual(photo().bbox);
    const a = itemAabb(r);
    expect(a.minX).toBeCloseTo(130, 6);
    expect(a.maxX).toBeCloseTo(170, 6);
    expect(a.minY).toBeCloseTo(70, 6);
    expect(a.maxY).toBeCloseTo(170, 6);
    expect(selectionBox([r], ["p"])?.maxY).toBeCloseTo(170, 6);
  });

  it("네 번 90° = 한 바퀴 → 각도 없음", () => {
    let r = photo();
    for (let i = 0; i < 4; i++) r = rotateItem(r, 90 * D, 150, 120);
    expect(r.transform.rot).toBeUndefined();
    expect(r.bbox.minX).toBeCloseTo(100, 6);
  });

  it("다른 점을 중심으로 돌리면 자리도 옮겨 간다", () => {
    const r = rotateItem(photo(), 180 * D, 0, 0);
    expect(rotOf(r)).toBe(180);
    expect((r.bbox.minX + r.bbox.maxX) / 2).toBeCloseTo(-150, 6);
    expect((r.bbox.minY + r.bbox.maxY) / 2).toBeCloseTo(-120, 6);
  });

  it("돌린 사진은 돌린 모양 그대로 눌린다", () => {
    const r = rotateItem(photo(), 90 * D, 150, 120);
    expect(hitItem([r], 150, 75, 0)?.id).toBe("p"); // 세워진 위쪽 끝 (원래 상자 밖)
    expect(hitItem([r], 105, 120, 0)).toBeUndefined(); // 원래 왼쪽 끝 (이제는 비었다)
  });

  it("손글씨는 점을 직접 돌린다 (각도를 따로 두지 않는다)", () => {
    const r = rotateItem(ink("i", [pt(0, 0), pt(10, 0)]), 90 * D, 0, 0);
    expect(rotOf(r)).toBe(0);
    expect(r.strokes[0]?.points[1]?.x).toBeCloseTo(0, 6);
    expect(r.strokes[0]?.points[1]?.y).toBeCloseTo(10, 6);
  });

  it("크기를 바꿔도 각도는 남는다", () => {
    const r = scaleItem(rotateItem(photo(), 30 * D, 150, 120), 2, 100, 100);
    expect(rotOf(r)).toBe(30);
  });
});

describe("잘라내기·복사·붙여넣기 (앱 안)", () => {
  beforeEach(() => {
    sessionStore.setState({ items: [photo("a"), ink("b", [pt(0, 0), pt(5, 5)])], selection: [] });
    selectionUi.setState({ clipboard: [], chip: null });
  });

  it("복사 → 붙여넣기: 새 id로 들어오고 골라진다, 원본은 그대로", () => {
    expect(copyItems(["a"])).toBe(1);
    expect(pasteItems({ x: 500, y: 600 })).toBe(1);
    const s = sessionStore.getState();
    expect(s.items).toHaveLength(3);
    const pasted = s.items.find((i) => s.selection.includes(i.id));
    expect(pasted?.id).not.toBe("a");
    expect(pasted?.bbox.minX).toBe(500);
    expect(pasted?.bbox.minY).toBe(600);
  });

  it("잘라내기 = 복사 + 지우기, 되돌리기 한 번에 원래대로", () => {
    expect(cutItems(["b"])).toBe(1);
    expect(sessionStore.getState().items.map((i) => i.id)).toEqual(["a"]);
    sessionStore.getState().undo();
    expect(sessionStore.getState().items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(selectionUi.getState().clipboard).toHaveLength(1);
  });

  it("돌리기도 Undo 1단계", () => {
    const base = sessionStore.getState().items;
    sessionStore.getState().previewRotate(["a"], 45 * D, 150, 120, base);
    sessionStore.getState().commitRotate(["a"], 45 * D, 150, 120, base);
    const a = sessionStore.getState().items.find((i) => i.id === "a");
    expect(a && rotOf(a)).toBe(45);
    sessionStore.getState().undo();
    const back = sessionStore.getState().items.find((i) => i.id === "a");
    expect(back && rotOf(back)).toBe(0);
  });
});
