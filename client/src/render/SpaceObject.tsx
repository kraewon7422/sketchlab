import type { SceneIR } from "@sketchlab/shared";
import katex from "katex";
import "katex/dist/katex.min.css";
import { memo, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import type { P2, View3 } from "../solid/project";
import { applyHandleDrag, drawSpace, screenDeltaToMath, spaceFaces, spaceHandles } from "../solid/space";
import { sessionStore } from "../store/session";
import { isFresh } from "./Shape2DView";
import { line } from "./SolidObject";
import { plot, solid, theme } from "./theme";
import { useTurntable } from "./useTurntable";

/**
 * 공간좌표 객체 — 좌표공간의 점과 수선 (마스터스펙 v4 §12.5). 돌려 볼 수 있다 (useTurntable).
 * 손잡이(벡터 끝·점·구의 중심과 반지름·평면)를 끌면 옮겨지고 아래 식도 다시 쓴다. 곡면의 계수 글자는 슬라이더로.
 */

type SpaceIR = Extract<SceneIR, { kind: "space3d" }>;
const DEG = Math.PI / 180;
/** 기본 시점: x축이 왼쪽 아래로 오는 교과서 배치 */
const DEFAULT_VIEW: View3 = { yaw: -40 * DEG, pitch: 18 * DEG };

export default memo(function SpaceObject({ item, interactive }: { item: ObjectItem; interactive: boolean }): ReactElement | null {
  if (item.ir.kind !== "space3d") return null;
  return <SpaceBox item={item} ir={item.ir} interactive={interactive} />;
});

function arrowHead(from: P2, to: P2, size: number): string {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const w = size / 2.4;
  return `M${to[0]},${to[1]} L${to[0] - ux * size - uy * w},${to[1] - uy * size + ux * w} L${to[0] - ux * size + uy * w},${to[1] - uy * size - ux * w}Z`;
}

type SurfaceFn = (x: number, y: number) => number;
type Compiled = (...v: number[]) => number;
const NO_FNS: Compiled[] = [];

/**
 * 곡면 식(등식) → z = f(x, y). F가 z에 대해 일차라서 z = −F(x,y,0) / (F(x,y,1) − F(x,y,0)).
 * 식 계산 모듈은 무거워서 곡면이 있을 때만 불러온다. 계수(a, b …)는 슬라이더 값으로.
 */
function useSurfaceFns(surfaces: ReadonlyArray<{ latex: string }> | undefined, params: ReadonlyArray<{ name: string; value: number }> | undefined): SurfaceFn[] {
  const [compiled, setCompiled] = useState<Compiled[]>(NO_FNS);
  const names = (params ?? []).map((p) => p.name);
  const key = `${(surfaces ?? []).map((s) => s.latex).join("\n")}|${names.join(",")}`;
  useEffect(() => {
    const latexes = key.split("|")[0] ?? "";
    if (!latexes) {
      setCompiled(NO_FNS);
      return;
    }
    let alive = true;
    const vars = ["x", "y", "z", ...(key.split("|")[1] ?? "").split(",").filter(Boolean)];
    void import("../math/latex").then(({ equationResidual }) => {
      const out: Compiled[] = [];
      for (const latex of latexes.split("\n")) {
        const r = equationResidual(latex);
        if (r) out.push(r.F(vars));
      }
      if (alive) setCompiled(out);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  const values = (params ?? []).map((p) => p.value);
  const valueKey = values.join(",");
  return useMemo(
    () =>
      compiled.map((F): SurfaceFn => (x, y) => {
        const f0 = F(x, y, 0, ...values);
        return -f0 / (F(x, y, 1, ...values) - f0);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- values는 valueKey로
    [compiled, valueKey],
  );
}

function SpaceBox({ item, ir, interactive }: { item: ObjectItem; ir: SpaceIR; interactive: boolean }) {
  const S = item.transform.scale;
  const { view, handlers } = useTurntable(item, ir.data.view3, DEFAULT_VIEW);
  // 곡면·평면·원기둥은 상자(±범위)를 꽉 채운다 — 돌려도 상자 모서리가 그림 밖으로 안 나가게 작게
  const fills = !!(ir.data.surfaces?.length || ir.data.planes?.length || ir.data.shapes?.some((s) => s.t === "cylinder"));
  const scale = (S * (fills ? 0.32 : 0.52)) / ir.data.view.range;
  const cy = S * (fills ? 0.52 : 0.58);
  const d = useMemo(() => drawSpace(ir.data, view, scale, S * 0.47, cy), [ir.data, view, scale, S, cy]);
  // z = f(x, y) 곡면은 식 계산 모듈(무거움)이 필요하다 — 곡면이 있을 때만 불러온다
  const fns = useSurfaceFns(ir.data.surfaces, ir.data.params);
  const handles = useMemo(() => (interactive ? spaceHandles(ir.data, view, scale, S * 0.47, cy) : []), [interactive, ir.data, view, scale, S, cy]);

  /** 지금 스토어의 그림 (끄는 동안 바뀐다) */
  const current = (): SpaceIR | null => {
    const now = sessionStore.getState().items.find((i) => i.id === item.id);
    return now && now.kind === "object" && now.ir.kind === "space3d" ? now.ir : null;
  };
  /** 손잡이 끌기 — 돌리기 대신 그 점만 옮긴다 (놓으면 Undo 1단계) */
  const grab = (key: string) => (e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    const start = current();
    const svg = e.currentTarget.ownerSVGElement;
    if (!start || !svg) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처를 못 해도 끌기는 된다 */
    }
    const k = svg.getBoundingClientRect().width / S || 1; // 화면 확대 배율
    const sx = e.clientX;
    const sy = e.clientY;
    const at = (ev: PointerEvent) => ({ ...start, data: applyHandleDrag(start.data, key, screenDeltaToMath(start.data, view, scale, (ev.clientX - sx) / k, (ev.clientY - sy) / k)) });
    const move = (ev: PointerEvent) => sessionStore.getState().previewObjectIR(item.id, at(ev));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      sessionStore.getState().commitObjectIR(item.id, start, at(ev), "3D 옮기기");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  /** 곡면 계수 슬라이더 */
  const sliderStart = useRef<SpaceIR | null>(null);
  const setParam = (name: string, value: number, commit: boolean) => {
    const now = current();
    if (!now) return;
    sliderStart.current ??= now;
    const next: SpaceIR = { ...now, data: { ...now.data, params: (now.data.params ?? []).map((p) => (p.name === name ? { ...p, value } : p)) } };
    if (commit) {
      sessionStore.getState().commitObjectIR(item.id, sliderStart.current, next, "계수 변경");
      sliderStart.current = null;
    } else sessionStore.getState().previewObjectIR(item.id, next);
  };
  const faces = useMemo(() => spaceFaces(ir.data, view, scale, S * 0.47, cy, fns), [ir.data, view, scale, S, cy, fns]);
  const caption = useMemo(() => (ir.data.caption ? katex.renderToString(ir.data.caption, { throwOnError: false, displayMode: true }) : null), [ir.data.caption]);
  const fresh = isFresh(item.id);
  const varFont = "KaTeX_Math, 'Times New Roman', serif";
  const numFont = "KaTeX_Main, 'Times New Roman', serif";
  const halo = { stroke: theme.color.bg, strokeWidth: 3, strokeLinejoin: "round" as const, paintOrder: "stroke" as const };

  return (
    <div
      data-overlay-id={item.id}
      className={fresh ? "sl-fade-in" : undefined}
      style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: S, pointerEvents: "none" }}
    >
      <svg
        width={S}
        height={S}
        style={{ display: "block", overflow: "visible", pointerEvents: interactive ? "auto" : "none", touchAction: "none", cursor: interactive ? "grab" : undefined }}
        {...handlers}
      >
        <rect x={0} y={0} width={S} height={S} fill="transparent" />
        {/* 축: 양의 방향은 화살표, 음의 방향은 가늘게 */}
        <g stroke={theme.color.ink} fill={theme.color.ink}>
          {d.axes.map((a) => (
            <g key={a.name}>
              <line x1={a.neg[0]} y1={a.neg[1]} x2={a.from[0]} y2={a.from[1]} strokeWidth={0.9} />
              <line x1={a.from[0]} y1={a.from[1]} x2={a.to[0]} y2={a.to[1]} strokeWidth={1.3} />
              <path d={arrowHead(a.from, a.to, plot.arrow)} stroke="none" />
            </g>
          ))}
        </g>
        {faces.length > 0 && (
          <g strokeWidth={0.5} strokeLinejoin="round" opacity={0.86}>
            {faces.map((f, i) => (
              <path key={i} d={f.d} fill={f.fill} stroke={f.stroke} />
            ))}
          </g>
        )}
        <g fill="none" stroke={theme.color.ink} strokeLinecap="round" strokeLinejoin="round">
          {d.edges.hidden.map((pts, i) => (
            <path key={`h${i}`} d={line(pts)} strokeWidth={solid.hiddenWidth} strokeDasharray={solid.hiddenDash} opacity={0.85} />
          ))}
          {d.edges.visible.map((pts, i) => (
            <path key={`v${i}`} d={line(pts)} strokeWidth={1.8} />
          ))}
        </g>
        <g stroke={theme.color.accent} fill={theme.color.accent} strokeWidth={2.2} strokeLinecap="round">
          {d.arrows.map((a, i) => (
            <g key={i}>
              <line x1={a.from[0]} y1={a.from[1]} x2={a.to[0]} y2={a.to[1]} />
              <path d={arrowHead(a.from, a.to, plot.arrow + 2)} stroke="none" />
              {a.label && (
                <text x={a.to[0] + 7} y={a.to[1] - 7} stroke={theme.color.bg} strokeWidth={3} paintOrder="stroke" fontSize={16} fontFamily={varFont} fontStyle="italic" fontWeight={700}>
                  {a.label}
                </text>
              )}
            </g>
          ))}
        </g>
        {/* 손잡이 — 끌어서 옮긴다 (빈 곳을 끌면 그대로 돌리기) */}
        {handles.map((h) => (
          <g key={h.key} style={{ cursor: "move", touchAction: "none" }} onPointerDown={grab(h.key)}>
            {/* 방향 손잡이 (법선·직선 방향): 발에서 손잡이까지 점선 화살 */}
            {h.from && <line x1={h.from[0]} y1={h.from[1]} x2={h.at[0]} y2={h.at[1]} stroke={theme.color.accent} strokeWidth={1.6} strokeDasharray="5 3" style={{ pointerEvents: "none" }} />}
            {h.from && (
              <text x={h.at[0] + 9} y={h.at[1] - 9} fontSize={11} fill={theme.color.accent} stroke={theme.color.bg} strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: "none" }}>
                {h.label}
              </text>
            )}
            <circle cx={h.at[0]} cy={h.at[1]} r={14} fill="transparent" />
            <circle cx={h.at[0]} cy={h.at[1]} r={6.5} fill={theme.color.bg} stroke={theme.color.accent} strokeWidth={2.5} />
          </g>
        ))}
        <g fill="none" stroke={theme.color.ink} strokeWidth={solid.hiddenWidth} strokeDasharray={solid.hiddenDash} opacity={0.85}>
          {d.dashed.map((pts, i) => (
            <path key={i} d={line(pts)} />
          ))}
        </g>
        <g fill="none" stroke={theme.color.accent} strokeWidth={2} strokeLinecap="round">
          {d.solid.map((pts, i) => (
            <path key={i} d={line(pts)} />
          ))}
        </g>
        <g fill={theme.color.ink} fontSize={plot.labelSize + 1} fontFamily={numFont} {...halo}>
          {d.ticks.map((t, i) => (
            <text key={i} x={t.at[0] + (t.axis === "z" ? -6 : 0)} y={t.at[1] + (t.axis === "z" ? 4 : 15)} textAnchor={t.axis === "z" ? "end" : "middle"}>
              {t.label}
            </text>
          ))}
          <text x={d.origin[0] - 6} y={d.origin[1] + 15} textAnchor="end" fontFamily={varFont} fontStyle="italic">
            O
          </text>
          {d.axes.map((a) => (
            <text key={a.name} x={a.to[0] + (a.to[0] < d.origin[0] ? -8 : 8)} y={a.to[1] + (a.name === "z" ? -6 : 14)} textAnchor="middle" fontFamily={varFont} fontStyle="italic" fontSize={plot.labelSize + 4}>
              {a.name}
            </text>
          ))}
        </g>
        {d.points.map((p, i) => (
          <g key={i}>
            <circle cx={p.at[0]} cy={p.at[1]} r={3.5} fill={theme.color.ink} />
            <text x={p.at[0] + 8} y={p.at[1] - 8} fontSize={14} fontFamily={numFont} fill={theme.color.ink} {...halo}>
              {p.label}
            </text>
          </g>
        ))}
      </svg>
      {caption && <div style={{ textAlign: "center", color: theme.color.ink, fontSize: 15, overflowX: "auto", overflowY: "hidden" }} dangerouslySetInnerHTML={{ __html: caption }} />}
      {interactive && (ir.data.params ?? []).length > 0 && (
        <div data-export-skip style={{ display: "grid", gap: 4, marginTop: 4, pointerEvents: "auto" }}>
          {(ir.data.params ?? []).map((p) => (
            <label key={p.name} style={{ display: "grid", gridTemplateColumns: "34px 1fr 44px", alignItems: "center", gap: 8, fontSize: 14, color: theme.color.ink }}>
              <i style={{ fontFamily: varFont }}>{p.name} =</i>
              <input
                type="range"
                aria-label={`계수 ${p.name}`}
                min={p.min}
                max={p.max}
                step={p.step}
                value={p.value}
                onInput={(e) => setParam(p.name, Number((e.target as HTMLInputElement).value), false)}
                onChange={() => {
                  /* 기록은 놓을 때 */
                }}
                onPointerUp={(e) => setParam(p.name, Number((e.target as HTMLInputElement).value), true)}
                onKeyUp={(e) => setParam(p.name, Number((e.target as HTMLInputElement).value), true)}
                style={{ width: "100%", accentColor: theme.color.accent, touchAction: "pan-x" }}
              />
              <span style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{Number(p.value.toFixed(2))}</span>
            </label>
          ))}
        </div>
      )}
      {interactive && (
        <div data-export-skip style={{ textAlign: "center", fontSize: 12, color: theme.color.asymptote }}>
          드래그해서 돌리기 · {handles.length ? "동그라미를 끌어 옮기기 · " : ""}두 번 탭하면 처음 각도
        </div>
      )}
    </div>
  );
}
