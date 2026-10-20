import { ComputeEngine, compile } from "@cortex-js/compute-engine";
import { isTrigOnly } from "./axes";

/**
 * LaTeX → 그래프로 쓸 수 있는 것 (마스터스펙 v4 §10).
 *
 * Compute Engine(파싱·계산)을 감싸는 유일한 곳이다 — CE는 0.x라 API가 버전마다 바뀌므로
 * 여기 밖에서는 CE를 직접 부르지 않는다. 이 모듈은 lazy 청크 안에서만 import 된다.
 *
 * 평가는 compile(..., { mode: "strict" }): 실수 그래프에는 복소수가 필요 없다.
 * √(−1), ln(−1), 1/0 같은 값은 NaN/∞ 로 나오고 샘플러가 "끊김"으로 처리한다.
 * compile이 못 하는 식은 CE가 알아서 해석(N) 폴백으로 돌린다 (스펙의 3단 폴백이 내장).
 */

const ce = new ComputeEngine();

type Json = unknown;

/** 그래프 변수(계수 슬라이더 후보에서 빠지는 이름) */
const RESERVED = new Set(["x", "y", "t", "r", "theta", "e", "i", "pi", "Pi", "ExponentialE", "ImaginaryUnit"]);

export type Analysis =
  | { kind: "explicit"; rhs: Json; params: string[]; trig: boolean; latex: string }
  | { kind: "implicit"; F: Json; params: string[]; latex: string }
  | { kind: "polar"; rhs: Json; params: string[]; latex: string }
  | { kind: "integral"; body: Json; variable: string; from: number; to: number; params: string[]; latex: string }
  /** 부등식 (사슬 1 < x+y < 3 포함) — 조건마다 F < 0 또는 F ≤ 0 꼴로 */
  | { kind: "inequality"; parts: Array<{ F: Json; strict: boolean }>; params: string[]; latex: string }
  | { kind: "formula"; latex: string }
  | { kind: "error"; message: string; latex: string };

/**
 * 손으로 친 식을 LaTeX로 다듬는다: sin(x) → \sin(x), sqrt(x) → \sqrt{x}, pi → \pi, ** → ^.
 * 이미 LaTeX인 부분(\sin 등)은 건드리지 않는다. 파서가 아니라 철자 보정일 뿐이다.
 */
