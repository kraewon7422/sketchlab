import { smoothStrokePath } from "../ink/smoothOutline";
import { unionBBoxes } from "../ink/geometry";
import type { Stroke } from "../ink/types";
import { ink } from "../render/theme";

/**
 * 손글씨 획 → AI에 보낼 그림 (흰 바탕 PNG).
 * 화면 DOM이 아니라 획 데이터에서 바로 그린다 — 확대·이동 상태나 겹친 그림과 상관없이 같은 그림.
 * 긴 변을 maxSide로 맞추고, 아주 작은 글씨는 키워서 모델이 읽기 쉽게 한다.
 */

export interface InkSvg {
  svg: string;
  width: number;
  height: number;
}

export function strokesToSvg(strokes: readonly Stroke[], maxSide = 1024, minSide = 160): InkSvg | null {
  const pen = strokes.filter((s) => s.tool !== "highlighter");
  if (pen.length === 0) return null;
  const box = unionBBoxes(pen.map((s) => s.bbox));
  const pad = 24;
  const w = box.maxX - box.minX + pad * 2;
  const h = box.maxY - box.minY + pad * 2;
  const k = Math.min(maxSide / Math.max(w, h), Math.max(1, minSide / Math.min(w, h)));
  const W = Math.round(w * k);
  const H = Math.round(h * k);
  // AI가 읽을 그림은 색과 상관없이 진한 검정 (연한 색 펜도 잘 보이게)
  const paths = pen
    .map((s) => `<path d="${smoothStrokePath(s.points, { baseWidth: s.width ?? ink.width })}" fill="#000"/>`)
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${box.minX - pad} ${box.minY - pad} ${w} ${h}">` +
    `<rect x="${box.minX - pad}" y="${box.minY - pad}" width="${w}" height="${h}" fill="#fff"/>${paths}</svg>`;
  return { svg, width: W, height: H };
}
