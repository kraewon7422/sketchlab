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

  it("빠르게 쓰면 보정이 거의 꺼진다 — 모서리가 둥글게 깎이지 않는다", () => {
    // 3 px/ms로 오른쪽 → 아래로 꺾는 "ㄱ" (4ms 간격)
    const pts: Point[] = [];
    for (let i = 0; i <= 20; i++) pts.push(pt(i * 12, 0, i * 4));
    for (let i = 1; i <= 20; i++) pts.push(pt(240, i * 12, 80 + i * 4));
    const out = run(9, pts);
    // 꺾인 모서리(240, 0) 근처를 지나간다 (보정이 켜져 있으면 몇 px씩 안쪽으로 깎인다)
    const nearest = Math.min(...out.map((p) => Math.hypot(p.x - 240, p.y)));
    expect(nearest).toBeLessThan(6);
  });

  it("천천히 그을 때는 그대로 다듬는다 (줄 길이 유지)", () => {
    const st = createStabilizer(6);
    for (let i = 0; i < 40; i++) st.push(pt(i * 0.5, 0, i * 8)); // 0.06 px/ms
    expect(st.currentRadius()).toBeGreaterThan(5);
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

  it("같은 손놀림이면 샘플 간격(60Hz·240Hz)과 무관하게 같은 선", () => {
    // 같은 속도(0.25 px/ms)·같은 손떨림(±2px, 25ms 주기)을 240Hz와 60Hz로 찍는다
    const motion = (stepMs: number) =>
      Array.from({ length: Math.round(1200 / stepMs) }, (_, i) => {
        const t = i * stepMs;
        return pt(t * 0.25, 100 + 2 * Math.sin((t / 25) * Math.PI), t);
      });
    const dev = (pts: Point[]) => Math.max(...pts.slice(10).map((p) => Math.abs(p.y - 100)));
    const fast = dev(run(4, motion(4)));
    const slow = dev(run(4, motion(16)));
    expect(fast).toBeLessThan(1);
    expect(slow).toBeLessThan(1);
    expect(Math.abs(fast - slow)).toBeLessThan(0.6);
  });
});
