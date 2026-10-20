import type { SceneIR } from "@sketchlab/shared";
import { Pause, Play, StepForward } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { ObjectItem } from "../ink/types";
import { FIGURES, GOSPER, genusSdf, golden, koch, LIFE_COLS, LIFE_ROWS, lifeStep, logistic, lorenzPoints, mandelbrot, paintMesh, sierpinski, surfaceMesh } from "../math/figures";
import { renderSdf } from "../math/topology";
import { rotate, type View3 } from "../solid/project";
import { sessionStore } from "../store/session";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";
import { useTurntable } from "./useTurntable";

/**
 * 유명한 그림 (수학·과학·컴퓨터) — 그림마다 직접 해 볼 수 있는 것:
 *   3D 곡면·종수·로렌츠: 돌리기 (+ 종수 −/+)        만델브로: 톡 확대 · 축소 · 처음으로
 *   코흐·시에르핀스키·황금 나선: 단계 −/+          오일러: θ 슬라이더
 *   라이프 게임: 칸 톡 · 재생/멈춤 · 한 세대 · 지우기 · 글라이더 총
 * 바꾼 것은 IR에 저장 (Undo 1단계). 화소 그림은 <svg><image>(data URL)라 내보내기에도 그대로.
 */

type FigIR = Extract<SceneIR, { kind: "figure" }>;
type FigData = FigIR["data"];
const DEG = Math.PI / 180;
const MONO = "KaTeX_Main, 'Times New Roman', serif";

export default memo(function FigureObject({ item, interactive = false }: { item: ObjectItem; interactive?: boolean }): ReactElement | null {
  if (item.ir.kind !== "figure") return null;
  return <FigureBox item={item} ir={item.ir} interactive={interactive} />;
});

function useCommit(item: ObjectItem) {
  return (patch: Partial<FigData>, label: string) => {
    const now = sessionStore.getState().items.find((i) => i.id === item.id);
    if (!now || now.kind !== "object" || now.ir.kind !== "figure") return;
    sessionStore.getState().commitObjectIR(item.id, now.ir, { ...now.ir, data: { ...now.ir.data, ...patch } }, label);
  };
}

/** 화소 그림 → data URL (작게 먼저, 멈추면 선명하게) */
function useImage(draw: (w: number, h: number) => Uint8ClampedArray, w: number, h: number, key: string): string | null {
  const [href, setHref] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const paint = (k: number) => {
      const W = Math.max(8, Math.round(w * k));
      const H = Math.max(8, Math.round(h * k));
      const c = (canvas.current ??= document.createElement("canvas"));
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(W, H);
      img.data.set(drawRef.current(W, H));
      ctx.putImageData(img, 0, 0);
      setHref(c.toDataURL("image/png"));
    };
    paint(0.3);
    const timer = setTimeout(() => paint(Math.min(2, window.devicePixelRatio || 1)), 140);
    return () => clearTimeout(timer);
  }, [key, w, h]);
  return href;
}

const btn = { minWidth: 30, minHeight: 30, padding: "3px 10px", border: `1px solid ${theme.color.sub}`, borderRadius: 999, background: theme.color.bg, color: theme.color.ink, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", pointerEvents: "auto", display: "inline-flex", alignItems: "center", gap: 4 } as const;

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: theme.color.asymptote, whiteSpace: "nowrap" }}>
      {label}
      <button type="button" aria-label={`${label} 줄이기`} disabled={value <= min} onClick={() => onChange(value - 1)} style={{ ...btn, padding: 0, opacity: value <= min ? 0.4 : 1 }}>
        −
      </button>
      <b style={{ color: theme.color.ink, minWidth: 12, textAlign: "center" }}>{value}</b>
      <button type="button" aria-label={`${label} 늘리기`} disabled={value >= max} onClick={() => onChange(value + 1)} style={{ ...btn, padding: 0, opacity: value >= max ? 0.4 : 1 }}>
        +
      </button>
    </span>
  );
}

