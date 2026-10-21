import { Pause, Play } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { backprop, initNet, lossOf, makeData, trainStep, type Net } from "../math/backprop";
import { layerName, paramCount, shownNeurons } from "../math/nnet";
import { sessionStore } from "../store/session";
import { btn, onBtn, useProgress } from "./figureKit";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";

/**
 * 신경망 그림 — 층마다 뉴런(원)을 세로로, 이웃 층의 뉴런끼리 모두 선으로 잇는다.
 * 입력 x₁…, 출력 ŷ₁…, 아래에 층 이름과 개수, 맨 아래에 학습할 값(가중치·편향)의 수.
 * 직접 바꾸기: 층마다 뉴런 −/+, 은닉층 더하기·빼기, 뉴런을 톡 하면 그 뉴런의 연결만 진하게.
 * 역전파로 학습: ① 순전파(값이 앞으로) ② 역전파(오차 δ가 뒤로, 연결마다 ∂L/∂w) ③ 가중치 바꾸기(w ← w − η∂L/∂w)
 *   연결 굵기·색 = 가중치(파랑 +, 주황 −), 역전파 중엔 보라 굵기 = 기울기 크기. 학습 상태는 기기 메모리에만.
 */

const COLORS = { input: "#3E9B6B", hidden: "#3D6FC4", output: "#D9772B" };
const POS = "#3D6FC4";
const NEG = "#D9772B";
const GRAD = "#8A55C8";
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sub = (n: number) => String(n).replace(/\d/g, (d) => SUB[Number(d)] as string);
const MAX_NODES = 16;
const MAX_LAYERS = 8;
const N_DATA = 6;
/** 오차 기록 — 400개를 넘으면 하나 걸러 하나씩 남겨 처음부터 끝까지의 모양을 지킨다 */
const pushLoss = (h: number[], L: number) => {
  const next = [...h, L];
  return next.length > 400 ? next.filter((_, i) => i % 2 === 0 || i === next.length - 1) : next;
};

type Phase = "idle" | "forward" | "backward";

