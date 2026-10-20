import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import type { ShapeKind } from "../ink/shapes";
import type { TapePattern } from "../ink/tape";
import type { HighlightBrush, LineStyle, PenBrush } from "../ink/brushes";
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
  /** 도형 도구로 그릴 도형 */
  shapeKind: ShapeKind;
  /** 정사각형·정원·45°로 맞추기 */
  shapeSquare: boolean;
  /** 즐겨 찾는 펜 (삼성노트처럼 한 번에 바꾸기) */
  presets: PenPreset[];
  /** 손가락으로는 그리지 않기 — 펜을 아직 안 써도 처음부터 손가락은 이동·선택만 */
  penOnly: boolean;
  /** 어두운 화면 */
  dark: boolean;
  /** 올가미: apple = 두른 고리 안 / samsung = 그은 선이 닿은 것까지 (끝을 시작점으로 잇지 않는다) */
  lassoStyle: "apple" | "samsung";
  /** 마스킹 테이프 색·폭(월드 px) */
  tapeColor: string;
  tapeWidth: number;
  tapePattern: TapePattern;
  /** 펜 종류·선 모양 (삼성노트 펜 패널) */
  penBrush: PenBrush;
  penLine: LineStyle;
  /** 형광펜 촉·투명도 */
  highlightBrush: HighlightBrush;
  highlightOpacity: number;
  /** 직선 자동 보정 (거의 곧게 그은 획 → 곧은 선) — 도구마다 따로 */
  straightPen: boolean;
  straightHighlight: boolean;
  straightTape: boolean;
}

export interface PenPreset {
  kind: PenKind;
  color: string;
  width: number;
  /** 펜 종류·선 모양·투명도 (없으면 볼펜·실선 — 예전에 저장한 즐겨찾기) */
  brush?: PenBrush | HighlightBrush;
  line?: LineStyle;
  opacity?: number;
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
  shapeKind: "line",
  shapeSquare: false,
  presets: [
    { kind: "pen", color: "#1A1A1A", width: 1.8 },
    { kind: "pen", color: "#DC2626", width: 2.6 },
    { kind: "pen", color: "#2563EB", width: 4 },
  ],
  penOnly: false,
  dark: false,
  lassoStyle: "apple",
  tapeColor: penOpts.tapeColors[0],
  tapeWidth: penOpts.tapeWidth.default,
  tapePattern: "stripes",
  penBrush: "ballpoint",
  penLine: "solid",
  highlightBrush: "round",
  highlightOpacity: penOpts.highlightOpacity,
  straightPen: false,
  straightHighlight: false,
  straightTape: false,
};

const PEN_BRUSH_KEYS: readonly PenBrush[] = ["ballpoint", "fountain", "calligraphy", "pencil", "brush"];
const LINE_KEYS: readonly LineStyle[] = ["solid", "thin", "dashed", "dotted"];

const SHAPES: readonly ShapeKind[] = ["line", "arrow", "rect", "ellipse", "triangle", "axes"];

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
      // 예전 기본값(0.45)을 그대로 쓰던 사람은 새 기본값으로 — 직접 고른 값은 그대로 둔다
      smoothing: typeof v.smoothing === "number" && v.smoothing !== 0.45 ? Math.min(1, Math.max(0, v.smoothing)) : DEFAULTS.smoothing,
      eraserMode: v.eraserMode === "area" ? "area" : "stroke",
      eraserSize: clamp(v.eraserSize, penOpts.eraserSize),
      shapeKind: SHAPES.includes(v.shapeKind as ShapeKind) ? (v.shapeKind as ShapeKind) : "line",
      shapeSquare: v.shapeSquare === true,
      presets: Array.isArray(v.presets)
        ? v.presets
            .filter((p): p is PenPreset => !!p && (p.kind === "pen" || p.kind === "highlighter") && /^#[0-9A-Fa-f]{6}$/.test(p.color) && typeof p.width === "number")
            .slice(0, 12)
        : DEFAULTS.presets,
      penOnly: v.penOnly === true,
      dark: v.dark === true,
      lassoStyle: v.lassoStyle === "samsung" ? "samsung" : "apple",
      tapeColor: hex(v.tapeColor, DEFAULTS.tapeColor),
      tapeWidth: clamp(v.tapeWidth, penOpts.tapeWidth),
      tapePattern: v.tapePattern === "plain" || v.tapePattern === "dots" || v.tapePattern === "grid" ? v.tapePattern : "stripes",
      penBrush: PEN_BRUSH_KEYS.includes(v.penBrush as PenBrush) ? (v.penBrush as PenBrush) : "ballpoint",
      penLine: LINE_KEYS.includes(v.penLine as LineStyle) ? (v.penLine as LineStyle) : "solid",
      highlightBrush: v.highlightBrush === "chisel" ? "chisel" : "round",
      highlightOpacity: typeof v.highlightOpacity === "number" ? Math.min(0.9, Math.max(0.1, v.highlightOpacity)) : DEFAULTS.highlightOpacity,
      straightPen: v.straightPen === true,
      straightHighlight: v.straightHighlight === true,
      straightTape: v.straightTape === true,
    };
  } catch {
    return DEFAULTS;
  }
}

function persist(s: PenSettings): void {
  try {
    const { kind, penColor, highlightColor, penWidth, highlightWidth, recentPen, recentHighlight, smoothing, eraserMode, eraserSize, shapeKind, shapeSquare, presets, penOnly, dark, lassoStyle, tapeColor, tapeWidth, tapePattern, penBrush, penLine, highlightBrush, highlightOpacity, straightPen, straightHighlight, straightTape } = s;
    localStorage.setItem(
      KEY,
      JSON.stringify({ kind, penColor, highlightColor, penWidth, highlightWidth, recentPen, recentHighlight, smoothing, eraserMode, eraserSize, shapeKind, shapeSquare, presets, penOnly, dark, lassoStyle, tapeColor, tapeWidth, tapePattern, penBrush, penLine, highlightBrush, highlightOpacity, straightPen, straightHighlight, straightTape }),
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
export function currentStrokeStyle(s: PenSettings = penStore.getState()): {
  tool: PenKind;
  color: string;
  width: number;
  brush: PenBrush | HighlightBrush;
  line: LineStyle;
  opacity?: number;
  straight: boolean;
} {
  const highlighter = s.kind === "highlighter";
  return highlighter
    ? { tool: s.kind, color: s.highlightColor, width: s.highlightWidth, brush: s.highlightBrush, line: "solid", opacity: s.highlightOpacity, straight: s.straightHighlight }
    : { tool: s.kind, color: s.penColor, width: s.penWidth, brush: s.penBrush, line: s.penLine, straight: s.straightPen };
}
