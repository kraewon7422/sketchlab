import type { Point } from "./types";

/**
 * 직선 자동 보정 (삼성노트 "직선 자동 보정") — 거의 곧게 그은 획을 손을 뗄 때 곧은 선으로.
 * 곡선·글씨는 건드리지 않는다: 시작점–끝점 직선에서 가장 멀리 벗어난 거리가
 * 직선 길이의 4%(최소 3px) 안이고, 그은 길이가 직선 길이의 1.15배 안일 때만.
 * 필압은 그은 순서대로 그대로 옮긴다 (붓·만년필의 굵기 변화가 남게).
 */
export function straightenStroke(points: readonly Point[], minLength = 20): Point[] | null {
  const a = points[0];
  const b = points[points.length - 1];
  if (!a || !b || points.length < 2) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const chord = Math.hypot(dx, dy);
  if (chord < minLength) return null;

  let pathLen = 0;
  let worst = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as Point;
    if (i > 0) {
      const q = points[i - 1] as Point;
      pathLen += Math.hypot(p.x - q.x, p.y - q.y);
    }
    worst = Math.max(worst, Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / chord);
  }
  if (worst > Math.max(3, chord * 0.04) || pathLen > chord * 1.15) return null;

  const n = Math.max(2, Math.min(80, Math.round(chord / 6)));
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    // 그은 획의 같은 비율 지점의 필압·시각
    const src = points[Math.min(points.length - 1, Math.round(t * (points.length - 1)))] as Point;
    return { x: a.x + dx * t, y: a.y + dy * t, p: src.p, t: src.t };
  });
}
