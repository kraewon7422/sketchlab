import katex from "katex";
import { Pause, Play, RotateCcw, StepForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactElement, type ReactNode } from "react";
import type { ObjectItem } from "../ink/types";
import { det2, det3, det3Expansion, euclidFigure, GD_FUNCTIONS, gdPath, ORBITALS, orbitalMesh } from "../math/science";
import { rotate, type View3 } from "../solid/project";
import { btn, DEG, MONO, num, onBtn, Slider, Turn, useCommit, useImage, useSlide, type FigIR } from "./figureKit";
import { theme } from "./theme";
import { useTurntable } from "./useTurntable";

/**
 * 과학·수학 그림 5개 (그림 · 분석 · 조작 단추를 한 덩어리로) — FigureObject가 이름에 따라 부른다.
 *   경사하강법 · 원자 오비탈 · 전자기파 · 행렬식 · 유클리드의 피타고라스 증명
 * 바꾼 값은 IR(p·t·n)에 저장 (Undo 1단계). 재생 중인 것(파동·경사하강 재생)은 화면에만.
 */

type Props = { item: ObjectItem; ir: FigIR; interactive: boolean; W: number };

const row = { display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 6 } as const;
const info = { textAlign: "center", fontSize: 12.5, color: theme.color.ink, marginTop: 4, wordBreak: "keep-all", lineHeight: 1.5 } as const;
const chip = (on: boolean) => (on ? onBtn : btn);
const ptr = (e: RPointerEvent<SVGSVGElement>, W: number, H: number) => {
  const r = e.currentTarget.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
};
const capture = (e: RPointerEvent<Element>) => {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* 합성 이벤트 */
  }
};