function FigureBox({ item, ir, interactive }: { item: ObjectItem; ir: FigIR; interactive: boolean }) {
  const W = item.transform.scale;
  const d = ir.data;
  const info = FIGURES[d.name];
  const commit = useCommit(item);
  const fresh = isFresh(item.id);
  let body: ReactNode;
  let controls: ReactNode = null;
  let hint = "";

  switch (d.name) {
    case "mobius":
    case "klein":
    case "trefoil":
      body = <Surface item={item} data={d} interactive={interactive} W={W} />;
      hint = "드래그해서 돌리기";
      break;
    case "genus":
      body = <Genus item={item} data={d} interactive={interactive} W={W} />;
      controls = <Stepper label="구멍" value={d.n ?? 2} min={0} max={4} onChange={(n) => commit({ n }, "구멍 수")} />;
      hint = "드래그해서 돌리기";
      break;
    case "lorenz":
      body = <Lorenz item={item} data={d} interactive={interactive} W={W} />;
      hint = "드래그해서 돌리기";
      break;
    case "mandelbrot":
      body = <Mandel data={d} interactive={interactive} W={W} onZoom={(zoom) => commit({ zoom }, "확대")} />;
      controls = (
        <>
          <button type="button" style={btn} onClick={() => d.zoom && commit({ zoom: { ...d.zoom, s: Math.min(4, d.zoom.s * 2.5) } }, "축소")}>
            축소
          </button>
          <button type="button" style={btn} onClick={() => commit({ zoom: { cx: -0.6, cy: 0, s: 3.2 } }, "처음 크기")}>
            처음으로
          </button>
        </>
      );
      hint = `톡 하면 그 자리를 2.5배 확대 · 지금 ×${(3.2 / (d.zoom?.s ?? 3.2)).toPrecision(3)}`;
      break;
    case "logistic":
      body = <Logistic W={W} />;
      break;
    case "koch":
    case "sierpinski":
    case "golden": {
      const max = d.name === "golden" ? 12 : d.name === "koch" ? 6 : 7;
      body = <Flat data={d} W={W} />;
      controls = <Stepper label={d.name === "golden" ? "정사각형" : "단계"} value={d.n ?? 3} min={d.name === "golden" ? 1 : 0} max={max} onChange={(n) => commit({ n }, "단계")} />;
      break;
    }
    case "euler":
      body = <Euler data={d} W={W} />;
      controls = (
        <label style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "center", width: "100%", fontSize: 13, color: theme.color.ink }}>
          <i style={{ fontFamily: MONO }}>θ</i>
          <input
            type="range"
            aria-label="각 θ"
            min={0}
            max={2 * Math.PI}
            step={Math.PI / 180}
            value={d.t ?? Math.PI / 4}
            onChange={(e) => sessionStore.getState().previewObjectIR(item.id, { ...ir, data: { ...d, t: Number(e.target.value) } })}
            onPointerUp={(e) => {
              const before = { ...ir, data: { ...d, t: ir.data.t } };
              sessionStore.getState().commitObjectIR(item.id, before, { ...ir, data: { ...d, t: Number((e.target as HTMLInputElement).value) } }, "각 θ");
            }}
            style={{ width: "100%", accentColor: theme.color.accent, pointerEvents: "auto", touchAction: "pan-x" }}
          />
        </label>
      );
      break;
    case "life":
      body = <Life item={item} ir={ir} interactive={interactive} W={W} />;
      break;
  }

  return (
    <div data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: W, pointerEvents: "none" }}>
      {body}
      <div style={{ textAlign: "center", marginTop: 4, color: theme.color.ink, fontSize: 15, fontWeight: 600 }}>{info.title}</div>
      <div style={{ textAlign: "center", fontSize: 12.5, color: theme.color.asymptote, wordBreak: "keep-all" }}>{info.note}</div>
      {interactive && controls && (
        <div data-export-skip style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 6 }}>
          {controls}
        </div>
      )}
      {interactive && hint && (
        <div data-export-skip style={{ textAlign: "center", fontSize: 12, color: theme.color.asymptote, marginTop: 3 }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── 3D

function Turn({ handlers, interactive, W, H, children }: { handlers: ReturnType<typeof useTurntable>["handlers"]; interactive: boolean; W: number; H: number; children: ReactNode }) {
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible", pointerEvents: interactive ? "auto" : "none", touchAction: "none", cursor: interactive ? "grab" : undefined }} {...handlers}>
      <rect x={0} y={0} width={W} height={H} fill="transparent" />
      {children}
    </svg>
  );
}

const HUES: Record<string, number> = { mobius: 205, klein: 280, trefoil: 18 };

function Surface({ item, data, interactive, W }: { item: ObjectItem; data: FigData; interactive: boolean; W: number }) {
  const { view, handlers } = useTurntable(item, data.view, { yaw: 25 * DEG, pitch: 28 * DEG });
  const name = data.name as "mobius" | "klein" | "trefoil";
  const patches = useMemo(() => paintMesh(surfaceMesh(name), view, W * 0.44, W / 2, W / 2, HUES[name] ?? 200), [name, view, W]);
  return (
    <Turn handlers={handlers} interactive={interactive} W={W} H={W}>
      <g strokeWidth={0.4} strokeLinejoin="round">
        {patches.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill} stroke={p.fill} />
        ))}
      </g>
    </Turn>
  );
}

