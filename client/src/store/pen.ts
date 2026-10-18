import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { penOpts } from "../render/theme";

/**
 * 지금 고른 펜 (색·굵기·종류·흔들림 보정). 문서가 아니라 도구 설정이라 Undo 대상이 아니다.
 * 기기에 기억해 둔다 (다음에 열어도 같은 펜) — 저장이 막힌 브라우저에서도 동작은 한다.
 */
export type PenKind = "pen" | "highlighter";

export interface PenSettings {
  kind: PenKind;
  /** 펜·형광펜 각각 마지막에 쓴 색 */
  penColor: string;
  highlightColor: string;
  /** penOpts.sizes 의 인덱스 (0 가늘게 · 1 보통 · 2 굵게) */
  size: 0 | 1 | 2;
  /** 흔들림 보정 0(끔) ~ 1(강함) */
  smoothing: number;
}

export interface PenState extends PenSettings {
  set(patch: Partial<PenSettings>): void;
}

const KEY = "sketchlab.pen";

const DEFAULTS: PenSettings = {
  kind: "pen",
  penColor: penOpts.colors[0],
  highlightColor: penOpts.highlightColors[0],
  size: 1,
  smoothing: penOpts.defaultSmoothing,
};

function load(): PenSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<PenSettings>;
    return {
      kind: v.kind === "highlighter" ? "highlighter" : "pen",
      penColor: typeof v.penColor === "string" ? v.penColor : DEFAULTS.penColor,
      highlightColor: typeof v.highlightColor === "string" ? v.highlightColor : DEFAULTS.highlightColor,
      size: v.size === 0 || v.size === 2 ? v.size : 1,
      smoothing: typeof v.smoothing === "number" ? Math.min(1, Math.max(0, v.smoothing)) : DEFAULTS.smoothing,
    };
  } catch {
    return DEFAULTS;
  }
}

export const penStore = createStore<PenState>((set, get) => ({
  ...load(),
  set(patch) {
    set(patch);
    const { kind, penColor, highlightColor, size, smoothing } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ kind, penColor, highlightColor, size, smoothing }));
    } catch {
      /* 저장이 막혀도 이번 세션 동안은 그대로 쓴다 */
    }
  },
}));

export function usePen<T>(selector: (state: PenState) => T): T {
  return useStore(penStore, selector);
}

/** 지금 설정으로 그릴 획의 모양 */
export function currentStrokeStyle(s: PenSettings = penStore.getState()): { tool: PenKind; color: string; width: number } {
  const highlighter = s.kind === "highlighter";
  return {
    tool: s.kind,
    color: highlighter ? s.highlightColor : s.penColor,
    width: (highlighter ? penOpts.highlightSizes : penOpts.sizes)[s.size],
  };
}
