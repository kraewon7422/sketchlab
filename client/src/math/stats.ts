import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { plot } from "../render/theme";

/**
 * 확률분포 그리기 (ƒ 입력) — 교과서 확률과 통계.
 *
 *   N(170, 6^2)      정규분포 (평균, 분산)        · 곡선 + 구하는 확률만큼 음영
 *   B(10, 0.3)       이항분포 (시행 횟수, 성공 확률) · 막대
 *   Po(3)            포아송분포 (평균)             · 막대
 *   U(0, 2)          연속 균등분포                 · 곡선
 *   Exp(0.5)         지수분포 (λ)                  · 곡선
 *   뒤에 P(164<X<182), P(X≤3), P(X=2) … 를 붙이면 그 확률을 칠하고 값을 보여 준다.
 *   P(-1<Z<1) 만 쓰면 표준정규분포 N(0, 1).
 */

export type Dist =
  | { kind: "normal"; mu: number; sigma: number }
  | { kind: "binomial"; n: number; p: number }
  | { kind: "poisson"; lambda: number }
  | { kind: "uniform"; a: number; b: number }
  | { kind: "exponential"; lambda: number };

export interface ProbQuery {
  lo: number;
  hi: number;
  loStrict: boolean;
  hiStrict: boolean;
  /** 화면에 보일 원래 모양 (P(164<X<182)) */
  latex: string;
}

// ─────────────────────────────────────────────────────────── 수치

/** 오차함수 (Abramowitz–Stegun 7.1.26, 오차 < 1.5e-7) */
export function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

export const normalCdf = (x: number, mu: number, sigma: number): number => 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));

