/**
 * 함수 그래프 적응 샘플링 (마스터스펙 v4 §11.3).
 *
 * 균등 샘플링이 "밤티" 나는 이유: 급하게 휘는 곳은 각지고, 불연속(tan x)에서는 위아래를
 * 잇는 수직선이 그려진다. 여기서는
 *   1) 화면 폭 기준 균등 격자로 시작해서
 *   2) 화면(px) 기준으로 직선에서 벗어나는 구간만 이분할하고
 *   3) 최대 깊이까지 쪼개도 메워지지 않는 점프는 "끊김"으로 처리한다.
 * 연속이지만 가파른 곡선(x³ 등)은 쪼갤수록 점프가 줄어서 이어지고,
 * 진짜 불연속(tan x, 1/x)은 끝까지 남아서 끊긴다 — 둘을 구분하는 핵심.
 *
 * 좌표는 전부 수학 좌표(y 위쪽). 화면 변환은 렌더러가 한다.
 */

export interface View {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export type Fn = (x: number) => number;
export type Pt = [number, number];

export interface SampleResult {
  /** 이어 그릴 수 있는 구간들 (화면 밖으로 나가는 지점은 경계에서 잘라 넣음) */
  runs: Pt[][];
  /**
   * 진짜 끊김 위치 — 점근선 판정에 쓴다. 화면 밖이라 생략한 구간은 여기 들어가지 않는다.
   * left/right: 끊김 직전·직후의 함수값 (정의되지 않으면 NaN)
   */
  breaks: Array<{ x: number; left: number; right: number }>;
}

export interface SampleOptions {
  /** 그래프가 그려질 폭·높이 (px) — "몇 px 휘었나"로 세분 여부를 판단한다 */
  widthPx: number;
  heightPx: number;
  /** 최대 이분 깊이 */
  maxDepth?: number;
  /** 직선에서 이만큼(px) 벗어나면 더 쪼갠다 */
  flatnessPx?: number;
  /** 화면 밖 여유 (뷰 높이 비율) — 이 밖은 그리지 않는다 */
  overscan?: number;
}

function safe(f: Fn, x: number): number {
  let y: number;
  try {
    y = f(x);
  } catch {
    return NaN;
  }
  return typeof y === "number" && Number.isFinite(y) ? y : NaN;
}

export function sampleFunction(f: Fn, view: View, options: SampleOptions): SampleResult {
  const maxDepth = options.maxDepth ?? 10;
  const flat = options.flatnessPx ?? 0.35;
  const overscan = options.overscan ?? 0.25;
  const xspan = view.xmax - view.xmin;
  const yspan = view.ymax - view.ymin;
  const sx = options.widthPx / xspan;
  const sy = options.heightPx / yspan;
  const yLo = view.ymin - overscan * yspan;
  const yHi = view.ymax + overscan * yspan;
  const jumpPx = options.heightPx * 0.5;

  const n0 = Math.max(64, Math.round(options.widthPx / 2));
  const xs = Array.from({ length: n0 + 1 }, (_, i) => view.xmin + (xspan * i) / n0);
  const ys = xs.map((x) => safe(f, x));

  /** 결과 점열. NaN = 끊김 표시 */
  const out: Array<Pt | null> = [];
  const breaks: SampleResult["breaks"] = [];
  let budget = 40000;

  const offSameSide = (a: number, b: number) => (a > yHi && b > yHi) || (a < yLo && b < yLo);

  /**
   * 뛰는 쪽 반을 계속 따라가며 40번 반으로 — 폭이 거의 0이 되어도 1px 넘게 뛰면 진짜 끊김(계단),
   * 가파르기만 한 연속 곡선은 폭과 함께 차이가 사라진다.
   */
  const isJump = (x0: number, y0: number, x1: number, y1: number): boolean => {
    let a = x0;
    let b = x1;
    let ya = y0;
    let yb = y1;
    for (let k = 0; k < 40; k++) {
      const m = (a + b) / 2;
      const ym = safe(f, m);
      if (Number.isNaN(ym)) return true;
      if (Math.abs(ym - ya) >= Math.abs(yb - ym)) {
        b = m;
        yb = ym;
      } else {
        a = m;
        ya = ym;
      }
    }
    return Math.abs(yb - ya) * sy > 1;
  };

  const refine = (x0: number, y0: number, x1: number, y1: number, depth: number): void => {
    const n0ok = !Number.isNaN(y0);
    const n1ok = !Number.isNaN(y1);
    if (!n0ok && !n1ok) {
      out.push(null);
      return;
    }
    // 둘 다 화면 밖 같은 쪽이면 자세히 볼 필요 없다 — 다만 그 사이를 이으면 안 된다.
    if (n0ok && n1ok && offSameSide(y0, y1)) {
      out.push(null);
      out.push([x1, y1]);
      return;
    }

    const xm = (x0 + x1) / 2;
    const ym = safe(f, xm);
    const dyPx = Math.abs(y1 - y0) * sy;
    let needSplit = !n0ok || !n1ok || dyPx > jumpPx;
    if (!needSplit && !Number.isNaN(ym)) {
      // 중점이 현(chord)에서 몇 px 떨어졌나 — 화면 기준 평탄도
      const chordY = (y0 + y1) / 2;
      needSplit = Math.abs(ym - chordY) * sy > flat && (x1 - x0) * sx > 0.5;
    } else if (!needSplit && Number.isNaN(ym)) {
      needSplit = true; // 사이에 정의되지 않는 구멍이 있다
    }

    if (needSplit && depth < maxDepth && budget-- > 0) {
      refine(x0, y0, xm, ym, depth + 1);
      refine(xm, ym, x1, y1, depth + 1);
      return;
    }

    // 더 쪼갤 수 없다: 여기서 판정
    if (!n0ok || !n1ok) {
      breaks.push({ x: (x0 + x1) / 2, left: y0, right: y1 });
      out.push(null);
      if (n1ok) out.push([x1, y1]);
      return;
    }
    // 좁은 칸에서 2px 넘게 뛰면 계단(가우스 기호 [x] 등)인지 가파른 곡선(x³ 등)인지 따로 확인 — 계단이면 세로선 없이 끊는다
    if (dyPx > jumpPx || (dyPx > 2 && isJump(x0, y0, x1, y1))) {
      breaks.push({ x: (x0 + x1) / 2, left: y0, right: y1 });
      out.push(null);
      out.push([x1, y1]);
      return;
    }
    out.push([x1, y1]);
  };

  const first = ys[0];
  out.push(first === undefined || Number.isNaN(first) ? null : [view.xmin, first]);
  for (let i = 0; i < n0; i++) {
    refine(xs[i] as number, ys[i] as number, xs[i + 1] as number, ys[i + 1] as number, 0);
  }

  return { runs: splitRuns(out, yLo, yHi), breaks };
}

/**
 * 점열을 연속 구간으로 나누고, 화면 밖(overscan 바깥)으로 나가는 선분은 경계에서 자른다.
 * 클램프(값을 경계로 눌러 붙이기)를 쓰지 않는 이유: 기울기가 바뀌어 화면 안쪽 모양까지 틀어진다.
 */
function splitRuns(points: ReadonlyArray<Pt | null>, yLo: number, yHi: number): Pt[][] {
  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  let prev: Pt | null = null;
  const inside = (p: Pt) => p[1] >= yLo && p[1] <= yHi;
  const cut = (a: Pt, b: Pt): Pt => {
    const yb = b[1] > yHi ? yHi : yLo;
    const t = (yb - a[1]) / (b[1] - a[1]);
    return [a[0] + (b[0] - a[0]) * t, yb];
  };
  const flush = () => {
    if (cur.length >= 2) runs.push(cur);
    cur = [];
  };

  for (const p of points) {
    if (p === null) {
      flush();
      prev = null;
      continue;
    }
    if (prev === null) {
      if (inside(p)) cur.push(p);
      prev = p;
      continue;
    }
    const pin = inside(prev);
    const qin = inside(p);
    if (pin && qin) {
      cur.push(p);
    } else if (pin && !qin) {
      cur.push(cut(prev, p));
      flush();
    } else if (!pin && qin) {
      cur.push(cut(p, prev), p);
    } else if ((prev[1] > yHi && p[1] < yLo) || (prev[1] < yLo && p[1] > yHi)) {
      // 화면을 위→아래로 한 번에 가로지름 (매우 가파른 연속 구간)
      cur.push(cut(p, prev), cut(prev, p));
      flush();
    }
    prev = p;
  }
  flush();
  return runs;
}

/** 매개변수 곡선 (극좌표 포함) — t 균등 샘플 + 같은 끊김 규칙 */
export function sampleParametric(
  fx: Fn,
  fy: Fn,
  t0: number,
  t1: number,
  view: View,
  steps = 720,
): Pt[][] {
  const yspan = view.ymax - view.ymin;
  const xspan = view.xmax - view.xmin;
  const runs: Pt[][] = [];
  let cur: Pt[] = [];
  let prev: Pt | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const x = safe(fx, t);
    const y = safe(fy, t);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      if (cur.length >= 2) runs.push(cur);
      cur = [];
      prev = null;
      continue;
    }
    const p: Pt = [x, y];
    if (prev && (Math.abs(p[0] - prev[0]) > xspan * 0.5 || Math.abs(p[1] - prev[1]) > yspan * 0.5)) {
      if (cur.length >= 2) runs.push(cur);
      cur = [];
    }
    cur.push(p);
    prev = p;
  }
  if (cur.length >= 2) runs.push(cur);
  return runs;
}

