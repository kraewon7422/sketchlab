import { describe, expect, it } from "vitest";
import type { InkItem } from "../ink/types";
import { A4, paperBounds, relayoutItems, sheetIndexAt, sheetRect, sheetsNeeded, SHEET_GAP, SPREAD_GAP, type Paper } from "./paper";

const paper = (layout: Paper["layout"], sheets = 4): Paper => ({ layout, sheets, w: A4.w, h: A4.h });
const dot = (id: string, x: number, y: number): InkItem => {
  const bbox = { minX: x - 5, minY: y - 5, maxX: x + 5, maxY: y + 5 };
  return { id, kind: "ink", bbox, strokes: [{ id: `${id}s`, points: [{ x, y, p: 0.5, t: 0 }], bbox, endedAt: 0, tool: "pen" }] };
};

describe("쪽 모양 (종이 늘어놓기)", () => {
  it("세로·가로·2쪽·끊김 없이 — 장의 자리", () => {
    expect(sheetRect(paper("vertical"), 2)).toEqual({ x: 0, y: 2 * (A4.h + SHEET_GAP), w: A4.w, h: A4.h });
    expect(sheetRect(paper("horizontal"), 1).x).toBe(A4.w + SHEET_GAP);
    expect(sheetRect(paper("two"), 3)).toEqual({ x: A4.w + SPREAD_GAP, y: A4.h + SHEET_GAP, w: A4.w, h: A4.h });
    expect(sheetRect(paper("continuous"), 2).y).toBe(2 * A4.h);
    expect(paperBounds(paper("two", 3))).toEqual({ x: 0, y: 0, w: A4.w * 2 + SPREAD_GAP, h: 2 * A4.h + SHEET_GAP });
  });

  it("점이 속한 장 (틈에 있으면 가까운 장)", () => {
    const v = paper("vertical");
    expect(sheetIndexAt(v, 100, 100)).toBe(0);
    expect(sheetIndexAt(v, 100, A4.h + SHEET_GAP + 10)).toBe(1);
    expect(sheetIndexAt(v, 100, A4.h + 5)).toBe(0);
    expect(sheetIndexAt(paper("two"), A4.w + 100, 100)).toBe(1);
  });

  it("내용이 3장째까지 있으면 3장 필요", () => {
    expect(sheetsNeeded(paper("vertical", 1), [dot("a", 100, 2 * (A4.h + SHEET_GAP) + 50)])).toBe(3);
    expect(sheetsNeeded(paper("horizontal", 1), [dot("a", A4.w + SHEET_GAP + 20, 50)])).toBe(2);
    expect(sheetsNeeded(paper("two", 1), [dot("a", A4.w + 100, A4.h + SHEET_GAP + 50)])).toBe(4);
    expect(sheetsNeeded(paper("continuous", 1), [])).toBe(1);
  });

  it("세로 → 2쪽 보기: 각 글씨가 자기 장을 따라 옮겨진다 (장 안의 자리는 그대로)", () => {
    const items = [dot("p1", 100, 100), dot("p2", 100, A4.h + SHEET_GAP + 100), dot("p3", 100, 2 * (A4.h + SHEET_GAP) + 100)];
    const out = relayoutItems(items, paper("vertical"), paper("two"));
    const at = (i: number) => out[i]?.bbox;
    expect(at(0)?.minX).toBe(95);
    expect(at(1)).toMatchObject({ minX: A4.w + SPREAD_GAP + 95, minY: 95 });
    expect(at(2)).toMatchObject({ minX: 95, minY: A4.h + SHEET_GAP + 95 });
    // 되돌리면 제자리
    const back = relayoutItems(out, paper("two"), paper("vertical"));
    expect(back.map((b) => b.bbox)).toEqual(items.map((b) => b.bbox));
  });

  it("캔버스에서 바꿀 때는 그대로", () => {
    const items = [dot("a", 300, 300)];
    expect(relayoutItems(items, null, paper("vertical"))[0]?.bbox).toEqual(items[0]?.bbox);
  });
});
