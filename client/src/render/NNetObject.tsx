import { memo, useMemo, useState, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { layerName, paramCount, shownNeurons } from "../math/nnet";
import { sessionStore } from "../store/session";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";

/**
 * 신경망 그림 — 층마다 뉴런(원)을 세로로, 이웃 층의 뉴런끼리 모두 선으로 잇는다.
 * 입력 x₁…, 출력 ŷ₁…, 아래에 층 이름과 개수, 맨 아래에 학습할 값(가중치·편향)의 수.
 * 직접 바꾸기: 층마다 뉴런 −/+, 은닉층 더하기·빼기, 뉴런을 톡 하면 그 뉴런의 연결만 진하게.
 */

const COLORS = { input: "#3E9B6B", hidden: "#3D6FC4", output: "#D9772B" };
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number) => String(n).replace(/\d/g, (d) => SUB[Number(d)] as string);
const MAX_NODES = 16;
const MAX_LAYERS = 8;

export default memo(function NNetObject({ item, interactive = false }: { item: ObjectItem; interactive?: boolean }): ReactElement | null {
  const ir = item.ir;
  const W = item.transform.scale;
  const layers = ir.kind === "nnet" ? ir.data.layers : null;
  const showLabels = ir.kind === "nnet" ? ir.data.showLabels : true;
  const fresh = isFresh(item.id);
  /** 톡 한 뉴런 [층, 번호] — 그 뉴런의 연결만 진하게 */
  const [focus, setFocus] = useState<[number, number] | null>(null);

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
    const edges: Array<{ d: string; from: [number, number]; to: [number, number] }> = [];
    for (let li = 1; li < cols.length; li++) {
      const a = cols[li - 1] as (typeof cols)[number];
      const b = cols[li] as (typeof cols)[number];
      for (const p of a.nodes) {
        if (p.idx === null) continue;
        for (const q of b.nodes) if (q.idx !== null) edges.push({ d: `M${(a.x + r).toFixed(1)},${p.y.toFixed(1)}L${(b.x - r).toFixed(1)},${q.y.toFixed(1)}`, from: [li - 1, p.idx], to: [li, q.idx] });
      }
    }
    return { H, r, cols, edges, bottom };
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
  const isFocus = (e: { from: [number, number]; to: [number, number] }) => !!focus && ((e.from[0] === focus[0] && e.from[1] === focus[1]) || (e.to[0] === focus[0] && e.to[1] === focus[1]));
  const heavy = g.edges.length > 120;

  const commit = (next: number[], label: string) => {
    const now = sessionStore.getState().items.find((i) => i.id === item.id);
    if (!now || now.kind !== "object" || now.ir.kind !== "nnet") return;
    sessionStore.getState().commitObjectIR(item.id, now.ir, { ...now.ir, data: { ...now.ir.data, layers: next } }, label);
    setFocus(null);
  };
  const setCount = (li: number, delta: number) => commit(layers.map((n, i) => (i === li ? Math.max(1, Math.min(MAX_NODES, n + delta)) : n)), "뉴런 수");
  const addLayer = () => commit([...layers.slice(0, -1), layers[layers.length - 2] ?? 4, layers[layers.length - 1] as number], "은닉층 더하기");
  const removeLayer = () => commit([...layers.slice(0, -2), layers[layers.length - 1] as number], "은닉층 빼기");
  const small = { minWidth: 26, minHeight: 26, padding: 0, border: `1px solid ${theme.color.sub}`, borderRadius: 999, background: theme.color.bg, color: theme.color.ink, fontSize: 14, cursor: "pointer", pointerEvents: "auto" } as const;
  const pill = { padding: "4px 10px", border: `1px solid ${theme.color.sub}`, borderRadius: 999, background: theme.color.bg, color: theme.color.ink, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", pointerEvents: "auto" } as const;

  return (
    <div data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: W, pointerEvents: "none" }}>
      <svg width={W} height={g.H} style={{ display: "block", overflow: "visible" }}>
        <path d={g.edges.filter((e) => !isFocus(e)).map((e) => e.d).join("")} stroke="#9AA3B2" strokeWidth={heavy ? 0.5 : 0.9} opacity={focus ? 0.3 : 0.75} fill="none" />
        {focus && <path d={g.edges.filter(isFocus).map((e) => e.d).join("")} stroke={theme.color.accent} strokeWidth={1.6} fill="none" />}
        {g.cols.map((c, li) => (
          <g key={li}>
            {c.nodes.map((p, k) =>
              p.idx === null ? (
                <text key={k} x={c.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={18} fill={theme.color.asymptote}>
                  ⋮
                </text>
              ) : (
                <g key={k}>
                  <circle
                    cx={c.x}
                    cy={p.y}
                    r={g.r}
                    fill={focus && focus[0] === li && focus[1] === p.idx ? color(li) : theme.color.bg}
                    stroke={color(li)}
                    strokeWidth={2}
                    style={{ pointerEvents: interactive ? "auto" : "none", cursor: interactive ? "pointer" : undefined }}
                    onClick={interactive ? () => setFocus((f) => (f && f[0] === li && f[1] === p.idx ? null : [li, p.idx as number])) : undefined}
                  />
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
        {focus && ` · 이 뉴런의 연결 ${(focus[0] > 0 ? layers[focus[0] - 1]! : 0) + (focus[0] < layers.length - 1 ? layers[focus[0] + 1]! : 0)}개`}
      </div>
      {interactive && (
        <div data-export-skip style={{ marginTop: 6, display: "grid", gap: 6 }}>
          {/* 층마다 뉴런 수 */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "6px 12px", fontSize: 12, color: theme.color.asymptote }}>
            {layers.map((n, li) => (
              <span key={li} style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                <span style={{ color: color(li), fontWeight: 600 }}>{li === 0 ? "입력" : li === layers.length - 1 ? "출력" : `은닉${layers.length > 3 ? li : ""}`}</span>
                <button type="button" aria-label={`${li + 1}번째 층 뉴런 빼기`} disabled={n <= 1} onClick={() => setCount(li, -1)} style={{ ...small, opacity: n <= 1 ? 0.4 : 1 }}>
                  −
                </button>
                <b style={{ color: theme.color.ink, minWidth: 14, textAlign: "center" }}>{n}</b>
                <button type="button" aria-label={`${li + 1}번째 층 뉴런 더하기`} disabled={n >= MAX_NODES} onClick={() => setCount(li, 1)} style={{ ...small, opacity: n >= MAX_NODES ? 0.4 : 1 }}>
                  +
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
            <button type="button" disabled={layers.length >= MAX_LAYERS} onClick={addLayer} style={{ ...pill, opacity: layers.length >= MAX_LAYERS ? 0.4 : 1 }}>
              은닉층 더하기
            </button>
            <button type="button" disabled={layers.length <= 2} onClick={removeLayer} style={{ ...pill, opacity: layers.length <= 2 ? 0.4 : 1 }}>
              은닉층 빼기
            </button>
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: theme.color.asymptote }}>뉴런을 톡 하면 그 뉴런의 연결만 보여요</div>
        </div>
      )}
    </div>
  );
});
