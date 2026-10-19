import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { plot } from "../render/theme";
import { div, isZero, neg, texFrac, toNumber, type Frac } from "./fraction";
import { equationResidual } from "./latex";
import {
  det,
  inverse,
  linearCoefficients,
  multiply,
  orderVars,
  parseMatrix,
  rank,
  rref,
  solve,
  splitSystem,
  texAugmented,
  texLinear,
  texMatrix,
  texSolution,
  textPoint,
  transpose,
  type Matrix,
} from "./linear";

/**
 * 연립일차방정식·행렬 입력 → 페이지 객체 (ƒ 입력과 손글씨 인식이 같이 쓴다).
 *
 *   "2x+3y=7, x-y=1"           → 두 직선 그래프 + 교점 (8/5, 3/5) 이름표 + 연립식·해
 *   "x+y+z=6, 2x-y+z=3, …"     → 연립식 → 첨가행렬 → 기약 행 사다리꼴 → 해 (모두 정확한 분수)
 *   "[[2,1],[1,3]]"             → 행렬과 행렬식·계수(rank)
 *   "det/inv/rref/rank/T [[…]]" → 그 계산,  "[[…]]*[[…]]" → 곱
 *
 * 선형이 아니면 null — 다른 해석(그래프·수식)으로 넘어간다.
 */

const meta = (): Pick<SceneIR, "version" | "confidence" | "source"> => ({ version: IR_VERSION, confidence: 1, source: "manual" });

export type LinearBuild = { ir: SceneIR; note: string };

export function buildLinear(input: string): LinearBuild | null {
  return buildMatrix(input) ?? buildSystem(input);
}

/** 미리보기 문구 (해석만, 그리지는 않는다) */
export function describeLinear(input: string): string | null {
  const m = parseMatrixCommand(input);
  if (m) return m.op === "show" ? "행렬 · 행렬식과 계수(rank)" : `행렬 계산 · ${OP_NAMES[m.op]}`;
  const parts = splitSystem(input);
  return parts ? `연립방정식 · 식 ${parts.length}개 → 정확한 분수로 풀기` : null;
}

// ─────────────────────────────────────────────────────────── 연립방정식

function buildSystem(input: string): LinearBuild | null {
  const parts = splitSystem(input);
  if (!parts) return null;
  const eqs = parts.map(equationResidual);
  if (eqs.some((e) => e === null)) return null;
  const vars = orderVars(eqs.flatMap((e) => e?.vars ?? []));
  if (vars.length === 0 || vars.length > 6) return null;
  const rows = eqs.map((e) => linearCoefficients((e as NonNullable<typeof e>).F(vars), vars.length));
  if (rows.some((r) => r === null)) return null;
  const A: Matrix = rows.map((r) => (r as NonNullable<typeof r>).coefs);
  const b: Frac[] = rows.map((r) => (r as NonNullable<typeof r>).rhs);
  const sol = solve(A, b);
  const system = `\\begin{cases} ${eqs.map((e) => e?.latex).join(" \\\\ ")} \\end{cases}`;
  const solTex = texSolution(sol, vars);

  // 미지수 x, y 두 개 → 직선들을 그려서 교점을 보인다
  if (vars.length === 2 && vars[0] === "x" && vars[1] === "y") {
    const functions = A.map((row, i) => {
      const [a, bb] = row as [Frac, Frac];
      const c = b[i] as Frac;
      if (!isZero(bb)) return { latex: `y=${texLinear([neg(div(a, bb))], ["x"], div(c, bb))}`, kind: "explicit" as const };
      if (!isZero(a)) return { latex: `x=${texFrac(div(c, a))}`, kind: "implicit" as const };
      return null;
    }).filter((f): f is NonNullable<typeof f> => f !== null);
    if (functions.length >= 1) {
      const center = sol.kind === "unique" ? sol.values.map(toNumber) : [0, 0];
      const reach = Math.max(5, Math.ceil(Math.max(...center.map(Math.abs)) * 1.6));
      const cx = sol.kind === "unique" ? Math.round(center[0] as number) : 0;
      const cy = sol.kind === "unique" ? Math.round(center[1] as number) : 0;
      const half = Math.min(reach, 50);
      return {
        note: sol.kind === "unique" ? `교점 ${textPoint(sol.values)}` : sol.kind === "none" ? "평행 — 해가 없어요" : "두 직선이 겹쳐요 — 해가 무수히 많아요",
        ir: {
          ...meta(),
          kind: "plot2d",
          data: {
            functions,
            view: { xmin: cx - half, xmax: cx + half, ymin: cy - half * plot.aspect, ymax: cy + half * plot.aspect, aspect: "equal", xTicks: "auto" },
            grid: false,
            showAxes: true,
            showCaption: true,
            ...(sol.kind === "unique" ? { points: [{ at: [toNumber(sol.values[0] as Frac), toNumber(sol.values[1] as Frac)] as [number, number], label: textPoint(sol.values) }] } : {}),
            caption: `${system}\\;\\Rightarrow\\; ${solTex}`,
          },
        },
      };
    }
  }

  // 그 밖: 풀이 과정까지 수식으로
  const aug = A.map((row, i) => [...row, b[i] as Frac]);
  const { R } = rref(aug);
  const latex = `\\begin{gathered} ${system} \\\\[4pt] ${texAugmented(aug)} \\;\\sim\\; ${texAugmented(R)} \\\\[4pt] ${solTex} \\end{gathered}`;
  return { note: sol.kind === "unique" ? "해가 하나" : sol.kind === "none" ? "해가 없어요" : "해가 무수히 많아요", ir: { ...meta(), kind: "formula", data: { latex, evaluate: false } } };
}

