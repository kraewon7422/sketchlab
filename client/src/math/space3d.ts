import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { equationResidual } from "./latex";

/**
 * 좌표공간 속 곡면·입체 (6단계) — 입력한 식을 공간좌표 그림으로.
 *
 *   z = f(x, y)              곡면 (포물면·안장면·sin x cos y …)
 *   x + 2y − z = 4           평면
 *   (x−1)² + y² + z² = 9     구 — 식을 2차식으로 맞춰 보고 중심·반지름을 읽는다
 *   x² + y² = 4              원기둥 (빠진 변수의 축과 나란하게)
 *   평행육면체 (1,0,0),(1,2,0),(0,1,2)   세 벡터로 만든 평행육면체 + 부피 |a·(b×c)|
 *
 * 쉼표로 여러 개를 함께 (구와 평면 등). 모두 평면이면 연립방정식(linearBuild)으로 넘긴다.
 */

type V3 = [number, number, number];
type Shape = NonNullable<Extract<SceneIR, { kind: "space3d" }>["data"]["shapes"]>[number];
type Piece = { kind: "plane"; normal: V3; d: number; latex: string } | { kind: "shape"; shape: Shape; latex: string } | { kind: "surface"; latex: string; zmax: number };

const meta = (): Pick<SceneIR, "version" | "confidence" | "source"> => ({ version: IR_VERSION, confidence: 1, source: "manual" });

/** 괄호 밖의 쉼표·세미콜론으로 나눈다 */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (depth === 0 && (ch === "," || ch === ";")) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

const fmt = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
};

/** 2차 이하 다항식이면 계수 (F = Σ A_ij x_i x_j + Σ B_i x_i + c) */
export function quadraticFit(F: (x: number, y: number, z: number) => number): { A: number[][]; B: V3; c: number } | null {
  const f = (p: readonly number[]) => F(p[0] as number, p[1] as number, p[2] as number);
  const e = (i: number, s = 1) => [0, 1, 2].map((k) => (k === i ? s : 0));
  const c = f([0, 0, 0]);
  if (!Number.isFinite(c)) return null;
  const A = [0, 1, 2].map(() => [0, 0, 0]);
  const B: V3 = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const p = f(e(i));
    const m = f(e(i, -1));
    (A[i] as number[])[i] = (p + m - 2 * c) / 2;
    B[i] = (p - m) / 2;
  }
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) {
      const both = f([0, 1, 2].map((k) => (k === i || k === j ? 1 : 0)));
      const v = both - c - B[i]! - B[j]! - (A[i] as number[])[i]! - (A[j] as number[])[j]!;
      (A[i] as number[])[j] = v / 2;
      (A[j] as number[])[i] = v / 2;
    }
  // 맞는지 아무 점에서나 확인 (2차식이 아니면 여기서 걸린다)
  const model = (p: readonly number[]) => {
    let s = c;
    for (let i = 0; i < 3; i++) {
      s += B[i]! * (p[i] as number);
      for (let j = 0; j < 3; j++) s += (A[i] as number[])[j]! * (p[i] as number) * (p[j] as number);
    }
    return s;
  };
  for (const p of [
    [0.37, -1.21, 0.83],
    [2.1, 0.45, -1.7],
    [-1.3, 1.9, 2.4],
    [0.9, 2.7, -0.6],
  ]) {
    const v = f(p);
    if (!Number.isFinite(v) || Math.abs(v - model(p)) > 1e-6 * Math.max(1, Math.abs(v))) return null;
  }
  return { A, B, c };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** needZ: z가 없는 식(x²+y²=4)은 평면 그래프다 — 다른 식에 z가 있거나 "공간"을 붙였을 때만 공간에 */
