import { expressionFunction } from "./latex";

/**
 * 풀이 검산 (8단계, Derive 참고) — 풀이를 줄마다 앞 줄과 비교해 맞는지(✓) 틀렸는지(✗) 본다.
 *
 *   식 줄          x^2+2x+1         앞 줄의 값과 같은 식인가 (아무 x에서나 값이 같은가)
 *   이어 쓴 줄      = (x+1)^2        바로 앞의 값과 같은가
 *   등식 사슬      a = b = c        각 = 의 양쪽이 같은 식인가
 *   방정식 줄      2x + 3 = 7       앞 방정식과 해가 같은가 (같은 해 = 맞게 옮긴 것)
 *
 * 기호 계산 대신 수치로: 무작위 점 여러 개에서 값을 비교하고, 방정식은 해를 수치로 찾아 서로 대입한다.
 * 틀리면 반례를 함께 보여 준다 ("x = 1.5에서 앞 줄 6.25, 이 줄 5.25").
 */

export type StepStatus = "ok" | "bad" | "start" | "unknown";
export interface StepResult {
  status: StepStatus;
  /** 사람이 읽는 짧은 설명 (✗일 때 반례) */
  note: string;
}

type Fn = { vars: string[]; at: (env: Record<string, number>) => number; latex: string };

/** 결정적인 난수 (시험이 매번 같게) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function compile(latex: string): Fn | null {
  const e = expressionFunction(latex);
  if (!e) return null;
  const f = e.f(e.vars);
  return { vars: e.vars, latex, at: (env) => f(...e.vars.map((v) => env[v] ?? 0)) };
}

/** 줄 앞의 ⇒ ∴ 같은 표시와 끝의 마침표를 떼고, 맨 앞 '='를 알려 준다 */
export function cleanLine(raw: string): { body: string; continues: boolean } {
  let s = raw.trim();
  s = s.replace(/^(?:\\Rightarrow|\\implies|\\therefore|\\Leftrightarrow|\\iff|⇒|∴|⇔|→|->)\s*/, "");
  s = s.replace(/[.,;。]\s*$/, "").replace(/^\\quad\s*/, "");
  const continues = /^=/.test(s);
  return { body: continues ? s.slice(1).trim() : s, continues };
}

