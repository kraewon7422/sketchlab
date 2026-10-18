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

// ─────────────────────────────────────────────────────────── 곡선 (v2: 포물선·타원·매끈한 곡선)

export interface ParabolaFit {
  /** 회전된 좌표계 (u 축 방향 각도) — v = a·u² + b·u + c */
  theta: number;
  a: number;
  b: number;
  c: number;
  /** 회전 좌표계 원점 (무게중심) */
  origin: V;
  /** 획 처음·끝의 u */
  u0: number;
  u1: number;
  /** 평균제곱근 오차 (px) */
  rms: number;
}

function solve3(m: number[][], r: number[]): [number, number, number] | null {
  const det = (q: number[][]) =>
    (q[0]![0]! * (q[1]![1]! * q[2]![2]! - q[1]![2]! * q[2]![1]!) -
      q[0]![1]! * (q[1]![0]! * q[2]![2]! - q[1]![2]! * q[2]![0]!) +
      q[0]![2]! * (q[1]![0]! * q[2]![1]! - q[1]![1]! * q[2]![0]!));
  const D = det(m);
  if (Math.abs(D) < 1e-12) return null;
  const col = (k: number) => m.map((row, i) => row.map((v, j) => (j === k ? r[i]! : v)));
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}

/**
 * 회전을 허용하는 포물선 맞춤. 각도를 훑으면서 각 방향에서 v = a·u² + b·u + c 최소제곱을 풀고
 * 오차가 가장 작은 방향을 고른다 (u가 획을 따라 단조여야 그 방향의 함수 그래프로 볼 수 있다).
 */
export function fitParabola(pts: readonly V[]): ParabolaFit | null {
  const n = pts.length;
  if (n < 5) return null;
  const origin = { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };

  const tryTheta = (theta: number): ParabolaFit | null => {
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const us: number[] = [];
    const vs: number[] = [];
    for (const p of pts) {
      const x = p.x - origin.x;
      const y = p.y - origin.y;
      us.push(x * cos + y * sin);
      vs.push(-x * sin + y * cos);
    }
    const u0 = at(us, 0);
    const u1 = at(us, n - 1);
    const span = Math.max(...us) - Math.min(...us);
    if (span <= 0) return null;
    const dir = Math.sign(u1 - u0);
    if (dir === 0) return null;
    for (let i = 1; i < n; i++) if ((at(us, i) - at(us, i - 1)) * dir < -0.02 * span) return null;

    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
    for (let i = 0; i < n; i++) {
      const u = at(us, i) / span;
      const v = at(vs, i);
      const u2 = u * u;
      s0 += 1; s1 += u; s2 += u2; s3 += u2 * u; s4 += u2 * u2;
      t0 += v; t1 += v * u; t2 += v * u2;
    }
    const sol = solve3([[s4, s3, s2], [s3, s2, s1], [s2, s1, s0]], [t2, t1, t0]);
    if (!sol) return null;
    // 정규화(u/span)를 되돌린다
    const a = sol[0] / (span * span);
    const b = sol[1] / span;
    const c = sol[2];
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const u = at(us, i);
      const e = at(vs, i) - (a * u * u + b * u + c);
      sq += e * e;
    }
    return { theta, a, b, c, origin, u0, u1, rms: Math.sqrt(sq / n) };
  };

  let best: ParabolaFit | null = null;
  const consider = (th: number) => {
    const f = tryTheta(th);
    if (f && (!best || f.rms < best.rms)) best = f;
  };
  for (let d = 0; d < 180; d += 3) consider((d * Math.PI) / 180);
  const coarse = best as ParabolaFit | null;
  if (coarse) for (let d = -3; d <= 3; d += 0.25) consider(coarse.theta + (d * Math.PI) / 180);
  return best;
}

/** 포물선 위 u의 점 (원래 좌표계) */
export function parabolaPoint(f: ParabolaFit, u: number): V {
  const v = f.a * u * u + f.b * u + f.c;
  const cos = Math.cos(f.theta);
  const sin = Math.sin(f.theta);
  return { x: f.origin.x + u * cos - v * sin, y: f.origin.y + u * sin + v * cos };
}

