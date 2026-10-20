import type { SceneIR } from "@sketchlab/shared";
import { rotate, type View3 } from "../solid/project";

/**
 * 유명한 그림 (수학·과학·컴퓨터) — 이름 하나로 그린다. 그리는 방법은 넷:
 *   3D 곡면(돌리기)        뫼비우스 띠 · 클라인 병 · 세잎 매듭        — 칠한 조각을 먼 것부터 (양면을 다 밝게)
 *   거리 함수(광선 진행)    종수 0·1·2·3 (구 · 도넛 · 구멍 두 개 …)    — topology.ts renderSdf
 *   평면 그림               코흐 눈송이 · 시에르핀스키 · 황금 나선 · 오일러 단위원
 *   그림 파일(화소)          만델브로 집합(톡 확대) · 로지스틱 사상 분기 도표
 *   그 밖                   로렌츠 끌개(돌리기) · 라이프 게임(칸 톡 · 재생)
 */

type V = [number, number, number];
type FigData = Extract<SceneIR, { kind: "figure" }>["data"];
export type FigureName = FigData["name"];

export interface FigureInfo {
  title: string;
  /** 그림 밑에 쓰는 한 줄 설명 */
  note: string;
  /** 처음 값 */
  init: Partial<FigData>;
}

export const FIGURES: Record<FigureName, FigureInfo> = {
  mobius: { title: "뫼비우스 띠", note: "면이 하나뿐인 띠 — 한 바퀴 돌면 뒤집혀 돌아온다", init: {} },
  klein: { title: "클라인 병", note: "안과 밖이 없는 닫힌 곡면 (3차원에서는 스스로를 뚫고 지나간다)", init: {} },
  trefoil: { title: "세잎 매듭", note: "풀 수 없는 가장 간단한 매듭", init: {} },
  genus: { title: "종수 (구멍 수)", note: "위상수학: 구멍 수가 같으면 같은 모양", init: { n: 2 } },
  mandelbrot: { title: "만델브로 집합", note: "zₙ₊₁ = zₙ² + c 가 무한히 커지지 않는 c — 톡 하면 확대", init: { zoom: { cx: -0.6, cy: 0, s: 3.2 } } },
  koch: { title: "코흐 눈송이", note: "변을 3등분해 가운데에 삼각형 — 둘레는 무한, 넓이는 유한", init: { n: 3 } },
  sierpinski: { title: "시에르핀스키 삼각형", note: "가운데를 계속 빼내는 프랙탈 (넓이 → 0)", init: { n: 4 } },
  golden: { title: "황금 나선", note: "피보나치 정사각형에 그린 나선 — 비가 황금비 φ ≈ 1.618에 가까워진다", init: { n: 8 } },
  lorenz: { title: "로렌츠 끌개", note: "나비 효과 — 처음이 조금만 달라도 전혀 다른 길 (σ=10, ρ=28, β=8/3)", init: {} },
  life: { title: "라이프 게임", note: "콘웨이: 이웃 3개면 태어나고 2·3개면 산다 — 칸 톡 · 재생", init: { gen: 0 } },
  logistic: { title: "로지스틱 사상 분기 도표", note: "xₙ₊₁ = r·xₙ(1−xₙ) — r이 커지며 주기 2·4·8… 그리고 혼돈", init: {} },
  euler: { title: "오일러 공식", note: "e^{iθ} = cos θ + i sin θ — 단위원 위의 점", init: { t: Math.PI / 4 } },
};