/** 괄호·중괄호 밖의 '=' 로 나눈다 (\le, \ge, \ne 는 등호 아님) */
export function splitEquals(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if ("({[".includes(ch)) depth++;
    if (")}]".includes(ch)) depth--;
    if (ch === "=" && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((p) => p.trim());
}

const fmt = (v: number) => (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : String(Math.round(v * 1000) / 1000)).replace("-", "−");
const envText = (env: Record<string, number>) =>
  Object.entries(env)
    // 줄바꿈이 "x = 2" 가운데서 끊지 않게 (띄어쓰기 대신 붙는 공백)
    .map(([k, v]) => `${k}\u00a0=\u00a0${fmt(v)}`)
    .join(", ");

/** 두 식이 같은 식인가 — 무작위 점에서 값 비교. 반례가 있으면 돌려준다 */
export function sameExpression(a: Fn, b: Fn, seed = 7): { same: boolean | null; counter?: { env: Record<string, number>; a: number; b: number } } {
  const vars = [...new Set([...a.vars, ...b.vars])];
  const r = rng(seed);
  let valid = 0;
  for (let k = 0; k < 24; k++) {
    const env: Record<string, number> = {};
    // 작은 값부터 (정의역 문제가 적게) — 정수 근처도 섞는다
    for (const v of vars) env[v] = k < 6 ? Math.round((r() * 6 - 3) * 2) / 2 + 0.25 : r() * 6 - 3;
    const x = a.at(env);
    const y = b.at(env);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    valid++;
    if (Math.abs(x - y) > 1e-7 * Math.max(1, Math.abs(x), Math.abs(y))) return { same: false, counter: { env, a: x, b: y } };
  }
  return { same: valid >= 4 ? true : null };
}

/** F(…, x, …) = 0 의 해를 (다른 변수는 고정하고) x에 대해 찾는다 — 부호 바뀜 + |F|의 아주 작은 극소 */
function roots(F: (x: number) => number, lo = -60, hi = 60, n = 6000): number[] {
  const out: number[] = [];
  const h = (hi - lo) / n;
  let px = lo;
  let pv = F(px);
  let ppv = Number.NaN;
  for (let i = 1; i <= n; i++) {
    const x = lo + i * h;
    const v = F(x);
    if (Number.isFinite(pv) && Number.isFinite(v)) {
      if (pv === 0) out.push(px);
      else if (pv * v < 0) {
        let a = px;
        let b = x;
        let fa = pv;
        for (let k = 0; k < 80; k++) {
          const m = (a + b) / 2;
          const fm = F(m);
          if (!Number.isFinite(fm)) break;
          if (fa * fm <= 0) b = m;
          else {
            a = m;
            fa = fm;
          }
        }
        const r = (a + b) / 2;
        // 극(분모 0)이 아니라 진짜 해인지
        if (Math.abs(F(r)) < 1e-6 * Math.max(1, Math.abs(pv), Math.abs(v))) out.push(r);
      } else if (Number.isFinite(ppv) && Math.abs(pv) < Math.abs(ppv) && Math.abs(pv) < Math.abs(v)) {
        // 접하는 해 (x² = 0): |F|가 극소이고 거의 0 → 황금분할로 다듬기
        let a = px - h;
        let b = x;
        for (let k = 0; k < 80; k++) {
          const m1 = b - (b - a) / 1.618;
          const m2 = a + (b - a) / 1.618;
          if (Math.abs(F(m1)) < Math.abs(F(m2))) b = m2;
          else a = m1;
        }
        const r = (a + b) / 2;
        if (Math.abs(F(r)) < 1e-9) out.push(r);
      }
    }
    ppv = pv;
    px = x;
    pv = v;
  }
  return out;
}

interface Eq {
  vars: string[];
  F: (env: Record<string, number>) => number;
  latex: string;
}

/**
 * 두 방정식의 해가 같은가. 첫 변수에 대해 풀고 (다른 변수는 무작위로 고정) 서로 대입한다.
 * 반례: 한쪽의 해인데 다른 쪽에서는 성립하지 않는 점.
 */
export function sameSolutions(a: Eq, b: Eq, seed = 11): { same: boolean; counter?: Record<string, number>; which?: "a" | "b" } {
  const vars = [...new Set([...a.vars, ...b.vars])];
  const main = vars[0];
  if (!main) return { same: true };
  const r = rng(seed);
  const trials = vars.length === 1 ? 1 : 5;
  const holds = (eq: Eq, env: Record<string, number>) => {
    const v = eq.F(env);
    if (!Number.isFinite(v)) return false;
    // 크기 기준: 그 근처의 값 크기
    const near = { ...env, [main]: (env[main] ?? 0) + 1 };
    const scale = Math.max(1, Math.abs(eq.F(near)));
    return Math.abs(v) <= 1e-6 * scale;
  };
  for (let t = 0; t < trials; t++) {
    const base: Record<string, number> = {};
    for (const v of vars) if (v !== main) base[v] = Math.round((r() * 6 - 3) * 4) / 4 + 0.5;
    for (const [from, to, which] of [
      [a, b, "a"],
      [b, a, "b"],
    ] as const) {
      for (const x of roots((xv) => from.F({ ...base, [main]: xv }))) {
        const env = { ...base, [main]: x };
        if (!holds(to, env)) return { same: false, counter: env, which };
      }
    }
  }
  return { same: true };
}

/**
 * 연습 문제 답 확인 — 방정식 문제면 답의 해들과 실제 해들이 같은가, 계산 문제면 값이 같은가.
 * true 맞음 · false 틀림 · null 확인할 수 없음 (증명·서술형 등)
 */
export function verifyAnswer(question: string, answer: string): boolean | null {
  const q = cleanLine(question).body.replace(/\\text\{[^}]*\}/g, "").replace(/(?:을|를)?\s*(?:풀어라|구하시오|구하여라|계산하시오)\.?$/, "");
  const parts = splitEquals(q);
  if (parts.length === 2) {
    const [lt, rt] = parts as [string, string];
    const l = compile(lt);
    const r = compile(rt);
    if (!l || !r) return null;
    const vars = [...new Set([...l.vars, ...r.vars])];
    if (vars.length !== 1) return null;
    const v = vars[0] as string;
    // 답: "x = 2, -3" · "x=2 \text{ 또는 } x=-3" · "x = \pm 3"
    const a = answer.replace(/\\text\{[^}]*\}|또는|or|\\quad|\\,/g, ",").replace(/\\pm\s*([^,]+)/g, "$1,-$1");
    const vals: number[] = [];
    for (const piece of a.split(/[,;]/)) {
      const t = piece.replace(new RegExp(`^\\s*${v}\\s*=`), "").trim();
      if (!t) continue;
      const f = compile(t);
      if (!f || f.vars.length) return null;
      const n = f.at({});
      if (!Number.isFinite(n)) return null;
      vals.push(n);
    }
    if (vals.length === 0) return null;
    const F = (x: number) => l.at({ [v]: x }) - r.at({ [v]: x });
    const found = roots(F, -1000, 1000, 40000);
    const near = (p: number, q2: number) => Math.abs(p - q2) < 1e-6 * Math.max(1, Math.abs(p));
    const uniq = vals.filter((x, i) => vals.findIndex((y) => near(x, y)) === i);
    return uniq.length === found.length && uniq.every((x) => found.some((y) => near(x, y)));
  }
  if (parts.length === 1) {
    const f = compile(parts[0] as string);
    const g = compile(answer.replace(/^\s*=\s*/, ""));
    if (!f || !g || f.vars.length || g.vars.length) return null;
    const x = f.at({});
    const y = g.at({});
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x));
  }
  return null;
}