export default memo(function NNetObject({ item, interactive = false }: { item: ObjectItem; interactive?: boolean }): ReactElement | null {
  const ir = item.ir;
  const W = item.transform.scale;
  const layers = ir.kind === "nnet" ? ir.data.layers : null;
  const showLabels = ir.kind === "nnet" ? ir.data.showLabels : true;
  const fresh = isFresh(item.id);
  /** 톡 한 뉴런 [층, 번호] — 그 뉴런의 연결만 진하게 */
  const [focus, setFocus] = useState<[number, number] | null>(null);

  // ───────── 학습 (역전파)
  const key = layers?.join("-") ?? "";
  const [train, setTrain] = useState(false);
  const [net, setNet] = useState<Net | null>(null);
  const [sample, setSample] = useState(0);
  const [lr, setLr] = useState(1);
  const [steps, setSteps] = useState(0);
  const [losses, setLosses] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [prog, startProg] = useProgress();
  const [playing, setPlaying] = useState(false);
  const data = useMemo(() => (key ? makeData(key.split("-").map(Number), N_DATA) : []), [key]);
  const reset = () => {
    if (!layers) return;
    const n = initNet(layers);
    setNet(n);
    setSteps(0);
    setLosses([lossOf(n, makeData(layers, N_DATA))]);
    setPhase("idle");
    setPlaying(false);
  };
  const resetRef = useRef(reset);
  resetRef.current = reset;
  // 층 구조가 바뀌면 처음부터
  useEffect(() => {
    if (train) resetRef.current();
  }, [key, train]);
  const pass = useMemo(() => (train && net && data[sample] ? backprop(net, data[sample]) : null), [train, net, data, sample]);

  // 계속 학습: 한 화면에 세 걸음씩
  const lrRef = useRef(lr);
  lrRef.current = lr;
  const netRef = useRef(net);
  netRef.current = net;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const n = netRef.current;
      if (n) {
        let m = n;
        for (let k = 0; k < 3; k++) m = trainStep(m, data, lrRef.current);
        netRef.current = m;
        setNet(m);
        setLosses((h) => pushLoss(h, lossOf(m, data)));
        setSteps((s) => s + 3);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, data]);

  const g = useMemo(() => {
    if (!layers) return null;
    const H = Math.round(W * 0.62);
    const padX = showLabels ? (train ? 64 : 44) : 20;
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
  }, [layers, W, showLabels, train]);

  // 자리 상자를 실제 높이에 (학습 칸을 열고 닫으면 높이가 바뀐다)
  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const b = item.bbox;
    if (Math.abs(b.maxY - b.minY - h) > 2) sessionStore.getState().fitObjectBox(item.id, { minX: item.transform.x, minY: item.transform.y, maxX: item.transform.x + W, maxY: item.transform.y + h });
  });

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

  // ───────── 학습 그림: 어디까지 값이 갔는가 (순전파는 앞에서부터, 역전파는 뒤에서부터)
  const last = layers.length - 1;
  const fwdReached = (li: number) => phase !== "forward" || li <= prog * last + 1e-9;
  const backReached = (li: number) => phase === "backward" && li >= (1 - prog) * last - 1e-9;
  const maxW = pass && net ? Math.max(1e-9, ...net.W.flat(2).map(Math.abs)) : 1;
  const maxG = pass ? Math.max(1e-12, ...pass.gW.flat(2).map(Math.abs)) : 1;
  const edgeStyle = (e: { from: [number, number]; to: [number, number] }) => {
    if (!pass || !net) return null;
    const [li, j] = e.to;
    const i = e.from[1];
    if (backReached(li)) {
      const gv = Math.abs(((pass.gW[li - 1] as number[][])[j] as number[])[i] as number) / maxG;
      return { stroke: GRAD, width: 0.4 + 3.2 * gv, opacity: 0.25 + 0.75 * gv };
    }
    const w = ((net.W[li - 1] as number[][])[j] as number[])[i] as number;
    const k = Math.abs(w) / maxW;
    return { stroke: w >= 0 ? POS : NEG, width: 0.4 + 2.8 * k, opacity: fwdReached(li) ? 0.3 + 0.6 * k : 0.12 };
  };
  const act = (li: number, idx: number) => (pass?.a[li] as number[] | undefined)?.[idx] ?? 0;
  const delta = (li: number, idx: number) => (pass?.delta[li] as number[] | undefined)?.[idx] ?? 0;
  const fmt = (v: number) => v.toFixed(2).replace("-", "−");

  const step = () => {
    if (!net) return;
    const n = trainStep(net, data, lr);
    setNet(n);
    setSteps((s) => s + 1);
    setLosses((h) => pushLoss(h, lossOf(n, data)));
    setPhase("idle");
  };
  const run = (p: Phase) => {
    setPlaying(false);
    setPhase(p);
    startProg(900);
  };
  const s = data[sample];
  const loss = losses[losses.length - 1] ?? 0;

  return (
    <div ref={boxRef} data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: W, pointerEvents: "none" }}>
      <svg width={W} height={g.H} style={{ display: "block", overflow: "visible" }}>
        {pass ? (
          <g fill="none">
            {g.edges.map((e, k) => {
              const st = edgeStyle(e);
              return st && <path key={k} d={e.d} stroke={st.stroke} strokeWidth={st.width} opacity={focus && !isFocus(e) ? 0.08 : st.opacity} />;
            })}
          </g>
        ) : (
          <>
            <path d={g.edges.filter((e) => !isFocus(e)).map((e) => e.d).join("")} stroke="#9AA3B2" strokeWidth={heavy ? 0.5 : 0.9} opacity={focus ? 0.3 : 0.75} fill="none" />
            {focus && <path d={g.edges.filter(isFocus).map((e) => e.d).join("")} stroke={theme.color.accent} strokeWidth={1.6} fill="none" />}
          </>
        )}
        {g.cols.map((c, li) => (
          <g key={li}>
            {c.nodes.map((p, k) => {
              if (p.idx === null)
                return (
                  <text key={k} x={c.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={18} fill={theme.color.asymptote}>
                    ⋮
                  </text>
                );
              const a = act(li, p.idx);
              const shown = !!pass && fwdReached(li);
              const back = !!pass && li > 0 && backReached(li);
              const focused = !!focus && focus[0] === li && focus[1] === p.idx;
              const fill = focused ? color(li) : shown ? (a >= 0 ? POS : NEG) : theme.color.bg;
              return (
                <g key={k}>
                  <circle
                    cx={c.x}
                    cy={p.y}
                    r={g.r}
                    fill={fill}
                    fillOpacity={shown && !focused ? 0.12 + 0.6 * Math.min(1, Math.abs(a)) : 1}
                    stroke={back ? GRAD : color(li)}
                    strokeWidth={back ? 3 : 2}
                    style={{ pointerEvents: interactive ? "auto" : "none", cursor: interactive ? "pointer" : undefined }}
                    onClick={interactive ? () => setFocus((f) => (f && f[0] === li && f[1] === p.idx ? null : [li, p.idx as number])) : undefined}
                  />
                  {pass && g.r >= 11 && (shown || back) && (
                    <text x={c.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(10, g.r * 0.72)} fill={back ? GRAD : theme.color.ink} fontWeight={600} style={{ pointerEvents: "none" }}>
                      {back ? fmt(delta(li, p.idx) * 10) : fmt(a)}
                    </text>
                  )}
                  {showLabels && li === 0 && (
                    <text x={c.x - g.r - 5} y={p.y} textAnchor="end" dominantBaseline="central" fontSize={13} fontFamily={font} fontStyle="italic" fill={theme.color.ink}>
                      x{sub(p.idx + 1)}
                      {pass && s && <tspan fontStyle="normal" fontSize={11} fill={theme.color.asymptote}>{` ${fmt(s.x[p.idx] ?? 0)}`}</tspan>}
                    </text>
                  )}
                  {showLabels && li === layers.length - 1 && (
                    <text x={c.x + g.r + 5} y={p.y} dominantBaseline="central" fontSize={13} fontFamily={font} fontStyle="italic" fill={theme.color.ink}>
                      ŷ{sub(p.idx + 1)}
                      {pass && s && <tspan fontStyle="normal" fontSize={11} fill={theme.color.asymptote}>{` t ${fmt(s.t[p.idx] ?? 0)}`}</tspan>}
                    </text>
                  )}
                </g>
              );
            })}
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

      {/* 역전파 학습 */}
      {train && pass && (
        <div style={{ marginTop: 6, display: "grid", gap: 6, fontSize: 12.5, color: theme.color.ink }}>
          <div style={{ textAlign: "center", wordBreak: "keep-all", lineHeight: 1.5 }}>
            {phase === "forward" ? (
              <>
                <b>① 순전파</b> — 입력이 층을 지나 앞으로: a = f(W·a + b) → 예측 ŷ (원 안 숫자 = 활성값)
              </>
            ) : phase === "backward" ? (
              <>
                <b style={{ color: GRAD }}>② 역전파</b> — 오차를 뒤로 보내요: δ = (ŷ − t)·σ′, 앞 층 δ = (Wᵀδ)·tanh′ (연쇄 법칙) · 보라 굵기 = ∂L/∂w = δ·a (원 안 = δ×10)
              </>
            ) : (
              <>
                파랑 = 양(+) 가중치 · 주황 = 음(−) · 굵을수록 큰 값 — <b>③</b> 모든 가중치를 w ← w − η·∂L/∂w 로 조금씩
              </>
            )}
          </div>
          <LossCurve losses={losses} W={W} />
          <div style={{ textAlign: "center" }}>
            오차 L = <b>{loss.toFixed(4)}</b> (예시 {N_DATA}개 평균) · 이 예시 L = {pass.loss.toFixed(4)} · 학습 <b>{steps}</b>번
          </div>
        </div>
      )}

      {interactive && (
        <div data-export-skip style={{ marginTop: 6, display: "grid", gap: 6 }}>
          {train ? (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
                <button type="button" style={phase === "forward" ? onBtn : btn} onClick={() => run("forward")}>
                  ① 순전파
                </button>
                <button type="button" style={phase === "backward" ? onBtn : btn} onClick={() => run("backward")}>
                  ② 역전파
                </button>
                <button type="button" style={btn} onClick={step}>
                  ③ 가중치 바꾸기
                </button>
                <button
                  type="button"
                  style={playing ? onBtn : btn}
                  onClick={() => {
                    setPhase("idle");
                    setPlaying((v) => !v);
                  }}
                >
                  {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "멈춤" : "계속 학습"}
                </button>
                <button type="button" style={btn} onClick={reset}>
                  처음부터
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 10, fontSize: 12.5, color: theme.color.ink }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  예시
                  <button type="button" aria-label="이전 예시" style={{ ...btn, padding: 0 }} onClick={() => setSample((k) => (k + N_DATA - 1) % N_DATA)}>
                    ‹
                  </button>
                  <b style={{ minWidth: 28, textAlign: "center" }}>
                    {sample + 1}/{N_DATA}
                  </b>
                  <button type="button" aria-label="다음 예시" style={{ ...btn, padding: 0 }} onClick={() => setSample((k) => (k + 1) % N_DATA)}>
                    ›
                  </button>
                </span>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <i style={{ fontFamily: font }}>η</i>
                  <input type="range" aria-label="학습률" min={0.1} max={5} step={0.1} value={lr} onChange={(e) => setLr(Number(e.target.value))} style={{ width: 110, accentColor: theme.color.accent, pointerEvents: "auto", touchAction: "pan-x" }} />
                  <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 24 }}>{lr.toFixed(1)}</span>
                </label>
                <button
                  type="button"
                  style={btn}
                  onClick={() => {
                    setPlaying(false);
                    setTrain(false);
                    setPhase("idle");
                  }}
                >
                  학습 닫기
                </button>
              </div>
            </>
          ) : (
            <>
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
                <button type="button" onClick={() => setTrain(true)} style={{ ...pill, border: `1px solid ${GRAD}`, color: GRAD, fontWeight: 600 }}>
                  역전파로 학습해 보기
                </button>
              </div>
              <div style={{ textAlign: "center", fontSize: 12, color: theme.color.asymptote }}>뉴런을 톡 하면 그 뉴런의 연결만 보여요</div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

/** 학습할수록 줄어드는 오차 */
function LossCurve({ losses, W }: { losses: number[]; W: number }): ReactElement {
  const H = 56;
  if (losses.length < 2) return <div style={{ height: H }} />;
  const max = Math.max(...losses, 1e-9);
  const pts = losses.map((l, i) => `${((i / (losses.length - 1)) * (W - 16) + 8).toFixed(1)},${(H - 6 - (l / max) * (H - 14)).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block", background: "#FAFBFC", borderRadius: 8 }}>
      <text x={W - 8} y={12} fontSize={10.5} fill={theme.color.asymptote} textAnchor="end">
        오차 L
      </text>
      <text x={W - 8} y={H - 4} fontSize={10.5} fill={theme.color.asymptote} textAnchor="end">
        학습 →
      </text>
      <polyline points={pts} fill="none" stroke={GRAD} strokeWidth={2} />
    </svg>
  );
}
