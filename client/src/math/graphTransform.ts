/**
 * 그래프 바꾸기 (식을 고쳐 쓴다 — 그리기는 늘 하던 대로):
 *   계수 조정: 식 속 숫자를 문자로 → 슬라이더 (y=2x²+3x−1 → y=ax²+bx−c, a=2 b=3 c=1), 되돌리기
 *   평행이동: y=f(x) → y=f(x−h)+k (끌면 h·k가 바뀐다)
 *   대칭이동: x축 (y→−y) · y축 (x→−x) · 원점 · 직선 y=x (x와 y를 바꾼다)
 * LaTeX 명령(\sin, \max …) 속 글자는 건드리지 않는다.
 */

export interface SimpleParam {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

const POOL = ["a", "b", "c", "d", "k", "m", "p", "q", "r", "s"];

/** 명령·지수·아래첨자를 빼고 본 글자들 */
function plainLetters(latex: string): Set<string> {
  return new Set(latex.replace(/\\[a-zA-Z]+/g, " ").match(/[a-zA-Z]/g) ?? []);
}

/** 명령(\sin …)은 그대로 두고 나머지 조각에만 f를 쓴다 */
function mapOutsideCommands(s: string, f: (chunk: string) => string): string {
  return s
    .split(/(\\[a-zA-Z]+)/)
    .map((part, i) => (i % 2 === 1 ? part : f(part)))
    .join("");
}

export function splitEq(latex: string): { lhs: string; rhs: string } | null {
  const k = latex.indexOf("=");
  if (k < 0 || latex.indexOf("=", k + 1) >= 0) return null;
  return { lhs: latex.slice(0, k).trim(), rhs: latex.slice(k + 1).trim() };
}

const range = (v: number): Pick<SimpleParam, "min" | "max" | "step"> => {
  const m = Math.max(5, Math.ceil(Math.abs(v) * 2));
  return { min: -m, max: m, step: m > 20 ? 1 : 0.1 };
};

/**
 * 식 속 숫자 → 문자 (지수·아래첨자의 숫자는 그대로). 슬라이더는 모두 합쳐 4개까지.
 * 반환: 바뀐 식과 새 문자들 (숫자가 없으면 null)
 */
export function numbersToParams(latex: string, taken: string[] = []): { latex: string; params: SimpleParam[] } | null {
  const eq = splitEq(latex);
  if (!eq) return null;
  const used = new Set([...plainLetters(latex), ...taken, "x", "y", "e", "i"]);
  const free = POOL.filter((l) => !used.has(l));
  const room = Math.min(free.length, 4 - taken.length);
  if (room <= 0) return null;
  const params: SimpleParam[] = [];
  const rhs = mapOutsideCommands(eq.rhs, (chunk) =>
    // 지수(^2, ^{10})·아래첨자는 건너뛴다
    chunk.replace(/(\^\{[^}]*\}|\^\d|_\{[^}]*\}|_\d)|(\d+(?:\.\d+)?)/g, (m, skip: string | undefined, num: string | undefined) => {
      if (skip || !num || params.length >= room) return m;
      const name = free[params.length] as string;
      const value = Number(num);
      params.push({ name, value, ...range(value) });
      return name;
    }),
  );
  if (params.length === 0) return null;
  return { latex: `${eq.lhs}=${rhs}`, params };
}

const fmt = (v: number) => String(Number(v.toFixed(2)));

/** 문자 → 지금 값 (계수 조정 끝내기). 부호는 깔끔하게 (+−3 → −3) */
export function paramsToNumbers(latex: string, params: Array<{ name: string; value: number }>): string {
  const byName = new Map(params.map((p) => [p.name, p.value]));
  const out = mapOutsideCommands(latex, (chunk) =>
    chunk.replace(/[a-zA-Z]/g, (ch, at: number, whole: string) => {
      const v = byName.get(ch);
      if (v === undefined) return ch;
      const prev = whole.slice(0, at).trimEnd().slice(-1);
      if (prev === "^") return `{${fmt(v)}}`;
      if (v >= 0 || prev === "" || "+-=({".includes(prev)) return fmt(v);
      return `(${fmt(v)})`;
    }),
  );
  return out.replace(/\+\s*-/g, "-").replace(/-\s*-/g, "+").replace(/-\s*\+/g, "-").replace(/=\s*\+/g, "=");
}

/** x를 다른 것으로 (명령 밖의 글자 x만) */
function substitute(s: string, from: string, to: string): string {
  return mapOutsideCommands(s, (chunk) => chunk.replace(new RegExp(from, "g"), to));
}

/** 이미 평행이동 꼴인가 (y=…(x-h)…+k) */
export function isShifted(latex: string, names: { h: string; k: string }): boolean {
  return latex.includes(`(x-${names.h})`) && latex.trimEnd().endsWith(`+${names.k}`);
}

/** 평행이동에 쓸 문자 (h, k가 이미 쓰였으면 u, v) */
export function shiftNames(latex: string, taken: string[] = []): { h: string; k: string } | null {
  const used = new Set([...plainLetters(latex), ...taken]);
  for (const [h, k] of [
    ["h", "k"],
    ["u", "v"],
  ] as const)
    if ((!used.has(h) && !used.has(k)) || isShifted(latex, { h, k })) return { h, k };
  return null;
}

/** y=f(x) → y=f(x−h)+k (y= 꼴만) */
export function shiftLatex(latex: string, names: { h: string; k: string }): string | null {
  const eq = splitEq(latex);
  if (!eq || (eq.lhs !== "y" && eq.lhs !== "f(x)")) return null;
  if (isShifted(latex, names)) return latex;
  return `${eq.lhs}=${substitute(eq.rhs, "x", `(x-${names.h})`)}+${names.k}`;
}

/** 괄호가 한 쌍으로 전체를 감싸는가 */
function wrapped(s: string): boolean {
  if (!s.startsWith("(") || !s.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    if (depth === 0 && i < s.length - 1) return false;
  }
  return true;
}
const negate = (s: string) => (s.startsWith("-(") && wrapped(s.slice(1)) ? s.slice(2, -1) : `-(${s})`);
const tidy = (s: string) => s.replace(/\(-\(-([a-z])\)\)/g, "$1");

export type Mirror = "xAxis" | "yAxis" | "origin" | "yEqualsX";

/** 대칭이동 — 식을 고쳐 쓴다 */
export function mirrorLatex(latex: string, how: Mirror): string | null {
  const eq = splitEq(latex);
  if (!eq) return null;
  const explicit = eq.lhs === "y";
  const swapXY = (s: string) => mapOutsideCommands(s, (c) => c.replace(/[xy]/g, (ch) => (ch === "x" ? "y" : "x")));
  switch (how) {
    case "yEqualsX":
      return swapXY(latex);
    case "xAxis":
      return explicit ? `y=${negate(eq.rhs)}` : `${substitute(eq.lhs, "y", "(-y)")}=${substitute(eq.rhs, "y", "(-y)")}`;
    case "yAxis":
      return tidy(`${eq.lhs === "y" ? "y" : substitute(eq.lhs, "x", "(-x)")}=${substitute(eq.rhs, "x", "(-x)")}`);
    case "origin": {
      const m = mirrorLatex(latex, "xAxis");
      return m ? mirrorLatex(m, "yAxis") : null;
    }
  }
}
