/**
 * Tier 0 기하 유틸 — 재표본화·꺾임각·직선/원 맞춤 (마스터스펙 v4 §9.1).
 *
 * 순수 함수만 둔다. DOM·React·스토어를 모른다 — 전부 단위 테스트 대상.
 * 입력 좌표의 단위는 상관없다(월드 px). 판정 임계값은 전부 "도형 크기 대비 비율"이라
 * 크게 그리든 작게 그리든 같은 결과가 나와야 한다.
 */

export interface V {
  x: number;
  y: number;
}

/** 배열 접근 — noUncheckedIndexedAccess 아래서 "있어야 하는 값"이 없으면 즉시 알린다. */
export function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`index ${i} out of range (${arr.length})`);
  return v;
}

export function mod(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export function dist(a: V, b: V): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pathLength(pts: readonly V[], closed = false): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(at(pts, i - 1), at(pts, i));
  if (closed && pts.length > 1) len += dist(at(pts, pts.length - 1), at(pts, 0));
  return len;
}

/**
 * 호 길이 기준 균등 재표본화.
 *
 * 저장된 획은 RDP로 단순화돼 있어 직선 구간엔 점이 거의 없다. 꺾임각을 "점 개수"가 아니라
 * "둘레 대비 길이" 창으로 재려면 점이 균등하게 깔려 있어야 한다.
 * closed면 마지막→처음 구간까지 포함해 고리 전체를 n등분한다 (시작점 중복 없음).
 */
export function resample(pts: readonly V[], n: number, closed: boolean): V[] {
  if (pts.length === 0) return [];
  const loop = closed ? [...pts, at(pts, 0)] : [...pts];
  const total = pathLength(loop);
  if (total === 0) return Array.from({ length: n }, () => ({ ...at(pts, 0) }));

  const step = closed ? total / n : total / (n - 1);
  const out: V[] = [{ ...at(loop, 0) }];
  let acc = 0; // 현재 구간 시작까지 누적 길이
  let target = step;
  let seg = 1;

  while (out.length < n && seg < loop.length) {
    const a = at(loop, seg - 1);
    const b = at(loop, seg);
    const len = dist(a, b);
    if (acc + len >= target && len > 0) {
      const t = (target - acc) / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      target += step;
    } else {
      acc += len;
      seg++;
    }
  }
  // 부동소수 오차로 마지막 점이 빠지면 원본 끝점으로 채운다.
  while (out.length < n) out.push({ ...at(loop, closed ? loop.length - 2 : loop.length - 1) });
  return out;
}

/**
 * 각 점에서의 꺾임각(도). 0 = 직진, 180 = 되돌아감.
 * 앞뒤로 k칸 떨어진 점을 써서 손떨림에 둔감하게 잰다.
 * 열린 획은 양 끝 k칸은 잴 수 없으므로 0.
 */
export function turningAngles(pts: readonly V[], k: number, closed: boolean): number[] {
  const n = pts.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (!closed && (i < k || i > n - 1 - k)) continue;
    const a = at(pts, mod(i - k, n));
    const b = at(pts, i);
    const c = at(pts, mod(i + k, n));
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const vx = c.x - b.x;
    const vy = c.y - b.y;
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (lu === 0 || lv === 0) continue;
    const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)));
    out[i] = (Math.acos(cos) * 180) / Math.PI;
  }
  return out;
}

/** 임계값을 넘는 꺾임의 국소 최댓값. 서로 window 칸 안에 붙은 후보는 큰 것만 남긴다. */
export function findCorners(
  angles: readonly number[],
  thresholdDeg: number,
  window: number,
  closed: boolean,
): number[] {
  const n = angles.length;
  const candidates = angles
    .map((a, i) => ({ a, i }))
    .filter((c) => c.a >= thresholdDeg)
    .sort((p, q) => q.a - p.a);

  const picked: number[] = [];
  for (const c of candidates) {
    const near = picked.some((p) => {
      const d = Math.abs(p - c.i);
      return (closed ? Math.min(d, n - d) : d) <= window;
    });
    if (!near) picked.push(c.i);
  }
  return picked.sort((p, q) => p - q);
}