export function ScienceFigure(props: Props): ReactElement | null {
  switch (props.ir.data.name) {
    case "gd":
      return <GradientDescent {...props} />;
    case "orbital":
      return <OrbitalView {...props} />;
    case "emwave":
      return <EmWave {...props} />;
    case "det":
      return <Determinant {...props} />;
    case "euclid":
      return <Euclid {...props} />;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────── 경사하강법

/** 함수마다 알맞은 처음 학습률 (로젠브록은 골짜기가 가팔라 작게) */
const GD_LR = [0.1, 0.02, 0.05, 0.008];

function GradientDescent({ item, ir, interactive, W }: Props) {
  const d = ir.data;
  const commit = useCommit(item);
  const slide = useSlide(item);
  const fnIdx = Math.min(GD_FUNCTIONS.length - 1, Math.max(0, d.p?.fn ?? 0));
  const fn = GD_FUNCTIONS[fnIdx] as (typeof GD_FUNCTIONS)[number];
  const lr = d.p?.lr ?? 0.1;
  const mom = d.p?.mom ?? 0;
  const start: [number, number] = [d.p?.x0 ?? fn.start[0], d.p?.y0 ?? fn.start[1]];
  const saved = d.p?.steps ?? 0;
  // 재생 중엔 걸음 수를 화면에서만 늘리고, 멈추면 기록
  const [live, setLive] = useState<number | null>(null);
  const steps = live ?? saved;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  const res = useMemo(() => gdPath(fn, lr, mom, start, steps), [fn, lr, mom, start[0], start[1], steps]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = res.pts[res.pts.length - 1] as [number, number];
  const [vx0, vx1, vy0, vy1] = fn.view;
  const H = Math.round(W * 0.68);
  const X = (x: number) => ((x - vx0) / (vx1 - vx0)) * W;
  const Y = (y: number) => H - ((y - vy0) / (vy1 - vy0)) * H;
  const toX = (px: number) => vx0 + (px / W) * (vx1 - vx0);
  const toY = (py: number) => vy0 + ((H - py) / H) * (vy1 - vy0);

  const setP = (kv: Record<string, number>, label: string) => commit({ p: { ...d.p, ...kv } }, label);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (live !== null) setP({ steps: live }, "경사하강 재생");
    setLive(null);
  };
  const play = () => {
    if (timer.current) return stop();
    let k = saved;
    setLive(k);
    timer.current = setInterval(() => {
      k += 1;
      setLive(k);
      const r = gdPath(fn, lr, mom, start, k);
      if (k >= saved + 150 || r.status === "converged" || r.status === "diverged") {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        setP({ steps: k }, "경사하강 재생");
        setLive(null);
      }
    }, 120);
  };

  // 2차원: 등고선 그림 (값이 작을수록 진하게, 띠로)
  const heat = useImage(
    (w, h) => {
      const out = new Uint8ClampedArray(w * h * 4);
      if (fn.dim !== 2) return out;
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const x = vx0 + ((i + 0.5) / w) * (vx1 - vx0);
          const y = vy1 - ((j + 0.5) / h) * (vy1 - vy0);
          const v = Math.log1p(fn.f(x, y));
          const band = (v * 3) % 1 < 0.08 ? 0.75 : 1;
          const t = Math.min(1, v / 4.5);
          const k = (j * w + i) * 4;
          out[k] = Math.round((40 + 200 * t) * band);
          out[k + 1] = Math.round((110 + 110 * (1 - t)) * band);
          out[k + 2] = Math.round((220 - 120 * t) * band);
          out[k + 3] = 255;
        }
      return out;
    },
    W,
    H,
    `${fnIdx}`,
  );

  const curve = useMemo(() => {
    if (fn.dim !== 1) return "";
    const n = 200;
    return Array.from({ length: n + 1 }, (_, i) => {
      const x = vx0 + ((vx1 - vx0) * i) / n;
      return `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(fn.f(x, 0)).toFixed(1)}`;
    }).join("");
  }, [fnIdx, W]); // eslint-disable-line react-hooks/exhaustive-deps

  const pathPts = res.pts.map(([x, y]) => (fn.dim === 1 ? [X(x), Y(fn.f(x, 0))] : [X(x), Y(y)]) as [number, number]);
  const dragging = useRef(false);
  const dragStart = (e: RPointerEvent<SVGSVGElement>, done: boolean) => {
    const p = ptr(e, W, H);
    const x = Math.round(Math.min(vx1, Math.max(vx0, toX(p.x))) * 20) / 20;
    const y = fn.dim === 2 ? Math.round(Math.min(vy1, Math.max(vy0, toY(p.y))) * 20) / 20 : 0;
    slide((x0) => ({ p: { ...x0.p, x0: x, y0: y, steps: 0 } }), done, "시작점");
  };
  const climbing = steps > 0 && res.status !== "diverged" && fn.f(last[0], last[1]) > fn.f(start[0], start[1]) * 1.5 + 1e-9;
  const status =
    climbing
      ? "↗ 값이 오히려 커지고 있어요 — 학습률이 너무 커요"
      : res.status === "converged"
      ? "✓ 최솟값에 도착 (기울기 ≈ 0)"
      : res.status === "oscillating"
        ? "↔ 골짜기를 넘나들며 튕겨요 — 학습률을 줄여 보세요"
        : res.status === "diverged"
          ? "✗ 발산 — 학습률이 너무 커서 값이 터졌어요"
          : steps === 0
            ? "▶ 한 걸음 / 재생을 눌러 보세요"
            : "↘ 내려가는 중";
  const g = fn.grad(last[0], last[1]);

  return (
    <>
      <svg
        width={W}
        height={H}
        style={{ display: "block", borderRadius: 8, background: fn.dim === 1 ? "#FAFBFC" : undefined, pointerEvents: interactive ? "auto" : "none", touchAction: interactive ? "none" : undefined, cursor: interactive ? "crosshair" : undefined }}
        onPointerDown={(e) => {
          dragging.current = true;
          capture(e);
          dragStart(e, false);
        }}
        onPointerMove={(e) => dragging.current && dragStart(e, false)}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          dragStart(e, true);
        }}
      >
        {fn.dim === 2 && heat && <image href={heat} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />}
        {fn.dim === 1 && (
          <>
            <line x1={0} y1={Y(0)} x2={W} y2={Y(0)} stroke="#C9CED6" />
            <line x1={X(0)} y1={0} x2={X(0)} y2={H} stroke="#C9CED6" />
            <path d={curve} fill="none" stroke={theme.color.ink} strokeWidth={2} />
          </>
        )}
        {fn.minima.map(([mx, my], i) => (
          <text key={i} x={X(mx)} y={(fn.dim === 1 ? Y(fn.f(mx, 0)) : Y(my)) + 16} textAnchor="middle" fontSize={11} fill="#3E9B6B">
            최소
          </text>
        ))}
        <polyline points={pathPts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")} fill="none" stroke="#E2733F" strokeWidth={1.8} strokeDasharray={fn.dim === 1 ? "4 3" : undefined} />
        {pathPts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === 0 ? 5 : 2.6} fill={i === 0 ? "#2F6DB5" : "#E2733F"} />
        ))}
        {pathPts.length > 0 && <circle cx={(pathPts[pathPts.length - 1] as [number, number])[0]} cy={(pathPts[pathPts.length - 1] as [number, number])[1]} r={7} fill="#E2733F" stroke="#fff" strokeWidth={2} />}
        <text x={8} y={16} fontSize={12} fill={fn.dim === 2 ? "#fff" : theme.color.asymptote}>
          {fn.name}
        </text>
      </svg>
      <div style={info}>
        <div>
          걸음 {steps} · x = {num(last[0], 3)}
          {fn.dim === 2 && <> · y = {num(last[1], 3)}</>} · f = {num(fn.f(last[0], last[1]), 4)} · |∇f| = {num(Math.hypot(g[0], g[1]), 3)}
        </div>
        <div style={{ color: res.status === "diverged" || climbing ? "#C0392B" : res.status === "converged" ? "#2E7D4F" : theme.color.asymptote }}>{status}</div>
      </div>
      {interactive && (
        <div data-export-skip style={{ ...row, display: "grid", gap: 6 }}>
          <div style={row}>
            {GD_FUNCTIONS.map((f, i) => (
              <button key={f.name} type="button" style={chip(i === fnIdx)} onClick={() => setP({ fn: i, x0: f.start[0], y0: f.start[1], steps: 0, lr: GD_LR[i] ?? 0.05, mom: 0 }, "함수")}>
                {["x²", "두 골짜기", "길쭉한 그릇", "로젠브록"][i]}
              </button>
            ))}
          </div>
          <Slider label="η" name="학습률 η" value={lr} min={0.001} max={1.2} step={0.001} show={lr.toFixed(3)} onSlide={(v, done) => slide((x) => ({ p: { ...x.p, lr: v, steps: x.p?.steps ?? 0 } }), done, "학습률")} />
          <Slider label="μ" name="모멘텀 μ" value={mom} min={0} max={0.95} step={0.05} show={mom.toFixed(2)} onSlide={(v, done) => slide((x) => ({ p: { ...x.p, mom: v } }), done, "모멘텀")} />
          <div style={row}>
            <button type="button" style={btn} onClick={() => setP({ steps: steps + 1 }, "한 걸음")}>
              <StepForward size={14} /> 한 걸음
            </button>
            <button type="button" style={onBtn} onClick={play}>
              {live !== null ? <Pause size={14} /> : <Play size={14} />} {live !== null ? "멈추기" : "재생"}
            </button>
            <button type="button" style={btn} onClick={() => setP({ steps: 0 }, "처음으로")}>
              <RotateCcw size={14} /> 처음으로
            </button>
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: theme.color.asymptote }}>그림을 눌러 끌면 시작점이 바뀌어요</div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────── 원자 오비탈

