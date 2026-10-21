import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { plot } from "../render/theme";
import { analyze, toFunction, toLatex, type Analysis } from "./latex";
import type { Fn } from "./sample";
import { fitView } from "./view";
import { parsePoints } from "../solid/space";
import { buildLinear } from "./linearBuild";
import { parseTupper, TUPPER_LATEX } from "./tupper";
import { buildDist } from "./stats";
import { parseVenn } from "./venn";
import { buildSpace } from "./space3d";
import { parseTensor } from "./tensor";
import { parseNNet } from "./nnet";
import { parseSpecial, SPECIAL_LATEX, type SpecialName } from "./special";
import { parseFigure } from "./figures";
import { circuitFromInput } from "./circuitExamples";
import { todaySeed } from "../chem/namingPuzzle";

/** 도넛 ↔ 머그잔 (위상수학) */
export const TOPOLOGY = /^\s*(?:위상수학|위상|토폴로지|topology|도넛\s*(?:↔|<->|-|와|과)?\s*(?:컵|머그잔?)|donut\s*(?:↔|<->|-|and)?\s*(?:cup|mug))\s*$/i;

/**
 * 입력한 식 → Scene IR (수동 입력 경로, 마스터스펙 v4 §9.3).
 * API 키 없이, 오프라인에서도 동작하는 1급 경로다.
 */

export type BuildResult = { ok: true; ir: SceneIR; analysis: Analysis } | { ok: false; message: string };

const DEFAULT_PARAM = { value: 1, min: -5, max: 5, step: 0.1 };

/** MathJSON 안의 변수 이름 바꾸기 (∫ t² dt 를 y = x² 로 그리기 위해) */
function renameVar(json: unknown, from: string, to: string): unknown {
  if (json === from) return to;
  return Array.isArray(json) ? json.map((j) => renameVar(j, from, to)) : json;
}

function meta(): Pick<SceneIR, "version" | "confidence" | "source"> {
  return { version: IR_VERSION, confidence: 1, source: "manual" };
}

/** 특수 곡선 그래프 — 보기 좋은 범위와 N 슬라이더 */
function specialPlot(name: SpecialName): SceneIR {
  const base = { grid: false, showAxes: true, showCaption: true, caption: SPECIAL_LATEX[name] } as const;
  if (name === "zetaCritical")
    return { ...meta(), kind: "plot2d", data: { ...base, functions: [], special: [{ name }], view: { xmin: 0, xmax: 50, ymin: -0.5, ymax: 4, aspect: "auto", xTicks: "auto", xLabel: "t", yLabel: "|\\zeta(\\frac12+it)|" } } };
  const N = { name: "N", value: name === "fourierSquare" ? 3 : 2, min: 1, max: name === "fourierSquare" ? 40 : 12, step: 1 };
  if (name === "fourierSquare")
    return { ...meta(), kind: "plot2d", data: { ...base, functions: [], special: [{ name }], params: [N], view: { xmin: -2 * Math.PI, xmax: 2 * Math.PI, ymin: -1.6, ymax: 1.6, aspect: "auto", xTicks: "pi" } } };
  return { ...meta(), kind: "plot2d", data: { ...base, functions: [{ latex: "y=\\sin x", kind: "explicit", color: "#9AA3B2" }], special: [{ name }], params: [N], view: { xmin: -2 * Math.PI, xmax: 2 * Math.PI, ymin: -2.5, ymax: 2.5, aspect: "auto", xTicks: "pi" } } };
}

