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
  /** 펜·형광펜 각각 마지막에 쓴 색 (#RRGGBB) */
  penColor: string;
  highlightColor: string;
  /** 굵기 px — 펜·형광펜 따로 */
  penWidth: number;
  highlightWidth: number;
  /** 직접 고른 색 (최근 것부터, 펜·형광펜 따로) */
  recentPen: string[];
  recentHighlight: string[];
  /** 흔들림 보정 0(끔) ~ 1(강함) */
  smoothing: number;
  /** 지우개: 획 지우기(닿은 획 통째로) / 영역 지우기(문지른 부분만) */
  eraserMode: "stroke" | "area";
  /** 지우개 반지름 (화면 px) */
  eraserSize: number;
}

export interface PenState extends PenSettings {
  set(patch: Partial<PenSettings>): void;
  /** 색을 고른다 — 미리 정해 둔 색이 아니면 "최근 색"에 올린다 */
  pickColor(color: string): void;
}

const KEY = "sketchlab.pen";
const RECENT_MAX = 8;

const DEFAULTS: PenSettings = {
  kind: "pen",
  penColor: penOpts.colors[0],
  highlightColor: penOpts.highlightColors[0],
  penWidth: penOpts.penWidth.default,
  highlightWidth: penOpts.highlightWidth.default,
  recentPen: [],
  recentHighlight: [],
  smoothing: penOpts.defaultSmoothing,
  eraserMode: "stroke",
  eraserSize: penOpts.eraserSize.default,
};

const clamp = (v: unknown, r: { min: number; max: number; default: number }) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : r.default;
const hex = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v) ? v.toUpperCase() : fallback);
const hexList = (v: unknown) =>
  Array.isArray(v) ? v.filter((c): c is string => typeof c === "string" && /^#[0-9A-Fa-f]{6}$/.test(c)).slice(0, RECENT_MAX) : [];

function load(): PenSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<PenSettings> & { size?: number };
    // 처음 버전은 굵기를 0·1·2 단계로 저장했다 → 그 단계의 px로 옮긴다
    const legacy = v.size === 0 || v.size === 1 || v.size === 2 ? v.size : null;
    return {
      kind: v.kind === "highlighter" ? "highlighter" : "pen",
      penColor: hex(v.penColor, DEFAULTS.penColor),
      highlightColor: hex(v.highlightColor, DEFAULTS.highlightColor),
      penWidth: legacy !== null && v.penWidth === undefined ? ([1.8, 2.6, 4][legacy] as number) : clamp(v.penWidth, penOpts.penWidth),
      highlightWidth:
        legacy !== null && v.highlightWidth === undefined ? ([12, 18, 26][legacy] as number) : clamp(v.highlightWidth, penOpts.highlightWidth),
      recentPen: hexList(v.recentPen),
      recentHighlight: hexList(v.recentHighlight),
      smoothing: typeof v.smoothing === "number" ? Math.min(1, Math.max(0, v.smoothing)) : DEFAULTS.smoothing,
      eraserMode: v.eraserMode === "area" ? "area" : "stroke",
      eraserSize: clamp(v.eraserSize, penOpts.eraserSize),
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(s: PenSettings): void {
  try {
    const { kind, penColor, highlightColor, penWidth, highlightWidth, recentPen, recentHighlight, smoothing, eraserMode, eraserSize } = s;
    localStorage.setItem(
      KEY,
      JSON.stringify({ kind, penColor, highlightColor, penWidth, highlightWidth, recentPen, recentHighlight, smoothing, eraserMode, eraserSize }),
    );
  } catch {
    /* 저장이 막혀도 이번 세션 동안은 그대로 쓴다 */
  }
}

export const penStore = createStore<PenState>((set, get) => ({
  ...load(),
  set(patch) {
    set(patch);
    persist(get());
  },
  pickColor(color) {
    const c = color.toUpperCase();
    const s = get();
    const highlighter = s.kind === "highlighter";
    const presets: readonly string[] = highlighter ? penOpts.highlightColors : penOpts.colors;
    const recent = highlighter ? s.recentHighlight : s.recentPen;
    const nextRecent = presets.includes(c) ? recent : [c, ...recent.filter((r) => r !== c)].slice(0, RECENT_MAX);
    set(highlighter ? { highlightColor: c, recentHighlight: nextRecent } : { penColor: c, recentPen: nextRecent });
    persist(get());
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
    width: highlighter ? s.highlightWidth : s.penWidth,
  };
}