const LETTERS = ["s", "p", "d", "f"];

function OrbitalView({ item, ir, interactive, W }: Props) {
  const d = ir.data;
  const commit = useCommit(item);
  const l = Math.min(3, Math.max(0, d.p?.l ?? 1));
  const group = ORBITALS[l] as (typeof ORBITALS)[number];
  const m = Math.min(group.length - 1, Math.max(0, d.p?.m ?? 0));
  const o = group[m] as (typeof group)[number];
  const { view, handlers } = useTurntable(item, d.view, { yaw: 30 * DEG, pitch: 20 * DEG });
  const mesh = useMemo(() => orbitalMesh(o, 56, 28), [o]);
  const S = W * 0.42;
  const cx = W / 2;
  const cy = W / 2;
  const patches = useMemo(() => {
    const L = norm([-0.4, 0.75, 0.55]);
    const R = mesh.grid.map((r) => r.map((p) => rotate(p, view as View3)));
    const quads: Array<{ pts: V3[]; z: number; s: number }> = [];
    for (let i = 0; i < R.length - 1; i++)
      for (let j = 0; j < (R[0]?.length ?? 1) - 1; j++) {
        const pts = [R[i]![j]!, R[i + 1]![j]!, R[i + 1]![j + 1]!, R[i]![j + 1]!];
        const s = (mesh.sign[i]![j]! + mesh.sign[i + 1]![j + 1]!) >= 0 ? 1 : -1;
        quads.push({ pts, z: (pts[0]![2] + pts[1]![2] + pts[2]![2] + pts[3]![2]) / 4, s });
      }
    quads.sort((a, b) => a.z - b.z);
    return quads.map(({ pts, s }) => {
      const [p0, p1, p2, p3] = pts as [V3, V3, V3, V3];
      const n = norm(cross([p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]], [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]));
      const I = Math.abs(n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
      const light = Math.round(40 + 38 * I);
      return { d: `M${pts.map((p) => `${(cx + p[0] * S).toFixed(1)},${(cy - p[1] * S).toFixed(1)}`).join("L")}Z`, fill: s > 0 ? `hsl(214 70% ${light}%)` : `hsl(28 85% ${light}%)` };
    });
  }, [mesh, view, W]); // eslint-disable-line react-hooks/exhaustive-deps
  const axes = useMemo(
    () =>
      ([
        [[1.15, 0, 0], "x"],
        [[0, 0, 1.15], "y"],
        [[0, 1.15, 0], "z"],
      ] as Array<[V3, string]>).map(([p, name]) => {
        const r = rotate(p, view as View3);
        return { x: cx + r[0] * S, y: cy - r[1] * S, name };
      }),
    [view, W], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <>
      <Turn handlers={handlers} interactive={interactive} W={W} H={W}>
        {axes.map((a) => (
          <g key={a.name} stroke="#B9C0CC" strokeWidth={1}>
            <line x1={cx} y1={cy} x2={a.x} y2={a.y} strokeDasharray="3 3" />
            <text x={a.x} y={a.y} fontSize={13} fontFamily={MONO} fontStyle="italic" fill={theme.color.asymptote} stroke="none" dx={4}>
              {a.name}
            </text>
          </g>
        ))}
        <g strokeWidth={0.35} strokeLinejoin="round">
          {patches.map((p, i) => (
            <path key={i} d={p.d} fill={p.fill} stroke={p.fill} />
          ))}
        </g>
        <text x={10} y={22} fontSize={18} fontFamily={MONO} fill={theme.color.ink}>
          {o.name}
        </text>
      </Turn>
      <div style={info}>
        l = {l} ({LETTERS[l]}) · 같은 l에 {group.length}개 · 마디면(Y = 0) {l}개 · 파랑 + / 주황 −
      </div>
      {interactive && (
        <div data-export-skip style={{ ...row, display: "grid", gap: 6 }}>
          <div style={row}>
            {LETTERS.map((ch, i) => (
              <button key={ch} type="button" style={chip(i === l)} onClick={() => commit({ p: { ...d.p, l: i, m: 0 } }, "오비탈")}>
                {ch}
              </button>
            ))}
          </div>
          {group.length > 1 && (
            <div style={row}>
              {group.map((g, i) => (
                <button key={g.name} type="button" style={chip(i === m)} onClick={() => commit({ p: { ...d.p, l, m: i } }, "오비탈")}>
                  {g.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ textAlign: "center", fontSize: 12, color: theme.color.asymptote }}>드래그해서 돌리기</div>
        </div>
      )}
    </>
  );
}

type V3 = [number, number, number];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const n = Math.hypot(...a) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

// ─────────────────────────────────────────────────────────── 전자기파

/** 대표 파장 (실제 값) — 이름 · λ(m) */
const BANDS: Array<[string, number]> = [
  ["전파 (라디오)", 1],
  ["마이크로파", 0.01],
  ["적외선", 1e-5],
  ["가시광선 (초록)", 5.2e-7],
  ["자외선", 1e-7],
  ["X선", 1e-9],
];
const sci = (v: number) => {
  const e = Math.floor(Math.log10(v));
  const m = v / 10 ** e;
  return `${m.toFixed(m < 9.95 ? 1 : 0)}×10${String(e).replace("-", "⁻").replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(c)] as string)}`;
};

function EmWave({ item, ir, interactive, W }: Props) {
  const d = ir.data;
  const commit = useCommit(item);
  const slide = useSlide(item);
  const lam = d.p?.lam ?? 1.6;
  const amp = d.p?.amp ?? 0.8;
  const band = Math.min(BANDS.length - 1, Math.max(0, d.p?.band ?? 3));
  const { view, handlers } = useTurntable(item, d.view, { yaw: -35 * DEG, pitch: 18 * DEG });
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let t0 = performance.now();
    const tick = (now: number) => {
      setPhase((p) => p + ((now - t0) / 1000) * 2.2);
      t0 = now;
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);
  const H = Math.round(W * 0.75);
  const S = W * 0.27;
  const cx = W / 2;
  const cy = H / 2;
  const P = (p: V3) => {
    const r = rotate(p, view as View3);
    return [cx + r[0] * S, cy - r[1] * S] as [number, number];
  };
  const xs = Array.from({ length: 121 }, (_, i) => -1.6 + (3.2 * i) / 120);
  const k = (2 * Math.PI) / lam;
  const e = xs.map((x) => [x, amp * Math.sin(k * x - phase), 0] as V3);
  const b = xs.map((x) => [x, 0, amp * Math.sin(k * x - phase)] as V3);
  const line = (pts: V3[]) => `M${pts.map((p) => P(p).map((v) => v.toFixed(1)).join(",")).join("L")}`;
  const stems = (pts: V3[]) => pts.filter((_, i) => i % 5 === 0).map((p) => `M${P([p[0], 0, 0]).join(",")}L${P(p).join(",")}`).join("");
  const [bname, blam] = BANDS[band] as [string, number];
  const c = 2.998e8;
  const a0 = P([-1.75, 0, 0]);
  const a1 = P([1.85, 0, 0]);
  return (
    <>
      <Turn handlers={handlers} interactive={interactive} W={W} H={H}>
        <line x1={a0[0]} y1={a0[1]} x2={a1[0]} y2={a1[1]} stroke={theme.color.ink} strokeWidth={1.4} />
        <path d={`M${a1[0]},${a1[1]}l-10,-5l2,5l-2,5z`} fill={theme.color.ink} transform={`rotate(${(Math.atan2(a1[1] - a0[1], a1[0] - a0[0]) * 180) / Math.PI} ${a1[0]} ${a1[1]})`} />
        <path d={stems(b)} stroke="#2F6DB5" strokeOpacity={0.45} strokeWidth={1} />
        <path d={line(b)} fill="none" stroke="#2F6DB5" strokeWidth={2.2} />
        <path d={stems(e)} stroke="#D64545" strokeOpacity={0.45} strokeWidth={1} />
        <path d={line(e)} fill="none" stroke="#D64545" strokeWidth={2.2} />
        <g fontFamily={MONO} fontSize={15} fontStyle="italic">
          <text x={P([-1.6, amp + 0.15, 0])[0]} y={P([-1.6, amp + 0.15, 0])[1]} fill="#D64545">
            E
          </text>
          <text x={P([-1.6, 0, amp + 0.2])[0]} y={P([-1.6, 0, amp + 0.2])[1]} fill="#2F6DB5">
            B
          </text>
          <text x={a1[0] + 4} y={a1[1] + 16} fill={theme.color.ink}>
            c
          </text>
        </g>
      </Turn>
      <div style={info}>
        <div>
          {bname}: λ = {sci(blam)} m → f = c/λ = {sci(c / blam)} Hz
        </div>
        <div style={{ color: theme.color.asymptote }}>E ⊥ B ⊥ 진행 방향 · E와 B는 같은 위상 · 진공에서 c ≈ 3.0×10⁸ m/s</div>
      </div>
      {interactive && (
        <div data-export-skip style={{ ...row, display: "grid", gap: 6 }}>
          <Slider label="λ" name="파장 λ" value={lam} min={0.6} max={3.2} step={0.05} show={lam.toFixed(2)} onSlide={(v, done) => slide((x) => ({ p: { ...x.p, lam: v } }), done, "파장")} />
          <Slider label="A" name="진폭" value={amp} min={0.2} max={1} step={0.05} show={amp.toFixed(2)} onSlide={(v, done) => slide((x) => ({ p: { ...x.p, amp: v } }), done, "진폭")} />
          <div style={row}>
            <button type="button" style={onBtn} onClick={() => setPlaying((p) => !p)}>
              {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "멈추기" : "진행"}
            </button>
          </div>
          <div style={row}>
            {BANDS.map(([name], i) => (
              <button key={name} type="button" style={chip(i === band)} onClick={() => commit({ p: { ...d.p, band: i, lam: [3, 2.6, 2.1, 1.6, 1.2, 0.7][i] as number } }, "전자기파 종류")}>
                {name.replace(/ \(.+\)/, "")}
              </button>
            ))}
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: theme.color.asymptote }}>드래그해서 돌리기 · 그림의 파장은 보기 좋게 줄인 것</div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────── 행렬식

function Determinant({ item, ir, interactive, W }: Props) {
  const d = ir.data;
  const commit = useCommit(item);
  const slide = useSlide(item);
  const n3 = (d.p?.n ?? 2) === 3;
  const a = d.p?.a ?? 2;
  const b = d.p?.b ?? 1;
  const c = d.p?.c ?? 1;
  const e = d.p?.d ?? 3;
  const m3 = Array.from({ length: 9 }, (_, i) => d.p?.[`m${i}`] ?? [2, 0, 1, 1, 3, 2, 1, 1, 2][i] ?? 0);
  /** 끌고 있는 열벡터 (2×2) — 훅은 2×2·3×3 어느 쪽이든 같은 순서로 */
  const drag = useRef<"u" | "v" | null>(null);

  const cell = (key: string, value: number, label: string) => (
    <input
      key={key}
      type="number"
      aria-label={label}
      value={value}
      step={1}
      onChange={(ev) => {
        const v = Number(ev.target.value);
        if (Number.isFinite(v)) commit({ p: { ...d.p, [key]: v } }, "행렬 값");
      }}
      style={{ width: 46, height: 30, textAlign: "center", border: `1px solid ${theme.color.sub}`, borderRadius: 6, fontSize: 14, fontFamily: MONO, pointerEvents: interactive ? "auto" : "none", background: theme.color.bg, color: theme.color.ink }}
    />
  );
  const bracket = (children: ReactNode, cols: number) => (
    <div style={{ display: "inline-grid", gridTemplateColumns: `repeat(${cols}, auto)`, gap: 4, padding: "4px 8px", borderLeft: `2px solid ${theme.color.ink}`, borderRight: `2px solid ${theme.color.ink}`, borderRadius: 4 }}>{children}</div>
  );

  if (n3) {
    const det = det3(m3);
    const tex = katex.renderToString(`\\det A = ${det3Expansion(m3)}`, { throwOnError: false });
    return (
      <>
        <Parallelepiped item={item} ir={ir} interactive={interactive} W={W} m={m3} />
        <div style={info}>
          <div dangerouslySetInnerHTML={{ __html: tex }} />
          <div style={{ color: theme.color.asymptote }}>세 열벡터가 만드는 평행육면체의 부피 = |det A| = {Math.abs(det)}{det < 0 ? " (방향이 뒤집힘)" : det === 0 ? " — 납작해져 부피 0 (역행렬 없음)" : ""}</div>
        </div>
        {interactive && (
          <div data-export-skip style={{ ...row, display: "grid", gap: 8, justifyItems: "center" }}>
            {bracket(m3.map((v, i) => cell(`m${i}`, v, `${Math.floor(i / 3) + 1}행 ${(i % 3) + 1}열`)), 3)}
            <div style={row}>
              <button type="button" style={btn} onClick={() => commit({ p: { ...d.p, n: 2 } }, "2×2")}>
                2×2로
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  const det = det2(a, b, c, e);
  // 보여 줄 범위: 원점·두 열벡터·합·단위 정사각형이 다 들어가게
  const xsAll = [0, 1, a, b, a + b];
  const ysAll = [0, 1, c, e, c + e];
  const pad = 0.8;
  const xmin = Math.min(...xsAll) - pad;
  const xmax = Math.max(...xsAll) + pad;
  const ymin = Math.min(...ysAll) - pad;
  const ymax = Math.max(...ysAll) + pad;
  const span = Math.max(xmax - xmin, ymax - ymin);
  const H = W;
  const sx = W / span;
  const X = (x: number) => (x - xmin) * sx + (W - (xmax - xmin) * sx) / 2;
  const Y = (y: number) => H - ((y - ymin) * sx + (H - (ymax - ymin) * sx) / 2);
  const toWorld = (px: number, py: number) => ({ x: (px - (W - (xmax - xmin) * sx) / 2) / sx + xmin, y: (H - py - (H - (ymax - ymin) * sx) / 2) / sx + ymin });
  const poly = (pts: Array<[number, number]>) => pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  const move = (e2: RPointerEvent<SVGSVGElement>, done: boolean) => {
    if (!drag.current) return;
    const p = ptr(e2, W, H);
    const w = toWorld(p.x, p.y);
    const sx2 = Math.round(w.x * 2) / 2;
    const sy2 = Math.round(w.y * 2) / 2;
    const which = drag.current;
    slide((x) => ({ p: { ...x.p, ...(which === "u" ? { a: sx2, c: sy2 } : { b: sx2, d: sy2 }) } }), done, "열벡터 끌기");
    if (done) drag.current = null;
  };
  const ticks: number[] = [];
  for (let t = Math.ceil(xmin); t <= Math.floor(xmax); t++) ticks.push(t);
  const ticksY: number[] = [];
  for (let t = Math.ceil(ymin); t <= Math.floor(ymax); t++) ticksY.push(t);
  const fill = det > 0 ? "rgba(47,109,181,0.22)" : det < 0 ? "rgba(214,69,69,0.22)" : "rgba(120,120,120,0.2)";
  const stroke = det > 0 ? "#2F6DB5" : det < 0 ? "#D64545" : "#888";
  const tex = katex.renderToString(`\\det\\begin{pmatrix}${a}&${b}\\\\${c}&${e}\\end{pmatrix} = ${a}\\cdot${e < 0 ? `(${e})` : e} - ${b}\\cdot${c < 0 ? `(${c})` : c} = ${det}`, { throwOnError: false });
  return (
    <>
      <svg
        width={W}
        height={H}
        style={{ display: "block", pointerEvents: interactive ? "auto" : "none", touchAction: interactive ? "none" : undefined }}
        onPointerMove={(ev) => move(ev, false)}
        onPointerUp={(ev) => move(ev, true)}
      >
        <g stroke="#ECEEF2" strokeWidth={1}>
          {ticks.map((t) => (
            <line key={`x${t}`} x1={X(t)} y1={0} x2={X(t)} y2={H} />
          ))}
          {ticksY.map((t) => (
            <line key={`y${t}`} x1={0} y1={Y(t)} x2={W} y2={Y(t)} />
          ))}
        </g>
        <line x1={0} y1={Y(0)} x2={W} y2={Y(0)} stroke="#9AA3B2" />
        <line x1={X(0)} y1={0} x2={X(0)} y2={H} stroke="#9AA3B2" />
        <polygon points={poly([[0, 0], [1, 0], [1, 1], [0, 1]])} fill="rgba(62,155,107,0.18)" stroke="#3E9B6B" strokeDasharray="4 3" />
        <polygon points={poly([[0, 0], [a, c], [a + b, c + e], [b, e]])} fill={fill} stroke={stroke} strokeWidth={1.6} />
        {(
          [
            ["u", a, c, "#2F6DB5"],
            ["v", b, e, "#D9772B"],
          ] as Array<["u" | "v", number, number, string]>
        ).map(([k, x, y, col]) => (
          <g key={k}>
            <line x1={X(0)} y1={Y(0)} x2={X(x)} y2={Y(y)} stroke={col} strokeWidth={2.4} />
            <circle
              cx={X(x)}
              cy={Y(y)}
              r={interactive ? 9 : 5}
              fill={col}
              stroke="#fff"
              strokeWidth={2}
              style={{ cursor: interactive ? "grab" : undefined }}
              onPointerDown={(ev) => {
                drag.current = k;
                try {
                  (ev.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(ev.pointerId);
                } catch {
                  /* 합성 이벤트 */
                }
              }}
            />
            <text x={X(x) + 10} y={Y(y) - 8} fontSize={13} fontFamily={MONO} fill={col}>
              ({x}, {y})
            </text>
          </g>
        ))}
        <text x={X(0.5)} y={Y(0.5) + 4} textAnchor="middle" fontSize={11} fill="#3E9B6B">
          1
        </text>
      </svg>
      <div style={info}>
        <div dangerouslySetInnerHTML={{ __html: tex }} />
        <div style={{ color: theme.color.asymptote }}>
          {det === 0 ? "납작해져 넓이 0 — 역행렬이 없어요" : `넓이 1인 정사각형 → 넓이 ${Math.abs(det)}${det < 0 ? " (뒤집힘: 방향이 반대)" : ""}`}
        </div>
      </div>
      {interactive && (
        <div data-export-skip style={{ ...row, display: "grid", gap: 8, justifyItems: "center" }}>
          {bracket(
            [cell("a", a, "1행 1열"), cell("b", b, "1행 2열"), cell("c", c, "2행 1열"), cell("d", e, "2행 2열")],
            2,
          )}
          <div style={row}>
            <button type="button" style={btn} onClick={() => commit({ p: { ...d.p, n: 3 } }, "3×3")}>
              3×3으로
            </button>
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: theme.color.asymptote }}>파랑·주황 점을 끌면 열벡터가 바뀌어요</div>
        </div>
      )}
    </>
  );
}

function Parallelepiped({ item, ir, interactive, W, m }: Props & { m: number[] }) {
  const { view, handlers } = useTurntable(item, ir.data.view, { yaw: 35 * DEG, pitch: 25 * DEG });
  // 열벡터 (수학 x,y,z → 화면 x, z 위, y 앞)
  const col = (j: number): V3 => [m[j] as number, m[6 + j] as number, m[3 + j] as number];
  const u = col(0);
  const v = col(1);
  const w = col(2);
  const corners: V3[] = [];
  for (const i of [0, 1]) for (const j of [0, 1]) for (const k of [0, 1]) corners.push([u[0] * i + v[0] * j + w[0] * k, u[1] * i + v[1] * j + w[1] * k, u[2] * i + v[2] * j + w[2] * k]);
  // 상자 가운데를 화면 가운데로, 가장 먼 꼭짓점이 화면의 40% 안에
  const mid: V3 = [(u[0] + v[0] + w[0]) / 2, (u[1] + v[1] + w[1]) / 2, (u[2] + v[2] + w[2]) / 2];
  const R = Math.max(0.5, ...corners.map((p) => Math.hypot(p[0] - mid[0], p[1] - mid[1], p[2] - mid[2])));
  const S = (W * 0.4) / R;
  const P = (p: V3) => {
    const r = rotate([p[0] - mid[0], p[1] - mid[1], p[2] - mid[2]], view as View3);
    return [W / 2 + r[0] * S, W / 2 - r[1] * S] as [number, number];
  };
  const edges: Array<[number, number]> = [];
  for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) if ([1, 2, 4].includes(a ^ b)) edges.push([a, b]);
  return (
    <Turn handlers={handlers} interactive={interactive} W={W} H={W}>
      {edges.map(([a, b], i) => {
        const p = P(corners[a] as V3);
        const q = P(corners[b] as V3);
        return <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#6B7FA3" strokeWidth={1.2} />;
      })}
      {(
        [
          [u, "#2F6DB5", "u"],
          [v, "#D9772B", "v"],
          [w, "#3E9B6B", "w"],
        ] as Array<[V3, string, string]>
      ).map(([vec, colr, name]) => {
        const o = P([0, 0, 0]);
        const t = P(vec);
        return (
          <g key={name}>
            <line x1={o[0]} y1={o[1]} x2={t[0]} y2={t[1]} stroke={colr} strokeWidth={2.6} />
            <text x={t[0] + 6} y={t[1] - 6} fill={colr} fontFamily={MONO} fontStyle="italic" fontSize={14}>
              {name}
            </text>
          </g>
        );
      })}
    </Turn>
  );
}

// ─────────────────────────────────────────────────────────── 유클리드의 증명

const EUCLID_STEPS = [
  "직각삼각형의 세 변 위에 정사각형을 그려요. 넓이가 a², b², c²",
  "직각 꼭짓점 C에서 빗변에 수선을 내려 큰 정사각형을 두 직사각형으로 나눠요",
  "삼각형 ABF와 CBE는 합동 (BA = BE, BF = BC, 끼인각 ∠ABF = ∠CBE = 90° + ∠B) — SAS",
  "삼각형 ABF = 정사각형 BCGF의 절반, 삼각형 CBE = 오른쪽 직사각형의 절반 → 정사각형 a² = 오른쪽 직사각형",
  "같은 방법으로 왼쪽: 정사각형 b² = 왼쪽 직사각형",
  "두 직사각형을 합치면 큰 정사각형 → a² + b² = c²",
];

function Euclid({ item, ir, interactive, W }: Props) {
  const d = ir.data;
  const commit = useCommit(item);
  const slide = useSlide(item);
  const t = Math.min(Math.PI - 0.3, Math.max(0.3, d.t ?? 1.15));
  const step = Math.min(EUCLID_STEPS.length - 1, Math.max(0, d.n ?? 0));
  const g = euclidFigure(t);
  const H = Math.round(W * 1.05);
  // 그림 범위 (수학 좌표): x −2.6~2.6, y −2.3~3
  const s = W / 5.4;
  const X = (x: number) => W / 2 + x * s;
  const Y = (y: number) => H * 0.56 - y * s;
  const pts = (...ps: Array<[number, number]>) => ps.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  const dragging = useRef(false);
  const dragC = (e: RPointerEvent<SVGSVGElement>, done: boolean) => {
    const p = ptr(e, W, H);
    const mx = (p.x - W / 2) / s;
    const my = (H * 0.56 - p.y) / s;
    const ang = Math.min(Math.PI - 0.3, Math.max(0.3, Math.atan2(Math.max(0.05, my), mx)));
    slide(() => ({ t: ang }), done, "직각 꼭짓점");
  };
  const label = (p: [number, number], text: string, dx = 0, dy = 0) => (
    <text x={X(p[0]) + dx} y={Y(p[1]) + dy} fontSize={13} fontFamily={MONO} fontStyle="italic" fill={theme.color.ink} textAnchor="middle" dominantBaseline="central">
      {text}
    </text>
  );
  const show = (k: number) => step >= k;
  return (
    <>
      <svg
        width={W}
        height={H}
        style={{ display: "block", pointerEvents: interactive ? "auto" : "none", touchAction: interactive ? "none" : undefined }}
        onPointerDown={(e) => {
          const p = ptr(e, W, H);
          if (Math.hypot(p.x - X(g.C[0]), p.y - Y(g.C[1])) > 30) return;
          dragging.current = true;
          capture(e);
        }}
        onPointerMove={(e) => dragging.current && dragC(e, false)}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          dragC(e, true);
        }}
      >
        {/* 세 정사각형 */}
        <polygon points={pts(g.B, g.C, g.G, g.F)} fill={step === 3 ? "rgba(47,109,181,0.30)" : "rgba(47,109,181,0.14)"} stroke="#2F6DB5" />
        <polygon points={pts(g.C, g.A, g.I, g.H)} fill={step === 4 ? "rgba(217,119,43,0.30)" : "rgba(217,119,43,0.14)"} stroke="#D9772B" />
        <polygon points={pts(g.A, g.B, g.E, g.D)} fill="rgba(62,155,107,0.10)" stroke="#3E9B6B" />
        {/* 수선과 두 직사각형 */}
        {show(1) && (
          <>
            <polygon points={pts(g.K, g.B, g.E, g.L)} fill={step === 3 || step === 5 ? "rgba(47,109,181,0.30)" : "rgba(47,109,181,0.10)"} stroke="none" />
            <polygon points={pts(g.A, g.K, g.L, g.D)} fill={step === 4 || step === 5 ? "rgba(217,119,43,0.30)" : "rgba(217,119,43,0.10)"} stroke="none" />
            <line x1={X(g.C[0])} y1={Y(g.C[1])} x2={X(g.L[0])} y2={Y(g.L[1])} stroke={theme.color.ink} strokeDasharray="5 4" />
          </>
        )}
        {/* 삼각형 (속을 비워 아래 색칠이 보이게) */}
        <polygon points={pts(g.A, g.B, g.C)} fill="rgba(255,255,255,0.55)" stroke="none" />
        {/* 합동 삼각형 */}
        {(step === 2 || step === 3) && (
          <>
            <polygon points={pts(g.A, g.B, g.F)} fill="rgba(156,39,176,0.25)" stroke="#8E24AA" strokeWidth={1.6} />
            <polygon points={pts(g.C, g.B, g.E)} fill="rgba(0,150,136,0.25)" stroke="#00897B" strokeWidth={1.6} />
          </>
        )}
        {step === 4 && (
          <>
            <polygon points={pts(g.B, g.A, g.I)} fill="rgba(156,39,176,0.25)" stroke="#8E24AA" strokeWidth={1.6} />
            <polygon points={pts(g.C, g.A, g.D)} fill="rgba(0,150,136,0.25)" stroke="#00897B" strokeWidth={1.6} />
          </>
        )}
        {/* 삼각형 테두리 (맨 위) */}
        <polygon points={pts(g.A, g.B, g.C)} fill="none" stroke={theme.color.ink} strokeWidth={1.8} />
        {/* 직각 표시 */}
        {(() => {
          const ca: [number, number] = [g.A[0] - g.C[0], g.A[1] - g.C[1]];
          const cb: [number, number] = [g.B[0] - g.C[0], g.B[1] - g.C[1]];
          const k = 0.16;
          const na = Math.hypot(...ca);
          const nb = Math.hypot(...cb);
          const p1: [number, number] = [g.C[0] + (ca[0] / na) * k, g.C[1] + (ca[1] / na) * k];
          const p2: [number, number] = [p1[0] + (cb[0] / nb) * k, p1[1] + (cb[1] / nb) * k];
          const p3: [number, number] = [g.C[0] + (cb[0] / nb) * k, g.C[1] + (cb[1] / nb) * k];
          return <polyline points={pts(p1, p2, p3)} fill="none" stroke={theme.color.ink} />;
        })()}
        {label(g.A, "A", -10, 8)}
        {label(g.B, "B", 10, 8)}
        {label(g.C, "C", 0, -14)}
        {label(g.D, "D", -10, 8)}
        {label(g.E, "E", 10, 8)}
        {label(g.F, "F", 8, 8)}
        {label(g.I, "I", -8, 8)}
        {show(1) && label(g.K, "K", 8, 10)}
        {show(1) && label(g.L, "L", 0, 12)}
        <g fontSize={13} fontFamily={MONO} textAnchor="middle">
          <text x={X((g.B[0] + g.G[0]) / 2)} y={Y((g.B[1] + g.G[1]) / 2)} fill="#2F6DB5">
            a² = {g.a2.toFixed(2)}
          </text>
          <text x={X((g.A[0] + g.H[0]) / 2)} y={Y((g.A[1] + g.H[1]) / 2)} fill="#D9772B">
            b² = {g.b2.toFixed(2)}
          </text>
          <text x={X(0)} y={Y(-1.55)} fill="#3E9B6B">
            c² = 4.00
          </text>
        </g>
        {interactive && <circle cx={X(g.C[0])} cy={Y(g.C[1])} r={10} fill="rgba(47,109,181,0.18)" stroke="#2F6DB5" style={{ cursor: "grab" }} />}
      </svg>
      <div style={info}>
        <div>
          <b>{step + 1}/6</b> {EUCLID_STEPS[step]}
        </div>
        {step === 5 && (
          <div style={{ color: "#2E7D4F" }}>
            {g.a2.toFixed(2)} + {g.b2.toFixed(2)} = {(g.a2 + g.b2).toFixed(2)} = c²
          </div>
        )}
      </div>
      {interactive && (
        <div data-export-skip style={row}>
          <button type="button" style={btn} disabled={step === 0} onClick={() => commit({ n: step - 1 }, "이전 단계")}>
            ◀ 이전
          </button>
          <button type="button" style={onBtn} disabled={step === EUCLID_STEPS.length - 1} onClick={() => commit({ n: step + 1 }, "다음 단계")}>
            다음 ▶
          </button>
          <span style={{ fontSize: 12, color: theme.color.asymptote }}>C를 끌어 모양을 바꿔도 늘 성립</span>
        </div>
      )}
    </>
  );
}

