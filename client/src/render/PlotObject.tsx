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
import { sampleFunction, sampleParametric, type Fn, type Pt, type View } from "../math/sample";
import { toBox } from "../math/view";
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

export default memo(function PlotObject({ item }: { item: ObjectItem }): ReactElement | null {
  if (item.ir.kind === "formula") return <FormulaBox item={item} latex={item.ir.data.latex} fontSize={item.ir.data.fontSize} inline={item.ir.data.inline} />;
  if (item.ir.kind === "chemEq") return <FormulaBox item={item} latex={`\\ce{${item.ir.data.ce}}`} fontSize={item.ir.data.fontSize} inline={item.ir.data.inline} />;
  if (item.ir.kind === "plot2d") return <PlotBox item={item} ir={item.ir} />;
  return null;
});

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
}

function pathFrom(runs: Pt[][], bx: (x: number) => number, by: (y: number) => number): string {
  return runs
    .map((run) => run.map(([x, y], i) => `${i ? "L" : "M"}${bx(x).toFixed(2)},${by(y).toFixed(2)}`).join(""))
    .join("");
}

function PlotBox({ item, ir }: { item: ObjectItem; ir: PlotIR }) {
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

  const xTicks: Tick[] = data.view.xTicks === "pi" ? piTicks(view.xmin, view.xmax) : numberTicks(view.xmin, view.xmax);
  // 1:1 비율이면 y 눈금도 x와 같은 간격(교과서), 비율이 다르면 y 범위에 맞는 간격
  const sameStep = data.view.aspect === "equal" && data.view.xTicks !== "pi" && xTicks.length > 1;
  const yTicks = numberTicks(view.ymin, view.ymax, sameStep ? Math.abs((xTicks[1] as Tick).value - (xTicks[0] as Tick).value) : undefined);
  const labelFont = "KaTeX_Main, 'Times New Roman', serif";
  const varFont = "KaTeX_Math, 'Times New Roman', serif";
  const t = plot.tick;
  const a = plot.arrow;

  const captionLatex = data.caption ?? data.functions.map((f) => f.latex).join(",\\quad ");

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
            <path key={`c${i}`} d={c.d} stroke={c.color} pathLength={fresh ? 1 : undefined} className={fresh ? "sl-draw" : undefined} />
          ))}
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
              <text key={`yl${tk.value}`} x={ax - t - 3} y={box.y(tk.value) + plot.labelSize * 0.35} textAnchor="end">
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
      </div>

      {(data.params ?? []).length > 0 && <Sliders item={item} ir={ir} />}
    </div>
  );
}

function by(box: ReturnType<typeof toBox>, y: number, H: number): number {
  return Math.min(Math.max(box.y(y), 0), H);
}

interface Drawn {
  curves: Curve[];
  shades: Array<{ d: string; edges: number[]; edgeY: number[]; negative: boolean }>;
  vertical: number[];
  horizontal: number[];
  valueLatex: string | null;
  error: string | null;
}

function renderCurves(data: PlotData, view: View, W: number, H: number, params: Record<string, number>): Drawn {
  const box = toBox(view, W, H);
  const out: Drawn = { curves: [], shades: [], vertical: [], horizontal: [], valueLatex: null, error: null };
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
      const asym = findAsymptotes(g, view, sampled);
      // 축 위에 겹치는 점근선(y = 1/x의 x = 0, y = 0)은 축이 대신한다 — 실선 위 점선은 지저분하다
      out.vertical.push(...asym.vertical.filter((x) => x !== 0));
      out.horizontal.push(...asym.horizontal.filter((y) => y !== 0));
    } else if (a.kind === "implicit") {
      const F = compileCached(`i|${fn.latex}|${names.join(",")}`, a.F, ["x", "y", ...names]);
      const lines = marchingSquares((x, y) => F(x, y, ...values), view, 140, Math.round(140 * plot.aspect));
      out.curves.push({ d: pathFrom(lines, box.x, box.y), color });
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
