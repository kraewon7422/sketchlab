import { describe, expect, it } from "vitest";
import { straightenStroke } from "./straighten";
import type { Point } from "./types";

const pts = (f: (t: number) => [number, number], n = 30): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const [x, y] = f(i / (n - 1));
    return { x, y, p: 0.3 + 0.4 * (i / (n - 1)), t: i * 8 };
  });

describe("직선 자동 보정", () => {
  it("살짝 떨린 직선 → 시작점과 끝점을 잇는 곧은 선 (필압 변화는 남는다)", () => {
    const wobbly = pts((t) => [100 + 300 * t, 200 + Math.sin(t * 20) * 3]);
    const s = straightenStroke(wobbly);
    expect(s).not.toBeNull();
    if (!s) return;
    const first = s[0] as Point;
    const last = s[s.length - 1] as Point;
    expect(first.x).toBe(100);
    expect(last.x).toBe(400);
    for (const p of s) expect(Math.abs(p.y - (first.y + ((last.y - first.y) * (p.x - 100)) / 300))).toBeLessThan(1e-9);
    expect(first.p).toBeLessThan(last.p);
  });

  it("곡선·글씨·짧은 획은 그대로 둔다", () => {
    expect(straightenStroke(pts((t) => [100 + 200 * t, 200 + 60 * Math.sin(t * Math.PI)]))).toBeNull();
    expect(straightenStroke(pts((t) => [100 + 200 * t, 200 + (t < 0.5 ? 0 : 40)]))).toBeNull();
    expect(straightenStroke(pts((t) => [100 + 10 * t, 100]))).toBeNull();
    // 갔다가 되돌아온 획 (그은 길이가 직선보다 훨씬 길다)
    expect(straightenStroke(pts((t) => [100 + 300 * (t < 0.5 ? t * 2 : 2 - t * 2) * 0.9 + 30 * t, 100]))).toBeNull();
  });
});
