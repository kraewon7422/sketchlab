import katex from "katex";
import { useMemo, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { vennCircles, vennContains, vennLatex } from "../math/venn";
import { isFresh } from "./Shape2DView";
import { plot, theme } from "./theme";

/**
 * 벤 다이어그램 — 전체집합 사각형 + 원 2·3개, 식의 영역을 칠한다.
 * 칠하기: 작은 칸마다 "이 점이 어느 원에 들었나"로 식을 계산해, 참인 칸을 가로로 이어 붙인다
 * (어떤 식이든 같은 방법). 원 테두리는 그 위에 매끈하게.
 */
export function VennObject({ item }: { item: ObjectItem }): ReactElement | null {
  const ir = item.ir;
  const W = item.transform.scale;
  const H = W * 0.72;
  const fresh = isFresh(item.id);
  const data = ir.kind === "venn" ? ir.data : null;
  const circles = useMemo(() => (data ? vennCircles(data.sets.length) : []), [data]);

  const region = useMemo(() => {
    if (!data) return "";
    const v = { sets: data.sets, expr: data.expr };
    const cols = Math.round(W / 2);
    const rows = Math.round(H / 2);
    const cw = W / cols;
    const ch = H / rows;
    let d = "";
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) / cols; // 단위: 폭 = 1
      let start = -1;
      for (let c = 0; c <= cols; c++) {
        const x = (c + 0.5) / cols;
        const inside =
          c < cols &&
          vennContains(v, (s) => {
            const i = data.sets.indexOf(s);
            const k = circles[i];
            return !!k && (x - k.cx) ** 2 + (y - k.cy) ** 2 <= k.r ** 2;
          });
        if (inside && start < 0) start = c;
        if (!inside && start >= 0) {
          d += `M${(start * cw).toFixed(1)},${(r * ch).toFixed(1)}h${((c - start) * cw).toFixed(1)}v${(ch + 0.4).toFixed(1)}h${(-(c - start) * cw).toFixed(1)}Z`;
          start = -1;
        }
      }
    }
    return d;
  }, [data, circles, W, H]);

  const caption = useMemo(() => (data ? katex.renderToString(vennLatex({ sets: data.sets, expr: data.expr }), { throwOnError: false }) : ""), [data]);
  if (!data) return null;
  const font = "KaTeX_Math, 'Times New Roman', serif";
  // 이름표 자리: 원 바깥쪽 위 (3개면 C는 아래)
  const labelAt = (i: number) => {
    const k = circles[i] as { cx: number; cy: number; r: number };
    if (data.sets.length === 3 && i === 2) return { x: (k.cx + k.r * 0.86) * W + 10, y: (k.cy + k.r * 0.62) * W + 6 };
    const side = i === 0 ? -1 : 1;
    return { x: (k.cx + side * k.r * 0.72) * W, y: (k.cy - k.r * 0.72) * W - 6 };
  };

  return (
    <div data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: W, pointerEvents: "none" }}>
      <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
        <path d={region} fill={plot.palette[1] ?? theme.color.accent} fillOpacity={0.32} shapeRendering="crispEdges" />
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke={theme.color.ink} strokeWidth={1.4} />
        <text x={10} y={22} fontFamily={font} fontStyle="italic" fontSize={17} fill={theme.color.ink}>
          {data.universe ?? "U"}
        </text>
        {circles.map((k, i) => (
          <circle key={i} cx={k.cx * W} cy={k.cy * W} r={k.r * W} fill="none" stroke={theme.color.ink} strokeWidth={1.6} />
        ))}
        {data.sets.map((s, i) => {
          const p = labelAt(i);
          return (
            <text key={s} x={p.x} y={p.y} textAnchor="middle" fontFamily={font} fontStyle="italic" fontSize={18} fill={theme.color.ink}>
              {s}
            </text>
          );
        })}
      </svg>
      <div style={{ marginTop: theme.space[2], textAlign: "center", fontSize: 17, color: theme.color.ink }} dangerouslySetInnerHTML={{ __html: caption }} />
    </div>
  );
}
