import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { plot } from "../render/theme";
import { analyze, toFunction, toLatex, type Analysis } from "./latex";
import type { Fn } from "./sample";
import { fitView } from "./view";

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

export function buildFromInput(input: string): BuildResult {
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
            ...(params.length ? { params } : {}),
          },
        },
      };
    }
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
