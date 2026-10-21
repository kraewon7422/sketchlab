import type { Point } from "./types";

/**
 * 납작한 펜촉 (캘리그래피 펜) — 펜촉을 일정한 각도의 짧은 선분으로 보고, 펜이 지나간 자리를
 * 표본 사이마다 사각형으로 쓸어 채운다 (평필 sweep, Minkowski 합의 근사).
 *   펜촉과 같은 방향으로 그으면 가늘고, 수직으로 그으면 가장 굵다.
 *   끝은 펜촉 모양 그대로 비스듬히 잘린다 — 둥근 마개(시작 얼룩)가 없다.
 *   필압과 상관없이 굵기는 펜촉 크기 그대로 (떼는 순간 가늘어지지 않는다).
 */

const r2 = (n: number) => Math.round(n * 1000) / 1000;

/** 볼록 껍질 (Andrew monotone chain) — 반시계 방향 */
function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2] as [number, number], lower[lower.length - 1] as [number, number], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Array<[number, number]> = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i] as [number, number];
    while (upper.length >= 2 && cross(upper[upper.length - 2] as [number, number], upper[upper.length - 1] as [number, number], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** centripetal 이 아닌 균일 Catmull-Rom으로 촘촘히 (간격 step) */
function resample(points: readonly Point[], step: number): Array<[number, number]> {
  const n = points.length;
  const P = (i: number) => points[Math.max(0, Math.min(n - 1, i))] as Point;
  const out: Array<[number, number]> = [[P(0).x, P(0).y]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const k = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
    for (let j = 1; j <= k; j++) {
      const t = j / k;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      out.push([x, y]);
    }
  }
  return out;
}

/**
 * 펜촉 자국 path d. width = 펜촉 길이, angle = 펜촉 방향(라디안, 화면 기준), thin = 가장 가늘 때 굵기.
 * 사각형마다 같은 방향으로 감아 nonzero로 칠하면 겹친 곳에 구멍이 생기지 않는다.
 */
export function nibStrokePath(points: readonly Point[], width: number, angle: number, thin: number): string {
  const first = points[0];
  if (!first) return "";
  const hx = (Math.cos(angle) * width) / 2;
  const hy = (Math.sin(angle) * width) / 2;
  // 펜촉에 수직인 아주 얇은 두께 (펜촉 방향으로 그은 획도 보이게)
  const tx = (-Math.sin(angle) * thin) / 2;
  const ty = (Math.cos(angle) * thin) / 2;
  const quad = (ax: number, ay: number, bx: number, by: number): string => {
    // 선분 a→b 를 (두께 있는) 펜촉으로 쓸어 생긴 자리 = 양 끝 펜촉 모서리 8점의 볼록 껍질.
    // 볼록 다각형은 늘 같은 방향으로 감기므로 겹쳐 칠해도(nonzero) 구멍·줄무늬가 생기지 않는다.
    const corners: Array<[number, number]> = [];
    for (const [cx, cy] of [
      [ax, ay],
      [bx, by],
    ] as const)
      for (const sn of [-1, 1]) for (const st of [-1, 1]) corners.push([cx + sn * hx + st * tx, cy + sn * hy + st * ty]);
    const hull = convexHull(corners);
    return `M${hull.map(([x, y]) => `${r2(x)},${r2(y)}`).join("L")}Z`;
  };
  if (points.length === 1) return quad(first.x, first.y, first.x + 0.01, first.y);
  const s = resample(points, Math.max(0.12, width / 30));
  let d = "";
  for (let i = 0; i + 1 < s.length; i++) {
    const [ax, ay] = s[i] as [number, number];
    const [bx, by] = s[i + 1] as [number, number];
    d += quad(ax, ay, bx, by);
  }
  return d;
}
