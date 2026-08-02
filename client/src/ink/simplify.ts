import type { Point } from "./types";

/**
 * Ramer-Douglas-Peucker 폴리라인 단순화.
 *
 * 포인터 이벤트는 1~2px 간격으로 쏟아지므로 그대로 그리면 path 데이터가 비대해지고
 * 리렌더가 느려진다. 사람 눈에 차이가 없는 점을 걷어낸다.
 *
 * ⚠️ 원본은 절대 건드리지 않는다 (§12.4). 여기서 나온 결과는 "그리기용"이고,
 *    인식(Tier 0/1)과 되돌리기는 항상 원본 points를 쓴다.
 *
 * 재귀가 아니라 명시적 스택으로 구현한 이유: 획이 아주 길면(빠른 필기 수천 점)
 * 최악의 경우 재귀 깊이가 점 개수만큼 깊어져 스택이 터질 수 있다.
 */
export function simplifyRDP(points: readonly Point[], epsilon: number): Point[] {
  if (points.length <= 2 || epsilon <= 0) return [...points];

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const range = stack.pop();
    if (!range) break;
    const [startIdx, endIdx] = range;
    if (endIdx <= startIdx + 1) continue;

    const start = points[startIdx];
    const end = points[endIdx];
    if (!start || !end) continue;

    let worstIdx = -1;
    let worstDist = -1;

    for (let i = startIdx + 1; i < endIdx; i++) {
      const p = points[i];
      if (!p) continue;
      const d = perpendicularDistance(p, start, end);
      if (d > worstDist) {
        worstDist = d;
        worstIdx = i;
      }
    }

    if (worstDist > epsilon && worstIdx > 0) {
      keep[worstIdx] = 1;
      stack.push([startIdx, worstIdx], [worstIdx, endIdx]);
    }
  }

  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (keep[i] === 1 && p) out.push(p);
  }
  return out;
}

/**
 * 점에서 직선 start-end 까지의 수직 거리.
 *
 * distanceToSegment 와 달리 선분이 아니라 무한직선 기준이다 —
 * RDP는 "이 구간을 직선으로 대체했을 때의 오차"를 재는 것이므로 이쪽이 맞다.
 * start와 end가 같은 점이면 직선이 정의되지 않으므로 점 사이 거리로 폴백한다.
 */
function perpendicularDistance(p: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return Math.hypot(p.x - start.x, p.y - start.y);

  const cross = Math.abs(dx * (start.y - p.y) - (start.x - p.x) * dy);
  return cross / Math.sqrt(lenSq);
}
