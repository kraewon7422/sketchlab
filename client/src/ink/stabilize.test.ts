import { describe, expect, it } from "vitest";
import { createStabilizer } from "./stabilize";
import type { Point } from "./types";

const pt = (x: number, y: number, t: number): Point => ({ x, y, p: 0.5, t });

/** 직선 y=100 위에 ±2px 손떨림 */
function shaky(n: number, step = 4): Point[] {
  return Array.from({ length: n }, (_, i) => pt(i * 2, 100 + (i % 2 === 0 ? 2 : -2), i * step));
}

const run = (r: number, pts: Point[]) => {
  const st = createStabilizer(r);
  return pts.map((p) => st.push(p)).filter((p): p is Point => p !== null);
};

describe("흔들림 보정 (줄로 끄는 붓)", () => {
  it("끄면 입력 그대로", () => {
    const raw = shaky(20);
    expect(run(0, raw)).toEqual(raw);
  });

  it("줄 길이보다 작은 손떨림은 거의 사라진다 (±2px → ±0.5px 미만)", () => {
    const out = run(4, shaky(120)).slice(10);
    expect(out.length).toBeGreaterThan(20);
    expect(Math.max(...out.map((p) => Math.abs(p.y - 100)))).toBeLessThan(0.5);
  });

  it("줄보다 큰 떨림(±3px, 5px마다)도 1px 미만으로 줄인다", () => {
    const pts = Array.from({ length: 200 }, (_, i) => pt(i * 5, 100 + (i % 2 ? 3 : -3), i * 8));
    const out = run(8, pts).slice(10);
    expect(Math.max(...out.map((p) => Math.abs(p.y - 100)))).toBeLessThan(1);
  });

  it("펜을 떼면 마지막 실제 점까지 이어진다", () => {
    const st = createStabilizer(4);
    const raw = shaky(30);
    raw.forEach((p) => st.push(p));
    const last = raw[raw.length - 1] as Point;
    const end = st.finish(last).at(-1) as Point;
    expect(end.x).toBe(last.x);
    expect(end.y).toBe(last.y);
  });

  it("샘플 간격(60Hz·240Hz)과 무관하다", () => {
    const xy = (pts: Point[]) => pts.map((p) => [p.x, p.y]);
    expect(xy(run(4, shaky(60, 4)))).toEqual(xy(run(4, shaky(60, 16))));
  });
});
