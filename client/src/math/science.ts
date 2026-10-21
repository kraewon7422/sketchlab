/**
 * 과학·수학 그림의 계산 (화면과 떨어진 순수 함수 — 테스트한다)
 *   경사하강법 · 원자 오비탈(실수 구면조화) · 행렬식 · 유클리드의 피타고라스 증명
 */

// ─────────────────────────────────────────────────────────── 경사하강법

export interface GdFunction {
  name: string;
  /** 1차원(곡선 위 공) / 2차원(등고선 위 길) */
  dim: 1 | 2;
  f: (x: number, y: number) => number;
  grad: (x: number, y: number) => [number, number];
  /** 보여 줄 범위 [xmin, xmax, ymin, ymax] (1차원은 x 범위 + f 범위) */
  view: [number, number, number, number];
  /** 처음 시작점 */
  start: [number, number];
  /** 진짜 최솟값 자리들 (설명용) */
  minima: Array<[number, number]>;
}

export const GD_FUNCTIONS: GdFunction[] = [
  { name: "그릇 f(x) = x²", dim: 1, f: (x) => x * x, grad: (x) => [2 * x, 0], view: [-2.5, 2.5, -0.5, 6.25], start: [2.2, 0], minima: [[0, 0]] },
  {
    name: "두 골짜기 f(x) = x⁴ − 3x² + x",
    dim: 1,
    f: (x) => x ** 4 - 3 * x * x + x,
    grad: (x) => [4 * x ** 3 - 6 * x + 1, 0],
    view: [-2.2, 2.2, -4.5, 6],
    start: [1.9, 0],
    minima: [[-1.3008, 0], [1.1309, 0]],
  },
  { name: "길쭉한 그릇 f = x² + 8y²", dim: 2, f: (x, y) => x * x + 8 * y * y, grad: (x, y) => [2 * x, 16 * y], view: [-3, 3, -2, 2], start: [-2.6, 1.4], minima: [[0, 0]] },
  {
    name: "로젠브록 f = (1−x)² + 5(y−x²)²",
    dim: 2,
    f: (x, y) => (1 - x) ** 2 + 5 * (y - x * x) ** 2,
    grad: (x, y) => [-2 * (1 - x) - 20 * x * (y - x * x), 10 * (y - x * x)],
    view: [-2, 2, -1, 3],
    start: [-1.6, 2.4],
    minima: [[1, 1]],
  },
];

export type GdStatus = "converged" | "moving" | "oscillating" | "diverged";

/**
 * 경사하강법 (모멘텀 포함): v ← μ·v − η·∇f, x ← x + v.
 * 값이 터지면(발산) 그 자리에서 멈춘다.
 */
export function gdPath(fn: GdFunction, lr: number, momentum: number, start: [number, number], steps: number): { pts: Array<[number, number]>; status: GdStatus } {
  let [x, y] = start;
  let vx = 0;
  let vy = 0;
  const pts: Array<[number, number]> = [[x, y]];
  for (let k = 0; k < steps; k++) {
    const [gx, gy] = fn.grad(x, y);
    vx = momentum * vx - lr * gx;
    vy = fn.dim === 2 ? momentum * vy - lr * gy : 0;
    x += vx;
    y += vy;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) return { pts, status: "diverged" };
    pts.push([x, y]);
  }
  return { pts, status: classify(fn, pts) };
}

function classify(fn: GdFunction, pts: ReadonlyArray<[number, number]>): GdStatus {
  const n = pts.length;
  const last = pts[n - 1] as [number, number];
  const [gx, gy] = fn.grad(last[0], last[1]);
  if (Math.hypot(gx, gy) < 1e-3) return "converged";
  const span = Math.max(fn.view[1] - fn.view[0], fn.view[3] - fn.view[2]);
  if (Math.hypot(last[0], last[1]) > span * 20) return "diverged";
  // 마지막 몇 걸음이 방향을 계속 바꾸며 거의 제자리면 진동
  if (n >= 6) {
    let flips = 0;
    for (let i = n - 5; i < n - 1; i++) {
      const a = pts[i] as [number, number];
      const b = pts[i + 1] as [number, number];
      const c = pts[i - 1] as [number, number];
      if ((b[0] - a[0]) * (a[0] - c[0]) + (b[1] - a[1]) * (a[1] - c[1]) < 0) flips++;
    }
    if (flips >= 4) return "oscillating";
  }
  return "moving";
}

// ─────────────────────────────────────────────────────────── 원자 오비탈

export interface Orbital {
  /** 이름 (pz, dxy, …) */
  name: string;
  l: number;
  /** 실수 구면조화 (모양만 — 정규화 상수 생략) x, y, z는 단위 방향 */
  Y: (x: number, y: number, z: number) => number;
}