const ALIASES: Array<[RegExp, FigureName]> = [
  [/^(뫼비우스(\s*띠)?|m[oö]bius(\s*strip)?)$/i, "mobius"],
  [/^(클라인(\s*병)?|klein(\s*bottle)?)$/i, "klein"],
  [/^((세잎|삼엽)\s*매듭|매듭|trefoil(\s*knot)?)$/i, "trefoil"],
  [/^(종수|genus|구멍)\s*(\d)?(\s*개)?(\s*도넛)?$/i, "genus"],
  [/^(만델브로(\s*집합)?|mandelbrot(\s*set)?)$/i, "mandelbrot"],
  [/^(코흐(\s*눈송이)?|koch(\s*snowflake)?)$/i, "koch"],
  [/^(시에르핀스키(\s*삼각형)?|sierpinski(\s*triangle)?)$/i, "sierpinski"],
  [/^(황금\s*(나선|비)?|피보나치(\s*나선)?|golden(\s*spiral)?|fibonacci(\s*spiral)?)$/i, "golden"],
  [/^(로렌츠(\s*끌개)?|나비\s*효과|lorenz(\s*attractor)?)$/i, "lorenz"],
  [/^(라이프\s*게임|생명\s*게임|(conway'?s\s*)?game\s*of\s*life|콘웨이)$/i, "life"],
  [/^(로지스틱(\s*(사상|맵))?|분기\s*도표|bifurcation|logistic(\s*map)?)$/i, "logistic"],
  [/^(오일러(\s*(공식|원|항등식))?|euler(\s*formula)?|e\^\{?i\\?theta\}?)$/i, "euler"],
];

/** 입력 → 그림 (아니면 null) */
export function parseFigure(input: string): FigData | null {
  const s = input.trim();
  for (const [re, name] of ALIASES) {
    const m = re.exec(s);
    if (!m) continue;
    const data: FigData = { name, ...structuredClone(FIGURES[name].init) };
    if (name === "genus") {
      const k = /\d/.exec(s);
      if (k) data.n = Math.min(4, Number(k[0]));
    }
    if (name === "life") data.cells = GOSPER;
    return data;
  }
  return null;
}

// ─────────────────────────────────────────────────────────── 3D 곡면 (칠한 조각)

/** 그물 (u, v) → 3D 점 — 그리기 좌표 (y 위) */
function grid(nu: number, nv: number, f: (u: number, v: number) => V): V[][] {
  const g: V[][] = [];
  for (let i = 0; i <= nu; i++) {
    const row: V[] = [];
    for (let j = 0; j <= nv; j++) row.push(f(i / nu, j / nv));
    g.push(row);
  }
  return g;
}

/** 가운데로 옮기고 반지름 1 안에 들게 */
function fit(g: V[][]): V[][] {
  const pts = g.flat();
  const c = [0, 1, 2].map((k) => (Math.min(...pts.map((p) => p[k]!)) + Math.max(...pts.map((p) => p[k]!))) / 2);
  const r = Math.max(...pts.map((p) => Math.hypot(p[0] - c[0]!, p[1] - c[1]!, p[2] - c[2]!))) || 1;
  return g.map((row) => row.map((p) => [(p[0] - c[0]!) / r, (p[1] - c[1]!) / r, (p[2] - c[2]!) / r] as V));
}

const TAU = Math.PI * 2;
const meshCache = new Map<FigureName, V[][]>();

export function surfaceMesh(name: "mobius" | "klein" | "trefoil"): V[][] {
  const hit = meshCache.get(name);
  if (hit) return hit;
  let g: V[][];
  if (name === "mobius") {
    g = grid(72, 8, (a, b) => {
      const u = a * TAU;
      const v = (b - 0.5) * 0.9;
      const r = 1 + v * Math.cos(u / 2);
      return [r * Math.cos(u), v * Math.sin(u / 2), r * Math.sin(u)];
    });
  } else if (name === "klein") {
    // 흔히 보는 "병" 모양 (Wikipedia의 매개변수 식)
    g = grid(60, 30, (a, b) => {
      const u = a * Math.PI;
      const v = b * TAU;
      const cu = Math.cos(u);
      const su = Math.sin(u);
      const cv = Math.cos(v);
      const x = (-2 / 15) * cu * (3 * cv - 30 * su + 90 * cu ** 4 * su - 60 * cu ** 6 * su + 5 * cu * cv * su);
      const y = (-1 / 15) * su * (3 * cv - 3 * cu ** 2 * cv - 48 * cu ** 4 * cv + 48 * cu ** 6 * cv - 60 * su + 5 * cu * cv * su - 5 * cu ** 3 * cv * su - 80 * cu ** 5 * cv * su + 80 * cu ** 7 * cv * su);
      const z = (2 / 15) * (3 + 5 * cu * su) * Math.sin(v);
      return [x, -y, z];
    });
  } else {
    // 세잎 매듭을 따라가는 관 (곡선의 접선에 수직인 원)
    const c = (t: number): V => [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)];
    g = grid(180, 12, (a, b) => {
      const t = a * TAU;
      const p = c(t);
      const h = 1e-3;
      const q = c(t + h);
      const T = norm([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
      const N = norm(cross(T, [0.3, 0.2, 1]));
      const B = cross(T, N);
      const w = b * TAU;
      const r = 0.42;
      return [p[0] + r * (Math.cos(w) * N[0] + Math.sin(w) * B[0]), p[2] + r * (Math.cos(w) * N[2] + Math.sin(w) * B[2]), p[1] + r * (Math.cos(w) * N[1] + Math.sin(w) * B[1])];
    });
  }
  const fitted = fit(g);
  meshCache.set(name, fitted);
  return fitted;
}

const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V): V => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface Patch {
  d: string;
  fill: string;
}

/** 그물 → 칠한 조각 (먼 것부터). 양면 곡면이라 법선의 방향과 상관없이 밝기를 준다 */
export function paintMesh(g: V[][], view: View3, scale: number, cx: number, cy: number, hue: number): Patch[] {
  const L = norm([-0.4, 0.75, 0.55]);
  const R = g.map((row) => row.map((p) => rotate(p, view)));
  const quads: Array<{ pts: V[]; z: number }> = [];
  for (let i = 0; i < R.length - 1; i++)
    for (let j = 0; j < (R[0]?.length ?? 1) - 1; j++) {
      const pts = [R[i]![j]!, R[i + 1]![j]!, R[i + 1]![j + 1]!, R[i]![j + 1]!];
      quads.push({ pts, z: (pts[0]![2] + pts[1]![2] + pts[2]![2] + pts[3]![2]) / 4 });
    }
  quads.sort((a, b) => a.z - b.z);
  return quads.map(({ pts }) => {
    const [p0, p1, p2, p3] = pts as [V, V, V, V];
    const n = norm(cross([p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]], [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]));
    const I = Math.abs(n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    // 보는 쪽을 향하면 조금 더 밝게 (앞뒤가 구별되게)
    const facing = n[2] > 0 ? 6 : 0;
    const light = Math.round(36 + 42 * I + facing);
    return { d: `M${pts.map((p) => `${(cx + p[0] * scale).toFixed(1)},${(cy - p[1] * scale).toFixed(1)}`).join("L")}Z`, fill: `hsl(${hue} 58% ${light}%)` };
  });
}

// ─────────────────────────────────────────────────────────── 종수 (거리 함수)

/** 종수 n: 0 = 구, 1 = 도넛, 2·3·4 = 구멍이 n개인 도넛 (도넛 n개를 매끄럽게 붙인 것) */
export function genusSdf(n: number): (p: V) => number {
  if (n <= 0) return (p) => Math.hypot(...p) - 0.95;
  const R = n === 1 ? 0.8 : 0.5;
  const r = n === 1 ? 0.34 : 0.22;
  const gap = 0.95;
  const centers = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * gap);
  const k = 0.12;
  return (p) => {
    let d = Infinity;
    for (const cx of centers) {
      const t = Math.hypot(Math.hypot(p[0] - cx, p[2]) - R, p[1]) - r;
      // 매끄러운 합집합
      const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (t - d)) / k));
      d = d === Infinity ? t : t * (1 - h) + d * h - k * h * (1 - h);
    }
    return d;
  };
}