function classify(eq: string, needZ: boolean): Piece | { error: string } | null {
  const r = equationResidual(eq);
  if (!r) return null;
  if (needZ && !r.vars.includes("z")) return null;
  if (r.vars.some((v) => !["x", "y", "z"].includes(v))) return { error: "공간 식에는 x, y, z만 쓸 수 있어요" };
  const F = r.F(["x", "y", "z"]) as (x: number, y: number, z: number) => number;
  const q = quadraticFit(F);
  if (q) {
    const { A, B, c } = q;
    const a = (i: number, j: number) => (A[i] as number[])[j] as number;
    const quad = [0, 1, 2].some((i) => [0, 1, 2].some((j) => !near(a(i, j), 0)));
    if (!quad) {
      if (B.every((b) => near(b, 0))) return { error: "x, y, z가 모두 지워졌어요" };
      return { kind: "plane", normal: [B[0], B[1], B[2]], d: -c, latex: r.latex };
    }
    const cross = !near(a(0, 1), 0) || !near(a(0, 2), 0) || !near(a(1, 2), 0);
    const diag = [a(0, 0), a(1, 1), a(2, 2)];
    if (!cross) {
      // 구: 세 제곱 계수가 같다
      if (near(diag[0]!, diag[1]!) && near(diag[1]!, diag[2]!)) {
        const k = diag[0] as number;
        const center = B.map((b) => -b / (2 * k)) as V3;
        const r2 = center.reduce((s, v) => s + v * v, 0) - c / k;
        if (r2 <= 1e-12) return { error: "반지름이 0 이하인 구예요 (그릴 점이 없어요)" };
        return { kind: "shape", shape: { t: "sphere", c: center.map((v) => +fmt(v)) as V3, r: Math.sqrt(r2) }, latex: r.latex };
      }
      // 원기둥: 한 변수가 아예 없고 나머지 두 제곱 계수가 같다
      for (let ax = 0; ax < 3; ax++) {
        const o = [0, 1, 2].filter((i) => i !== ax) as [number, number];
        if (near(diag[ax]!, 0) && near(B[ax]!, 0) && near(diag[o[0]]!, diag[o[1]]!)) {
          const k = diag[o[0]] as number;
          const center: V3 = [0, 0, 0];
          for (const i of o) center[i] = -B[i]! / (2 * k);
          const r2 = center.reduce((s, v) => s + v * v, 0) - c / k;
          if (r2 <= 1e-12) return { error: "반지름이 0 이하인 원기둥이에요" };
          return { kind: "shape", shape: { t: "cylinder", axis: (["x", "y", "z"] as const)[ax]!, c: center.map((v) => +fmt(v)) as V3, r: Math.sqrt(r2) }, latex: r.latex };
        }
      }
    }
  }
  // z에 대해 일차 → z = f(x, y) 곡면 (포물면·안장면·삼각함수 곡면)
  const probes: Array<[number, number]> = [
    [0.3, -0.7],
    [1.4, 0.9],
    [-1.1, 1.6],
  ];
  const ks = probes.map(([x, y]) => F(x, y, 1) - F(x, y, 0));
  const lin = ks.every((k) => Number.isFinite(k) && Math.abs(k) > 1e-9 && near(k, ks[0] as number)) && probes.every(([x, y]) => near(F(x, y, 2) - F(x, y, 0), 2 * (ks[0] as number)));
  if (lin) {
    // z축 범위를 곡면에 맞춘다 (x, y ∈ [−3, 3]) — 안 그러면 포물면 가장자리가 잘려 들쭉날쭉
    let zmax = 0;
    for (let i = 0; i <= 12; i++)
      for (let j = 0; j <= 12; j++) {
        const x = -3 + i / 2;
        const y = -3 + j / 2;
        const f0 = F(x, y, 0);
        const z = -f0 / (F(x, y, 1) - f0);
        if (Number.isFinite(z)) zmax = Math.max(zmax, Math.abs(z));
      }
    return { kind: "surface", latex: r.latex, zmax };
  }
  return { error: "공간 곡면은 z = f(x, y) 꼴, 평면, 구, 원기둥만 그릴 수 있어요" };
}

const VEC = String.raw`\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)`;

/** "평행육면체 (1,0,0),(1,2,0),(0,1,2)" → 세 벡터 */
export function parseParallelepiped(input: string): [V3, V3, V3] | null {
  const m = new RegExp(String.raw`^\s*(?:평행육면체|parallelepiped)\s*:?\s*${VEC}\s*,?\s*${VEC}\s*,?\s*${VEC}\s*$`, "i").exec(input);
  if (!m) return null;
  const n = m.slice(1, 10).map(Number);
  return [n.slice(0, 3) as V3, n.slice(3, 6) as V3, n.slice(6, 9) as V3];
}

export const triple = (a: V3, b: V3, c: V3): number => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);