function logFactorial(n: number): number {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

export const binomialPmf = (k: number, n: number, p: number): number =>
  k < 0 || k > n ? 0 : Math.exp(logFactorial(n) - logFactorial(k) - logFactorial(n - k) + k * Math.log(p || 1e-300) + (n - k) * Math.log(1 - p || 1e-300));

export const poissonPmf = (k: number, lambda: number): number => (k < 0 ? 0 : Math.exp(-lambda + k * Math.log(lambda) - logFactorial(k)));

/** P(query) */
export function probability(d: Dist, q: ProbQuery): number {
  switch (d.kind) {
    case "normal":
      return normalCdf(q.hi, d.mu, d.sigma) - normalCdf(q.lo, d.mu, d.sigma);
    case "uniform": {
      const lo = Math.max(q.lo, d.a);
      const hi = Math.min(q.hi, d.b);
      return hi > lo ? (hi - lo) / (d.b - d.a) : 0;
    }
    case "exponential": {
      const F = (x: number) => (x <= 0 ? 0 : 1 - Math.exp(-d.lambda * x));
      return F(q.hi) - F(q.lo);
    }
    case "binomial":
    case "poisson": {
      let s = 0;
      for (const k of discreteSupport(d)) if (inRange(k, q)) s += d.kind === "binomial" ? binomialPmf(k, d.n, d.p) : poissonPmf(k, d.lambda);
      return s;
    }
  }
}

function inRange(k: number, q: ProbQuery): boolean {
  return (q.loStrict ? k > q.lo : k >= q.lo) && (q.hiStrict ? k < q.hi : k <= q.hi);
}

function discreteSupport(d: Dist): number[] {
  if (d.kind === "binomial") return Array.from({ length: d.n + 1 }, (_, k) => k);
  if (d.kind === "poisson") {
    const max = Math.max(8, Math.ceil(d.lambda + 5 * Math.sqrt(d.lambda) + 2));
    return Array.from({ length: max + 1 }, (_, k) => k);
  }
  return [];
}

// ─────────────────────────────────────────────────────────── 입력 읽기

const NUM = String.raw`-?\d+(?:\.\d+)?`;

/** "X~N(170,6^2), P(164<X<182)" → 분포 + 확률. 분포 입력이 아니면 null */
export function parseDist(input: string): { dist: Dist; query: ProbQuery | null; distLatex: string } | null {
  const s = input
    .replace(/\s+/g, "")
    .replace(/²/g, "^2")
    .replace(/\\le(?:q)?|≤|<=/g, "≤")
    .replace(/\\ge(?:q)?|≥|>=/g, "≥")
    .replace(/\\sim|∼/g, "~")
    .replace(/정규분포|이항분포|포아송분포|균등분포|지수분포/g, "");
  let dist: Dist | null = null;
  let distLatex = "";
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`N\\((${NUM}),(${NUM})(\\^2)?\\)`).exec(s))) {
    const mu = Number(m[1]);
    const v = Number(m[2]);
    const sigma = m[3] ? Math.abs(v) : Math.sqrt(Math.abs(v));
    if (sigma > 0) {
      dist = { kind: "normal", mu, sigma };
      distLatex = `N\\left(${mu},\\,${m[3] ? `${v}^2` : v}\\right)`;
    }
  } else if ((m = new RegExp(`B\\((\\d+),(${NUM})\\)`).exec(s))) {
    const n = Number(m[1]);
    const p = Number(m[2]);
    if (n >= 1 && n <= 200 && p >= 0 && p <= 1) {
      dist = { kind: "binomial", n, p };
      distLatex = `B\\left(${n},\\,${p}\\right)`;
    }
  } else if ((m = new RegExp(`Po(?:isson)?\\((${NUM})\\)`, "i").exec(s))) {
    const lambda = Number(m[1]);
    if (lambda > 0 && lambda <= 100) {
      dist = { kind: "poisson", lambda };
      distLatex = `\\mathrm{Po}\\left(${lambda}\\right)`;
    }
  } else if ((m = new RegExp(`U\\((${NUM}),(${NUM})\\)`).exec(s))) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (b > a) {
      dist = { kind: "uniform", a, b };
      distLatex = `U\\left(${a},\\,${b}\\right)`;
    }
  } else if ((m = new RegExp(`Exp\\((${NUM})\\)`, "i").exec(s))) {
    const lambda = Number(m[1]);
    if (lambda > 0) {
      dist = { kind: "exponential", lambda };
      distLatex = `\\mathrm{Exp}\\left(${lambda}\\right)`;
    }
  }

  const query = parseQuery(s);
  if (!dist && query?.z) {
    dist = { kind: "normal", mu: 0, sigma: 1 };
    distLatex = "N\\left(0,\\,1\\right)";
  }
  if (!dist) return null;
  return { dist, query: query?.q ?? null, distLatex };
}

function parseQuery(s: string): { q: ProbQuery; z: boolean } | null {
  const m = /P\(([^)]*)\)/.exec(s);
  if (!m) return null;
  const body = m[1] as string;
  const z = /Z/.test(body);
  const v = String.raw`[XZ]`;
  const op = String.raw`(<|≤|>|≥|=)`;
  const toLatex = (t: string) => t.replace(/≤/g, "\\le ").replace(/≥/g, "\\ge ");
  let r: RegExpExecArray | null;
  // a < X < b
  if ((r = new RegExp(`^(${NUM})${op}${v}${op}(${NUM})$`).exec(body))) {
    const [, a, o1, o2, b] = r as unknown as [string, string, string, string, string];
    if ((o1 === "<" || o1 === "≤") && (o2 === "<" || o2 === "≤"))
      return { z, q: { lo: Number(a), hi: Number(b), loStrict: o1 === "<", hiStrict: o2 === "<", latex: `P(${toLatex(body)})` } };
    return null;
  }
  // X op a
  if ((r = new RegExp(`^${v}${op}(${NUM})$`).exec(body))) {
    const [, o, a] = r as unknown as [string, string, string];
    const x = Number(a);
    const q: ProbQuery =
      o === "<" || o === "≤"
        ? { lo: -Infinity, hi: x, loStrict: false, hiStrict: o === "<", latex: `P(${toLatex(body)})` }
        : o === "="
          ? { lo: x, hi: x, loStrict: false, hiStrict: false, latex: `P(${toLatex(body)})` }
          : { lo: x, hi: Infinity, loStrict: o === ">", hiStrict: false, latex: `P(${toLatex(body)})` };
    return { z, q };
  }
  return null;
}

