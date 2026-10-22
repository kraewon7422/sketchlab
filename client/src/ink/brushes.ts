import { penOpts, theme } from "../render/theme";
import { grainDefs } from "./grain";
import { nibStrokePath } from "./nibStroke";
import { centerlinePath, smoothStrokePath, type SmoothOptions } from "./smoothOutline";
import type { Point } from "./types";

/**
 * 펜 종류·선 모양 (삼성노트 펜 패널처럼) — 진행 중 획(PointerCanvas)과 저장된 획(InkLayer)이
 * 이 한 곳의 정의를 같이 써서, 그리는 동안과 다 그린 뒤 모양이 같다.
 *
 * 삼성노트 차례: 만년필 · 캘리그래피 펜 · 펜 · 연필 · 브러시
 *   만년필       필압을 세게 주면 굵게, 살살 주면 가늘게 (잉크 펜촉이 벌어지는 것처럼)
 *   캘리그래피 펜 납작한 펜촉을 일정한 각도로 쓸어 그린다 (nibStroke.ts) — 필압과 상관없이,
 *                오른쪽 위로 긋는 획은 가늘고 세로·가로 획은 굵다. 끝은 비스듬히 잘린다
 *   펜           고른 굵기 (선 모양: 실선 · 끝이 가는 선 · 파선 · 점선)
 *   연필         종이 결에 고정된 흑연 질감 (grain.ts — 지글거리지 않는다) + 투명도
 *   브러시       필압에 크게 반응하는 굵은 붓, 결이 거의 다 묻고 가장자리만 거칠다
 *   형광펜: 둥근 촉 / 사각 촉(가로획은 굵고 세로획은 가늘게)
 * 저장되는 이름(ballpoint …)은 예전 그대로 — 예전 획도 그대로 열린다. "thin"(가는 선)은 예전 획만.
 */
export type PenBrush = "ballpoint" | "fountain" | "calligraphy" | "pencil" | "brush" | "custom";
export type HighlightBrush = "round" | "chisel";
export type Brush = PenBrush | HighlightBrush;
export type LineStyle = "solid" | "taper" | "thin" | "dashed" | "dotted";

export const PEN_BRUSHES: Array<[PenBrush, string]> = [
  ["fountain", "만년필"],
  ["calligraphy", "캘리그래피 펜"],
  ["ballpoint", "펜"],
  ["pencil", "연필"],
  ["brush", "수채화 브러시"],
];
export const HIGHLIGHT_BRUSHES: Array<[HighlightBrush, string]> = [
  ["round", "둥근 촉"],
  ["chisel", "사각 촉"],
];
/** 패널에 보이는 선 모양 (삼성노트: 실선 · 끝이 가는 선 · 파선 · 점선) */
export const LINE_STYLES: Array<[LineStyle, string]> = [
  ["solid", "실선"],
  ["taper", "끝이 가는 선"],
  ["dashed", "파선"],
  ["dotted", "점선"],
];
/** 선 모양을 고를 수 있는 펜 (삼성노트: 펜·연필만) */
export const hasLineStyles = (brush: Brush | undefined): boolean => brush === "ballpoint" || brush === "pencil";

/** 획 하나의 모양 — Stroke에 저장되는 필드와 같다 (없는 필드는 예전 획 = 볼펜·실선) */
export interface StrokeLook {
  tool: "pen" | "highlighter";
  color?: string | undefined;
  width?: number | undefined;
  brush?: Brush | undefined;
  line?: LineStyle | undefined;
  /** 형광펜·연필 투명도 0~1 */
  opacity?: number | undefined;
  /** 가져온 브러시 id (brush = "custom") */
  stamp?: string | undefined;
}

/** 도장 엔진으로 그리는 펜 (연필 · 수채화 · 가져온 브러시) — 다 그은 뒤 그림으로 (stampBrush.ts) */
export const isRasterBrush = (look: StrokeLook): boolean => look.tool === "pen" && (look.brush === "pencil" || look.brush === "brush" || look.brush === "custom") && look.line !== "dashed" && look.line !== "dotted";

/**
 * 만년필 손맛: 필압에 비례, 속도에 반비례 (빨리 쓰면 가늘게) + 굵기를 부드럽게 (저역 필터 0.8/0.2)
 * + 획 끝에서 튕기듯 가늘어짐. 결과는 필압 자리에 넣어 그대로 외곽선 계산에 쓴다.
 */