/** 공간 식 → IR. 공간 식이 아니면 null, 공간 식인데 못 그리면 { error } */
export function buildSpace(input: string): SceneIR | { error: string } | null {
  const pp = parseParallelepiped(input);
  if (pp) {
    const [a, b, c] = pp;
    const v = triple(a, b, c);
    const reach = Math.max(...[0, 1, 2].map((i) => Math.abs(a[i]!) + Math.abs(b[i]!) + Math.abs(c[i]!)));
    const vec = (p: V3) => `(${p.map(fmt).join(", ")})`;
    return {
      ...meta(),
      kind: "space3d",
      data: {
        view: { range: Math.max(3, Math.ceil(reach * 1.15)) },
        shapes: [{ t: "parallelepiped", o: [0, 0, 0], a, b, c }],
        vectors: [
          { from: [0, 0, 0], to: a, label: "a" },
          { from: [0, 0, 0], to: b, label: "b" },
          { from: [0, 0, 0], to: c, label: "c" },
        ],
        caption:
          `\\begin{gathered}\\vec a=${vec(a)},\\ \\vec b=${vec(b)},\\ \\vec c=${vec(c)}\\\\` +
          `V=\\left|\\vec a\\cdot(\\vec b\\times\\vec c)\\right|=${fmt(Math.abs(v))}` +
          (Math.abs(v) < 1e-9 ? "\\ (\\text{세 벡터가 한 평면 위})" : "") +
          "\\end{gathered}",
        showProjections: false,
      },
    };
  }
  const forced = /^\s*(?:공간|3d)\s*:?\s*/i.exec(input);
  const parts = splitTop(forced ? input.slice(forced[0].length) : input);
  if (parts.length === 0 || parts.length > 4) return null;
  const needZ = !forced && !parts.some((p) => equationResidual(p)?.vars.includes("z"));
  const pieces: Piece[] = [];
  for (const p of parts) {
    const k = classify(p, needZ);
    if (k === null) return null;
    if ("error" in k) return parts.length === 1 ? k : null;
    pieces.push(k);
  }
  // 평면 여러 개 = 연립방정식 (교점을 정확히 푼다) — 그쪽에 맡긴다
  if (pieces.length > 1 && pieces.every((p) => p.kind === "plane")) return null;
  const shapes = pieces.flatMap((p) => (p.kind === "shape" ? [p.shape] : []));
  const reach = Math.max(
    3,
    ...shapes.map((s) => (s.t === "sphere" ? Math.max(...s.c.map(Math.abs)) + s.r : s.t === "cylinder" ? Math.max(...s.c.map(Math.abs)) + s.r : 3)),
  );
  // 곡면만 있으면: x, y는 ±3, z는 곡면 높이에 맞춰 (보기 좋은 수로 올림, 너무 크면 잘라서)
  const surfaceOnly = pieces.every((p) => p.kind === "surface");
  const zmax = Math.max(...pieces.map((p) => (p.kind === "surface" ? p.zmax : 0)));
  const nice = (v: number) => {
    const e = 10 ** Math.floor(Math.log10(v));
    return [1, 1.5, 2, 3, 4, 5, 6, 8, 10].map((m) => m * e).find((m) => m >= v * 0.999) ?? 10 * e;
  };
  const view = surfaceOnly && zmax > 1e-9 ? { range: 3, axes: { x: 3, y: 3, z: nice(Math.min(zmax, 50)) } } : { range: Math.ceil(reach * 1.25) };
  return {
    ...meta(),
    kind: "space3d",
    data: {
      view,
      ...(shapes.length ? { shapes } : {}),
      ...(pieces.some((p) => p.kind === "surface") ? { surfaces: pieces.flatMap((p) => (p.kind === "surface" ? [{ latex: p.latex }] : [])) } : {}),
      ...(pieces.some((p) => p.kind === "plane") ? { planes: pieces.flatMap((p) => (p.kind === "plane" ? [{ normal: p.normal, d: p.d }] : [])) } : {}),
      caption: pieces.map((p) => p.latex).join(",\\quad "),
      showProjections: false,
    },
  };
}

/** 미리보기 문구 */
export function describeSpace(ir: Extract<SceneIR, { kind: "space3d" }>): string {
  const d = ir.data;
  const names = [
    ...(d.shapes ?? []).map((s) => (s.t === "sphere" ? `구 (중심 (${s.c.map(fmt).join(", ")}), 반지름 ${fmt(s.r)})` : s.t === "cylinder" ? `${s.axis}축 방향 원기둥 (반지름 ${fmt(s.r)})` : "평행육면체 · 부피 |a·(b×c)|")),
    ...(d.surfaces ?? []).map(() => "곡면 z = f(x, y)"),
    ...(d.planes ?? []).map(() => "평면"),
  ];
  return `공간좌표 · ${names.join(" + ")} · 드래그해서 돌려 보기`;
}