export interface LineFit {
  /** 중심 */
  c: V;
  /** 단위 방향 */
  d: V;
  /** 맞춘 직선에서 가장 먼 점까지의 수직 거리 */
  maxDev: number;
}

/** 전최소제곱(PCA) 직선 맞춤. 세로선에서도 기울기가 발산하지 않는다. */
export function fitLine(pts: readonly V[]): LineFit | null {
  if (pts.length < 2) return null;
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx + syy === 0) return null;

  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const d = { x: Math.cos(theta), y: Math.sin(theta) };
  let maxDev = 0;
  for (const p of pts) {
    const dev = Math.abs((p.x - cx) * d.y - (p.y - cy) * d.x);
    if (dev > maxDev) maxDev = dev;
  }
  return { c: { x: cx, y: cy }, d, maxDev };
}

/** 점을 직선 위로 정사영 */
export function projectOnLine(p: V, line: LineFit): V {
  const t = (p.x - line.c.x) * line.d.x + (p.y - line.c.y) * line.d.y;
  return { x: line.c.x + line.d.x * t, y: line.c.y + line.d.y * t };
}

/** 두 직선의 교점. 거의 평행이면 null */
export function intersectLines(l1: LineFit, l2: LineFit): V | null {
  const cross = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
  if (Math.abs(cross) < 1e-6) return null;
  const dx = l2.c.x - l1.c.x;
  const dy = l2.c.y - l1.c.y;
  const t = (dx * l2.d.y - dy * l2.d.x) / cross;
  return { x: l1.c.x + l1.d.x * t, y: l1.c.y + l1.d.y * t };
}

export interface CircleFit {
  c: V;
  r: number;
  /** 중심거리의 표준편차 / 평균 — 0이면 완벽한 원 */
  residual: number;
}

/**
 * Kåsa 대수적 원 맞춤: x²+y²+Dx+Ey+F=0 의 최소제곱 해.
 * 3×3 정규방정식을 크라메르로 푼다. 점이 일직선이면 행렬이 특이 → null.
 * 수치 안정성을 위해 무게중심을 원점으로 옮긴 뒤 푼다.
 */
export function fitCircle(pts: readonly V[]): CircleFit | null {
  const n = pts.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sxz = 0;
  let syz = 0;
  let sz = 0;
  for (const p of pts) {
    const x = p.x - mx;
    const y = p.y - my;
    const z = x * x + y * y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sxz += x * z;
    syz += y * z;
    sz += z;
  }
  // 중심화했으므로 Σx = Σy = 0 → 방정식이 2×2 + F 로 분리된다.
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-9) return null;
  const D = (-sxz * syy + syz * sxy) / det;
  const E = (-syz * sxx + sxz * sxy) / det;
  const F = -sz / n;

  const cx = -D / 2;
  const cy = -E / 2;
  const r2 = cx * cx + cy * cy - F;
  if (!(r2 > 0)) return null;

  const c = { x: cx + mx, y: cy + my };
  const ds = pts.map((p) => dist(p, c));
  const mean = ds.reduce((s, d) => s + d, 0) / n;
  const variance = ds.reduce((s, d) => s + (d - mean) ** 2, 0) / n;
  return { c, r: mean, residual: mean > 0 ? Math.sqrt(variance) / mean : Infinity };
}

/** (-π, π] 로 정규화 */
export function normAngle(a: number): number {
  let x = a;
  while (x <= -Math.PI) x += 2 * Math.PI;
  while (x > Math.PI) x -= 2 * Math.PI;
  return x;
}

/** 다각형 부호 넓이 (양수 = 수학 좌표계 반시계 = 화면(y아래) 시계) */
export function polygonArea(pts: readonly V[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = at(pts, i);
    const b = at(pts, mod(i + 1, pts.length));
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** 꼭짓점 i에서의 내각(도) */
export function interiorAngle(pts: readonly V[], i: number): number {
  const n = pts.length;
  const p = at(pts, mod(i - 1, n));
  const q = at(pts, i);
  const r = at(pts, mod(i + 1, n));
  const ux = p.x - q.x;
  const uy = p.y - q.y;
  const vx = r.x - q.x;
  const vy = r.y - q.y;
  const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

export function unit(a: V, b: V): V {
  const l = dist(a, b);
  return l === 0 ? { x: 0, y: 0 } : { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
}
