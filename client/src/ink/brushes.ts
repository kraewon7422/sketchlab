import { penOpts, theme } from "../render/theme";
import { centerlinePath, smoothStrokePath, type SmoothOptions } from "./smoothOutline";
import type { Point } from "./types";

/**
 * 펜 종류·선 모양 (삼성노트 펜 패널처럼) — 진행 중 획(PointerCanvas)과 저장된 획(InkLayer)이
 * 이 한 곳의 정의를 같이 써서, 그리는 동안과 다 그린 뒤 모양이 같다.
 *
 * 삼성노트 차례: 만년필 · 캘리그래피 펜 · 펜 · 연필 · 브러시
 *   만년필       매끈한 잉크, 필압에 살짝 반응
 *   캘리그래피 펜 납작한 펜촉 — 오른쪽 위로 긋는 획은 가늘고 세로·가로 획은 굵다
 *   펜           고른 굵기 (선 모양: 실선 · 끝이 가는 선 · 파선 · 점선)
 *   연필         흑연 알갱이 질감(SVG 필터) + 투명도 (선 모양도 고른다)
 *   브러시       가장자리가 부드럽게 번지는 굵은 붓
 *   형광펜: 둥근 촉 / 사각 촉(가로획은 굵고 세로획은 가늘게)
 * 저장되는 이름(ballpoint …)은 예전 그대로 — 예전 획도 그대로 열린다. "thin"(가는 선)은 예전 획만.
 */
export type PenBrush = "ballpoint" | "fountain" | "calligraphy" | "pencil" | "brush";
export type HighlightBrush = "round" | "chisel";
export type Brush = PenBrush | HighlightBrush;
export type LineStyle = "solid" | "taper" | "thin" | "dashed" | "dotted";

export const PEN_BRUSHES: Array<[PenBrush, string]> = [
  ["fountain", "만년필"],
  ["calligraphy", "캘리그래피 펜"],
  ["ballpoint", "펜"],
  ["pencil", "연필"],
  ["brush", "브러시"],
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
      return { baseWidth, pressure: (p) => clamp(0.6 + 0.8 * p, 0.6, 1.4) };
    case "calligraphy":
      // 오른쪽 위(화면 −45°)로 긋는 획이 가장 가늘다
      return { baseWidth: baseWidth * 1.6, pressure: (p) => clamp(0.9 + 0.2 * p, 0.9, 1.1), nib: { angle: -Math.PI / 4, min: 0.12 } };
    case "pencil":
      return { baseWidth, pressure: (p) => clamp(0.7 + 0.5 * p, 0.7, 1.2), ...lineTaper };
    case "brush":
      return { baseWidth, pressure: (p) => clamp(0.85 + 0.3 * p, 0.85, 1.15) };
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
  return isLineDrawn(look) ? centerlinePath(points) : smoothStrokePath(points, outlineOptions(look, w));
}

// ─────────────────────────────────────────────────────────── 질감 (SVG 필터)

/** 브러시 가장자리 번짐 단계 (월드 px) — 굵기에 맞는 것을 고른다 */
const SOFT_STEPS = [0.4, 0.8, 1.5, 2.5, 4, 6.5];
export const softFilterId = (width: number): string => {
  const want = width * 0.07;
  let k = 0;
  SOFT_STEPS.forEach((s, i) => {
    if (Math.abs(s - want) < Math.abs((SOFT_STEPS[k] as number) - want)) k = i;
  });
  return `sl-soft-${k}`;
};

/** 연필 알갱이 + 브러시 번짐 필터 (캔버스 SVG 안에 한 번 — 내보내기에도 같이 담긴다) */
export function inkFilterMarkup(): string {
  const pencil =
    `<filter id="sl-pencil" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>` +
    // 잡음의 빨강 값 → 알파: 0.5 언저리에서 들쭉날쭉 (흑연 알갱이)
    `<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.4 0 0 0 1.95" result="grain"/>` +
    `<feComposite in="SourceGraphic" in2="grain" operator="in"/>` +
    `</filter>`;
  const soft = SOFT_STEPS.map(
    (s, i) =>
      `<filter id="sl-soft-${i}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceGraphic" stdDeviation="${s}" result="b"/>` +
      // 번진 가장자리를 살짝 단단하게 (가운데는 진하게, 끝만 부드럽게)
      `<feComponentTransfer in="b"><feFuncA type="linear" slope="1.35" intercept="-0.05"/></feComponentTransfer>` +
      `</filter>`,
  ).join("");
  return pencil + soft;
}

/** 이 획에 필터가 필요한가 (연필·브러시) */
export function strokeFilter(look: StrokeLook): string | undefined {
  if (look.tool !== "pen") return undefined;
  if (look.brush === "pencil") return "url(#sl-pencil)";
  if (look.brush === "brush") return `url(#${softFilterId(look.width ?? 2.6)})`;
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
  filter?: string;
} {
  const color = look.color ?? theme.color.ink;
  if (look.tool === "highlighter") {
    return { fill: color, opacity: look.opacity ?? penOpts.highlightOpacity, mixBlendMode: "multiply" };
  }
  const filter = strokeFilter(look);
  // 연필은 고른 투명도 (예전 연필 획은 0.82)
  const opacity = look.brush === "pencil" ? (look.opacity ?? 0.82) : undefined;
  const extra = { ...(opacity !== undefined ? { opacity } : {}), ...(filter ? { filter } : {}) };
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