// ─────────────────────────────────────────────────────────── 행렬

type Op = "show" | "det" | "inv" | "rref" | "rank" | "T" | "mul";
const OP_NAMES: Record<Op, string> = { show: "행렬", det: "행렬식", inv: "역행렬", rref: "기약 행 사다리꼴", rank: "계수(rank)", T: "전치행렬", mul: "행렬의 곱" };

function parseMatrixCommand(input: string): { op: Op; A: Matrix; B?: Matrix } | null {
  const s = input.trim().replace(/\\cdot|\\times|·/g, "*");
  const cmd = /^(det|inv|inverse|rref|rank|transpose|T)\s*\(?\s*([\s\S]+?)\s*\)?$/i.exec(s);
  if (cmd) {
    const A = parseMatrix(cmd[2] as string);
    if (!A) return null;
    const word = (cmd[1] as string).toLowerCase();
    const op: Op = word === "inverse" ? "inv" : word === "transpose" || word === "t" ? "T" : (word as Op);
    return { op, A };
  }
  const post = /^([\s\S]+?)\s*\^\s*\{?\s*(-1|T)\s*\}?$/.exec(s);
  if (post) {
    const A = parseMatrix(post[1] as string);
    if (A) return { op: post[2] === "T" ? "T" : "inv", A };
  }
  const prod = /^(\[[\s\S]*\]|\\begin[\s\S]*?\\end\{[pbvB]?matrix\})\s*\*\s*(\[[\s\S]*\]|\\begin[\s\S]*?\\end\{[pbvB]?matrix\})$/.exec(s);
  if (prod) {
    const A = parseMatrix(prod[1] as string);
    const B = parseMatrix(prod[2] as string);
    if (A && B) return { op: "mul", A, B };
  }
  const A = parseMatrix(s);
  return A ? { op: "show", A } : null;
}

function buildMatrix(input: string): LinearBuild | null {
  const c = parseMatrixCommand(input);
  if (!c) return null;
  const A = c.A;
  const M = texMatrix(A);
  const square = A.every((r) => r.length === A.length);
  let latex: string;
  try {
    switch (c.op) {
      case "show":
        latex = `A = ${M}${square ? `,\\quad \\det A = ${texFrac(det(A))}` : ""},\\quad \\operatorname{rank} A = ${rank(A)}`;
        break;
      case "det":
        latex = `\\det ${M} = ${texFrac(det(A))}`;
        break;
      case "inv": {
        const inv = inverse(A);
        latex = inv ? `${M}^{-1} = ${texMatrix(inv)}` : `\\det ${M} = 0 \\;\\Rightarrow\\; \\text{역행렬이 없어요}`;
        break;
      }
      case "rref":
        latex = `${M} \\;\\sim\\; ${texMatrix(rref(A).R)}`;
        break;
      case "rank":
        latex = `\\operatorname{rank} ${M} = ${rank(A)}`;
        break;
      case "T":
        latex = `${M}^{T} = ${texMatrix(transpose(A))}`;
        break;
      case "mul":
        latex = `${M}\\,${texMatrix(c.B as Matrix)} = ${texMatrix(multiply(A, c.B as Matrix))}`;
        break;
    }
  } catch (e) {
    latex = `${M} \\;\\; \\text{${e instanceof Error ? e.message : "계산할 수 없어요"}}`;
  }
  return { note: OP_NAMES[c.op], ir: { ...meta(), kind: "formula", data: { latex, evaluate: false } } };
}
