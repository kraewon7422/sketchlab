import type { SceneDataOf, SceneIR } from "@sketchlab/shared";
import katex from "katex";
import "katex/dist/katex.min.css";
import "katex/contrib/mhchem";
import { memo, useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { findAsymptotes } from "../math/asymptotes";
import { numberTicks, piTicks, type Tick } from "../math/axes";
import { marchingSquares } from "../math/implicit";
import { simpson } from "../math/integrate";
import { analyze, definiteIntegral, toFunction, type Analysis } from "../math/latex";
import { jumpDots, sampleFunction, sampleParametric, type Fn, type Pt, type View } from "../math/sample";
import { toBox } from "../math/view";
import { TUPPER_H, TUPPER_W, tupperGrid } from "../math/tupper";
import { discreteCaption, rangeCaption } from "../math/stats";
import { special } from "../math/special";
import { sessionStore } from "../store/session";
import { isFresh } from "./Shape2DView";
import { plot, stroke, theme } from "./theme";

/**
 * 그래프·수식 객체 (마스터스펙 v4 §11). 이 모듈은 lazy 청크 — Compute Engine·KaTeX가 여기서만 실린다.
 *
 * 화면 구조: 객체 위치에 놓인 HTML 상자 하나
 *   ┌──────────────────┐
 *   │ <svg> 축·곡선     │  교과서 규범: 1:1 비율, 원점 O, 끝 화살표, π 눈금, 점근선 점선, 격자 없음
 *   ├──────────────────┤
 *   │ KaTeX 캡션        │  y = x² − 3   /  ∫₀² x² dx = 8/3 ≈ 2.667
 *   │ 계수 슬라이더     │  a = 1.0 ───●───
 *   └──────────────────┘
 * 상자는 pointer-events: none — 그 위에 계속 필기할 수 있다. 슬라이더만 터치를 받는다.
 */

const analysisCache = new Map<string, Analysis>();
function analyzeCached(latex: string): Analysis {
  let a = analysisCache.get(latex);
  if (!a) {
    a = analyze(latex);
    analysisCache.set(latex, a);
  }
  return a;
}
const fnCache = new Map<string, (...args: number[]) => number>();
function compileCached(key: string, json: unknown, vars: string[]): (...args: number[]) => number {
  let f = fnCache.get(key);
  if (!f) {
    f = toFunction(json, vars);
    fnCache.set(key, f);
  }
  return f;
}

function KaTeX({ latex, display = false, size }: { latex: string; display?: boolean; size?: number }) {
  const html = useMemo(() => katex.renderToString(latex, { throwOnError: false, displayMode: display }), [latex, display]);
  return <span style={{ fontSize: size }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** interactive: 막대 톡·구간 끝 끌기를 받는다 (펜 도구이고 고르지 않았을 때) */
export default memo(function PlotObject({ item, interactive = false }: { item: ObjectItem; interactive?: boolean }): ReactElement | null {
  if (item.ir.kind === "formula") return <FormulaBox item={item} latex={item.ir.data.latex} fontSize={item.ir.data.fontSize} inline={item.ir.data.inline} />;
  if (item.ir.kind === "chemEq") return <FormulaBox item={item} latex={`\\ce{${item.ir.data.ce}}`} fontSize={item.ir.data.fontSize} inline={item.ir.data.inline} />;
  if (item.ir.kind === "plot2d") return item.ir.data.tupper ? <TupperBox item={item} k={item.ir.data.tupper.k} caption={item.ir.data.caption} showCaption={item.ir.data.showCaption} /> : <PlotBox item={item} ir={item.ir} interactive={interactive} />;
  return null;
});

/**
 * 투퍼의 자기 참조 공식 그림 — 106×17 칸 (사용자 사진처럼: x는 105 → 0, y는 k부터 아래로 k+16까지).
 * 칸은 BigInt로 구한다 (math/tupper.ts). 축 눈금은 x 0~100, y는 k, k+5, k+10, k+15.
 */
function TupperBox({ item, k, caption, showCaption }: { item: ObjectItem; k: string; caption?: string | undefined; showCaption: boolean }) {
  const W = item.transform.scale;
  const left = 54;
  const cell = (W - left - 8) / TUPPER_W;
  const H = cell * TUPPER_H;
  const grid = useMemo(() => tupperGrid(k), [k]);
  const fresh = isFresh(item.id);
  const font = "KaTeX_Main, 'Times New Roman', serif";
  let d = "";
  grid.forEach((row, j) =>
    row.forEach((on, x) => {
      if (on) d += `M${(left + (TUPPER_W - 1 - x) * cell).toFixed(2)},${(j * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h${(-cell).toFixed(2)}Z`;
    }),
  );
  return (
    <div data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: W, pointerEvents: "none" }}>
      <svg width={W} height={H + 22} style={{ display: "block", overflow: "visible" }}>
        <rect x={left} y={0} width={cell * TUPPER_W} height={H} fill="none" stroke={theme.color.sub} />
        <path d={d} fill={plot.palette[0]} shapeRendering="crispEdges" />
        <g fill={theme.color.ink} fontSize={plot.labelSize} fontFamily={font}>
          {[0, 5, 10, 15].map((j) => (
            <text key={j} x={left - 6} y={(j + 0.75) * cell} textAnchor="end">
              {j === 0 ? "k" : `k + ${j}`}
            </text>
          ))}
          {[100, 80, 60, 40, 20, 0].map((x) => (
            <text key={x} x={left + (TUPPER_W - 1 - x + 0.5) * cell} y={H + 15} textAnchor="middle">
              {x}
            </text>
          ))}
        </g>
      </svg>
      {showCaption && caption && (
        <div style={{ marginTop: theme.space[1], textAlign: "center", color: theme.color.ink }}>
          <KaTeX latex={caption} size={15} />
        </div>
      )}
      <div data-export-skip style={{ marginTop: 2, textAlign: "center", fontSize: 12, color: theme.color.asymptote }}>
        k = {k.length > 24 ? `${k.slice(0, 10)}…${k.slice(-10)} (${k.length}자리)` : k}
      </div>
    </div>
  );
}

function FormulaBox({ item, latex, fontSize, inline: inlineFlag }: { item: ObjectItem; latex: string; fontSize?: number | undefined; inline?: boolean | undefined }) {
  const fresh = isFresh(item.id);
  // 한 줄 모양: 정해 두었으면 그대로, 아니면 글자 크기가 있을 때(손글씨에서 온 수식)만
  const inline = inlineFlag ?? fontSize !== undefined;
  return (
    <div
      data-overlay-id={item.id}
      className={fresh ? "sl-fade-in" : undefined}
      style={{
        position: "absolute",
        left: item.transform.x,
        top: item.transform.y,
        // 손글씨에서 온 수식(fontSize 있음)은 한 줄로 — 손글씨 폭에 맞춰 줄바꿈하면 오히려 어색하다
        maxWidth: fontSize ? undefined : item.bbox.maxX - item.bbox.minX,
        whiteSpace: fontSize ? "nowrap" : undefined,
        color: theme.color.ink,
        pointerEvents: "none",
      }}
    >
      <KaTeX latex={latex} display={!inline} size={fontSize ?? 22} />
    </div>
  );
}

type PlotIR = Extract<SceneIR, { kind: "plot2d" }>;
type PlotData = SceneDataOf<"plot2d">;

interface Curve {
  d: string;
  color: string;
  /** 부등식 < 의 경계 (점선) */
  dash?: boolean;
}

function pathFrom(runs: Pt[][], bx: (x: number) => number, by: (y: number) => number): string {
  return runs
    .map((run) => run.map(([x, y], i) => `${i ? "L" : "M"}${bx(x).toFixed(2)},${by(y).toFixed(2)}`).join(""))
    .join("");
}

function PlotBox({ item, ir, interactive }: { item: ObjectItem; ir: PlotIR; interactive: boolean }) {
  const clipId = useId();
  const W = item.transform.scale;
  const H = W * plot.aspect;
  const data = ir.data;
  const view: View = data.view;
  const fresh = isFresh(item.id);
  const params = useMemo(
    () => Object.fromEntries((data.params ?? []).map((p) => [p.name, p.value])) as Record<string, number>,
    [data.params],
  );

  const drawn = useMemo(() => renderCurves(data, view, W, H, params), [data, view, W, H, params]);
  const box = toBox(view, W, H);
  const ax = Math.min(Math.max(box.x(0), 0), W); // y축이 놓일 x (0이 화면 밖이면 가장자리)
  const ay = Math.min(Math.max(box.y(0), 0), H); // x축이 놓일 y

  // 막대그래프: x축 눈금 자리에 이름 (1, 2, 3 … 자리)
  const xTicks: Tick[] = data.xCategories?.length
    ? data.xCategories.map((label, i) => ({ value: i + 1, label }))
    : data.view.xTicks === "pi"
      ? piTicks(view.xmin, view.xmax)
      : numberTicks(view.xmin, view.xmax);
  // 1:1 비율이면 y 눈금도 x와 같은 간격(교과서), 비율이 다르면 y 범위에 맞는 간격
  const sameStep = data.view.aspect === "equal" && data.view.xTicks !== "pi" && xTicks.length > 1;
  const yTicks = numberTicks(view.ymin, view.ymax, sameStep ? Math.abs((xTicks[1] as Tick).value - (xTicks[0] as Tick).value) : undefined);
  const labelFont = "KaTeX_Main, 'Times New Roman', serif";
  const varFont = "KaTeX_Math, 'Times New Roman', serif";
  const t = plot.tick;
  const a = plot.arrow;

  // 확률분포: 고른 막대·칠한 구간으로 확률을 그때그때 다시 계산해 보여 준다
  const dist = data.dist;
  const continuous = !!dist && dist.kind !== "binomial" && dist.kind !== "poisson";
  const range = data.shade?.[0];
  const captionLatex = dist
    ? continuous && range
      ? rangeCaption(dist, range.from, range.to)
      : !continuous
        ? discreteCaption(dist, (data.bars ?? []).filter((b) => b.on).map((b) => b.x))
        : (data.caption ?? "")
    : (data.caption ?? data.functions.map((f) => f.latex).join(",\\quad "));
  // 확률분포가 아닌 막대그래프: 고른 막대의 합·평균
  const picked = !dist ? (data.bars ?? []).filter((b) => b.on) : [];
  const live = interactive ? "auto" : "none";

  /** 곡선 따라가기 — 곡선을 누른 채 끌면 그 점의 좌표 (저장하지 않는 표시) */
  const [trace, setTrace] = useState<{ i: number; x: number } | null>(null);
  const startTrace = (i: number) => (e: React.PointerEvent<SVGPathElement>) => {
    e.stopPropagation();
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처를 못 해도 된다 */
    }
    const r = svg.getBoundingClientRect();
    const xAt = (clientX: number) => view.xmin + ((clientX - r.left) / r.width) * (view.xmax - view.xmin);
    setTrace({ i, x: xAt(e.clientX) });
    const move = (ev: PointerEvent) => setTrace({ i, x: Math.min(view.xmax, Math.max(view.xmin, xAt(ev.clientX))) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const traced = trace ? drawn.trace[trace.i] : undefined;
  const ty = traced && trace ? traced.f(trace.x) : NaN;

  /** 막대 톡 → 고르기·풀기 (Undo 1단계) */
  const toggleBar = (i: number) => {
    const now = currentPlot(item.id) ?? ir;
    const bars = (now.data.bars ?? []).map((b, j) => {
      if (j !== i) return b;
      const { on: _on, ...rest } = b;
      return b.on ? rest : { ...rest, on: true };
    });
    sessionStore.getState().commitObjectIR(item.id, now, { ...now, data: { ...now.data, bars } }, "막대 고르기");
  };

  /** 구간 끝 끌기 — 끄는 동안은 미리보기, 놓으면 한 번 기록 */
  const dragEdge = (which: 0 | 1) => (e: React.PointerEvent<SVGElement>) => {
    e.stopPropagation();
    const svg = (e.currentTarget as SVGElement).ownerSVGElement;
    if (!svg || !range) return;
    const start = currentPlot(item.id) ?? ir;
    const r = svg.getBoundingClientRect();
    const span = view.xmax - view.xmin;
    const step = niceStep(span / 200);
    try {
      (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    } catch {
      /* 캡처를 못 해도 끌기는 된다 */
    }
    const at = (clientX: number) => Math.round((view.xmin + ((clientX - r.left) / r.width) * span) / step) * step;
    const apply = (clientX: number) => {
      const base = currentPlot(item.id) ?? start;
      const sh = base.data.shade?.[0];
      if (!sh) return base;
      const x = Math.min(view.xmax, Math.max(view.xmin, at(clientX)));
      const next = { ...sh, ...(which === 0 ? { from: x } : { to: x }) };
      return { ...base, data: { ...base.data, shade: [next, ...(base.data.shade ?? []).slice(1)] } };
    };
    const move = (ev: PointerEvent) => sessionStore.getState().previewObjectIR(item.id, apply(ev.clientX));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const end = apply(ev.clientX);
      sessionStore.getState().commitObjectIR(item.id, start, end, "확률 구간");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div
      data-overlay-id={item.id}
      style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: W, pointerEvents: "none" }}
      className={fresh ? "sl-fade-in" : undefined}
    >
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={W} height={H} />
          </clipPath>
        </defs>

        {/* 부등식 영역 — 옅게 칠한다 */}
        <g clipPath={`url(#${clipId})`}>
          {drawn.regions.map((rg, i) => (
            <path key={`rg${i}`} d={rg.d} fill={rg.color === plot.palette[0] ? theme.color.accent : rg.color} opacity={0.16} shapeRendering="crispEdges" />
          ))}
        </g>
        {/* 막대 (이산 확률분포·막대그래프) — 구하는 범위의 막대는 진하게 */}
        <g clipPath={`url(#${clipId})`}>
          {(data.bars ?? []).map((b, i) => {
            const half = (data.barWidth ?? 0.8) / 2;
            const x0 = box.x(b.x - half);
            const x1 = box.x(b.x + half);
            const y0 = box.y(Math.max(0, b.h));
            const y1 = box.y(Math.min(0, b.h));
            return (
              <rect
                key={`b${i}`}
                x={x0}
                y={y0}
                width={Math.max(1, x1 - x0)}
                height={Math.max(0.5, y1 - y0)}
                style={{ pointerEvents: live, cursor: interactive ? "pointer" : undefined }}
                onClick={interactive ? () => toggleBar(i) : undefined}
                // 구하는 범위가 있으면 그 막대만 진하게 (나머지는 옅은 회색), 없으면 모두 파랗게
                fill={b.on || !(data.bars ?? []).some((x) => x.on) ? theme.color.accent : plot.palette[0]}
                fillOpacity={b.on ? 0.55 : (data.bars ?? []).some((x) => x.on) ? 0.12 : 0.42}
                stroke={b.on || !(data.bars ?? []).some((x) => x.on) ? theme.color.accent : plot.palette[0]}
                strokeOpacity={0.7}
                strokeWidth={1}
              />
            );
          })}
        </g>
        {/* 넓이 음영 — 곡선 아래에 깔린다 */}
        <g clipPath={`url(#${clipId})`}>
          {drawn.shades.map((s, i) => (
            <g key={`s${i}`}>
              <path d={s.d} fill={s.negative ? plot.shadeNegative : plot.shade} stroke="none" />
              {s.edges.map((x, j) => (
                <line key={j} x1={box.x(x)} x2={box.x(x)} y1={ay} y2={by(box, s.edgeY[j] ?? 0, H)} stroke={theme.color.asymptote} strokeWidth={1} strokeDasharray="4 3" />
              ))}
            </g>
          ))}
        </g>

        {/* 확률 구간의 양 끝 손잡이 — 끌어서 "어디부터 어디까지" */}
        {continuous && range && interactive && (
          <g>
            {([0, 1] as const).map((w) => {
              const x = box.x(w === 0 ? range.from : range.to);
              return (
                <g key={w} style={{ pointerEvents: "auto", cursor: "ew-resize", touchAction: "none" }} onPointerDown={dragEdge(w)}>
                  <rect x={x - 14} y={0} width={28} height={H} fill="transparent" />
                  <circle cx={x} cy={ay} r={9} fill={theme.color.bg} stroke={theme.color.accent} strokeWidth={2.5} />
                  <path d={`M${x - 3},${ay - 3}l-3,3l3,3M${x + 3},${ay - 3}l3,3l-3,3`} fill="none" stroke={theme.color.accent} strokeWidth={1.5} />
                </g>
              );
            })}
          </g>
        )}

        {/* 축 — 끝 화살표, 원점 O, 축 이름은 바깥쪽 */}
        {data.showAxes && (
        <g stroke={theme.color.ink} strokeWidth={1.2} fill={theme.color.ink}>
          <line x1={0} y1={ay} x2={W} y2={ay} />
          <path d={`M${W + 2},${ay} l${-a},${-a / 2.4} l0,${(a / 2.4) * 2}z`} stroke="none" />
          <line x1={ax} y1={H} x2={ax} y2={0} />
          <path d={`M${ax},${-2} l${-a / 2.4},${a} l${(a / 2.4) * 2},0z`} stroke="none" />
          {xTicks.map((tk) => (
            <line key={`xt${tk.value}`} x1={box.x(tk.value)} x2={box.x(tk.value)} y1={ay - t / 2} y2={ay + t / 2} />
          ))}
          {yTicks.map((tk) => (
            <line key={`yt${tk.value}`} x1={ax - t / 2} x2={ax + t / 2} y1={box.y(tk.value)} y2={box.y(tk.value)} />
          ))}
        </g>
        )}
        {/* 점근선 — 곡선보다 확실히 연한 점선 */}
        <g clipPath={`url(#${clipId})`} stroke={theme.color.asymptote} strokeWidth={stroke.asymptote} strokeDasharray={stroke.asymptoteDash.join(" ")}>
          {drawn.vertical.map((x) => (
            <line key={`va${x}`} x1={box.x(x)} x2={box.x(x)} y1={0} y2={H} />
          ))}
          {drawn.horizontal.map((y) => (
            <line key={`ha${y}`} x1={0} x2={W} y1={box.y(y)} y2={box.y(y)} />
          ))}
        </g>

        {/* 곡선 */}
        <g clipPath={`url(#${clipId})`} fill="none" strokeWidth={stroke.main} strokeLinecap="round" strokeLinejoin="round">
          {drawn.curves.map((c, i) => (
            <path key={`c${i}`} d={c.d} stroke={c.color} strokeDasharray={c.dash ? "7 5" : undefined} pathLength={fresh && !c.dash ? 1 : undefined} className={fresh && !c.dash ? "sl-draw" : undefined} />
          ))}
        </g>
        {/* 계단의 끝: 채운 점(함수값) · 빈 점(닿지 않는 쪽) */}
        <g strokeWidth={1.6}>
          {drawn.dots.map((d, i) => (
            <circle key={`dot${i}`} cx={box.x(d.x)} cy={box.y(d.y)} r={3.4} fill={d.filled ? d.color : theme.color.bg} stroke={d.color} />
          ))}
        </g>
        {/* 곡선 따라가기: 곡선 근처만 터치를 받는다 (나머지는 그대로 필기) */}
        {interactive &&
          drawn.trace.map((t, i) => (
            <path key={`tr${i}`} d={t.d} fill="none" stroke="transparent" strokeWidth={18} style={{ pointerEvents: "stroke", cursor: "crosshair", touchAction: "none" }} onPointerDown={startTrace(i)} />
          ))}
        {traced && trace && Number.isFinite(ty) && box.y(ty) >= -4 && box.y(ty) <= H + 4 && (
          <g style={{ pointerEvents: "none" }}>
            <line x1={box.x(trace.x)} x2={box.x(trace.x)} y1={box.y(ty)} y2={ay} stroke={traced.color} strokeDasharray="3 3" strokeWidth={1} />
            <line x1={box.x(trace.x)} x2={ax} y1={box.y(ty)} y2={box.y(ty)} stroke={traced.color} strokeDasharray="3 3" strokeWidth={1} />
            <circle cx={box.x(trace.x)} cy={box.y(ty)} r={5} fill={traced.color} stroke={theme.color.bg} strokeWidth={2} />
            <text
              x={box.x(trace.x) + (box.x(trace.x) > W - 110 ? -10 : 10)}
              y={box.y(ty) + (box.y(ty) < 24 ? 20 : -10)}
              textAnchor={box.x(trace.x) > W - 110 ? "end" : "start"}
              fontSize={13}
              fontFamily={labelFont}
              fill={theme.color.ink}
              stroke={theme.color.bg}
              strokeWidth={3}
              paintOrder="stroke"
            >
              ({fmtSum(Number(trace.x.toFixed(3)))}, {fmtSum(Number(ty.toFixed(3)))})
            </text>
          </g>
        )}
        {/* 자료 (산점도의 점 · 꺾은선) */}
        <g clipPath={`url(#${clipId})`}>
          {(data.series ?? []).map((sr, i) => {
            const color = sr.color ?? (plot.palette[(i + 1) % plot.palette.length] as string);
            return (
              <g key={`sr${i}`}>
                {sr.line && sr.pts.length > 1 && (
                  <path d={`M${sr.pts.map(([x, y]) => `${box.x(x).toFixed(1)},${box.y(y).toFixed(1)}`).join("L")}`} fill="none" stroke={color} strokeWidth={stroke.main} strokeLinejoin="round" />
                )}
                {sr.pts.map(([x, y], j) => (
                  <circle key={j} cx={box.x(x)} cy={box.y(y)} r={sr.line ? 3 : 3.6} fill={sr.line ? color : theme.color.bg} stroke={color} strokeWidth={1.6} />
                ))}
              </g>
            );
          })}
        </g>
        {/* 점 (연립방정식의 교점 등) — 검은 점과 이름표 */}
        <g clipPath={`url(#${clipId})`}>
          {(data.points ?? []).map((p, i) => (
            <circle key={`p${i}`} cx={box.x(p.at[0])} cy={box.y(p.at[1])} r={4} fill={theme.color.ink} />
          ))}
        </g>
        <g fill={theme.color.ink} fontSize={plot.labelSize + 1} fontFamily={labelFont} stroke={theme.color.bg} strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">
          {(data.points ?? []).map((p, i) =>
            p.label ? (
              <text key={`pl${i}`} x={box.x(p.at[0]) + (box.x(p.at[0]) > W - 90 ? -8 : 8)} y={box.y(p.at[1]) - 9} textAnchor={box.x(p.at[0]) > W - 90 ? "end" : "start"}>
                {p.label}
              </text>
            ) : null,
          )}
        </g>
        {/* 라벨은 곡선 위에, 흰 테두리(halo)로 — 곡선이 지나가도 글자가 읽힌다 (교과서 그림 관행) */}
        {data.showAxes && (
        <g
          fill={theme.color.ink}
          fontSize={plot.labelSize}
          fontFamily={labelFont}
          stroke={theme.color.bg}
          strokeWidth={3}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {xTicks
            .filter((tk) => box.x(tk.value) > 10 && box.x(tk.value) < W - 18)
            .map((tk) => (
              <text key={`xl${tk.value}`} x={box.x(tk.value)} y={ay + t + plot.labelSize} textAnchor="middle">
                {tk.label}
              </text>
            ))}
          {yTicks
            .filter((tk) => box.y(tk.value) > 16 && box.y(tk.value) < H - 6)
            .map((tk) => (
              // y축이 왼쪽 끝에 붙으면(x = 0이 화면 밖) 숫자를 축 안쪽에 — 그림 밖으로 나가지 않게
              <text key={`yl${tk.value}`} x={ax < 24 ? ax + t + 4 : ax - t - 3} y={box.y(tk.value) + plot.labelSize * 0.35} textAnchor={ax < 24 ? "start" : "end"}>
                {tk.label}
              </text>
            ))}
          {box.x(0) >= 0 && box.x(0) <= W && box.y(0) >= 0 && box.y(0) <= H && (
            <text x={ax - 4} y={ay + plot.labelSize + 2} textAnchor="end" fontFamily={varFont} fontStyle="italic">
              O
            </text>
          )}
          <text x={W - 2} y={ay + plot.labelSize + t + 2} textAnchor="end" fontFamily={varFont} fontStyle="italic" fontSize={plot.labelSize + 3}>
            x
          </text>
          <text x={ax + 7} y={10} fontFamily={varFont} fontStyle="italic" fontSize={plot.labelSize + 3}>
            y
          </text>
        </g>
        )}
      </svg>

      <div style={{ marginTop: theme.space[2], color: theme.color.ink, textAlign: "center" }}>
        {data.showCaption && <KaTeX latex={captionLatex + (drawn.valueLatex ? `=${drawn.valueLatex}` : "")} size={17} />}
        {drawn.error && <div style={{ color: theme.color.danger, fontSize: 13, marginTop: theme.space[1] }}>{drawn.error}</div>}
        {picked.length > 0 && (
          <div style={{ fontSize: 13, color: theme.color.accent, marginTop: 2 }}>
            고른 막대 {picked.length}개 · 합 {fmtSum(picked.reduce((a, b) => a + b.h, 0))} · 평균 {fmtSum(picked.reduce((a, b) => a + b.h, 0) / picked.length)}
          </div>
        )}
        {interactive && (dist || (data.bars ?? []).length > 0) && (
          <div data-export-skip style={{ fontSize: 12, color: theme.color.asymptote, marginTop: 2 }}>
            {continuous ? "축 위의 동그라미를 끌어 구간을 바꿔요" : "막대를 톡톡 눌러 고르면 확률(합)을 구해요"}
          </div>
        )}
      </div>

      {(data.params ?? []).length > 0 && <Sliders item={item} ir={ir} />}
    </div>
  );
}

/** 스토어의 지금 IR (끄는 동안 매 프레임 바뀐다 — props는 한 박자 늦다) */
function currentPlot(id: string): PlotIR | null {
  const it = sessionStore.getState().items.find((i) => i.id === id);
  return it && it.kind === "object" && it.ir.kind === "plot2d" ? it.ir : null;
}

/** 1·2·5 × 10ⁿ 꼴의 깔끔한 간격 */
function niceStep(raw: number): number {
  const e = 10 ** Math.floor(Math.log10(raw || 1));
  const m = raw / e;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
}

const fmtSum = (v: number) => String(Number(v.toPrecision(5)));

function by(box: ReturnType<typeof toBox>, y: number, H: number): number {
  return Math.min(Math.max(box.y(y), 0), H);
}

interface Drawn {
  curves: Curve[];
  shades: Array<{ d: string; edges: number[]; edgeY: number[]; negative: boolean }>;
  /** 부등식이 참인 곳 (칸을 이어 붙인 경로) */
  regions: Array<{ d: string; color: string }>;
  vertical: number[];
  horizontal: number[];
  valueLatex: string | null;
  error: string | null;
  /** 따라가기(트레이스)용: y = f(x) 꼴 곡선마다 함수와 그 경로 */
  trace: Array<{ d: string; f: Fn; color: string }>;
  /** 계단처럼 뛰는 곳 (가우스 기호 [x] 등): 함수값이 있는 쪽은 채운 점, 반대쪽은 빈 점 (교과서) */
  dots: Array<{ x: number; y: number; filled: boolean; color: string }>;
}


function renderCurves(data: PlotData, view: View, W: number, H: number, params: Record<string, number>): Drawn {
  const box = toBox(view, W, H);
  const out: Drawn = { curves: [], shades: [], regions: [], vertical: [], horizontal: [], valueLatex: null, error: null, trace: [], dots: [] };
  const names = Object.keys(params).sort();
  const values = names.map((n) => params[n] as number);
  const explicitFns: Array<Fn | null> = [];

  data.functions.forEach((fn, i) => {
    const color = fn.color ?? (plot.palette[i % plot.palette.length] as string);
    const a = analyzeCached(fn.latex);
    explicitFns[i] = null;
    if (a.kind === "explicit") {
      const f = compileCached(`e|${fn.latex}|${names.join(",")}`, a.rhs, ["x", ...names]);
      const g: Fn = (x) => f(x, ...values);
      explicitFns[i] = g;
      const sampled = sampleFunction(g, view, { widthPx: W, heightPx: H });
      out.curves.push({ d: pathFrom(sampled.runs, box.x, box.y), color });
      out.trace.push({ d: pathFrom(sampled.runs, box.x, box.y), f: g, color });
      const asym = findAsymptotes(g, view, sampled);
      for (const d of jumpDots(g, view, sampled.breaks)) if (d.y >= view.ymin && d.y <= view.ymax && d.x >= view.xmin && d.x <= view.xmax) out.dots.push({ ...d, color });
      // 축 위에 겹치는 점근선(y = 1/x의 x = 0, y = 0)은 축이 대신한다 — 실선 위 점선은 지저분하다
      out.vertical.push(...asym.vertical.filter((x) => x !== 0));
      out.horizontal.push(...asym.horizontal.filter((y) => y !== 0));
    } else if (a.kind === "implicit") {
      const F = compileCached(`i|${fn.latex}|${names.join(",")}`, a.F, ["x", "y", ...names]);
      const lines = marchingSquares((x, y) => F(x, y, ...values), view, 140, Math.round(140 * plot.aspect));
      out.curves.push({ d: pathFrom(lines, box.x, box.y), color });
    } else if (a.kind === "inequality") {
      // 화면을 촘촘한 칸으로 나눠 조건이 참인 칸을 칠한다 (가로로 이어진 칸은 한 사각형으로)
      const conds = a.parts.map((part, k) => ({ f: compileCached(`q${k}|${fn.latex}|${names.join(",")}`, part.F, ["x", "y", ...names]), strict: part.strict }));
      const cols = Math.max(80, Math.round(W / 2.5));
      const rows = Math.max(60, Math.round((cols * H) / W));
      const dx = (view.xmax - view.xmin) / cols;
      const dy = (view.ymax - view.ymin) / rows;
      const cw = W / cols;
      const ch = H / rows;
      let d = "";
      for (let r = 0; r < rows; r++) {
        const y = view.ymax - (r + 0.5) * dy;
        let start = -1;
        for (let c = 0; c <= cols; c++) {
          const inside =
            c < cols &&
            conds.every(({ f, strict }) => {
              const v = f(view.xmin + (c + 0.5) * dx, y, ...values);
              return strict ? v < 0 : v <= 0;
            });
          if (inside && start < 0) start = c;
          if (!inside && start >= 0) {
            d += `M${(start * cw).toFixed(1)},${(r * ch).toFixed(1)}h${((c - start) * cw).toFixed(1)}v${(ch + 0.4).toFixed(1)}h${(-(c - start) * cw).toFixed(1)}Z`;
            start = -1;
          }
        }
      }
      out.regions.push({ d, color });
      // 경계선: < 는 점선, ≤ 는 실선 (⌊ ⌋·mod처럼 끊어지는 식은 경계를 그리지 않는다 — 계단 모서리가 지저분해진다)
      if (!/Floor|Ceil|Mod|Round/.test(JSON.stringify(a.parts))) {
        conds.forEach(({ f, strict }) => {
          const lines = marchingSquares((x, y) => f(x, y, ...values), view, 140, Math.round(140 * plot.aspect));
          out.curves.push({ d: pathFrom(lines, box.x, box.y), color, ...(strict ? { dash: true } : {}) });
        });
      }
    } else if (a.kind === "polar") {
      const r = compileCached(`p|${fn.latex}|${names.join(",")}`, a.rhs, ["theta", ...names]);
      const runs = sampleParametric(
        (th) => r(th, ...values) * Math.cos(th),
        (th) => r(th, ...values) * Math.sin(th),
        0,
        2 * Math.PI,
        view,
        1440,
      );
      out.curves.push({ d: pathFrom(runs, box.x, box.y), color });
    } else {
      out.error = "그래프로 그릴 수 없는 식이에요";
    }
  });

  // 코드로 계산하는 유명한 곡선 (제타 임계선·푸리에·테일러) — 계수 N은 슬라이더
  (data.special ?? []).forEach((sp, i) => {
    const color = sp.color ?? (plot.palette[(data.functions.length + i) % plot.palette.length] as string);
    const g: Fn = (x) => special(sp.name, x, params);
    const sampled = sampleFunction(g, view, { widthPx: W, heightPx: H });
    const d = pathFrom(sampled.runs, box.x, box.y);
    out.curves.push({ d, color });
    out.trace.push({ d, f: g, color });
  });

  for (const sh of data.shade ?? []) {
    const g = explicitFns[sh.fn];
    if (!g) continue;
    const lo = Math.min(sh.from, sh.to);
    const hi = Math.max(sh.from, sh.to);
    const steps = 200;
    const xs = Array.from({ length: steps + 1 }, (_, k) => lo + ((hi - lo) * k) / steps);
    const pts = xs.map((x) => [x, g(x)] as Pt).filter(([, y]) => Number.isFinite(y));
    if (pts.length < 2) continue;
    const clampY = (y: number) => Math.min(Math.max(y, view.ymin - (view.ymax - view.ymin)), view.ymax + (view.ymax - view.ymin));
    const d =
      `M${box.x(lo)},${box.y(0)}` +
      pts.map(([x, y]) => `L${box.x(x).toFixed(2)},${box.y(clampY(y)).toFixed(2)}`).join("") +
      `L${box.x(hi)},${box.y(0)}Z`;
    const area = simpson(g, sh.from, sh.to);
    out.shades.push({ d, edges: [lo, hi], edgeY: [g(lo), g(hi)].map((y) => (Number.isFinite(y) ? y : 0)), negative: area < 0 });

    if (sh.showValue) {
      const cap = data.caption ? analyzeCached(data.caption) : null;
      const exact =
        cap && cap.kind === "integral" ? definiteIntegral(cap.body, cap.variable, cap.from, cap.to, params) : { exact: null, value: area };
      const v = Number.isFinite(exact.value) ? exact.value : area;
      if (Number.isFinite(v)) {
        const approx = Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(3);
        out.valueLatex = exact.exact && exact.exact !== approx ? `${exact.exact}\\approx ${approx}` : approx;
      }
    }
  }
  return out;
}

type Param = NonNullable<PlotIR["data"]["params"]>[number];

/** 길게 누르면 범위가 여기까지 부드럽게 넓어진다 */
const RANGE_LIMIT = 100;
const HOLD_MS = 450;
/** 길게 누르기로 보는 손떨림 한계 (화면 px) — 이보다 움직이면 그냥 끌기 */
const HOLD_SLOP = 8;
const round2 = (v: number) => Math.round(v * 100) / 100;

function Sliders({ item, ir }: { item: ObjectItem; ir: PlotIR }) {
  const before = useRef<SceneIR | null>(null);
  const params = ir.data.params ?? [];

  /** 스토어의 지금 IR (길게 누르는 동안 매 프레임 바뀐다 — props는 한 박자 늦다) */
  const current = (): PlotIR => {
    const now = sessionStore.getState().items.find((i) => i.id === item.id);
    return now && now.kind === "object" && now.ir.kind === "plot2d" ? now.ir : ir;
  };
  const readParam = (name: string): Param | undefined => (current().data.params ?? []).find((q) => q.name === name);
  const begin = () => {
    before.current ??= current();
  };
  const preview = (name: string, change: Partial<Param>) => {
    begin();
    const base = current();
    sessionStore.getState().previewObjectIR(item.id, {
      ...base,
      data: { ...base.data, params: (base.data.params ?? []).map((q) => (q.name === name ? { ...q, ...change } : q)) },
    });
  };
  /** 끌기·길게 누르기·숫자 입력이 끝나면 한 번에 기록 (Undo 1단계) */
  const commit = () => {
    const start = before.current;
    before.current = null;
    const now = current();
    if (start && now !== start) sessionStore.getState().commitObjectIR(item.id, start, now, "계수 변경");
  };

  return (
    <div style={{ marginTop: theme.space[2], display: "grid", gap: theme.space[1], pointerEvents: "auto" }}>
      {params.map((p) => (
        <ParamRow key={p.name} p={p} read={() => readParam(p.name)} onPreview={(c) => preview(p.name, c)} onBegin={begin} onCommit={commit} />
      ))}
    </div>
  );
}

/**
 * 계수 한 줄: 이름 · 슬라이더 · 숫자 상자.
 *   슬라이더를 꾹 누르고 있으면 범위가 −100 ~ 100까지 부드럽게 넓어진다.
 *   숫자 상자에 아무 값이나 치면 그 값이 들어가도록 범위도 늘어난다.
 */
function ParamRow({
  p,
  read,
  onPreview,
  onBegin,
  onCommit,
}: {
  p: Param;
  read: () => Param | undefined;
  onPreview: (change: Partial<Param>) => void;
  onBegin: () => void;
  onCommit: () => void;
}) {
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; raf: number | null; x: number; y: number } | null>(null);
  const [growing, setGrowing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const stopHold = () => {
    const h = hold.current;
    if (h?.timer) clearTimeout(h.timer);
    if (h?.raf) cancelAnimationFrame(h.raf);
    hold.current = null;
    setGrowing(false);
  };
  useEffect(() => stopHold, []);

  const startHold = (x: number, y: number) => {
    stopHold();
    const h: NonNullable<typeof hold.current> = { timer: null, raf: null, x, y };
    hold.current = h;
    h.timer = setTimeout(() => {
      h.timer = null;
      setGrowing(true);
      navigator.vibrate?.(8);
      const tick = () => {
        const cur = read();
        if (!cur || hold.current !== h) return;
        const goalMin = Math.min(cur.min, -RANGE_LIMIT);
        const goalMax = Math.max(cur.max, RANGE_LIMIT);
        // 목표까지 남은 거리의 일정 비율씩 — 처음엔 빠르게, 끝에선 천천히 (약 1초)
        const step = (v: number, goal: number) => (Math.abs(goal - v) < 0.5 ? goal : round2(v + (goal - v) * 0.07));
        const min = step(cur.min, goalMin);
        const max = step(cur.max, goalMax);
        onPreview({ min, max });
        if (min !== goalMin || max !== goalMax) h.raf = requestAnimationFrame(tick);
        else setGrowing(false);
      };
      h.raf = requestAnimationFrame(tick);
    }, HOLD_MS);
  };

  const finish = () => {
    stopHold();
    onCommit();
  };

  const applyTyped = () => {
    if (draft === null) return;
    const v = Number(draft.replace(/[−–]/g, "-").replace(",", ".").trim());
    setDraft(null);
    if (!Number.isFinite(v) || draft.trim() === "") return;
    onPreview({ value: v, min: Math.min(p.min, v), max: Math.max(p.max, v) });
    onCommit();
  };

  const small = { fontSize: 11, color: theme.color.asymptote, fontVariantNumeric: "tabular-nums" } as const;

  return (
    <div data-export-skip style={{ display: "grid", gridTemplateColumns: "28px 1fr 64px", alignItems: "center", gap: theme.space[2], minHeight: theme.touch.minTarget }}>
      <span style={{ color: theme.color.ink }}>
        <KaTeX latex={`${p.name}=`} size={15} />
      </span>
      <div style={{ display: "grid" }}>
        <input
          type="range"
          min={p.min}
          max={p.max}
          step={p.step}
          value={p.value}
          aria-label={`계수 ${p.name}`}
          title="꾹 누르고 있으면 범위가 −100 ~ 100까지 넓어져요"
          style={{ width: "100%", accentColor: theme.color.accent, touchAction: "pan-x" }}
          onPointerDown={(e) => {
            onBegin();
            startHold(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            // 끌기 시작 = 길게 누르기 아님 (이미 넓어지는 중이면 그대로 둔다)
            const h = hold.current;
            if (h?.timer && Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP) stopHold();
          }}
          onInput={(e) => onPreview({ value: Number((e.target as HTMLInputElement).value) })}
          onChange={() => {
            /* React가 input 이벤트를 onChange로도 보낸다 — 실제 기록은 놓을 때(onPointerUp/onKeyUp) */
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onKeyDown={onBegin}
          onKeyUp={onCommit}
        />
        <span style={{ display: "flex", justifyContent: "space-between", marginTop: -2 }}>
          <span style={small}>{round2(p.min)}</span>
          {growing && <span style={{ ...small, color: theme.color.accent }}>범위 넓히는 중…</span>}
          <span style={small}>{round2(p.max)}</span>
        </span>
      </div>
      <input
        type="text"
        inputMode="decimal"
        aria-label={`계수 ${p.name} 값 입력`}
        value={draft ?? String(round2(p.value))}
        onFocus={(e) => {
          setDraft(String(round2(p.value)));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={applyTyped}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        style={{
          width: "100%",
          height: 34,
          boxSizing: "border-box",
          padding: "0 6px",
          border: `1px solid ${theme.color.sub}`,
          borderRadius: theme.radius.s,
          background: theme.color.bg,
          color: theme.color.ink,
          font: "inherit",
          fontSize: 14,
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
        }}
      />
    </div>
  );
}
