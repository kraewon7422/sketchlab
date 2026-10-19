import { add, div, eq, frac, fromNumber, isZero, mul, neg, ONE, sub, texFrac, textFrac, toNumber, ZERO, type Frac } from "./fraction";

/**
 * 선형대수 (연립일차방정식·행렬) — 정확한 분수로 가우스-조르단 소거.
 * 식 해석은 하지 않는다 (latex.ts가 계수를 넘겨준다). 이 파일은 순수 계산.
 */

export type Matrix = Frac[][];

/** 기약 행 사다리꼴(RREF)과 피벗 열 */
export function rref(M: Matrix): { R: Matrix; pivots: number[] } {
  const R = M.map((row) => [...row]);
  const rows = R.length;
  const cols = R[0]?.length ?? 0;
  const pivots: number[] = [];
  let r = 0;
  for (let c = 0; c < cols && r < rows; c++) {
    let p = r;
    while (p < rows && isZero((R[p] as Frac[])[c] as Frac)) p++;
    if (p === rows) continue;
    [R[r], R[p]] = [R[p] as Frac[], R[r] as Frac[]];
    const row = R[r] as Frac[];
    const pv = row[c] as Frac;
    for (let j = 0; j < cols; j++) row[j] = div(row[j] as Frac, pv);
    for (let i = 0; i < rows; i++) {
      if (i === r) continue;
      const other = R[i] as Frac[];
      const f = other[c] as Frac;
      if (isZero(f)) continue;
      for (let j = 0; j < cols; j++) other[j] = sub(other[j] as Frac, mul(f, row[j] as Frac));
    }
    pivots.push(c);
    r++;
  }
  return { R, pivots };
}

export type Solution =
  | { kind: "unique"; values: Frac[] }
  | { kind: "none" }
  /** 해가 무수히 많음: 자유변수 인덱스, 각 피벗 변수 = 상수 + Σ 계수·자유변수 */
  | { kind: "infinite"; free: number[]; R: Matrix; pivots: number[] };

/** A x = b 풀기 (A: m×n) */
export function solve(A: Matrix, b: Frac[]): Solution {
  const n = A[0]?.length ?? 0;
  const aug = A.map((row, i) => [...row, b[i] as Frac]);
  const { R, pivots } = rref(aug);
  if (pivots.includes(n)) return { kind: "none" }; // 0 = (0이 아닌 수) 줄
  if (pivots.length === n) return { kind: "unique", values: Array.from({ length: n }, (_, j) => (R[pivots.indexOf(j)] as Frac[])[n] as Frac) };
  const free = Array.from({ length: n }, (_, j) => j).filter((j) => !pivots.includes(j));
  return { kind: "infinite", free, R, pivots };
}

export function det(M: Matrix): Frac {
  const n = M.length;
  if (n === 0 || M.some((r) => r.length !== n)) throw new Error("정사각행렬이 아니에요");
  const A = M.map((r) => [...r]);
  let d = ONE;
  for (let c = 0; c < n; c++) {
    let p = c;
    while (p < n && isZero((A[p] as Frac[])[c] as Frac)) p++;
    if (p === n) return ZERO;
    if (p !== c) {
      [A[c], A[p]] = [A[p] as Frac[], A[c] as Frac[]];
      d = neg(d);
    }
    const pv = (A[c] as Frac[])[c] as Frac;
    d = mul(d, pv);
    for (let i = c + 1; i < n; i++) {
      const f = div((A[i] as Frac[])[c] as Frac, pv);
      if (isZero(f)) continue;
      for (let j = c; j < n; j++) (A[i] as Frac[])[j] = sub((A[i] as Frac[])[j] as Frac, mul(f, (A[c] as Frac[])[j] as Frac));
    }
  }
  return d;
}

export function inverse(M: Matrix): Matrix | null {
  const n = M.length;
  if (M.some((r) => r.length !== n)) throw new Error("정사각행렬이 아니에요");
  const aug = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO))]);
  const { R, pivots } = rref(aug);
  if (pivots.length < n || pivots.slice(0, n).some((p, i) => p !== i)) return null;
  return R.map((row) => row.slice(n));
}

export const rank = (M: Matrix) => rref(M).pivots.length;
export const transpose = (M: Matrix): Matrix => (M[0] ?? []).map((_, j) => M.map((r) => r[j] as Frac));