// ─────────────────────────────────────────────────────────── 평면 프랙탈

type P = [number, number];

/** 코흐 눈송이 (단위 원 안, 위가 꼭짓점) — 점들 (닫힌 다각형) */
export function koch(n: number): P[] {
  const s = Math.min(6, Math.max(0, n));
  let pts: P[] = [0, 1, 2].map((k) => [Math.sin((k * TAU) / 3), Math.cos((k * TAU) / 3)] as P);
  for (let it = 0; it < s; it++) {
    const next: P[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i] as P;
      const b = pts[(i + 1) % pts.length] as P;
      const dx = (b[0] - a[0]) / 3;
      const dy = (b[1] - a[1]) / 3;
      const p1: P = [a[0] + dx, a[1] + dy];
      const p2: P = [a[0] + 2 * dx, a[1] + 2 * dy];
      // 바깥쪽으로 정삼각형 꼭짓점 (오른쪽으로 60° 돌리기 — 시계 방향 다각형의 바깥)
      const peak: P = [p1[0] + dx * 0.5 + dy * (Math.sqrt(3) / 2), p1[1] + dy * 0.5 - dx * (Math.sqrt(3) / 2)];
      next.push(a, p1, peak, p2);
    }
    pts = next;
  }
  return pts;
}

/** 시에르핀스키 삼각형 — 칠할 작은 삼각형들 */
export function sierpinski(n: number): P[][] {
  const s = Math.min(8, Math.max(0, n));
  let tris: P[][] = [
    [
      [0, 1],
      [-Math.sqrt(3) / 2, -0.5],
      [Math.sqrt(3) / 2, -0.5],
    ],
  ];
  const mid = (a: P, b: P): P => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (let it = 0; it < s; it++) {
    tris = tris.flatMap(([a, b, c]) => {
      const ab = mid(a as P, b as P);
      const bc = mid(b as P, c as P);
      const ca = mid(c as P, a as P);
      return [
        [a as P, ab, ca],
        [ab, b as P, bc],
        [ca, bc, c as P],
      ];
    });
  }
  return tris;
}