/** 포물선 구간 [u0,u1]은 정확히 2차 베지어 하나 — 제어점 = 양 끝 접선의 교점 */
export function parabolaBezier(f: ParabolaFit, u0: number, u1: number): { p0: V; c: V; p1: V } {
  const v0 = f.a * u0 * u0 + f.b * u0 + f.c;
  const slope0 = 2 * f.a * u0 + f.b;
  const uc = (u0 + u1) / 2;
  const vc = v0 + slope0 * (uc - u0);
  const cos = Math.cos(f.theta);
  const sin = Math.sin(f.theta);
  return {
    p0: parabolaPoint(f, u0),
    c: { x: f.origin.x + uc * cos - vc * sin, y: f.origin.y + uc * sin + vc * cos },
    p1: parabolaPoint(f, u1),
  };
}

export interface EllipseFit {
  c: V;
  rx: number;
  ry: number;
  /** 장축 방향 (라디안) */
  rot: number;
  /** 정규화 반지름의 std/mean */
  residual: number;
}

/**
 * 타원 맞춤 (닫힌 획, 호 길이 균등 재표본 전제). 주성분으로 축 방향을 잡고,
 * 각 축 방향의 양 끝(손떨림 대비 2~98 백분위)으로 반지름을 구한 뒤 잔차를 잰다.
 */
export function fitEllipse(pts: readonly V[]): EllipseFit | null {
  const n = pts.length;
  if (n < 8) return null;
  let cx = pts.reduce((s, p) => s + p.x, 0) / n;
  let cy = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  const rot = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const proj = (p: V) => [(p.x - cx) * cos + (p.y - cy) * sin, -(p.x - cx) * sin + (p.y - cy) * cos] as const;
  const pct = (arr: number[], q: number) => {
    const s = [...arr].sort((a, b) => a - b);
    return at(s, Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1)))));
  };
  let us = pts.map((p) => proj(p)[0]);
  let vs = pts.map((p) => proj(p)[1]);
  // 중심 보정: 축 방향 양 끝의 중점
  const du = (pct(us, 0.98) + pct(us, 0.02)) / 2;
  const dv = (pct(vs, 0.98) + pct(vs, 0.02)) / 2;
  cx += du * cos - dv * sin;
  cy += du * sin + dv * cos;
  us = pts.map((p) => proj(p)[0]);
  vs = pts.map((p) => proj(p)[1]);
  const rx = (pct(us, 0.98) - pct(us, 0.02)) / 2;
  const ry = (pct(vs, 0.98) - pct(vs, 0.02)) / 2;
  if (!(rx > 0) || !(ry > 0)) return null;
  const rho = us.map((u, i) => Math.hypot(u / rx, at(vs, i) / ry));
  const mean = rho.reduce((s, r) => s + r, 0) / n;
  const sd = Math.sqrt(rho.reduce((s, r) => s + (r - mean) ** 2, 0) / n);
  return rx >= ry
    ? { c: { x: cx, y: cy }, rx, ry, rot, residual: sd / mean }
    : { c: { x: cx, y: cy }, rx: ry, ry: rx, rot: rot + Math.PI / 2, residual: sd / mean };
}

/** 가우시안 평활 (열린 곡선은 양 끝 고정) */
export function gaussianSmooth(pts: readonly V[], sigma: number, closed: boolean): V[] {
  const n = pts.length;
  if (n < 3 || sigma <= 0) return [...pts];
  const half = Math.ceil(sigma * 2.5);
  const w = Array.from({ length: 2 * half + 1 }, (_, i) => Math.exp(-((i - half) ** 2) / (2 * sigma * sigma)));
  return pts.map((p, i) => {
    if (!closed && (i === 0 || i === n - 1)) return { ...p };
    let sx = 0, sy = 0, sw = 0;
    for (let k = -half; k <= half; k++) {
      let j = i + k;
      if (closed) j = mod(j, n);
      else if (j < 0 || j >= n) continue;
      const q = at(pts, j);
      const wk = at(w, k + half);
      sx += q.x * wk; sy += q.y * wk; sw += wk;
    }
    return { x: sx / sw, y: sy / sw };
  });
}

/** 좌표 전용 RDP (ink/simplify.ts는 필압·시각을 가진 Point용) */
export function rdp(pts: readonly V[], eps: number): V[] {
  if (pts.length <= 2) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number];
    const a = at(pts, s);
    const b = at(pts, e);
    let worst = -1;
    let wi = -1;
    for (let i = s + 1; i < e; i++) {
      const p = at(pts, i);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy);
      const d = l === 0 ? dist(p, a) : Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / l;
      if (d > worst) {
        worst = d;
        wi = i;
      }
    }
    if (worst > eps && wi > 0) {
      keep[wi] = 1;
      stack.push([s, wi], [wi, e]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}
