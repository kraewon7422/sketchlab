import type { View } from "./sample";

/**
 * 축별 확대·축소 (그래프의 [축] 두 번 톡 → 축 패널).
 * factor < 1 = 확대(범위가 좁아진다), > 1 = 축소. 가운데는 그대로.
 */
export function zoomRange(min: number, max: number, factor: number): [number, number] {
  const c = (min + max) / 2;
  const half = ((max - min) / 2) * factor;
  return [nice(c - half), nice(c + half)];
}

/** 2D 그래프: 한 축 또는 두 축을 함께 */
export function zoomView(view: View, axis: "x" | "y" | "both", factor: number): View {
  const out = { ...view };
  if (axis !== "y") [out.xmin, out.xmax] = zoomRange(view.xmin, view.xmax, factor);
  if (axis !== "x") [out.ymin, out.ymax] = zoomRange(view.ymin, view.ymax, factor);
  return out;
}

/** 1:1로 맞추기 — x 범위는 그대로, y 범위를 상자 비율(높이/폭)에 맞춘다 (y 가운데는 그대로) */
export function equalAspect(view: View, boxAspect: number): View {
  const half = ((view.xmax - view.xmin) * boxAspect) / 2;
  const c = (view.ymin + view.ymax) / 2;
  return { ...view, ymin: nice(c - half), ymax: nice(c + half) };
}

/** 직접 친 범위가 쓸 만한가 (숫자, min < max, 너무 좁지 않게) */
export function validRange(min: number, max: number): boolean {
  return Number.isFinite(min) && Number.isFinite(max) && max - min > 1e-9;
}

/** 부동소수 찌꺼기(0.30000000000000004) 없이 */
function nice(v: number): number {
  return Number(v.toPrecision(10));
}
