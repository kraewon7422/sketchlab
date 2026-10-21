import { describe, expect, it } from "vitest";
import { fountainDynamics } from "./brushes";
import { placeDabs } from "./stampBrush";
import type { Point } from "./types";

const line = (n: number, dx: number, dt: number, p = 0.5): Point[] => Array.from({ length: n }, (_, i) => ({ x: i * dx, y: 0, p, t: i * dt }));

describe("도장 브러시 엔진", () => {
  it("도장은 간격마다 고르게 찍힌다", () => {
    const dabs = placeDabs(line(11, 10, 8), () => 2);
    expect(dabs.length).toBeGreaterThan(48);
    expect(dabs.length).toBeLessThan(53);
    for (let i = 2; i < dabs.length; i++) expect(Math.hypot(dabs[i]!.x - dabs[i - 1]!.x, dabs[i]!.y - dabs[i - 1]!.y)).toBeCloseTo(2, 0);
  });
  it("필압이 도장 자리까지 이어진다", () => {
    const pts = line(3, 50, 8).map((p, i) => ({ ...p, p: i === 0 ? 0 : 1 }));
    const dabs = placeDabs(pts, () => 5);
    expect(dabs[0]!.p).toBe(0);
    expect(dabs[dabs.length - 1]!.p).toBeGreaterThan(0.9);
  });
});

describe("만년필 손맛", () => {
  it("빨리 쓰면 가늘고, 천천히 쓰면 굵다", () => {
    const mid = (pts: Point[]) => fountainDynamics(pts)[Math.floor(pts.length / 2)]!.p;
    expect(mid(line(40, 6, 2))).toBeLessThan(mid(line(40, 6, 30)) * 0.75);
  });
  it("획 끝은 튕기듯 가늘어진다", () => {
    const d = fountainDynamics(line(40, 5, 16));
    expect(d[d.length - 1]!.p).toBeLessThan(d[20]!.p * 0.35);
  });
});
