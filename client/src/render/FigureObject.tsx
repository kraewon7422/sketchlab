import type { SceneIR } from "@sketchlab/shared";
import { Pause, Play, StepForward } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent, type ReactElement, type ReactNode } from "react";
import type { ObjectItem } from "../ink/types";
import {
  chaosGame,
  figureNote,
  figureTitle,
  gcd,
  GOSPER,
  genusSdf,
  golden,
  inMandelbrot,
  julia,
  koch,
  kochStats,
  LIFE_COLS,
  LIFE_ROWS,
  lifeRandom,
  lifeStep,
  logistic,
  logisticOrbit,
  logisticSeries,
  lorenz,
  LORENZ0,
  lorenzParams,
  lorenzRegime,
  mandelbrot,
  paintMesh,
  sierpinski,
  sierpinskiArea,
  surfaceMesh,
} from "../math/figures";
import { renderSdf } from "../math/topology";
import { rotate, type View3 } from "../solid/project";
import { sessionStore } from "../store/session";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";
import { useTurntable } from "./useTurntable";

/**
 * 유명한 그림 (수학·과학·컴퓨터) — 그림마다 직접 해 볼 수 있는 것:
 *   모든 그림: 이름을 톡 → 밑 설명 접기/펴기
 *   3D 곡면·종수·로렌츠: 돌리기  · 띠 꼬임 수 · 매듭 p·q · 종수 −/+
 *   로렌츠: σ·ρ·β 슬라이더 + 지금 모습(원점/고정점/혼돈) · 나비 효과(두 길) · 그려지는 모습 재생
 *   로지스틱: 끌어서 r 구간 확대 · 톡/슬라이더로 r 고르기 → 주기·랴푸노프 지수·xₙ 그래프
 *   만델브로: 톡 확대 · 줄리아 모드(톡/끌기로 c 고르기 → 줄리아 집합)
 *   코흐·시에르핀스키·황금 나선: 단계 −/+ 와 수치 · 혼돈 게임 재생
 *   오일러: 점 끌기·θ 슬라이더   라이프 게임: 칸 톡 · 재생 속도 · 무작위 · 글라이더 총
 * 바꾼 것은 IR에 저장 (Undo 1단계). 화소 그림은 <svg><image>(data URL)라 내보내기에도 그대로.
 */

type FigIR = Extract<SceneIR, { kind: "figure" }>;
type FigData = FigIR["data"];
const DEG = Math.PI / 180;
const MONO = "KaTeX_Main, 'Times New Roman', serif";
const num = (v: number, d = 3) => v.toFixed(d).replace("-", "−");

export default memo(function FigureObject({ item, interactive = false }: { item: ObjectItem; interactive?: boolean }): ReactElement | null {
  if (item.ir.kind !== "figure") return null;
  return <FigureBox item={item} ir={item.ir} interactive={interactive} />;
});

function current(item: ObjectItem): FigIR | null {
  const now = sessionStore.getState().items.find((i) => i.id === item.id);
  return now && now.kind === "object" && now.ir.kind === "figure" ? now.ir : null;
}

function useCommit(item: ObjectItem) {
  return (patch: Partial<FigData>, label: string) => {
    const now = current(item);
    if (now) sessionStore.getState().commitObjectIR(item.id, now, { ...now, data: { ...now.data, ...patch } }, label);
  };
}

/** 끄는 중엔 미리보기, 놓을 때 한 번 기록 (Undo 1단계) */
function useSlide(item: ObjectItem) {
  const start = useRef<FigIR | null>(null);
  return (patch: (d: FigData) => Partial<FigData>, done: boolean, label: string) => {
    const now = current(item);
    if (!now) return;
    start.current ??= now;
    const next: FigIR = { ...now, data: { ...now.data, ...patch(now.data) } };
    if (done) {
      sessionStore.getState().commitObjectIR(item.id, start.current, next, label);
      start.current = null;
    } else sessionStore.getState().previewObjectIR(item.id, next);
  };
}