export function fountainDynamics(points: readonly Point[]): Point[] {
  if (points.length < 3) return [...points];
  const out: Point[] = [];
  let w = -1;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot((points[i] as Point).x - (points[i - 1] as Point).x, (points[i] as Point).y - (points[i - 1] as Point).y);
  let run = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as Point;
    const prev = points[Math.max(0, i - 1)] as Point;
    const d = Math.hypot(p.x - prev.x, p.y - prev.y);
    run += d;
    const v = d / Math.max(1, p.t - prev.t); // px/ms
    const target = p.p * Math.min(1.3, Math.max(0.55, 1.3 - 0.45 * v));
    // 6px 움직일 때마다 목표의 약 20 %씩 따라간다 (표본 간격과 무관)
    const a = 1 - Math.exp(-d / 27);
    w = w < 0 ? target : w + (target - w) * a;
    // 끝 15 %: 튕기듯 가늘어짐
    const left = total - run;
    const flick = total > 0 && left < total * 0.15 ? Math.max(0.2, (left / (total * 0.15)) ** 0.6) : 1;
    out.push({ ...p, p: w * flick });
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function outlineOptions(look: StrokeLook, baseWidth: number): SmoothOptions {
  if (look.tool === "highlighter") {
    return look.brush === "chisel" ? { baseWidth, pressure: () => 1, nib: { angle: Math.PI / 2, min: 0.3 } } : { baseWidth };
  }
  // 예전 획의 "가는 선"
  if (look.line === "thin") return { baseWidth: baseWidth * 0.6, pressure: () => 1 };
  const lineTaper = look.line === "taper" ? { taperEnd: 0.55 } : {};
  switch (look.brush) {
    case "fountain":
      // 필압 0.5(마우스·필압 없음) = 고른 굵기, 세게 누르면 1.8배까지, 살짝 대면 0.2배까지
      return { baseWidth, pressure: (p) => clamp(0.2 + 1.6 * p, 0.2, 1.8) };
    case "pencil":
      return { baseWidth, pressure: (p) => clamp(0.75 + 0.5 * p, 0.75, 1.25), ...lineTaper };
    case "brush":
    case "custom":
      // (그리는 동안의 미리보기 모양 — 다 그으면 도장 엔진 그림으로 바뀐다)
      return { baseWidth, pressure: (p) => clamp(0.1 + 1.9 * p ** 1.1, 0.1, 2) };
    default:
      // 펜: 고른 굵기
      return { baseWidth, pressure: () => 1, ...lineTaper };
  }
}

/** 점선·파선은 외곽선을 칠하지 않고 중심선을 굵기만큼 긋는다 */
export const isLineDrawn = (look: StrokeLook): boolean => look.tool === "pen" && (look.line === "dashed" || look.line === "dotted");

/** 획 → SVG path d */
export function strokeD(points: readonly Point[], look: StrokeLook): string {
  const w = look.width ?? (look.tool === "highlighter" ? penOpts.highlightWidth.default : 2.6);
  if (isLineDrawn(look)) return centerlinePath(points);
  // 캘리그래피: 납작한 펜촉 (오른쪽 위 −45° 방향으로 놓인 펜촉, 가장 가늘 때 굵기의 12 %)
  if (look.tool === "pen" && look.brush === "calligraphy" && look.line !== "thin") return nibStrokePath(points, w * 1.8, -Math.PI / 4, w * 0.22);
  if (look.tool === "pen" && look.brush === "fountain") return smoothStrokePath(fountainDynamics(points), outlineOptions(look, w));
  return smoothStrokePath(points, outlineOptions(look, w));
}

// ─────────────────────────────────────────────────────────── 질감 (종이 결)

/** 캔버스 SVG 안에 한 번 넣는 정의 (연필·브러시 결) — 내보내기에도 같이 담긴다 */
export function inkFilterMarkup(): string {
  return grainDefs();
}

/** 이 획에 결 가리개가 필요한가 (연필·브러시) */
export function strokeMask(look: StrokeLook): string | undefined {
  if (look.tool !== "pen") return undefined;
  if (look.brush === "pencil") return "url(#sl-pencil-mask)";
  if (look.brush === "brush") return "url(#sl-brush-mask)";
  return undefined;
}

/** 획을 그리는 속성 (SVG path에 그대로) */
export function strokeAttrs(look: StrokeLook): {
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  strokeLinecap?: "round";
  strokeLinejoin?: "round";
  opacity?: number;
  mixBlendMode?: "multiply";
  mask?: string;
} {
  const color = look.color ?? theme.color.ink;
  if (look.tool === "highlighter") {
    return { fill: color, opacity: look.opacity ?? penOpts.highlightOpacity, mixBlendMode: "multiply" };
  }
  const mask = strokeMask(look);
  // 연필은 고른 투명도 (예전 연필 획은 0.82) · 수채화·가져온 브러시의 미리보기는 옅게
  const opacity = look.brush === "pencil" ? (look.opacity ?? 0.82) : look.brush === "brush" || look.brush === "custom" ? 0.55 : undefined;
  const extra = { ...(opacity !== undefined ? { opacity } : {}), ...(mask ? { mask } : {}) };
  if (isLineDrawn(look)) {
    const w = look.width ?? 2.6;
    return {
      fill: "none",
      stroke: color,
      strokeWidth: w,
      strokeDasharray: look.line === "dashed" ? `${w * 3.2} ${w * 2.4}` : `0 ${w * 2.2}`,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...extra,
    };
  }
  return { fill: color, ...extra };
}