function Genus({ item, data, interactive, W }: { item: ObjectItem; data: FigData; interactive: boolean; W: number }) {
  const { view, handlers } = useTurntable(item, data.view, { yaw: 0, pitch: 55 * DEG });
  const n = data.n ?? 2;
  const half = n >= 3 ? 2.3 : 1.75;
  const href = useImage((w, h) => renderSdf(genusSdf(n), view, w, h, [222, 160, 96], half), W, W * 0.7, `${n}|${view.yaw.toFixed(3)}|${view.pitch.toFixed(3)}`);
  return (
    <Turn handlers={handlers} interactive={interactive} W={W} H={W * 0.7}>
      {href && <image href={href} x={0} y={0} width={W} height={W * 0.7} />}
    </Turn>
  );
}

function Lorenz({ item, data, interactive, W }: { item: ObjectItem; data: FigData; interactive: boolean; W: number }) {
  // 두 날개가 겹치지 않고 나비 모양으로 보이는 쪽에서 시작
  const { view, handlers } = useTurntable(item, data.view, { yaw: 38 * DEG, pitch: 12 * DEG });
  const paths = useMemo(() => {
    const pts = lorenzPoints();
    const s = W * 0.46;
    const proj = (p: [number, number, number]) => {
      const r = rotate(p, view as View3);
      return `${(W / 2 + r[0] * s).toFixed(1)},${(W / 2 - r[1] * s).toFixed(1)}`;
    };
    // 시간에 따라 색이 바뀌게 6조각으로
    const parts = 6;
    const per = Math.ceil(pts.length / parts);
    return Array.from({ length: parts }, (_, k) => ({ d: `M${pts.slice(k * per, (k + 1) * per + 1).map(proj).join("L")}`, color: `hsl(${200 + k * 22} 70% ${45 + k * 3}%)` }));
  }, [view, W]);
  return (
    <Turn handlers={handlers} interactive={interactive} W={W} H={W}>
      <g fill="none" strokeWidth={0.8} strokeLinejoin="round">
        {paths.map((p, i) => (
          <path key={i} d={p.d} stroke={p.color} />
        ))}
      </g>
    </Turn>
  );
}

// ─────────────────────────────────────────────────────────── 화소 그림

function Mandel({ data, interactive, W, onZoom }: { data: FigData; interactive: boolean; W: number; onZoom: (z: { cx: number; cy: number; s: number }) => void }) {
  const zoom = data.zoom ?? { cx: -0.6, cy: 0, s: 3.2 };
  const H = W * 0.75;
  const href = useImage((w, h) => mandelbrot(zoom, w, h), W, H, `${zoom.cx}|${zoom.cy}|${zoom.s}`);
  return (
    <svg
      width={W}
      height={H}
      style={{ display: "block", pointerEvents: interactive ? "auto" : "none", cursor: interactive ? "zoom-in" : undefined, borderRadius: 8 }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const fx = (e.clientX - r.left) / r.width - 0.5;
        const fy = (e.clientY - r.top) / r.height - 0.5;
        onZoom({ cx: zoom.cx + fx * zoom.s, cy: zoom.cy - fy * zoom.s * (H / W), s: Math.max(1e-12, zoom.s / 2.5) });
      }}
    >
      <rect width={W} height={H} fill="#141830" />
      {href && <image href={href} x={0} y={0} width={W} height={H} />}
    </svg>
  );
}