export function multiply(A: Matrix, B: Matrix): Matrix {
  const n = A[0]?.length ?? 0;
  if (n !== B.length) throw new Error(`곱할 수 없어요: ${A.length}×${n} · ${B.length}×${B[0]?.length ?? 0}`);
  return A.map((row) => (B[0] ?? []).map((_, j) => row.reduce((s, a, k) => add(s, mul(a, (B[k] as Frac[])[j] as Frac)), ZERO)));
}

// ─────────────────────────────────────────────────────────── 표시 (LaTeX)

export function texMatrix(M: Matrix, kind: "pmatrix" | "bmatrix" = "pmatrix"): string {
  return `\\begin{${kind}}${M.map((r) => r.map(texFrac).join(" & ")).join(" \\\\ ")}\\end{${kind}}`;
}

/** 첨가행렬 [A | b] */
export function texAugmented(M: Matrix): string {
  const n = (M[0]?.length ?? 1) - 1;
  return `\\left[\\begin{array}{${"c".repeat(n)}|c}${M.map((r) => r.map(texFrac).join(" & ")).join(" \\\\ ")}\\end{array}\\right]`;
}

/** 2x - \frac{1}{3}y + z 처럼 (계수 1·−1·0 처리) */
export function texLinear(coefs: Frac[], vars: readonly string[], constant: Frac = ZERO): string {
  const terms: string[] = [];
  coefs.forEach((c, i) => {
    if (isZero(c)) return;
    const neg_ = c.n < 0n;
    const absC = neg_ ? neg(c) : c;
    const coef = eq(absC, ONE) ? "" : texFrac(absC);
    terms.push(`${terms.length === 0 ? (neg_ ? "-" : "") : neg_ ? " - " : " + "}${coef}${vars[i]}`);
  });
  if (!isZero(constant) || terms.length === 0) {
    const negC = constant.n < 0n;
    terms.push(terms.length === 0 ? texFrac(constant) : `${negC ? " - " : " + "}${texFrac(negC ? neg(constant) : constant)}`);
  }
  return terms.join("");
}

/** 해를 LaTeX로 */
export function texSolution(sol: Solution, vars: readonly string[]): string {
  if (sol.kind === "none") return "\\text{해가 없어요 (모순)}";
  if (sol.kind === "unique") return sol.values.map((v, i) => `${vars[i]} = ${texFrac(v)}`).join(",\\; ");
  // 자유변수를 매개변수 t, s, … 로
  const names = ["t", "s", "u", "v"];
  const param = new Map(sol.free.map((j, k) => [j, names[k] ?? `t_${k}`]));
  const n = vars.length;
  const parts = vars.map((v, j) => {
    if (param.has(j)) return `${v} = ${param.get(j)}`;
    const row = sol.R[sol.pivots.indexOf(j)] as Frac[];
    const coefs = sol.free.map((f) => neg(row[f] as Frac));
    return `${v} = ${texLinear(coefs, sol.free.map((f) => param.get(f) as string), row[n] as Frac)}`;
  });
  return `${parts.join(",\\; ")}\\quad(${[...param.values()].join(", ")}\\text{는 아무 수})`;
}

export function textPoint(values: Frac[]): string {
  return `(${values.map(textFrac).join(", ")})`;
}

// ─────────────────────────────────────────────────────────── 입력 해석

/** "[[1,2],[3,4]]", "[1 2; 3 4]", \begin{pmatrix}1&2\\3&4\end{pmatrix} → 행렬. 아니면 null */
export function parseMatrix(src: string): Matrix | null {
  const s = src.trim();
  let rows: string[][] | null = null;
  const env = /^\\begin\{([pbvB]?matrix)\}([\s\S]*)\\end\{\1\}$/.exec(s);
  if (env) rows = (env[2] as string).split(/\\\\/).map((r) => r.split("&"));
  else if (/^\[\s*\[/.test(s) && /\]\s*\]$/.test(s)) {
    rows = s
      .slice(1, -1)
      .split(/\]\s*,?\s*\[/)
      .map((r) => r.replace(/[[\]]/g, "").split(/[,\s]+/));
  } else if (/^\[[^[\]]*;[^[\]]*\]$/.test(s)) {
    rows = s
      .slice(1, -1)
      .split(";")
      .map((r) => r.trim().split(/[,\s]+/));
  }
  if (!rows) return null;
  const M = rows.map((r) => r.map((x) => x.trim()).filter(Boolean).map(parseNumber));
  if (M.length === 0 || M.some((r) => r.length === 0 || r.length !== (M[0] as (Frac | null)[]).length || r.some((x) => x === null))) return null;
  return M as Matrix;
}