/** l = 0~3 (s·p·d·f) 오비탈 — 화학 교과서 이름 */
export const ORBITALS: Orbital[][] = [
  [{ name: "s", l: 0, Y: () => 1 }],
  [
    { name: "pz", l: 1, Y: (_x, _y, z) => z },
    { name: "px", l: 1, Y: (x) => x },
    { name: "py", l: 1, Y: (_x, y) => y },
  ],
  [
    { name: "dz²", l: 2, Y: (x, y, z) => 2 * z * z - x * x - y * y },
    { name: "dxz", l: 2, Y: (x, _y, z) => 2 * x * z },
    { name: "dyz", l: 2, Y: (_x, y, z) => 2 * y * z },
    { name: "dx²−y²", l: 2, Y: (x, y) => x * x - y * y },
    { name: "dxy", l: 2, Y: (x, y) => 2 * x * y },
  ],
  [
    { name: "fz³", l: 3, Y: (x, y, z) => z * (2 * z * z - 3 * x * x - 3 * y * y) },
    { name: "fxz²", l: 3, Y: (x, y, z) => x * (4 * z * z - x * x - y * y) },
    { name: "fyz²", l: 3, Y: (x, y, z) => y * (4 * z * z - x * x - y * y) },
    { name: "fz(x²−y²)", l: 3, Y: (x, y, z) => z * (x * x - y * y) },
    { name: "fxyz", l: 3, Y: (x, y, z) => x * y * z },
    { name: "fx(x²−3y²)", l: 3, Y: (x, y) => x * (x * x - 3 * y * y) },
    { name: "fy(3x²−y²)", l: 3, Y: (x, y) => y * (3 * x * x - y * y) },
  ],
];

type V = [number, number, number];

/**
 * 오비탈 모양 그물: 방향마다 반지름 = |Y| (정규화해 가장 큰 것이 1).
 * 화면 좌표 (x 오른쪽, y 위 = 화학의 z, z 앞) — 각 점에 Y의 부호도.
 */
export function orbitalMesh(o: Orbital, nu = 48, nv = 24): { grid: V[][]; sign: number[][] } {
  const raw: Array<Array<{ p: V; s: number }>> = [];
  let max = 0;
  for (let i = 0; i <= nu; i++) {
    const row: Array<{ p: V; s: number }> = [];
    const phi = (i / nu) * Math.PI * 2;
    for (let j = 0; j <= nv; j++) {
      const th = (j / nv) * Math.PI;
      const dx = Math.sin(th) * Math.cos(phi);
      const dy = Math.sin(th) * Math.sin(phi);
      const dz = Math.cos(th);
      const y = o.Y(dx, dy, dz);
      const r = Math.abs(y);
      max = Math.max(max, r);
      // 화면: 화학 z → 위(y), 화학 x → 오른쪽, 화학 y → 앞
      row.push({ p: [dx * r, dz * r, dy * r], s: Math.sign(y) });
    }
    raw.push(row);
  }
  const k = max > 0 ? 1 / max : 1;
  return { grid: raw.map((row) => row.map((c) => [c.p[0] * k, c.p[1] * k, c.p[2] * k] as V)), sign: raw.map((row) => row.map((c) => c.s)) };
}

/** 마디(Y = 0인 면·원뿔)의 수 = l */
export const orbitalNodes = (o: Orbital): number => o.l;

// ─────────────────────────────────────────────────────────── 행렬식

export const det2 = (a: number, b: number, c: number, d: number): number => a * d - b * c;

export function det3(m: readonly number[]): number {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/** 첫 행 전개 (여인수) 를 숫자로 적은 LaTeX */
export function det3Expansion(m: readonly number[]): string {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const n = (v: number) => (v < 0 ? `(${v})` : `${v}`);
  const m1 = e * i - f * h;
  const m2 = d * i - f * g;
  const m3 = d * h - e * g;
  return `${n(a)}\\cdot${n(m1)} - ${n(b)}\\cdot${n(m2)} + ${n(c)}\\cdot${n(m3)} = ${det3(m)}`;
}

// ─────────────────────────────────────────────────────────── 유클리드의 피타고라스 증명 (원론 1권 47)

type P = [number, number];

/**
 * 빗변 AB(길이 2, 바닥)에 내린 수직 위의 C(반원 위 → 언제나 직각). 수학 좌표(y 위).
 *   정사각형: AB 아래 (A B E D) · BC 바깥 (B C G F) · CA 바깥 (C A I H)
 *   K: C에서 AB에 내린 수선의 발, L: 그 수선이 DE와 만나는 곳 → 큰 정사각형이 두 직사각형 (A K L D) · (K B E L)
 */
export function euclidFigure(t: number): {
  A: P; B: P; C: P; D: P; E: P; F: P; G: P; H: P; I: P; K: P; L: P;
  a2: number; b2: number; c2: number;
} {
  const A: P = [-1, 0];
  const B: P = [1, 0];
  const C: P = [Math.cos(t), Math.sin(t)];
  const E: P = [1, -2];
  const D: P = [-1, -2];
  // BC 바깥 정사각형: B→C를 시계 방향(삼각형 밖)으로 90° 돌려 F
  const bc: P = [C[0] - B[0], C[1] - B[1]];
  const outBC: P = [bc[1], -bc[0]];
  const F: P = [B[0] + outBC[0], B[1] + outBC[1]];
  const G: P = [C[0] + outBC[0], C[1] + outBC[1]];
  const ca: P = [A[0] - C[0], A[1] - C[1]];
  const outCA: P = [ca[1], -ca[0]];
  const H: P = [C[0] + outCA[0], C[1] + outCA[1]];
  const I: P = [A[0] + outCA[0], A[1] + outCA[1]];
  const K: P = [C[0], 0];
  const L: P = [C[0], -2];
  const a2 = bc[0] ** 2 + bc[1] ** 2;
  const b2 = ca[0] ** 2 + ca[1] ** 2;
  return { A, B, C, D, E, F, G, H, I, K, L, a2, b2, c2: 4 };
}

/** 다각형 넓이 (신발끈 공식) */
export function polyArea(pts: readonly P[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as P;
    const q = pts[(i + 1) % pts.length] as P;
    s += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(s) / 2;
}
