import type { BBox, Point } from "./types";

/**
 * 순수 기하 유틸. DOM도 React도 모른다 — 전부 단위 테스트 대상이다.
 *
 * 이 파일이 틀리면 그룹핑·지우개·히트 테스트가 조용히 어긋난다.
 * "대충 맞는" 값을 돌려주지 않도록 경계 조건(빈 배열, 길이 0인 선분)을 명시적으로 처리한다.
 */

export const EMPTY_BBOX: BBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/** 화면 이동·확대 상태: 화면 = 월드 × k + (tx, ty) */
export interface View {
  tx: number;
  ty: number;
  k: number;
}

export const IDENTITY_VIEW: View = { tx: 0, ty: 0, k: 1 };

/** 화면 좌표 → 월드 좌표 (팬·줌 반영) */
export function toWorld(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top">, view: View = IDENTITY_VIEW): { x: number; y: number } {
  return { x: (clientX - rect.left - view.tx) / view.k, y: (clientY - rect.top - view.ty) / view.k };
}

/**
 * (sx, sy) 화면 점을 고정한 채 확대 배율을 k로 — 핀치·Ctrl+휠의 공통 계산.
 * 손가락 사이(또는 커서) 아래의 그림이 제자리에 머문다.
 */
export function zoomAbout(view: View, sx: number, sy: number, k: number, min: number, max: number): View {
  const nk = Math.min(max, Math.max(min, k));
  const wx = (sx - view.tx) / view.k;
  const wy = (sy - view.ty) / view.k;
  return { k: nk, tx: sx - wx * nk, ty: sy - wy * nk };
}

export function bboxOfPoints(points: readonly Point[]): BBox {
  const first = points[0];
  if (!first) return EMPTY_BBOX;

  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    if (!pt) continue;
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  return { minX, minY, maxX, maxY };
}

export function unionBBox(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function unionBBoxes(boxes: readonly BBox[]): BBox {
  const first = boxes[0];
  if (!first) return EMPTY_BBOX;
  let acc = first;
  for (let i = 1; i < boxes.length; i++) {
    const box = boxes[i];
    if (box) acc = unionBBox(acc, box);
  }
  return acc;
}

/**
 * 경계 상자를 비율만큼 부풀린다.
 *
 * 폭이나 높이가 0인 상자(수직선·수평선·점)도 실제로 자주 생긴다.
 * 비율만 쓰면 그런 상자는 아무리 부풀려도 0이라 교차 판정이 항상 실패한다.
 * 그래서 최소 절대값(minPad)을 함께 준다.
 */
export function inflateBBox(box: BBox, ratio: number, minPad = 0): BBox {
  const padX = Math.max((box.maxX - box.minX) * ratio, minPad);
  const padY = Math.max((box.maxY - box.minY) * ratio, minPad);
  return {
    minX: box.minX - padX,
    minY: box.minY - padY,
    maxX: box.maxX + padX,
    maxY: box.maxY + padY,
  };
}

/** 경계가 닿기만 해도 교차로 본다. */
export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

export function bboxContainsPoint(box: BBox, x: number, y: number): boolean {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * 점에서 선분까지의 최단 거리.
 *
 * 길이 0인 선분(같은 점이 두 번 들어온 경우)은 실제로 발생한다 —
 * 손을 멈춘 채 펜을 대고 있으면 같은 좌표가 연속으로 들어온다.
 * 그때 0으로 나누지 않도록 먼저 처리한다.
 */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return distance(px, py, ax, ay);

  // 선분 위로의 정사영 위치를 [0,1]로 자른다.
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;

  return distance(px, py, ax + t * dx, ay + t * dy);
}

/** 폴리라인까지의 최단 거리. 점이 하나뿐이면 그 점까지의 거리. */
export function distanceToPolyline(px: number, py: number, points: readonly Point[]): number {
  const first = points[0];
  if (!first) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return distance(px, py, first.x, first.y);

  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const d = distanceToSegment(px, py, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return best;
}

/**
 * 다각형의 부호 있는 넓이 (양수 = 반시계 방향).
 *
 * 획 외곽선을 그릴 때 모든 서브패스의 감김 방향을 통일하는 데 쓴다.
 * 방향이 섞이면 fill-rule:nonzero 에서 겹친 부분이 서로 상쇄돼 구멍이 뚫린다.
 */
export function signedArea(pts: readonly { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (!a || !b) continue;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}