/** 3, -2, 1/2, \frac{1}{2}, 0.25 */
function parseNumber(x: string): Frac | null {
  const t = x.replace(/\s+/g, "").replace(/−/g, "-");
  const f = /^(-?)\\frac\{(-?\d+)\}\{(-?\d+)\}$/.exec(t);
  if (f) return frac(BigInt(f[2] as string) * (f[1] ? -1n : 1n), BigInt(f[3] as string));
  const q = /^(-?\d+)\/(-?\d+)$/.exec(t);
  if (q && BigInt(q[2] as string) !== 0n) return frac(BigInt(q[1] as string), BigInt(q[2] as string));
  if (/^-?\d+(\.\d+)?$/.test(t)) return fromNumber(Number(t));
  return null;
}

/**
 * 연립방정식 입력을 식 하나씩으로 나눈다.
 *   "2x+3y=7, x-y=1"  "2x+3y=7; x-y=1"  줄바꿈
 *   \begin{cases} 2x+3y=7 \\ x-y=1 \end{cases}
 * 괄호 안의 쉼표(f(1,2))는 나누지 않는다. 식이 2개 이상이고 모두 '='가 하나씩일 때만.
 */
export function splitSystem(src: string): string[] | null {
  const s = src.trim();
  let parts: string[];
  const cases = /^\\begin\{(cases|aligned|array)\}(?:\{[^}]*\})?([\s\S]*)\\end\{\1\}$/.exec(s);
  if (cases) parts = (cases[2] as string).split(/\\\\/).map((p) => p.replace(/&/g, ""));
  else {
    parts = [];
    let depth = 0;
    let cur = "";
    for (const ch of s) {
      if ("([{".includes(ch)) depth++;
      if (")]}".includes(ch)) depth--;
      if (depth === 0 && (ch === "," || ch === ";" || ch === "\n")) {
        parts.push(cur);
        cur = "";
      } else cur += ch;
    }
    parts.push(cur);
  }
  parts = parts.map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.some((p) => (p.match(/=/g) ?? []).length !== 1)) return null;
  return parts;
}

/** 변수 순서: x y z w 먼저, 나머지는 알파벳 */
export function orderVars(vars: Iterable<string>): string[] {
  const pref = ["x", "y", "z", "w"];
  return [...new Set(vars)].sort((a, b) => {
    const ia = pref.indexOf(a);
    const ib = pref.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b);
  });
}

/**
 * F(vars) = 0 꼴의 식이 일차인지 확인하고 계수를 정확한 분수로 꺼낸다.
 * F(v) = Σ a_i v_i + F(0) 가 여러 점에서 맞아야 일차. a_i 는 F(e_i) − F(0).
 * 반환: { coefs: a_i, rhs: −F(0) } (a·v = rhs). 일차가 아니면 null.
 */
export function linearCoefficients(F: (...v: number[]) => number, nVars: number): { coefs: Frac[]; rhs: Frac } | null {
  const zero = Array<number>(nVars).fill(0);
  const f0 = F(...zero);
  if (!Number.isFinite(f0)) return null;
  const a = Array.from({ length: nVars }, (_, i) => {
    const e = [...zero];
    e[i] = 1;
    return F(...e) - f0;
  });
  if (a.some((v) => !Number.isFinite(v))) return null;
  for (const probe of [
    [2.5, -1.75, 3.25, 0.5],
    [-3.1, 4.2, -0.7, 2.9],
    [7, 11, -5, 13],
  ]) {
    const p = probe.slice(0, nVars);
    while (p.length < nVars) p.push(1.3);
    const want = a.reduce((s, ai, i) => s + ai * (p[i] as number), f0);
    const got = F(...p);
    if (!Number.isFinite(got) || Math.abs(got - want) > 1e-7 * Math.max(1, Math.abs(want))) return null;
  }
  const coefs = a.map((v) => fromNumber(v));
  const rhs = fromNumber(-f0);
  if (coefs.some((c) => c === null) || !rhs) return null;
  return { coefs: coefs as Frac[], rhs };
}

export { toNumber };
