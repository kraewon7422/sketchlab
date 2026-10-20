import type { SceneIR } from "@sketchlab/shared";
import katex from "katex";
import "katex/dist/katex.min.css";
import { memo, useEffect, useMemo, useState, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import type { P2, View3 } from "../solid/project";
import { drawSpace, spaceFaces } from "../solid/space";
import { isFresh } from "./Shape2DView";
import { line } from "./SolidObject";
import { plot, solid, theme } from "./theme";
import { useTurntable } from "./useTurntable";

/**
 * 공간좌표 객체 — 좌표공간의 점과 수선 (마스터스펙 v4 §12.5). 돌려 볼 수 있다 (useTurntable).
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
const NO_FNS: SurfaceFn[] = [];

/** 곡면 식(등식) → z = f(x, y). F가 z에 대해 일차라서 z = −F(x,y,0) / (F(x,y,1) − F(x,y,0)) */
function useSurfaceFns(surfaces: ReadonlyArray<{ latex: string }> | undefined): SurfaceFn[] {
  const [fns, setFns] = useState<SurfaceFn[]>(NO_FNS);
  const key = (surfaces ?? []).map((s) => s.latex).join("\n");
  useEffect(() => {
    if (!key) {
      setFns(NO_FNS);
      return;
    }
    let alive = true;
    void import("../math/latex").then(({ equationResidual }) => {
      const out: SurfaceFn[] = [];
      for (const latex of key.split("\n")) {
        const r = equationResidual(latex);
        if (!r) continue;
        const F = r.F(["x", "y", "z"]);
        out.push((x, y) => {
          const f0 = F(x, y, 0);
          return -f0 / (F(x, y, 1) - f0);
        });
      }
      if (alive) setFns(out);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return fns;
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
  const fns = useSurfaceFns(ir.data.surfaces);
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
      {interactive && (
        <div data-export-skip style={{ textAlign: "center", fontSize: 12, color: theme.color.asymptote }}>
          드래그해서 돌리기 · 두 번 탭하면 처음 각도
        </div>
      )}
    </div>
  );
}