/** 0 → 1 로 흐르는 재생 (멈춰 있을 땐 1) */
function useProgress(): [number, (ms: number) => void, () => void] {
  const [t, setT] = useState(1);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const stop = () => {
    cancelAnimationFrame(raf.current);
    setT(1);
  };
  const start = (ms: number) => {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setT(k);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    setT(0);
    raf.current = requestAnimationFrame(tick);
  };
  return [t, start, stop];
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

const btn = { minWidth: 30, minHeight: 30, padding: "3px 10px", border: `1px solid ${theme.color.sub}`, borderRadius: 999, background: theme.color.bg, color: theme.color.ink, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", pointerEvents: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 } as const;
const onBtn = { ...btn, background: theme.color.accent, color: "#fff", borderColor: theme.color.accent } as const;

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

/** 이름 · 슬라이더 · 지금 값 — 끄는 동안 미리보기, 놓으면 기록 */
function Slider({ label, name, value, min, max, step, show, onSlide }: { label: ReactNode; name: string; value: number; min: number; max: number; step: number; show: string; onSlide: (v: number, done: boolean) => void }) {
  const end = (e: { currentTarget: HTMLInputElement }) => onSlide(Number(e.currentTarget.value), true);
  return (
    <label style={{ display: "grid", gridTemplateColumns: "24px 1fr 58px", gap: 8, alignItems: "center", width: "100%", fontSize: 13, color: theme.color.ink }}>
      <i style={{ fontFamily: MONO, textAlign: "center" }}>{label}</i>
      <input
        type="range"
        aria-label={name}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onSlide(Number(e.target.value), false)}
        onPointerUp={end}
        onKeyUp={end}
        style={{ width: "100%", accentColor: theme.color.accent, pointerEvents: "auto", touchAction: "pan-x" }}
      />
      <span style={{ fontFamily: MONO, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{show}</span>
    </label>
  );
}

const nextQ = (p: number, q: number, dir: number) => {
  for (let x = q + dir; x >= p + 1 && x <= 9; x += dir) if (gcd(p, x) === 1) return x;
  return q;
};
const fixQ = (p: number, q: number) => {
  for (let x = Math.max(q, p + 1); x <= 11; x++) if (gcd(p, x) === 1) return x;
  return p + 1;
};

function FigureBox({ item, ir, interactive }: { item: ObjectItem; ir: FigIR; interactive: boolean }) {
  const W = item.transform.scale;
  const d = ir.data;
  const commit = useCommit(item);
  const slide = useSlide(item);
  const [prog, play, stopPlay] = useProgress();
  const [chaosOn, setChaosOn] = useState(false);
  const fresh = isFresh(item.id);
  const setP = (kv: Record<string, number>, label: string) => commit({ p: { ...d.p, ...kv } }, label);
  const slideP = (key: string, label: string) => (v: number, done: boolean) => slide((x) => ({ p: { ...x.p, [key]: v } }), done, label);
  let body: ReactNode;
  let controls: ReactNode = null;
  let analysis: ReactNode = null;
  let hint = "";
  let stats = "";

  switch (d.name) {
    case "mobius":
    case "klein":
    case "trefoil":
      body = <Surface item={item} data={d} interactive={interactive} W={W} />;
      hint = "드래그해서 돌리기";
      if (d.name === "mobius") controls = <Stepper label="반 꼬임" value={d.p?.tw ?? 1} min={1} max={5} onChange={(tw) => setP({ tw }, "꼬임 수")} />;
      if (d.name === "trefoil") {
        const kp = d.p?.p ?? 2;
        const kq = d.p?.q ?? 3;
        controls = (
          <>
            <Stepper label="둘레 p" value={kp} min={2} max={5} onChange={(p) => setP({ p, q: fixQ(p, kq) }, "매듭 p")} />
            <Stepper label="구멍 q" value={kq} min={kp + 1} max={9} onChange={(v) => setP({ q: nextQ(kp, kq, Math.sign(v - kq)) }, "매듭 q")} />
          </>
        );
        hint = "드래그해서 돌리기 · p·q는 서로소만";
      }
      break;
    case "genus":
      body = <Genus item={item} data={d} interactive={interactive} W={W} />;
      controls = <Stepper label="구멍" value={d.n ?? 2} min={0} max={4} onChange={(n) => commit({ n }, "구멍 수")} />;
      hint = "드래그해서 돌리기";
      break;
    case "lorenz": {
      const L = lorenzParams(d);
      const bf = !!d.p?.bf;
      const res = lorenz(L, bf);
      const reg = lorenzRegime(L);
      body = <Lorenz item={item} data={d} res={res} interactive={interactive} W={W} prog={prog} />;
      analysis = (
        <>
          <div>{reg.text}</div>
          {bf && <div style={{ color: "#C8622A" }}>{res.split === null ? "두 길이 갈라지지 않는다 — 혼돈이 아니면 처음 차이가 사라진다" : `처음 차이 0.00001 → t ≈ ${res.split.toFixed(1)} 에 완전히 다른 길`}</div>}
        </>
      );
      controls = (
        <>
          <Slider label="σ" name="σ (시그마)" value={L.s} min={0.5} max={30} step={0.5} show={num(L.s, 1)} onSlide={slideP("s", "σ")} />
          <Slider label="ρ" name="ρ (로)" value={L.r} min={0.5} max={120} step={0.5} show={num(L.r, 1)} onSlide={slideP("r", "ρ")} />
          <Slider label="β" name="β (베타)" value={L.b} min={0.2} max={6} step={0.01} show={num(L.b, 2)} onSlide={slideP("b", "β")} />
          <button type="button" aria-pressed={bf} style={bf ? onBtn : btn} onClick={() => setP({ bf: bf ? 0 : 1 }, "나비 효과")}>
            나비 효과
          </button>
          <button type="button" style={btn} onClick={() => (prog < 1 ? stopPlay() : play(6000))}>
            {prog < 1 ? <Pause size={14} /> : <Play size={14} />} {prog < 1 ? "멈추기" : "그려지는 모습"}
          </button>
          <button type="button" style={btn} onClick={() => commit({ p: { ...d.p, s: LORENZ0.s, r: LORENZ0.r, b: LORENZ0.b } }, "처음 값")}>
            처음 값
          </button>
        </>
      );
      hint = "드래그해서 돌리기 · ρ를 1, 24.7 넘게 바꿔 보기";
      break;
    }
    case "mandelbrot": {
      const jm = !!d.p?.jm;
      const c = d.p?.jx !== undefined ? { x: d.p.jx, y: d.p.jy ?? 0 } : null;
      body = <Mandel data={d} interactive={interactive} W={W} julia={jm} c={c} onZoom={(zoom) => commit({ zoom }, "확대")} onPick={(cx, cy, done) => slide((x) => ({ p: { ...x.p, jx: cx, jy: cy } }), done, "줄리아 c")} />;
      if (c) analysis = <div>{`c = ${num(c.x)} ${c.y < 0 ? "−" : "+"} ${Math.abs(c.y).toFixed(3)}i — ${inMandelbrot(c) ? "c가 집합 안: 줄리아 집합이 한 덩어리" : "c가 집합 밖: 먼지처럼 흩어짐"}`}</div>;
      controls = (
        <>
          <button type="button" aria-pressed={!jm} style={!jm ? onBtn : btn} onClick={() => jm && setP({ jm: 0 }, "톡 = 확대")}>
            톡 = 확대
          </button>
          <button type="button" aria-pressed={jm} style={jm ? onBtn : btn} onClick={() => !jm && setP({ jm: 1 }, "톡 = 줄리아")}>
            톡 = 줄리아 c
          </button>
          <button type="button" style={btn} onClick={() => d.zoom && commit({ zoom: { ...d.zoom, s: Math.min(4, d.zoom.s * 2.5) } }, "축소")}>
            축소
          </button>
          <button type="button" style={btn} onClick={() => commit({ zoom: { cx: -0.6, cy: 0, s: 3.2 } }, "처음 크기")}>
            처음으로
          </button>
          {c && (
            <button
              type="button"
              style={btn}
              onClick={() => {
                commit({ p: Object.fromEntries(Object.entries(d.p ?? {}).filter(([k]) => k !== "jx" && k !== "jy")) }, "줄리아 끄기");
              }}
            >
              줄리아 끄기
            </button>
          )}
        </>
      );
      hint = jm ? "톡하거나 끌어서 c 고르기 → 오른쪽 아래 줄리아 집합" : `톡 하면 그 자리를 2.5배 확대 · 지금 ×${(3.2 / (d.zoom?.s ?? 3.2)).toPrecision(3)}`;
      break;
    }
    case "logistic": {
      const r0 = d.p?.r0 ?? 2.5;
      const r1 = d.p?.r1 ?? 4;
      const rc = Math.min(r1, Math.max(r0, d.p?.rc ?? 3.5));
      const o = logisticOrbit(rc);
      const uniq = o.period && o.period <= 8 ? [...o.values.slice(0, o.period)].sort((a, b) => a - b) : [];
      body = <Logistic data={d} interactive={interactive} W={W} orbit={uniq} slide={slide} />;
      analysis = (
        <>
          <div>
            {`r = ${rc.toFixed(4)} · `}
            {o.period ? `주기 ${o.period}` : o.lyap < 0 ? "주기 판정 어려움 (분기점 근처 — 아주 천천히 모임)" : "혼돈 (주기 없음)"}
            {` · λ = ${num(o.lyap)} ${o.lyap < 0 ? "(안정)" : "(혼돈: 가까운 두 점이 멀어진다)"}`}
          </div>
          {uniq.length > 0 && <div>{`x → ${uniq.map((v) => v.toFixed(3)).join(", ")}`}</div>}
          <Series r={rc} W={W} />
        </>
      );
      const span = (a: number, b: number, label: string) => commit({ p: { ...d.p, r0: a, r1: b, rc: rc >= a && rc <= b ? rc : (a + b) / 2 } }, label);
      controls = (
        <>
          <Slider label="r" name="r 고르기" value={rc} min={r0} max={r1} step={(r1 - r0) / 1000} show={rc.toFixed(3)} onSlide={slideP("rc", "r 고르기")} />
          <button type="button" style={btn} onClick={() => span(2.5, 4, "처음 구간")}>
            처음으로
          </button>
          <button type="button" style={btn} onClick={() => span(0, 4, "전체 구간")}>
            전체 0~4
          </button>
          <button type="button" style={btn} onClick={() => span(2.9, 3.6, "주기 배가")}>
            주기 2·4·8…
          </button>
          <button type="button" style={btn} onClick={() => span(3.82, 3.86, "주기 3 창")}>
            주기 3 창
          </button>
        </>
      );
      hint = "옆으로 끌면 그 r 구간 확대 · 톡 하면 그 r 분석";
      break;
    }
    case "koch":
    case "sierpinski":
    case "golden": {
      const n = d.n ?? 3;
      const max = d.name === "golden" ? 12 : d.name === "koch" ? 6 : 7;
      const chaos = d.name === "sierpinski" && chaosOn ? Math.round(5000 * prog) : null;
      body = <Flat data={d} W={W} chaos={chaos} />;
      if (d.name === "koch") {
        const k = kochStats(n);
        stats = `둘레 ×${k.perimeter.toFixed(3)} (→ ∞) · 넓이 ×${k.area.toFixed(4)} (→ 8/5 = 1.6)`;
      } else if (d.name === "sierpinski") stats = chaosOn ? `점 ${chaos ?? 0}개 — 무작위로 찍어도 같은 모양이 나타난다` : `남은 넓이 (3/4)ⁿ = ${sierpinskiArea(n).toFixed(4)} (→ 0)`;
      else {
        const sq = golden(n).squares;
        const a = sq[sq.length - 1]?.s ?? 1;
        const b = sq[sq.length - 2]?.s ?? 1;
        const phi = (1 + Math.sqrt(5)) / 2;
        stats = sq.length > 1 ? `${a}/${b} = ${(a / b).toFixed(5)} · φ = ${phi.toFixed(5)} (차이 ${Math.abs(a / b - phi).toExponential(1)})` : "φ = 1.61803…";
      }
      controls = (
        <>
          <Stepper label={d.name === "golden" ? "정사각형" : "단계"} value={n} min={d.name === "golden" ? 1 : 0} max={max} onChange={(v) => commit({ n: v }, "단계")} />
          {d.name === "sierpinski" && (
            <button
              type="button"
              aria-pressed={chaosOn}
              style={chaosOn ? onBtn : btn}
              onClick={() => {
                if (chaosOn) {
                  setChaosOn(false);
                  stopPlay();
                } else {
                  setChaosOn(true);
                  play(5000);
                }
              }}
            >
              혼돈 게임
            </button>
          )}
        </>
      );
      break;
    }
    case "euler": {
      const t = d.t ?? Math.PI / 4;
      body = <Euler data={d} W={W} interactive={interactive} onDrag={(v, done) => slide(() => ({ t: v }), done, "각 θ")} />;
      controls = <Slider label="θ" name="각 θ" value={t} min={0} max={2 * Math.PI} step={Math.PI / 180} show={`${Math.round(t / DEG)}°`} onSlide={(v, done) => slide(() => ({ t: v }), done, "각 θ")} />;
      hint = "점을 끌거나 슬라이더 — 15°마다 살짝 붙는다";
      break;
    }
    case "life":
      body = <Life item={item} ir={ir} interactive={interactive} W={W} />;
      break;
  }

  return (
    <div data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: W, pointerEvents: "none" }}>
      {body}
      <button
        type="button"
        aria-expanded={!d.hideInfo}
        aria-label={`${figureTitle(d)} — 설명 ${d.hideInfo ? "펴기" : "접기"}`}
        onClick={() => commit({ hideInfo: !d.hideInfo }, d.hideInfo ? "설명 펴기" : "설명 접기")}
        style={{ display: "block", margin: "4px auto 0", padding: "1px 8px", border: "none", borderRadius: 8, background: "transparent", color: theme.color.ink, fontSize: 15, fontWeight: 600, fontFamily: "inherit", cursor: interactive ? "pointer" : "default", pointerEvents: interactive ? "auto" : "none" }}
      >
        {figureTitle(d)}
        {interactive && (
          <span data-export-skip style={{ marginLeft: 5, fontSize: 11, color: theme.color.asymptote }}>
            {d.hideInfo ? "▸" : "▾"}
          </span>
        )}
      </button>
      {!d.hideInfo && (
        <>
          <div style={{ textAlign: "center", fontSize: 12.5, color: theme.color.asymptote, wordBreak: "keep-all" }}>{figureNote(d)}</div>
          {stats && <div style={{ textAlign: "center", fontSize: 12, color: theme.color.ink, fontFamily: MONO, marginTop: 2, wordBreak: "keep-all" }}>{stats}</div>}
        </>
      )}
      {analysis && <div style={{ display: "grid", gap: 2, textAlign: "center", fontSize: 12.5, color: theme.color.ink, marginTop: 4, wordBreak: "keep-all" }}>{analysis}</div>}
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
  const a = name === "mobius" ? (data.p?.tw ?? 1) : name === "trefoil" ? (data.p?.p ?? 2) : 0;
  const b = name === "trefoil" ? (data.p?.q ?? 3) : 0;
  const patches = useMemo(() => paintMesh(surfaceMesh(name, a, b), view, W * 0.44, W / 2, W / 2, HUES[name] ?? 200), [name, a, b, view, W]);
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

type V3 = [number, number, number];

function Lorenz({ item, data, res, interactive, W, prog }: { item: ObjectItem; data: FigData; res: { a: V3[]; b: V3[] | null }; interactive: boolean; W: number; prog: number }) {
  // 두 날개가 겹치지 않고 나비 모양으로 보이는 쪽에서 시작
  const { view, handlers } = useTurntable(item, data.view, { yaw: 38 * DEG, pitch: 12 * DEG });
  const drawn = useMemo(() => {
    const s = W * 0.46;
    const xy = (p: V3): [number, number] => {
      const r = rotate(p, view as View3);
      return [W / 2 + r[0] * s, W / 2 - r[1] * s];
    };
    const proj = (p: V3) => xy(p).map((v) => v.toFixed(1)).join(",");
    const cut = (pts: V3[]) => (prog < 1 ? pts.slice(0, Math.max(2, Math.round(pts.length * prog))) : pts);
    const A = cut(res.a);
    const B = res.b ? cut(res.b) : null;
    // 시간에 따라 색이 바뀌게 6조각으로
    const parts = 6;
    const per = Math.ceil(A.length / parts);
    return {
      a: Array.from({ length: parts }, (_, k) => ({ d: `M${A.slice(k * per, (k + 1) * per + 1).map(proj).join("L")}`, color: `hsl(${200 + k * 22} 70% ${45 + k * 3}%)` })).filter((p) => p.d.length > 1),
      b: B ? `M${B.map(proj).join("L")}` : null,
      heads: prog < 1 ? [A[A.length - 1], B?.[B.length - 1]].filter((p): p is V3 => !!p).map(xy) : [],
    };
  }, [res, view, W, prog]);
  return (
    <Turn handlers={handlers} interactive={interactive} W={W} H={W}>
      <g fill="none" strokeWidth={0.8} strokeLinejoin="round">
        {drawn.a.map((p, i) => (
          <path key={i} d={p.d} stroke={p.color} />
        ))}
        {drawn.b && <path d={drawn.b} stroke="#E8743B" strokeOpacity={0.85} />}
      </g>
      {drawn.heads.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={4} fill={i === 0 ? "#2F6DB5" : "#E8743B"} stroke="#fff" strokeWidth={1.5} />
      ))}
    </Turn>
  );
}

// ─────────────────────────────────────────────────────────── 화소 그림

function Mandel({
  data,
  interactive,
  W,
  julia: pickMode,
  c,
  onZoom,
  onPick,
}: {
  data: FigData;
  interactive: boolean;
  W: number;
  julia: boolean;
  c: { x: number; y: number } | null;
  onZoom: (z: { cx: number; cy: number; s: number }) => void;
  onPick: (x: number, y: number, done: boolean) => void;
}) {
  const zoom = data.zoom ?? { cx: -0.6, cy: 0, s: 3.2 };
  const H = W * 0.75;
  const href = useImage((w, h) => mandelbrot(zoom, w, h), W, H, `${zoom.cx}|${zoom.cy}|${zoom.s}`);
  const JW = Math.round(W * 0.4);
  const JH = Math.round(JW * 0.75);
  const jc = c ?? { x: 0, y: 0 };
  const jhref = useImage((w, h) => julia(jc, w, h), JW, JH, `${jc.x}|${jc.y}`);
  const pressed = useRef(false);
  const toC = (e: RPointerEvent<SVGSVGElement> | RMouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width - 0.5;
    const fy = (e.clientY - r.top) / r.height - 0.5;
    return { x: zoom.cx + fx * zoom.s, y: zoom.cy - fy * zoom.s * (H / W) };
  };
  const mark = c && { x: W * ((c.x - zoom.cx) / zoom.s + 0.5), y: H * (-(c.y - zoom.cy) / (zoom.s * (H / W)) + 0.5) };
  return (
    <svg
      width={W}
      height={H}
      style={{ display: "block", pointerEvents: interactive ? "auto" : "none", cursor: interactive ? (pickMode ? "crosshair" : "zoom-in") : undefined, borderRadius: 8, touchAction: pickMode ? "none" : undefined }}
      onClick={(e) => {
        if (pickMode) return;
        const p = toC(e);
        onZoom({ cx: p.x, cy: p.y, s: Math.max(1e-12, zoom.s / 2.5) });
      }}
      onPointerDown={(e) => {
        if (!pickMode) return;
        pressed.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* 합성 이벤트 */
        }
        const p = toC(e);
        onPick(p.x, p.y, false);
      }}
      onPointerMove={(e) => {
        if (!pickMode || !pressed.current) return;
        const p = toC(e);
        onPick(p.x, p.y, false);
      }}
      onPointerUp={(e) => {
        if (!pickMode || !pressed.current) return;
        pressed.current = false;
        const p = toC(e);
        onPick(p.x, p.y, true);
      }}
    >
      <rect width={W} height={H} fill="#141830" />
      {href && <image href={href} x={0} y={0} width={W} height={H} />}
      {mark && mark.x >= 0 && mark.x <= W && mark.y >= 0 && mark.y <= H && (
        <g stroke="#fff" strokeWidth={1.5} fill="none">
          <circle cx={mark.x} cy={mark.y} r={6} />
          <path d={`M${mark.x - 10},${mark.y}h6M${mark.x + 4},${mark.y}h6M${mark.x},${mark.y - 10}v6M${mark.x},${mark.y + 4}v6`} />
        </g>
      )}
      {c && jhref && (
        <g>
          <rect x={W - JW - 7} y={H - JH - 7} width={JW + 2} height={JH + 2} fill="none" stroke="#fff" strokeWidth={2} rx={4} />
          <image href={jhref} x={W - JW - 6} y={H - JH - 6} width={JW} height={JH} />
          <text x={W - JW - 2} y={H - JH + 6} fontSize={11} fill="#fff" stroke="#141830" strokeWidth={3} paintOrder="stroke" fontFamily={MONO}>
            줄리아
          </text>
        </g>
      )}
    </svg>
  );
}

