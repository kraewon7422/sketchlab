import type { SceneIR } from "@sketchlab/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ObjectItem } from "../ink/types";
import { sessionStore } from "../store/session";
import { theme } from "./theme";
import type { useTurntable } from "./useTurntable";

/**
 * 그림 객체들(FigureObject · ScienceFigures)이 함께 쓰는 부품:
 *   지금 IR 읽기 · 기록(Undo 1단계) · 끄는 동안 미리보기 · 재생 · 화소 그림 · 단추 · −/+ · 슬라이더 · 돌리는 틀
 */
export type FigIR = Extract<SceneIR, { kind: "figure" }>;
export type FigData = FigIR["data"];
export const DEG = Math.PI / 180;
export const MONO = "KaTeX_Main, 'Times New Roman', serif";
export const num = (v: number, d = 3) => v.toFixed(d).replace("-", "−");

export function current(item: ObjectItem): FigIR | null {
  const now = sessionStore.getState().items.find((i) => i.id === item.id);
  return now && now.kind === "object" && now.ir.kind === "figure" ? now.ir : null;
}

export function useCommit(item: ObjectItem) {
  return (patch: Partial<FigData>, label: string) => {
    const now = current(item);
    if (now) sessionStore.getState().commitObjectIR(item.id, now, { ...now, data: { ...now.data, ...patch } }, label);
  };
}

/** 끄는 중엔 미리보기, 놓을 때 한 번 기록 (Undo 1단계) */
export function useSlide(item: ObjectItem) {
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
export function useProgress(): [number, (ms: number) => void, () => void] {
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
export function useImage(draw: (w: number, h: number) => Uint8ClampedArray, w: number, h: number, key: string): string | null {
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

export const btn = { minWidth: 30, minHeight: 30, padding: "3px 10px", border: `1px solid ${theme.color.sub}`, borderRadius: 999, background: theme.color.bg, color: theme.color.ink, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap", pointerEvents: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 } as const;
export const onBtn = { ...btn, background: theme.color.accent, color: "#fff", border: `1px solid ${theme.color.accent}` } as const;

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
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
export function Slider({ label, name, value, min, max, step, show, onSlide }: { label: ReactNode; name: string; value: number; min: number; max: number; step: number; show: string; onSlide: (v: number, done: boolean) => void }) {
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

export function Turn({ handlers, interactive, W, H, children }: { handlers: ReturnType<typeof useTurntable>["handlers"]; interactive: boolean; W: number; H: number; children: ReactNode }) {
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible", pointerEvents: interactive ? "auto" : "none", touchAction: "none", cursor: interactive ? "grab" : undefined }} {...handlers}>
      <rect x={0} y={0} width={W} height={H} fill="transparent" />
      {children}
    </svg>
  );
}