function Logistic({ W }: { W: number }) {
  const H = W * 0.62;
  const L = 30;
  const B = 22;
  const href = useImage((w, h) => logistic(w, h), W - L, H - B, "logistic");
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      {href && <image href={href} x={L} y={0} width={W - L} height={H - B} />}
      <line x1={L} y1={H - B} x2={W} y2={H - B} stroke={theme.color.ink} strokeWidth={1} />
      <line x1={L} y1={0} x2={L} y2={H - B} stroke={theme.color.ink} strokeWidth={1} />
      <g fontSize={11} fontFamily={MONO} fill={theme.color.asymptote}>
        <text x={L} y={H - 6} textAnchor="start">2.5</text>
        <text x={L + (W - L) * (2 / 3)} y={H - 6} textAnchor="middle">3.5</text>
        <text x={W} y={H - 6} textAnchor="end">r = 4</text>
        <text x={L - 4} y={10} textAnchor="end">1</text>
        <text x={L - 4} y={H - B} textAnchor="end">0</text>
        <text x={L - 4} y={(H - B) / 2} textAnchor="end" fontStyle="italic">x</text>
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────── 평면 그림

function Flat({ data, W }: { data: FigData; W: number }) {
  const n = data.n ?? 3;
  if (data.name === "koch") {
    const pts = koch(n);
    const s = W * 0.42;
    const d = `M${pts.map(([x, y]) => `${(W / 2 + x * s).toFixed(2)},${(W * 0.52 - y * s).toFixed(2)}`).join("L")}Z`;
    return (
      <svg width={W} height={W} style={{ display: "block" }}>
        <path d={d} fill="#DCEBFB" stroke="#2F6DB5" strokeWidth={1} strokeLinejoin="round" />
      </svg>
    );
  }
  if (data.name === "sierpinski") {
    const tris = sierpinski(n);
    const s = W * 0.48;
    const d = tris.map((t) => `M${t.map(([x, y]) => `${(W / 2 + x * s).toFixed(2)},${(W * 0.58 - y * s).toFixed(2)}`).join("L")}Z`).join("");
    return (
      <svg width={W} height={W * 0.92} style={{ display: "block" }}>
        <path d={d} fill="#E2733F" />
      </svg>
    );
  }
  // 황금 나선
  const g = golden(n);
  const xs = g.squares.flatMap((q) => [q.x, q.x + q.s]);
  const ys = g.squares.flatMap((q) => [q.y, q.y + q.s]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const H = W * 0.7;
  const k = Math.min((W - 16) / spanX, (H - 16) / spanY);
  const ox = (W - spanX * k) / 2 - minX * k;
  const oy = (H - spanY * k) / 2 - minY * k;
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <g transform={`translate(${ox} ${oy}) scale(${k})`}>
        {g.squares.map((q, i) => (
          <g key={i}>
            <rect x={q.x} y={q.y} width={q.s} height={q.s} fill={`hsl(${40 + i * 18} 80% 92%)`} stroke="#B98A2E" strokeWidth={1 / k} />
            {q.s * k > 18 && (
              <text x={q.x + q.s / 2} y={q.y + q.s / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(q.s * 0.4, 28 / k)} fill="#8A6A1F" fontFamily={MONO}>
                {q.f}
              </text>
            )}
          </g>
        ))}
        <path d={g.arcs.join("")} fill="none" stroke="#C0392B" strokeWidth={2.2 / k} />
      </g>
    </svg>
  );
}

function Euler({ data, W }: { data: FigData; W: number }) {
  const t = data.t ?? Math.PI / 4;
  const H = W * 0.86;
  const r = W * 0.32;
  const cx = W / 2;
  const cy = H / 2;
  const px = cx + r * Math.cos(t);
  const py = cy - r * Math.sin(t);
  const f = (v: number) => v.toFixed(3).replace("-", "−");
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      <line x1={8} y1={cy} x2={W - 8} y2={cy} stroke={theme.color.ink} strokeWidth={1} />
      <line x1={cx} y1={H - 4} x2={cx} y2={4} stroke={theme.color.ink} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#9AA3B2" strokeWidth={1.4} />
      <path d={`M${cx + 22},${cy}A22,22 0 ${t > Math.PI ? 1 : 0} 0 ${cx + 22 * Math.cos(t)},${cy - 22 * Math.sin(t)}`} fill="none" stroke="#D9772B" strokeWidth={1.6} />
      <line x1={cx} y1={cy} x2={px} y2={py} stroke={theme.color.accent} strokeWidth={2.2} />
      <line x1={px} y1={py} x2={px} y2={cy} stroke="#3E9B6B" strokeWidth={1.6} strokeDasharray="4 3" />
      <line x1={cx} y1={cy} x2={px} y2={cy} stroke="#D9772B" strokeWidth={2.4} />
      <circle cx={px} cy={py} r={5} fill={theme.color.accent} />
      <g fontFamily={MONO} fontSize={13} fill={theme.color.ink} stroke={theme.color.bg} strokeWidth={3} paintOrder="stroke">
        <text x={px + (Math.cos(t) >= 0 ? 8 : -8)} y={py - 8} textAnchor={Math.cos(t) >= 0 ? "start" : "end"}>
          e^(iθ) = {f(Math.cos(t))} + {f(Math.sin(t))} i
        </text>
        <text x={cx + 26} y={cy - 6} fill="#D9772B">θ = {Math.round((t * 180) / Math.PI)}°</text>
        <text x={W - 10} y={cy + 16} textAnchor="end">Re</text>
        <text x={cx + 6} y={14}>Im</text>
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────── 라이프 게임

function Life({ item, ir, interactive, W }: { item: ObjectItem; ir: FigIR; interactive: boolean; W: number }) {
  const [live, setLive] = useState<Array<[number, number]> | null>(null);
  const [gen, setGen] = useState(ir.data.gen ?? 0);
  const playing = live !== null;
  const cells = live ?? ir.data.cells ?? [];
  const cell = W / LIFE_COLS;
  const H = cell * LIFE_ROWS;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  const save = (next: Array<[number, number]>, g: number, label: string) => {
    const now = sessionStore.getState().items.find((i) => i.id === item.id);
    if (!now || now.kind !== "object" || now.ir.kind !== "figure") return;
    sessionStore.getState().commitObjectIR(item.id, now.ir, { ...now.ir, data: { ...now.ir.data, cells: next, gen: g } }, label);
  };
  const play = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
      if (live) save(live, gen, "라이프 게임");
      setLive(null);
      return;
    }
    let cur = ir.data.cells ?? [];
    let g = ir.data.gen ?? 0;
    setLive(cur);
    timer.current = setInterval(() => {
      cur = lifeStep(cur);
      g += 1;
      setLive(cur);
      setGen(g);
    }, 130);
  };
  const toggle = (r: number, c: number) => {
    if (playing) return;
    const has = cells.some(([a, b]) => a === r && b === c);
    save(has ? cells.filter(([a, b]) => !(a === r && b === c)) : [...cells, [r, c]], ir.data.gen ?? 0, "칸 바꾸기");
  };
  const alive = new Set(cells.map(([r, c]) => r * LIFE_COLS + c));
  return (
    <>
      <svg
        width={W}
        height={H}
        style={{ display: "block", pointerEvents: interactive ? "auto" : "none", cursor: interactive && !playing ? "pointer" : undefined, background: "#F7F8FA", borderRadius: 6 }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          toggle(Math.floor(((e.clientY - r.top) / r.height) * LIFE_ROWS), Math.floor(((e.clientX - r.left) / r.width) * LIFE_COLS));
        }}
      >
        <path
          d={[...Array(LIFE_COLS + 1).keys()].map((i) => `M${i * cell},0V${H}`).join("") + [...Array(LIFE_ROWS + 1).keys()].map((i) => `M0,${i * cell}H${W}`).join("")}
          stroke="#E3E6EB"
          strokeWidth={0.6}
        />
        {cells.map(([r, c]) => (
          <rect key={`${r},${c}`} x={c * cell + 0.5} y={r * cell + 0.5} width={cell - 1} height={cell - 1} rx={1.5} fill="#2F6DB5" />
        ))}
      </svg>
      {interactive && (
        <div data-export-skip style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 6 }}>
          <button type="button" aria-label={playing ? "멈추기" : "재생"} onClick={play} style={{ ...btn, background: theme.color.accent, color: "#fff", borderColor: theme.color.accent }}>
            {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "멈추기" : "재생"}
          </button>
          <button
            type="button"
            disabled={playing}
            onClick={() => {
              const next = lifeStep(cells);
              setGen((g) => g + 1);
              save(next, (ir.data.gen ?? 0) + 1, "한 세대");
            }}
            style={{ ...btn, opacity: playing ? 0.4 : 1 }}
          >
            <StepForward size={14} /> 한 세대
          </button>
          <button type="button" disabled={playing} onClick={() => save([], 0, "모두 지우기")} style={{ ...btn, opacity: playing ? 0.4 : 1 }}>
            지우기
          </button>
          <button type="button" disabled={playing} onClick={() => save(GOSPER, 0, "글라이더 총")} style={{ ...btn, opacity: playing ? 0.4 : 1 }}>
            글라이더 총
          </button>
          <span style={{ fontSize: 12, color: theme.color.asymptote }}>
            {playing ? gen : (ir.data.gen ?? 0)}세대 · 산 칸 {alive.size}
          </span>
        </div>
      )}
    </>
  );
}