/**
 * 화면 안에서 작게 뛰는 끊김(점근선이 아닌 것)의 정확한 자리와 양쪽 값.
 * 왼쪽 값에 가까우면 왼쪽, 아니면 오른쪽으로 이분해서 뛰는 x를 찾고, 그 x의 실제 함수값이 어느 쪽인지 본다.
 */
export function jumpDots(f: Fn, view: View, breaks: ReadonlyArray<{ x: number; left: number; right: number }>): Array<{ x: number; y: number; filled: boolean }> {
  const yspan = view.ymax - view.ymin;
  const xspan = view.xmax - view.xmin;
  const out: Array<{ x: number; y: number; filled: boolean }> = [];
  const val = (x: number) => {
    try {
      const y = f(x);
      return Number.isFinite(y) ? y : NaN;
    } catch {
      return NaN;
    }
  };
  for (const b of breaks) {
    if (!Number.isFinite(b.left) || !Number.isFinite(b.right)) continue;
    if (Math.abs(b.left - b.right) > yspan * 0.5) continue; // 점근선 쪽
    let lo = b.x - xspan * 1e-3;
    let hi = b.x + xspan * 1e-3;
    const L = val(lo);
    const R = val(hi);
    if (!Number.isFinite(L) || !Number.isFinite(R) || Math.abs(L - R) < yspan * 1e-3) continue;
    for (let k = 0; k < 60; k++) {
      const m = (lo + hi) / 2;
      const v = val(m);
      if (Math.abs(v - L) < Math.abs(v - R)) lo = m;
      else hi = m;
    }
    // 정수·1/12 칸에 가까우면 그 값 (계단의 끝이 정확히 찍히게)
    let x = (lo + hi) / 2;
    const k12 = Math.round(x * 12) / 12;
    if (Math.abs(x - k12) < xspan * 1e-6) x = k12;
    const at = val(x);
    const atLeft = Math.abs(at - L) < Math.abs(at - R);
    // 함수값이 있는 쪽은 채운 점, 다른 쪽은 빈 점
    out.push({ x, y: atLeft ? L : R, filled: true }, { x, y: atLeft ? R : L, filled: false });
    if (Number.isFinite(at) && Math.abs(at - L) > yspan * 1e-3 && Math.abs(at - R) > yspan * 1e-3) {
      // 따로 떨어진 점 (양쪽 모두 빈 점, 함수값만 채운 점)
      out.splice(out.length - 2, 2, { x, y: L, filled: false }, { x, y: R, filled: false }, { x, y: at, filled: true });
    }
  }
  return out;
}