/** 황금 나선: 피보나치 정사각형 n개와 사분원 호들 */
export function golden(n: number): { squares: Array<{ x: number; y: number; s: number; f: number }>; arcs: string[] } {
  const N = Math.min(14, Math.max(1, n));
  const fib = [1, 1];
  while (fib.length < N) fib.push((fib[fib.length - 1] as number) + (fib[fib.length - 2] as number));
  const squares: Array<{ x: number; y: number; s: number; f: number }> = [];
  const arcs: string[] = [];
  // 사각형을 반시계로 붙여 나간다: 오른쪽 → 위 → 왼쪽 → 아래
  let minX = 0;
  let minY = 0;
  let maxX = 1;
  let maxY = 1;
  squares.push({ x: 0, y: 0, s: 1, f: 1 });
  arcs.push(`M1,0A1,1 0 0 1 0,1`);
  for (let i = 1; i < N; i++) {
    const s = fib[i] as number;
    const dir = i % 4;
    // 붙일 자리: 1 왼쪽 · 2 아래 · 3 오른쪽 · 0 위 (화면 좌표, y 아래)
    const [x, y] = dir === 1 ? [minX - s, minY] : dir === 2 ? [minX, minY - s] : dir === 3 ? [maxX, minY] : [minX, maxY];
    const arc =
      dir === 1
        ? `M${x + s},${y + s}A${s},${s} 0 0 1 ${x},${y}`
        : dir === 2
          ? `M${x},${y + s}A${s},${s} 0 0 1 ${x + s},${y}`
          : dir === 3
            ? `M${x},${y}A${s},${s} 0 0 1 ${x + s},${y + s}`
            : `M${x + s},${y}A${s},${s} 0 0 1 ${x},${y + s}`;
    squares.push({ x, y, s, f: s });
    arcs.push(arc);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + s);
    maxY = Math.max(maxY, y + s);
  }
  return { squares, arcs };
}

// ─────────────────────────────────────────────────────────── 화소 그림

/** 만델브로 집합 — 보는 곳(가운데·너비)을 w×h 화소로. 바깥은 탈출 속도로 색칠 */
export function mandelbrot(zoom: { cx: number; cy: number; s: number }, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const iter = Math.min(1200, Math.round(80 + 40 * Math.log2(3.2 / zoom.s + 1)));
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const cr = zoom.cx + ((px + 0.5) / w - 0.5) * zoom.s;
      const ci = zoom.cy - ((py + 0.5) / h - 0.5) * zoom.s * (h / w);
      let x = 0;
      let y = 0;
      let k = 0;
      while (k < iter && x * x + y * y <= 4) {
        const t = x * x - y * y + cr;
        y = 2 * x * y + ci;
        x = t;
        k++;
      }
      const i = (py * w + px) * 4;
      if (k >= iter) {
        out[i] = 20;
        out[i + 1] = 24;
        out[i + 2] = 48;
      } else {
        // 매끄러운 색 (탈출 횟수의 소수부)
        const mu = k + 1 - Math.log2(Math.log2(Math.sqrt(x * x + y * y)) || 1);
        const t = (mu / 40) % 1;
        out[i] = 255 * (0.5 + 0.5 * Math.cos(TAU * (t + 0.0)));
        out[i + 1] = 255 * (0.5 + 0.5 * Math.cos(TAU * (t + 0.15)));
        out[i + 2] = 255 * (0.5 + 0.5 * Math.cos(TAU * (t + 0.3)));
      }
      out[i + 3] = 255;
    }
  return out;
}

