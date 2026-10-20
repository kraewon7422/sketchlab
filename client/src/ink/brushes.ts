import { penOpts, theme } from "../render/theme";
import { centerlinePath, smoothStrokePath, type SmoothOptions } from "./smoothOutline";
import type { Point } from "./types";

/**
 * 펜 종류·선 모양 (삼성노트 펜 패널처럼) — 진행 중 획(PointerCanvas)과 저장된 획(InkLayer)이
 * 이 한 곳의 정의를 같이 써서, 그리는 동안과 다 그린 뒤 모양이 같다.
 *
 *   볼펜     필압에 조금 반응 (예전 펜 그대로)
 *   만년필   필압에 크게 반응
 *   캘리그래피  납작한 펜촉 — 획 방향에 따라 굵기가 바뀐다
 *   연필     가늘고 연하게
 *   붓       필압에 아주 크게 반응 + 양 끝이 가늘게
 *   형광펜: 둥근 촉 / 사각 촉(가로획은 굵고 세로획은 가늘게)
 * 선 모양(펜만): 실선 · 가는 실선(필압 없이 일정) · 파선 · 점선
 */
export type PenBrush = "ballpoint" | "fountain" | "calligraphy" | "pencil" | "brush";
export type HighlightBrush = "round" | "chisel";
export type Brush = PenBrush | HighlightBrush;
export type LineStyle = "solid" | "thin" | "dashed" | "dotted";

export const PEN_BRUSHES: Array<[PenBrush, string]> = [
  ["ballpoint", "볼펜"],
  ["fountain", "만년필"],
  ["calligraphy", "캘리그래피"],
  ["pencil", "연필"],
  ["brush", "붓"],
];
export const HIGHLIGHT_BRUSHES: Array<[HighlightBrush, string]> = [
  ["round", "둥근 촉"],
  ["chisel", "사각 촉"],
];
export const LINE_STYLES: Array<[LineStyle, string]> = [
  ["solid", "실선"],
  ["thin", "가는 선"],
  ["dashed", "파선"],
  ["dotted", "점선"],
];

/** 획 하나의 모양 — Stroke에 저장되는 필드와 같다 (없는 필드는 예전 획 = 볼펜·실선) */
export interface StrokeLook {
  tool: "pen" | "highlighter";
  color?: string | undefined;
  width?: number | undefined;
  brush?: Brush | undefined;
  line?: LineStyle | undefined;
  /** 형광펜 투명도 0~1 */
  opacity?: number | undefined;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function outlineOptions(look: StrokeLook, baseWidth: number): SmoothOptions {
  if (look.tool === "highlighter") {
    return look.brush === "chisel" ? { baseWidth, pressure: () => 1, nib: { angle: Math.PI / 2, min: 0.3 } } : { baseWidth };
  }
  if (look.line === "thin") return { baseWidth: baseWidth * 0.6, pressure: () => 1 };
  switch (look.brush) {
    case "fountain":
      return { baseWidth, pressure: (p) => clamp(0.2 + 1.6 * p, 0.25, 1.7) };
    case "calligraphy":
      return { baseWidth: baseWidth * 1.8, pressure: (p) => clamp(0.85 + 0.3 * p, 0.85, 1.15), nib: { angle: -Math.PI / 4, min: 0.16 } };
    case "pencil":
      return { baseWidth: baseWidth * 0.8, pressure: (p) => clamp(0.55 + 0.5 * p, 0.5, 1.05) };
    case "brush":
      return { baseWidth: baseWidth * 1.4, pressure: (p) => clamp(0.08 + 2.1 * p ** 1.4, 0.1, 2.2), taper: baseWidth * 9 };
    default:
      return { baseWidth };
  }
}

/** 점선·파선은 외곽선을 칠하지 않고 중심선을 굵기만큼 긋는다 */
export const isLineDrawn = (look: StrokeLook): boolean => look.tool === "pen" && (look.line === "dashed" || look.line === "dotted");

/** 획 → SVG path d */
export function strokeD(points: readonly Point[], look: StrokeLook): string {
  const w = look.width ?? (look.tool === "highlighter" ? penOpts.highlightWidth.default : 2.6);
  return isLineDrawn(look) ? centerlinePath(points) : smoothStrokePath(points, outlineOptions(look, w));
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
} {
  const color = look.color ?? theme.color.ink;
  if (look.tool === "highlighter") {
    return { fill: color, opacity: look.opacity ?? penOpts.highlightOpacity, mixBlendMode: "multiply" };
  }
  const opacity = look.brush === "pencil" ? 0.82 : undefined;
  if (isLineDrawn(look)) {
    const w = look.width ?? 2.6;
    return {
      fill: "none",
      stroke: color,
      strokeWidth: w,
      strokeDasharray: look.line === "dashed" ? `${w * 3.2} ${w * 2.4}` : `0 ${w * 2.2}`,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...(opacity ? { opacity } : {}),
    };
  }
  return { fill: color, ...(opacity ? { opacity } : {}) };
}