/** 풀이 줄들 → 줄마다 결과 */
export function checkSteps(lines: readonly string[]): StepResult[] {
  const out: StepResult[] = [];
  let prevValue: Fn | null = null;
  let prevEq: Eq | null = null;

  for (const raw of lines) {
    const { body, continues } = cleanLine(raw);
    if (!body) {
      out.push({ status: "unknown", note: "빈 줄" });
      continue;
    }
    const partsTex = splitEquals(body);
    const parts = partsTex.map(compile);
    if (parts.some((p) => !p)) {
      out.push({ status: "unknown", note: "식으로 읽지 못했어요" });
      continue;
    }
    const fns = parts as Fn[];

    // 사슬: = 로 이어 쓴 줄은 앞 값부터, a = b = c 는 각 = 마다
    const chain = continues ? [prevValue, ...fns] : fns;
    if (continues && !prevValue) {
      out.push({ status: "unknown", note: "앞에 비교할 식이 없어요" });
      continue;
    }

    if (chain.length === 1) {
      // 식 하나: 앞 줄의 값과 같은가
      const cur = chain[0] as Fn;
      if (!prevValue) out.push({ status: "start", note: "" });
      else out.push(compareExpr(prevValue, cur, "앞 줄"));
      prevValue = cur;
      prevEq = null;
      continue;
    }

    if (chain.length === 2 && !continues) {
      const [l, rgt] = chain as [Fn, Fn];
      const ident = sameExpression(l, rgt);
      if (ident.same) {
        // 항등식 (a = b 가 늘 참) — 식 변형의 한 줄
        out.push(prevValue && !sameExpression(prevValue, l).same ? compareExpr(prevValue, l, "앞 줄") : { status: "ok", note: "" });
        prevValue = rgt;
        prevEq = null;
        continue;
      }
      // 방정식: 앞 방정식과 해가 같은가
      const eq: Eq = { vars: [...new Set([...l.vars, ...rgt.vars])], F: (env) => l.at(env) - rgt.at(env), latex: body };
      // 양변에 문자가 있고 문자가 둘 이상이면 (a−b)(a+b) = … 같은 전개(항등식)로 본다 — 틀린 전개를 잡게
      if (!prevEq && l.vars.length > 0 && rgt.vars.length > 0 && eq.vars.length >= 2) {
        out.push(compareExpr(l, rgt, "왼쪽"));
        prevValue = rgt;
        continue;
      }
      if (eq.vars.length === 0) {
        out.push({ status: "bad", note: `계산이 틀렸어요: ${fmt(l.at({}))} ≠ ${fmt(rgt.at({}))}` });
        prevEq = null;
        prevValue = rgt;
        continue;
      }
      if (!prevEq) out.push({ status: "start", note: "" });
      else {
        const s = sameSolutions(prevEq, eq);
        out.push(
          s.same
            ? { status: "ok", note: "" }
            : {
                status: "bad",
                note: s.which === "a" ? `앞 줄의 해 ${envText(s.counter ?? {})}가 이 줄에서 성립하지 않아요` : `${envText(s.counter ?? {})}는 이 줄의 해인데 앞 줄에서는 아니에요`,
              },
        );
      }
      prevEq = eq;
      prevValue = null;
      continue;
    }

    // 등식 사슬 (a = b = c, 또는 = b = c): 이웃끼리 모두 같아야
    let bad: StepResult | null = null;
    for (let i = 1; i < chain.length && !bad; i++) {
      const res = compareExpr(chain[i - 1] as Fn, chain[i] as Fn, i === 1 && continues ? "앞 줄" : `${i}번째 =의 왼쪽`);
      if (res.status === "bad") bad = res;
    }
    out.push(bad ?? { status: "ok", note: "" });
    prevValue = chain[chain.length - 1] as Fn;
    prevEq = null;
  }
  return out;
}

function compareExpr(prev: Fn, cur: Fn, what: string): StepResult {
  const s = sameExpression(prev, cur);
  if (s.same === null) return { status: "unknown", note: "값을 계산할 수 없어요" };
  if (s.same) return { status: "ok", note: "" };
  const c = s.counter;
  return { status: "bad", note: c ? `${what}과 값이 달라요${Object.keys(c.env).length ? ` (${envText(c.env)}에서 ${fmt(c.a)} ≠ ${fmt(c.b)})` : ` (${fmt(c.a)} ≠ ${fmt(c.b)})`}` : `${what}과 값이 달라요` };
}