/** 로지스틱 사상 분기 도표 — 가로 r ∈ [2.5, 4], 세로 x ∈ [0, 1] (점이 많이 찍힌 곳일수록 진하게) */
export function logistic(w: number, h: number): Uint8ClampedArray {
  const count = new Float32Array(w * h);
  for (let px = 0; px < w; px++) {
    const r = 2.5 + (1.5 * (px + 0.5)) / w;
    let x = 0.5;
    for (let k = 0; k < 300; k++) x = r * x * (1 - x);
    for (let k = 0; k < 400; k++) {
      x = r * x * (1 - x);
      const py = Math.min(h - 1, Math.max(0, Math.floor((1 - x) * h)));
      count[py * w + px]! += 1;
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = Math.min(1, Math.sqrt(count[i]! / 30));
    out[i * 4] = 30;
    out[i * 4 + 1] = 60;
    out[i * 4 + 2] = 140;
    out[i * 4 + 3] = Math.round(255 * a);
  }
  return out;
}

// ─────────────────────────────────────────────────────────── 로렌츠 끌개

let lorenzCache: V[] | null = null;
/** 로렌츠 방정식을 따라간 점들 (그리기 좌표, 반지름 1 안) */
export function lorenzPoints(): V[] {
  if (lorenzCache) return lorenzCache;
  const s = 10;
  const r = 28;
  const b = 8 / 3;
  const f = ([x, y, z]: V): V => [s * (y - x), x * (r - z) - y, x * y - b * z];
  let p: V = [0.1, 0, 0];
  const dt = 0.008;
  const pts: V[] = [];
  for (let k = 0; k < 7000; k++) {
    // 4차 룽게-쿠타
    const k1 = f(p);
    const k2 = f([p[0] + (dt / 2) * k1[0], p[1] + (dt / 2) * k1[1], p[2] + (dt / 2) * k1[2]]);
    const k3 = f([p[0] + (dt / 2) * k2[0], p[1] + (dt / 2) * k2[1], p[2] + (dt / 2) * k2[2]]);
    const k4 = f([p[0] + dt * k3[0], p[1] + dt * k3[1], p[2] + dt * k3[2]]);
    p = [p[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), p[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]), p[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])];
    if (k > 200) pts.push([p[0] / 25, (p[2] - 25) / 25, p[1] / 25]);
  }
  lorenzCache = pts;
  return pts;
}

// ─────────────────────────────────────────────────────────── 라이프 게임

export const LIFE_ROWS = 26;
export const LIFE_COLS = 40;

/** 고스퍼 글라이더 총 (글라이더를 끝없이 쏘아 낸다) */
export const GOSPER: Array<[number, number]> = (
  [
    [5, 1], [5, 2], [6, 1], [6, 2],
    [5, 11], [6, 11], [7, 11], [4, 12], [8, 12], [3, 13], [9, 13], [3, 14], [9, 14], [6, 15], [4, 16], [8, 16], [5, 17], [6, 17], [7, 17], [6, 18],
    [3, 21], [4, 21], [5, 21], [3, 22], [4, 22], [5, 22], [2, 23], [6, 23], [1, 25], [2, 25], [6, 25], [7, 25],
    [3, 35], [4, 35], [3, 36], [4, 36],
  ] as Array<[number, number]>
).map(([r, c]) => [r + 1, c + 1]);

/** 한 세대 앞으로 (가장자리 밖은 죽은 칸) */
export function lifeStep(cells: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const alive = new Set(cells.map(([r, c]) => r * LIFE_COLS + c));
  const counts = new Map<number, number>();
  for (const [r, c] of cells)
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= LIFE_ROWS || cc >= LIFE_COLS) continue;
        const k = rr * LIFE_COLS + cc;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
  const next: Array<[number, number]> = [];
  for (const [k, n] of counts) if (n === 3 || (n === 2 && alive.has(k))) next.push([Math.floor(k / LIFE_COLS), k % LIFE_COLS]);
  return next.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
