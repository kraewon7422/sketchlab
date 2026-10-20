import { memo, useMemo, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { layerName, paramCount, shownNeurons } from "../math/nnet";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";

/**
 * 신경망 그림 — 층마다 뉴런(원)을 세로로, 이웃 층의 뉴런끼리 모두 선으로 잇는다.
 * 입력 x₁…, 출력 ŷ₁…, 아래에 층 이름과 개수, 맨 아래에 학습할 값(가중치·편향)의 수.
 */

const COLORS = { input: "#3E9B6B", hidden: "#3D6FC4", output: "#D9772B" };
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number) => String(n).replace(/\d/g, (d) => SUB[Number(d)] as string);

export default memo(function NNetObject({ item }: { item: ObjectItem }): ReactElement | null {
  const ir = item.ir;
  const W = item.transform.scale;
  const layers = ir.kind === "nnet" ? ir.data.layers : null;
  const showLabels = ir.kind === "nnet" ? ir.data.showLabels : true;
  const fresh = isFresh(item.id);

  const g = useMemo(() => {
    if (!layers) return null;
    const H = Math.round(W * 0.62);
    const padX = showLabels ? 44 : 20;
    const top = 16;
    const bottom = H - 40;
    const most = Math.max(...layers.map((n) => shownNeurons(n).length));
    const r = Math.max(6, Math.min(16, ((bottom - top) / most) * 0.32));
    const cols = layers.map((n, li) => {
      const x = padX + ((W - 2 * padX) * li) / (layers.length - 1);
      const shown = shownNeurons(n);
      const gap = (bottom - top) / Math.max(shown.length, 1);
      const y0 = (top + bottom) / 2 - (gap * (shown.length - 1)) / 2;
      return { x, n, nodes: shown.map((idx, k) => ({ idx, y: y0 + k * gap })) };
    });
    const edges: string[] = [];
    for (let li = 1; li < cols.length; li++) {
      const a = cols[li - 1] as (typeof cols)[number];
      const b = cols[li] as (typeof cols)[number];
      for (const p of a.nodes) {
        if (p.idx === null) continue;
        for (const q of b.nodes) if (q.idx !== null) edges.push(`M${(a.x + r).toFixed(1)},${p.y.toFixed(1)}L${(b.x - r).toFixed(1)},${q.y.toFixed(1)}`);
      }
    }
    return { H, r, cols, edge: edges.join(""), bottom };
  }, [layers, W, showLabels]);

  if (!layers || !g) return null;
  const pc = paramCount(layers);
  const color = (li: number) => (li === 0 ? COLORS.input : li === layers.length - 1 ? COLORS.output : COLORS.hidden);
  const font = "KaTeX_Main, 'Times New Roman', serif";
  const nameSize = W < 360 ? 11 : 12.5;
  // 층이 많거나 폭이 좁아 칸이 좁으면 이름을 줄인다 (입력·출력만, 은닉층은 개수만) — 글자가 겹치지 않게
  const spacing = layers.length > 1 ? (g.cols[1]?.x ?? 0) - (g.cols[0]?.x ?? 0) : W;
  const compact = spacing < 76;
  const name = (li: number) => (!compact ? layerName(li, layers.length) : li === 0 ? "입력" : li === layers.length - 1 ? "출력" : "");

  return (
    <div data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: W, pointerEvents: "none" }}>
      <svg width={W} height={g.H} style={{ display: "block", overflow: "visible" }}>
        <path d={g.edge} stroke="#9AA3B2" strokeWidth={layers.reduce((s, n, i) => s + (i ? n * (layers[i - 1] as number) : 0), 0) > 120 ? 0.5 : 0.9} opacity={0.75} fill="none" />
        {g.cols.map((c, li) => (
          <g key={li}>
            {c.nodes.map((p, k) =>
              p.idx === null ? (
                <text key={k} x={c.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={18} fill={theme.color.asymptote}>
                  ⋮
                </text>
              ) : (
                <g key={k}>
                  <circle cx={c.x} cy={p.y} r={g.r} fill={theme.color.bg} stroke={color(li)} strokeWidth={2} />
                  {showLabels && li === 0 && (
                    <text x={c.x - g.r - 5} y={p.y} textAnchor="end" dominantBaseline="central" fontSize={13} fontFamily={font} fontStyle="italic" fill={theme.color.ink}>
                      x{sub(p.idx + 1)}
                    </text>
                  )}
                  {showLabels && li === layers.length - 1 && (
                    <text x={c.x + g.r + 5} y={p.y} dominantBaseline="central" fontSize={13} fontFamily={font} fontStyle="italic" fill={theme.color.ink}>
                      ŷ{sub(p.idx + 1)}
                    </text>
                  )}
                </g>
              ),
            )}
            {showLabels && (
              <text x={c.x} y={g.bottom + 22} textAnchor="middle" fontSize={nameSize} fill={color(li)} fontWeight={600}>
                {name(li)}
                <tspan fill={theme.color.asymptote} fontWeight={400}>{`${name(li) ? " " : ""}${c.n}`}</tspan>
              </text>
            )}
          </g>
        ))}
      </svg>
      <div style={{ textAlign: "center", fontSize: 13, color: theme.color.asymptote, marginTop: 2, wordBreak: "keep-all" }}>
        {layers.join("–")} 신경망 · 가중치 {pc.weights}개 + 편향 {pc.biases}개
      </div>
    </div>
  );
});