// ─────────────────────────────────────────────────────────── 그래프 만들기

const fmt = (v: number) => String(Number(v.toPrecision(6)));

/** 분포 입력 → 그래프 IR. 분포가 아니면 null */
export function buildDist(input: string): SceneIR | null {
  const parsed = parseDist(input);
  if (!parsed) return null;
  const { dist: d, query: q, distLatex } = parsed;
  const prob = q ? probability(d, q) : null;
  const caption = q && prob !== null ? `\\begin{gathered}X\\sim ${distLatex}\\\\ ${q.latex}\\approx ${prob.toFixed(4)}\\end{gathered}` : `X\\sim ${distLatex}`;
  const base = { version: IR_VERSION, confidence: 1, source: "manual" } as const;

  if (d.kind === "binomial" || d.kind === "poisson") {
    const ks = discreteSupport(d);
    const pmf = (k: number) => (d.kind === "binomial" ? binomialPmf(k, d.n, d.p) : poissonPmf(k, d.lambda));
    const shown = d.kind === "poisson" ? ks.filter((k) => k <= d.lambda || pmf(k) > 1e-4) : ks;
    const bars = shown.map((k) => ({ x: k, h: pmf(k), ...(q && inRange(k, q) ? { on: true } : {}) }));
    const top = Math.max(...bars.map((b) => b.h));
    return {
      ...base,
      kind: "plot2d",
      data: {
        functions: [],
        view: { xmin: -1, xmax: (shown[shown.length - 1] ?? 1) + 1, ymin: -top * 0.12, ymax: top * 1.25, aspect: "auto", xTicks: "auto" },
        grid: false,
        showAxes: true,
        showCaption: true,
        bars,
        barWidth: 0.7,
        caption,
      },
    };
  }

  let latex: string;
  let xmin: number;
  let xmax: number;
  let top: number;
  if (d.kind === "normal") {
    const { mu, sigma } = d;
    latex = String.raw`y=\frac{1}{${fmt(sigma)}\sqrt{2\pi}}e^{-\frac{(x-${fmt(mu)})^2}{2\cdot ${fmt(sigma)}^2}}`.replace("x--", "x+");
    xmin = mu - 4 * sigma;
    xmax = mu + 4 * sigma;
    top = 1 / (sigma * Math.sqrt(2 * Math.PI));
  } else if (d.kind === "uniform") {
    const w = d.b - d.a;
    // 균등분포: [a, b]에서 1/(b−a), 밖에서 0 — 계단 모양을 곱으로 (경계는 거의 수직)
    latex = String.raw`y=\frac{1}{${fmt(w)}}\cdot\frac{1}{1+e^{-200(x-${fmt(d.a)})}}\cdot\frac{1}{1+e^{200(x-${fmt(d.b)})}}`.replace("x--", "x+");
    xmin = d.a - w * 0.4;
    xmax = d.b + w * 0.4;
    top = 1 / w;
  } else {
    latex = String.raw`y=${fmt(d.lambda)}e^{-${fmt(d.lambda)}x}\cdot\frac{1}{1+e^{-200x}}`;
    xmin = -0.5 / d.lambda;
    xmax = 5 / d.lambda;
    top = d.lambda;
  }
  const lo = q ? Math.max(q.lo, xmin) : 0;
  const hi = q ? Math.min(q.hi, xmax) : 0;
  return {
    ...base,
    kind: "plot2d",
    data: {
      functions: [{ latex, kind: "explicit", color: plot.palette[0] }],
      view: { xmin, xmax, ymin: -top * 0.12, ymax: top * 1.3, aspect: "auto", xTicks: "auto" },
      grid: false,
      showAxes: true,
      showCaption: true,
      ...(q && hi > lo ? { shade: [{ fn: 0, from: lo, to: hi, against: "axis" as const, showValue: false }] } : {}),
      caption,
    },
  };
}