function Logistic({ data, interactive, W, orbit, slide }: { data: FigData; interactive: boolean; W: number; orbit: number[]; slide: ReturnType<typeof useSlide> }) {
  const r0 = data.p?.r0 ?? 2.5;
  const r1 = data.p?.r1 ?? 4;
  const rc = data.p?.rc ?? 3.5;
  const H = W * 0.62;
  const L = 34;
  const B = 22;
  const PW = W - L;
  const PH = H - B;
  const href = useImage((w, h) => logistic(w, h, r0, r1), PW, PH, `${r0}|${r1}`);
  const [brush, setBrush] = useState<[number, number] | null>(null);
  const down = useRef<number | null>(null);
  const toR = (e: RPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    return r0 + Math.min(1, Math.max(0, (fx - L) / PW)) * (r1 - r0);
  };
  const xOf = (r: number) => L + ((r - r0) / (r1 - r0)) * PW;
  const digits = Math.max(1, Math.min(6, Math.ceil(-Math.log10(r1 - r0)) + 2));
  const showRc = rc >= r0 && rc <= r1;
  return (
    <svg
      width={W}
      height={H}
      style={{ display: "block", pointerEvents: interactive ? "auto" : "none", touchAction: interactive ? "none" : undefined, cursor: interactive ? "col-resize" : undefined }}
      onPointerDown={(e) => {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* 합성 이벤트 */
        }
        const r = toR(e);
        down.current = r;
        setBrush([r, r]);
      }}
      onPointerMove={(e) => {
        if (down.current !== null) setBrush([down.current, toR(e)]);
      }}
      onPointerUp={(e) => {
        const a = down.current;
        down.current = null;
        setBrush(null);
        if (a === null) return;
        const r = toR(e);
        if (Math.abs(xOf(r) - xOf(a)) < 6) {
          slide((x) => ({ p: { ...x.p, rc: r } }), true, "r 고르기");
          return;
        }
        const lo = Math.min(a, r);
        const hi = Math.max(a, r);
        if (hi - lo < 1e-6) return;
        slide((x) => {
          const old = x.p?.rc ?? 3.5;
          return { p: { ...x.p, r0: lo, r1: hi, rc: old >= lo && old <= hi ? old : (lo + hi) / 2 } };
        }, true, "구간 확대");
      }}
      onPointerCancel={() => {
        down.current = null;
        setBrush(null);
      }}
    >
      <rect x={L} y={0} width={PW} height={PH} fill="transparent" />
      {href && <image href={href} x={L} y={0} width={PW} height={PH} preserveAspectRatio="none" />}
      {brush && <rect x={Math.min(xOf(brush[0]), xOf(brush[1]))} y={0} width={Math.abs(xOf(brush[1]) - xOf(brush[0]))} height={PH} fill={theme.color.accent} fillOpacity={0.15} stroke={theme.color.accent} />}
      {showRc && (
        <g>
          <line x1={xOf(rc)} y1={0} x2={xOf(rc)} y2={PH} stroke="#D64545" strokeWidth={1.2} strokeDasharray="4 3" />
          {orbit.map((v, i) => (
            <circle key={i} cx={xOf(rc)} cy={(1 - v) * PH} r={3.2} fill="#D64545" stroke="#fff" strokeWidth={1} />
          ))}
        </g>
      )}
      <line x1={L} y1={PH} x2={W} y2={PH} stroke={theme.color.ink} strokeWidth={1} />
      <line x1={L} y1={0} x2={L} y2={PH} stroke={theme.color.ink} strokeWidth={1} />
      <g fontSize={11} fontFamily={MONO} fill={theme.color.asymptote}>
        <text x={L} y={H - 6} textAnchor="start">
          {r0.toFixed(digits)}
        </text>
        <text x={L + PW / 2} y={H - 6} textAnchor="middle">
          {((r0 + r1) / 2).toFixed(digits)}
        </text>
        <text x={W} y={H - 6} textAnchor="end">
          r = {r1.toFixed(digits)}
        </text>
        <text x={L - 4} y={10} textAnchor="end">
          1
        </text>
        <text x={L - 4} y={PH} textAnchor="end">
          0
        </text>
        <text x={L - 4} y={PH / 2} textAnchor="end" fontStyle="italic">
          x
        </text>
      </g>
    </svg>
  );
}

