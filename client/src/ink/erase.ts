import type { Point } from "./types";

/**
 * 영역 지우기 — 지우개 원이 지나간 부분만 획에서 잘라낸다 (삼성노트의 "영역 지우기").
 *
 * 저장된 획은 RDP로 솎은 점이라 긴 직선 구간에는 중간 점이 없다. 그래서 점만 보면
 * 원이 선 한가운데를 지나가도 못 지운다 → 선분과 원의 교점을 직접 구해 자른다.
 *
 * 결과: 남은 조각들의 점 목록 (원 밖 부분). 조각이 없으면 [] (획 전체가 지워짐).
 * 하나도 안 닿았으면 null (그대로 두라는 뜻 — 새 획을 만들 필요 없음).
 */
export function cutStroke(points: readonly Point[], cx: number, cy: number, r: number): Point[][] | null {
  if (points.length === 0) return null;
  const inside = (p: Point) => (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r;

  if (points.length === 1) {
    return inside(points[0] as Point) ? [] : null;
  }

  const pieces: Point[][] = [];
  let cur: Point[] = [];
  let touched = false;
  const lerp = (a: Point, b: Point, t: number): Point => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    p: a.p + (b.p - a.p) * t,
    t: a.t + (b.t - a.t) * t,
  });

  const first = points[0] as Point;
  if (inside(first)) touched = true;
  else cur.push(first);

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    // 선분 a + t(b−a) 와 원의 교점 t (0..1)
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const fx = a.x - cx;
    const fy = a.y - cy;
    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - r * r;
    const disc = B * B - 4 * A * C;
    let t1 = 2;
    let t2 = -1;
    if (A > 0 && disc > 0) {
      const sq = Math.sqrt(disc);
      t1 = (-B - sq) / (2 * A);
      t2 = (-B + sq) / (2 * A);
    }
    const aIn = inside(a);
    const bIn = inside(b);

    if (!aIn && !bIn && t1 > 0 && t1 < 1 && t2 > 0 && t2 < 1) {
      // 원이 선분 한가운데를 가로지름: 들어가는 곳에서 끊고 나오는 곳에서 새로 시작
      touched = true;
      cur.push(lerp(a, b, t1));
      pieces.push(cur);
      cur = [lerp(a, b, t2), b];
      continue;
    }
    if (!aIn && bIn) {
      touched = true;
      cur.push(lerp(a, b, Math.min(1, Math.max(0, t1))));
      pieces.push(cur);
      cur = [];
      continue;
    }
    if (aIn && !bIn) {
      touched = true;
      cur = [lerp(a, b, Math.min(1, Math.max(0, t2))), b];
      continue;
    }
    if (aIn && bIn) {
      touched = true;
      continue;
    }
    cur.push(b);
  }
  if (cur.length > 0) pieces.push(cur);
  if (!touched) return null;
  // 지우개 가장자리에 남은 티끌(길이 0.5px 미만)은 버린다
  return pieces.filter((pc) => pc.length >= 2 && pathLength(pc) >= 0.5);
}

function pathLength(pts: readonly Point[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Point;
    const b = pts[i] as Point;
    L += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return L;
}