export function normalizeInput(text: string): string {
  let s = text.trim().replace(/\*\*/g, "^");
  // sqrt(...) → \sqrt{...} (괄호 짝 맞춰서)
  for (;;) {
    const m = /(?<!\\)\bsqrt\s*\(/.exec(s);
    if (!m) break;
    let depth = 0;
    let end = -1;
    for (let i = m.index + m[0].length - 1; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) break;
    s = `${s.slice(0, m.index)}\\sqrt{${s.slice(m.index + m[0].length, end)}}${s.slice(end + 1)}`;
  }
  s = s.replace(/(?<![\\a-zA-Z])(arcsin|arccos|arctan|sin|cos|tan|sec|csc|cot|ln|log|exp)(?=[^a-zA-Z]|[a-zA-Z]|$)/g, "\\$1 ");
  s = s.replace(/(?<![\\a-zA-Z])(pi|theta)(?![a-zA-Z])/g, "\\$1 ");
  // 명령 뒤 공백은 글자가 이어질 때만 필요하다 (\sin x). 그 외(\sin(x), \pi*x)는 지운다.
  return s.replace(/ +/g, " ").replace(/(\\[a-zA-Z]+) (?=[^a-zA-Z ]|$)/g, "$1").trim();
}

function freeVars(json: Json): string[] {
  try {
    return [...ce.box(json as never).freeVariables];
  } catch {
    return [];
  }
}

function paramsOf(json: Json, graphVars: readonly string[]): string[] | null {
  const extra = freeVars(json).filter((v) => !graphVars.includes(v) && !RESERVED.has(v));
  if (extra.some((v) => !/^[a-zA-Z]$/.test(v)) || extra.length > 4) return null;
  return extra.sort();
}

function numeric(json: Json): number {
  try {
    const v = ce.box(json as never).N().re;
    return typeof v === "number" ? v : NaN;
  } catch {
    return NaN;
  }
}

export function analyze(input: string): Analysis {
  const latex = normalizeInput(input);
  if (!latex) return { kind: "error", message: "식이 비어 있어요", latex };
  const expr = ce.parse(latex);
  if (!expr.isValid) return { kind: "error", message: "식을 해석하지 못했어요", latex };
  const json = expr.json as Json;

  const asFormula: Analysis = { kind: "formula", latex };

  if (Array.isArray(json) && json[0] === "Integrate") {
    const [, fn, limits] = json as [string, Json, Json];
    if (Array.isArray(fn) && fn[0] === "Function" && Array.isArray(limits) && limits[0] === "Limits") {
      let body = fn[1];
      if (Array.isArray(body) && body[0] === "Block" && body.length === 2) body = body[1];
      const variable = String(fn[2]);
      const from = numeric(limits[2]);
      const to = numeric(limits[3]);
      const params = paramsOf(body, [variable]);
      if (Number.isFinite(from) && Number.isFinite(to) && params) {
        return { kind: "integral", body, variable, from, to, params, latex };
      }
    }
    return asFormula;
  }

  // 부등식: Less / LessEqual / Greater / GreaterEqual (a < b < c 사슬은 인자가 셋 이상)
  const REL: Record<string, { strict: boolean; flip: boolean }> = {
    Less: { strict: true, flip: false },
    LessEqual: { strict: false, flip: false },
    Greater: { strict: true, flip: true },
    GreaterEqual: { strict: false, flip: true },
  };
  const rel = Array.isArray(json) ? REL[json[0] as string] : undefined;
  if (rel && Array.isArray(json) && json.length >= 3) {
    const vars = freeVars(json);
    if (vars.includes("x") || vars.includes("y")) {
      const args = json.slice(1) as Json[];
      const parts = args.slice(0, -1).map((a, i) => {
        const b = args[i + 1];
        // a < b ⇔ a − b < 0 ,  a > b ⇔ b − a < 0
        return { F: rel.flip ? ["Subtract", b, a] : ["Subtract", a, b], strict: rel.strict };
      });
      const params = paramsOf(json, ["x", "y"]);
      if (params) return { kind: "inequality", parts, params, latex };
    }
    return asFormula;
  }

  if (Array.isArray(json) && json[0] === "Equal" && json.length === 3) {
    const [, lhs, rhs] = json as [string, Json, Json];
    const fx = Array.isArray(lhs) && lhs.length === 2 && lhs[1] === "x" && typeof lhs[0] === "string";
    for (const [l, r] of [
      [lhs, rhs],
      [rhs, lhs],
    ] as const) {
      if (l === "y" || (fx && l === lhs)) {
        const vars = freeVars(r);
        if (vars.includes("y")) break;
        const params = paramsOf(r, ["x"]);
        if (params) return { kind: "explicit", rhs: r, params, trig: isTrigOnly(r), latex };
      }
      if (l === "r") {
        const params = paramsOf(r, ["theta"]);
        if (params) return { kind: "polar", rhs: r, params, latex };
      }
    }
    const vars = freeVars(json);
    if (vars.includes("x") || vars.includes("y")) {
      const F = ["Subtract", lhs, rhs];
      const params = paramsOf(F, ["x", "y"]);
      if (params) return { kind: "implicit", F, params, latex };
    }
    return asFormula;
  }

  // 등호 없는 식: x만 있으면 y = (식) 그래프
  const vars = freeVars(json);
  if (vars.includes("x") && !vars.includes("y")) {
    const params = paramsOf(json, ["x"]);
    if (params) return { kind: "explicit", rhs: json, params, trig: isTrigOnly(json), latex };
  }
  return asFormula;
}

/**
 * 등식 하나 → (왼쪽 − 오른쪽)과 그 안의 변수들 (선형대수용).
 * 변수는 한 글자 이름만 (e·π·i 같은 상수는 빼고). 등식이 아니거나 해석이 안 되면 null.
 */
export function equationResidual(input: string): { vars: string[]; F: (names: readonly string[]) => (...v: number[]) => number; latex: string } | null {
  const latex = normalizeInput(input);
  if (!latex) return null;
  const expr = ce.parse(latex);
  if (!expr.isValid) return null;
  const json = expr.json as Json;
  if (!Array.isArray(json) || json[0] !== "Equal" || json.length !== 3) return null;
  const F = ["Subtract", json[1], json[2]];
  const vars = freeVars(F).filter((v) => /^[a-zA-Z]$/.test(v) && v !== "e" && v !== "i");
  if (vars.length === 0) return null;
  return { vars, F: (names) => toFunction(F, names), latex };
}

/** MathJSON → JS 함수. 변수 이름 목록 순서대로 인자를 받는다. */
export function toFunction(json: Json, varNames: readonly string[]): (...args: number[]) => number {
  const result = compile(ce.box(json as never), { mode: "strict" });
  const run = result.run as ((vars: Record<string, number>) => unknown) | undefined;
  if (!run) return () => NaN;
  const vars: Record<string, number> = {};
  return (...args: number[]) => {
    for (let i = 0; i < varNames.length; i++) vars[varNames[i] as string] = args[i] as number;
    let v: unknown;
    try {
      v = run(vars);
    } catch {
      return NaN;
    }
    return typeof v === "number" ? v : NaN;
  };
}

/** MathJSON → LaTeX (화면 표시용) */
export function toLatex(json: Json): string {
  return ce.box(json as never).latex;
}

/**
 * 정적분 값. 기호 결과(8/3)가 나오면 그것도 함께 — 교과서는 "= 8/3 ≈ 2.667" 로 쓴다.
 * 계수(params)가 있으면 그 값을 넣어서 계산한다.
 */
export function definiteIntegral(
  body: Json,
  variable: string,
  from: number,
  to: number,
  params: Record<string, number> = {},
): { exact: string | null; value: number } {
  try {
    const sub = ce.box(body as never).subs(params);
    const integral = ce.box(["Integrate", ["Function", sub.json, variable], ["Limits", variable, from, to]] as never);
    const exact = integral.evaluate();
    const value = exact.N().re;
    const latex = exact.latex;
    const symbolic = !/Integrate|\\int/.test(latex) && !/^-?\d+(\.\d+)?$/.test(latex) ? latex : null;
    return { exact: symbolic, value: typeof value === "number" ? value : NaN };
  } catch {
    return { exact: null, value: NaN };
  }
}
