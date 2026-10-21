import { describe, expect, it } from "vitest";
import { simplifyEpsilonAt, simplifyRDP } from "./simplify";
import type { Point } from "./types";

/** 원 위의 점들과 줄인 꺾은선 사이의 가장 큰 어긋남 */
function maxGap(dense: Point[], kept: Point[]): number {
  const segDist = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  return Math.max(...dense.map((p) => Math.min(...kept.slice(1).map((b, i) => segDist(p, kept[i] as Point, b)))));
}

describe("확대해 쓴 획은 손을 떼도 각지지 않는다", () => {
  // 1000 % 확대해서 반지름 3(월드 px) 원 — 화면에서는 반지름 30px
  const circle: Point[] = Array.from({ length: 200 }, (_, i) => {
    const a = (i / 199) * Math.PI * 2;
    return { x: 3 * Math.cos(a), y: 3 * Math.sin(a), p: 0.5, t: i };
  });
  it("허용 오차는 화면 기준 0.6px", () => {
    expect(simplifyEpsilonAt(1)).toBe(0.6);
    expect(simplifyEpsilonAt(10)).toBeCloseTo(0.06);
    expect(simplifyEpsilonAt(0.5)).toBe(0.6);
  });
  it("배율 10에서 줄여도 화면에서 0.6px 이내로 원에 붙어 있다 (예전 고정 0.6은 6px 어긋남)", () => {
    const k = 10;
    const kept = simplifyRDP(circle, simplifyEpsilonAt(k));
    expect(maxGap(circle, kept) * k).toBeLessThanOrEqual(0.6 + 1e-9);
    // 예전 방식은 화면에서 눈에 띄게 각졌다
    const old = simplifyRDP(circle, 0.6);
    expect(maxGap(circle, old) * k).toBeGreaterThan(2);
  });
});