export function buildFromInput(input: string): BuildResult {
  // 3D 텐서 (3겹 괄호 · "텐서 2x3x4") — 행렬 [[…]]보다 먼저
  const tensor = parseTensor(input);
  if (tensor) return { ok: true, analysis: { kind: "formula", latex: input }, ir: { ...meta(), kind: "tensor", data: tensor } };
  const layers = parseNNet(input);
  if (layers) return { ok: true, analysis: { kind: "formula", latex: input }, ir: { ...meta(), kind: "nnet", data: { layers, showLabels: true } } };
  if (TOPOLOGY.test(input)) return { ok: true, analysis: { kind: "formula", latex: input }, ir: { ...meta(), kind: "topology", data: { t: 0 } } };
  // 유명한 그림 (뫼비우스 띠·만델브로·라이프 게임 …)
  const fig = parseFigure(input);
  if (fig) return { ok: true, analysis: { kind: "formula", latex: input }, ir: { ...meta(), kind: "figure", data: fig } };
  // 유기 화합물 이름 퍼즐 (오늘의 문제)
  const puzzle = /^\s*(이름|명명법|iupac|naming)\s*(퍼즐|퀴즈|puzzle|quiz)\s*(중급|중|medium)?\s*$/i.exec(input);
  if (puzzle) return { ok: true, analysis: { kind: "formula", latex: input }, ir: { ...meta(), kind: "naming", data: { level: puzzle[3] ? "medium" : "easy", seed: todaySeed(), lang: "en", guesses: [] } } };
  // 회로도 (직렬·병렬·RC·교류 / 논리 게이트·가산기·래치)
  const circuit = circuitFromInput(input);
  if (circuit) return { ok: true, analysis: { kind: "formula", latex: input }, ir: { ...meta(), kind: "circuit", data: circuit } };
  // 유명한 곡선 (제타 임계선·푸리에 사각파·테일러 sin)
  const sp = parseSpecial(input);
  if (sp) return { ok: true, analysis: { kind: "formula", latex: SPECIAL_LATEX[sp] }, ir: specialPlot(sp) };

  // 좌표공간 속 곡면·입체 (z가 든 식, 평행육면체) — 평면만 여러 개면 null이라 연립방정식으로 간다
  const space = buildSpace(input);
  if (space) return "error" in space ? { ok: false, message: space.error } : { ok: true, analysis: { kind: "formula", latex: input }, ir: space };

  // 연립일차방정식·행렬 — 쉼표로 나뉜 식이나 [[…]]는 여기서 먼저 (아니면 null로 넘어간다)
  const lin = buildLinear(input);
  if (lin) return { ok: true, analysis: { kind: "formula", latex: input }, ir: lin.ir };

  // 벤 다이어그램: A∩B, (A∪B)ᶜ, 벤 A−B …
  const venn = parseVenn(input);
  if (venn) return { ok: true, analysis: { kind: "formula", latex: input }, ir: { ...meta(), kind: "venn", data: { sets: venn.sets, expr: venn.expr } } };

  // 확률분포: N(170,6^2), B(10,0.3), Po(3) … (+ P(…) 확률)
  const dist = buildDist(input);
  if (dist) return { ok: true, analysis: { kind: "formula", latex: input }, ir: dist };

  // 투퍼의 자기 참조 공식 — 543자리 k라 보통 계산으로는 못 그린다 (BigInt 전용 그림)
  const tupper = parseTupper(input);
  if (tupper) {
    return {
      ok: true,
      analysis: { kind: "formula", latex: TUPPER_LATEX },
      ir: {
        ...meta(),
        kind: "plot2d",
        data: {
          functions: [{ latex: TUPPER_LATEX, kind: "inequality" }],
          view: { xmin: 0, xmax: 106, ymin: 0, ymax: 17, aspect: "auto", xTicks: "auto" },
          grid: false,
          showAxes: true,
          showCaption: true,
          tupper,
          caption: TUPPER_LATEX,
        },
      },
    };
  }

  // 공간좌표의 점: "A(2,3,4), B(-1,2,0)" — LaTeX 분석 전에 먼저 본다
  const pts = parsePoints(input);
  if (pts) {
    const range = Math.max(3, Math.ceil(Math.max(...pts.flatMap((p) => p.at.map(Math.abs))) * 1.2));
    return {
      ok: true,
      analysis: { kind: "formula", latex: input },
      ir: {
        ...meta(),
        kind: "space3d",
        data: {
          view: { range },
          points: pts.map((p) => ({ at: p.at, ...(p.label ? { label: p.label } : {}) })),
          showProjections: true,
        },
      },
    };
  }

  const a = analyze(input);
  const aspect = plot.aspect;

  switch (a.kind) {
    case "error":
      return { ok: false, message: a.message };
    case "formula":
      return { ok: true, analysis: a, ir: { ...meta(), kind: "formula", data: { latex: a.latex, evaluate: false } } };
    case "explicit": {
      const params = a.params.map((name) => ({ name, ...DEFAULT_PARAM }));
      const f = toFunction(a.rhs, ["x", ...a.params]);
      const values = params.map((p) => p.value);
      const g: Fn = (x) => f(x, ...values);
      const range = a.trig ? { xmin: -2 * Math.PI, xmax: 2 * Math.PI } : {};
      const view = fitView([g], { aspect, ...range });
      return {
        ok: true,
        analysis: a,
        ir: {
          ...meta(),
          kind: "plot2d",
          data: {
            functions: [{ latex: a.latex, kind: "explicit" }],
            view: { ...view, aspect: "equal", xTicks: a.trig ? "pi" : "auto" },
            grid: false,
            showAxes: true,
            showCaption: true,
            ...(params.length ? { params } : {}),
          },
        },
      };
    }
    case "inequality":
    case "implicit":
    case "polar": {
      const params = a.params.map((name) => ({ name, ...DEFAULT_PARAM }));
      let half = 5;
      if (a.kind === "polar") {
        const r = toFunction(a.rhs, ["theta", ...a.params]);
        const values = params.map((p) => p.value);
        let rmax = 0;
        for (let i = 0; i <= 360; i++) {
          const v = Math.abs(r((i / 360) * 2 * Math.PI, ...values));
          if (Number.isFinite(v)) rmax = Math.max(rmax, v);
        }
        half = Math.max(1, Math.ceil(rmax * 1.3));
      }
      const view = fitView([], { aspect, xmin: -half, xmax: half });
      return {
        ok: true,
        analysis: a,
        ir: {
          ...meta(),
          kind: "plot2d",
          data: {
            functions: [{ latex: a.latex, kind: a.kind }],
            view: { ...view, aspect: "equal", xTicks: "auto" },
            grid: false,
            showAxes: true,
            showCaption: true,
            ...(params.length ? { params } : {}),
          },
        },
      };
    }
    case "integral": {
      const params = a.params.map((name) => ({ name, ...DEFAULT_PARAM }));
      const body = renameVar(a.body, a.variable, "x");
      const f = toFunction(body, ["x", ...a.params]);
      const values = params.map((p) => p.value);
      const lo = Math.min(a.from, a.to, 0);
      const hi = Math.max(a.from, a.to, 0);
      const span = hi - lo || 2;
      const xmin = lo - 0.35 * span;
      const xmax = hi + 0.35 * span;
      // 넓이가 주인공 — 1:1을 고집하면 x²처럼 금방 커지는 함수의 음영이 잘린다.
      // 적분 구간의 함수값이 전부 들어오게 y를 정하고, 비율은 auto로 표시한다.
      let fmin = 0;
      let fmax = 0;
      for (let k = 0; k <= 200; k++) {
        const y = f(a.from + ((a.to - a.from) * k) / 200, ...values);
        if (Number.isFinite(y)) {
          fmin = Math.min(fmin, y);
          fmax = Math.max(fmax, y);
        }
      }
      const pad = (fmax - fmin || 1) * 0.18;
      const equal = fitView([(x) => f(x, ...values)], { aspect, xmin, xmax });
      const fits = equal.ymin <= fmin && equal.ymax >= fmax;
      const view = fits ? equal : { xmin, xmax, ymin: fmin - pad, ymax: fmax + pad };
      return {
        ok: true,
        analysis: a,
        ir: {
          ...meta(),
          kind: "plot2d",
          data: {
            functions: [{ latex: `y=${toLatex(body)}`, kind: "explicit" }],
            view: { ...view, aspect: fits ? "equal" : "auto", xTicks: "auto" },
            grid: false,
            showAxes: true,
            showCaption: true,
            shade: [{ fn: 0, from: a.from, to: a.to, against: "axis", showValue: true }],
            caption: a.latex,
            ...(params.length ? { params } : {}),
          },
        },
      };
    }
  }
}

/** 입력 미리보기용 한 줄 설명 */
export function describe(a: Analysis): string {
  switch (a.kind) {
    case "explicit":
      return a.params.length ? `그래프 · 계수 ${a.params.join(", ")} 슬라이더` : "그래프 y = f(x)";
    case "implicit":
      return "음함수 그래프";
    case "inequality":
      return "부등식 영역 · 참인 곳을 칠해요 (< 는 점선 경계, ≤ 는 실선 경계)";
    case "polar":
      return "극좌표 그래프 r = f(θ)";
    case "integral":
      return "정적분 · 넓이와 값";
    case "formula":
      return "수식으로 표시";
    case "error":
      return a.message;
  }
}
