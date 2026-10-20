import { translateItem } from "../ink/editing";
import type { CanvasItem } from "../ink/types";

/**
 * 쪽 모양 (삼성노트 "페이지 설정") — 한 쪽을 종이 여러 장으로 보여 주는 방법.
 *   캔버스      끝없는 판 (예전 그대로 · 기본)
 *   세로로      A4 종이를 위아래로 이어 넘기기
 *   가로로      A4 종이를 옆으로 이어 넘기기
 *   2쪽 보기    펼친 책처럼 두 장씩, 위아래로
 *   끊김 없이   종이 폭은 정해져 있고 아래로 끝없이 (장 사이 틈·경계 없음)
 * 모두 하나의 월드 좌표 안에 종이를 늘어놓은 것이라, 그리기·고르기·지우기는 그대로 쓴다 (순수 함수).
 */
export type Layout = "canvas" | "vertical" | "horizontal" | "two" | "continuous";

export const LAYOUTS: Array<[Layout, string]> = [
  ["canvas", "캔버스"],
  ["vertical", "세로 넘김"],
  ["horizontal", "가로 넘김"],
  ["two", "2쪽 보기"],
  ["continuous", "끊김 없이"],
];

/** A4 세로 (96dpi px) */
export const A4 = { w: 794, h: 1123 } as const;
/** 장 사이 틈 · 펼친 두 장 사이 틈 */
export const SHEET_GAP = 48;
export const SPREAD_GAP = 12;

export interface Paper {
  layout: Exclude<Layout, "canvas">;
  sheets: number;
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function sheetRect(p: Paper, i: number): Rect {
  switch (p.layout) {
    case "vertical":
      return { x: 0, y: i * (p.h + SHEET_GAP), w: p.w, h: p.h };
    case "horizontal":
      return { x: i * (p.w + SHEET_GAP), y: 0, w: p.w, h: p.h };
    case "two":
      return { x: (i % 2) * (p.w + SPREAD_GAP), y: Math.floor(i / 2) * (p.h + SHEET_GAP), w: p.w, h: p.h };
    case "continuous":
      return { x: 0, y: i * p.h, w: p.w, h: p.h };
  }
}

/** 모든 장을 감싸는 사각형 */
export function paperBounds(p: Paper): Rect {
  const last = sheetRect(p, p.sheets - 1);
  const w = p.layout === "two" && p.sheets > 1 ? p.w * 2 + SPREAD_GAP : last.x + last.w;
  return { x: 0, y: 0, w, h: last.y + last.h };
}

/** (x, y)가 속한(가장 가까운) 장 번호 */
export function sheetIndexAt(p: Paper, x: number, y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < p.sheets; i++) {
    const r = sheetRect(p, i);
    const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
    const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** 내용이 들어가려면 몇 장이 있어야 하나 (진행 방향으로 가장 먼 것 기준) */
export function sheetsNeeded(p: Paper, items: readonly CanvasItem[]): number {
  let need = 1;
  for (const it of items) {
    const b = it.bbox;
    let i: number;
    switch (p.layout) {
      case "horizontal":
        i = Math.floor(b.maxX / (p.w + SHEET_GAP));
        break;
      case "two":
        i = Math.floor(b.maxY / (p.h + SHEET_GAP)) * 2 + (b.maxX > p.w + SPREAD_GAP / 2 ? 1 : 0);
        break;
      case "continuous":
        i = Math.floor(b.maxY / p.h);
        break;
      default:
        i = Math.floor(b.maxY / (p.h + SHEET_GAP));
    }
    need = Math.max(need, i + 1);
  }
  return need;
}

/**
 * 쪽 모양을 바꿀 때: 각 항목은 (가운데가 놓인) 자기 장을 따라 새 자리로 옮긴다.
 * 캔버스에서 바꿀 때는 그대로 둔다 (첫 장의 왼쪽 위가 원점).
 */
export function relayoutItems(items: readonly CanvasItem[], from: Paper | null, to: Paper): CanvasItem[] {
  if (!from) return [...items];
  return items.map((it) => {
    const cx = (it.bbox.minX + it.bbox.maxX) / 2;
    const cy = (it.bbox.minY + it.bbox.maxY) / 2;
    const i = sheetIndexAt(from, cx, cy);
    const a = sheetRect(from, i);
    const b = sheetRect(to, i);
    return translateItem(it, b.x - a.x, b.y - a.y);
  });
}