/** 한 r에서 xₙ이 시간에 따라 어떻게 움직이는지 (n = 0…50) */
function Series({ r, W }: { r: number; W: number }) {
  const H = 48;
  const L = 34;
  const xs = logisticSeries(r, 50);
  const px = (n: number) => L + (n / 50) * (W - L - 4);
  const py = (v: number) => 4 + (1 - v) * (H - 8);
  return (
    <svg width={W} height={H + 12} style={{ display: "block", marginTop: 2 }}>
      <line x1={L} y1={H - 4} x2={W - 4} y2={H - 4} stroke={theme.color.sub} />
      <polyline points={xs.map((v, n) => `${px(n).toFixed(1)},${py(v).toFixed(1)}`).join(" ")} fill="none" stroke="#2F6DB5" strokeWidth={1} />
      {xs.map((v, n) => (
        <circle key={n} cx={px(n)} cy={py(v)} r={1.6} fill="#2F6DB5" />
      ))}
      <g fontSize={10.5} fontFamily={MONO} fill={theme.color.asymptote}>
        <text x={L - 4} y={10} textAnchor="end" fontStyle="italic">
          xₙ
        </text>
        <text x={W - 4} y={H + 9} textAnchor="end">
          n = 50
        </text>
        <text x={L} y={H + 9}>
          0
        </text>
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────── 평면 그림

function Flat({ data, W, chaos }: { data: FigData; W: number; chaos: number | null }) {
  const n = data.n ?? 3;
  const chaosPts = useMemo(() => (data.name === "sierpinski" ? chaosGame(5000) : []), [data.name]);
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
    const X = (x: number) => W / 2 + x * s;
    const Y = (y: number) => W * 0.58 - y * s;
    const d = tris.map((t) => `M${t.map(([x, y]) => `${X(x).toFixed(2)},${Y(y).toFixed(2)}`).join("L")}Z`).join("");
    const dots = chaos === null ? "" : chaosPts.slice(0, chaos).map(([x, y]) => `M${X(x).toFixed(1)},${Y(y).toFixed(1)}h1.4v1.4h-1.4z`).join("");
    return (
      <svg width={W} height={W * 0.92} style={{ display: "block" }}>
        <path d={d} fill="#E2733F" fillOpacity={chaos === null ? 1 : 0.18} />
        {dots && <path d={dots} fill="#8A3412" />}
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

function Euler({ data, W, interactive, onDrag }: { data: FigData; W: number; interactive: boolean; onDrag: (t: number, done: boolean) => void }) {
  const t = data.t ?? Math.PI / 4;
  const H = W * 0.86;
  const r = W * 0.32;
  const cx = W / 2;
  const cy = H / 2;
  const px = cx + r * Math.cos(t);
  const py = cy - r * Math.sin(t);
  const f = (v: number) => v.toFixed(3).replace("-", "−");
  const pressed = useRef(false);
  const toT = (e: RPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W - cx;
    const y = ((e.clientY - rect.top) / rect.height) * H - cy;
    let a = Math.atan2(-y, x);
    if (a < 0) a += 2 * Math.PI;
    // 15°마다 살짝 붙기 (2° 안)
    const snap = Math.round(a / (15 * DEG)) * 15 * DEG;
    return Math.abs(a - snap) < 2 * DEG ? snap % (2 * Math.PI) : a;
  };
  const special = Math.abs(t - Math.PI) < 0.005 ? "e^(iπ) + 1 = 0" : null;
  return (
    <svg
      width={W}
      height={H}
      style={{ display: "block", overflow: "visible", pointerEvents: interactive ? "auto" : "none", touchAction: interactive ? "none" : undefined, cursor: interactive ? "pointer" : undefined }}
      onPointerDown={(e) => {
        pressed.current = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* 합성 이벤트 */
        }
        onDrag(toT(e), false);
      }}
      onPointerMove={(e) => pressed.current && onDrag(toT(e), false)}
      onPointerUp={(e) => {
        if (!pressed.current) return;
        pressed.current = false;
        onDrag(toT(e), true);
      }}
    >
      <rect width={W} height={H} fill="transparent" />
      <line x1={8} y1={cy} x2={W - 8} y2={cy} stroke={theme.color.ink} strokeWidth={1} />
      <line x1={cx} y1={H - 4} x2={cx} y2={4} stroke={theme.color.ink} strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#9AA3B2" strokeWidth={1.4} />
      <path d={`M${cx + 22},${cy}A22,22 0 ${t > Math.PI ? 1 : 0} 0 ${cx + 22 * Math.cos(t)},${cy - 22 * Math.sin(t)}`} fill="none" stroke="#D9772B" strokeWidth={1.6} />
      <line x1={cx} y1={cy} x2={px} y2={py} stroke={theme.color.accent} strokeWidth={2.2} />
      <line x1={px} y1={py} x2={px} y2={cy} stroke="#3E9B6B" strokeWidth={1.6} strokeDasharray="4 3" />
      <line x1={cx} y1={cy} x2={px} y2={cy} stroke="#D9772B" strokeWidth={2.4} />
      <circle cx={px} cy={py} r={interactive ? 8 : 5} fill={theme.color.accent} stroke="#fff" strokeWidth={interactive ? 2 : 0} />
      <g fontFamily={MONO} fontSize={13} fill={theme.color.ink} stroke={theme.color.bg} strokeWidth={3} paintOrder="stroke">
        <text x={8} y={H - 8}>
          e^(iθ) = {f(Math.cos(t))} {Math.sin(t) < -5e-4 ? "−" : "+"} {f(Math.abs(Math.sin(t)))} i
        </text>
        <text x={cx + 26} y={cy - 6} fill="#D9772B">
          θ = {Math.round((t * 180) / Math.PI)}°
        </text>
        <text x={W - 10} y={cy + 16} textAnchor="end">
          Re
        </text>
        <text x={cx + 6} y={14}>
          Im
        </text>
        {special && (
          <text x={W - 8} y={H - 8} textAnchor="end" fill="#C0392B" fontSize={15}>
            {special}
          </text>
        )}
      </g>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────── 라이프 게임

function Life({ item, ir, interactive, W }: { item: ObjectItem; ir: FigIR; interactive: boolean; W: number }) {
  const [live, setLive] = useState<Array<[number, number]> | null>(null);
  const [gen, setGen] = useState(ir.data.gen ?? 0);
  const [speed, setSpeed] = useState(130);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const playing = live !== null;
  const cells = live ?? ir.data.cells ?? [];
  const cell = W / LIFE_COLS;
  const H = cell * LIFE_ROWS;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loop = useRef<{ cur: Array<[number, number]>; g: number } | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const save = (next: Array<[number, number]>, g: number, label: string) => {
    const now = current(item);
    if (now) sessionStore.getState().commitObjectIR(item.id, now, { ...now, data: { ...now.data, cells: next, gen: g } }, label);
  };
  const play = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      if (loop.current) save(loop.current.cur, loop.current.g, "라이프 게임");
      loop.current = null;
      setLive(null);
      return;
    }
    loop.current = { cur: ir.data.cells ?? [], g: ir.data.gen ?? 0 };
    setLive(loop.current.cur);
    const tick = () => {
      const L = loop.current;
      if (!L) return;
      L.cur = lifeStep(L.cur);
      L.g += 1;
      setLive(L.cur);
      setGen(L.g);
      timer.current = setTimeout(tick, speedRef.current);
    };
    timer.current = setTimeout(tick, speedRef.current);
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
          <button type="button" aria-label={playing ? "멈추기" : "재생"} onClick={play} style={onBtn}>
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
          <button type="button" disabled={playing} onClick={() => save(lifeRandom(0.3, Date.now() % 1e9), 0, "무작위 채우기")} style={{ ...btn, opacity: playing ? 0.4 : 1 }}>
            무작위
          </button>
          <button type="button" disabled={playing} onClick={() => save(GOSPER, 0, "글라이더 총")} style={{ ...btn, opacity: playing ? 0.4 : 1 }}>
            글라이더 총
          </button>
          <span style={{ fontSize: 12, color: theme.color.asymptote }}>
            {playing ? gen : (ir.data.gen ?? 0)}세대 · 산 칸 {alive.size}
          </span>
          <Slider label="⏱" name="재생 속도" value={440 - speed} min={40} max={400} step={10} show={`${Math.round(1000 / speed)}/초`} onSlide={(v) => setSpeed(440 - v)} />
        </div>
      )}
    </>
  );
}
