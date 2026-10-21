import { describe, expect, it } from "vitest";
import { snapShape } from "./holdShape";
import type { Point } from "./types";

/** 떨리는 손 (같은 씨앗 = 같은 떨림) */
function jitter(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s / 2147483647 - 0.5) * 2;
  };
}
function path(verts: Array<[number, number]>, closed: boolean, perEdge = 25, noise = 1.5, seed = 3): Point[] {
  const r = jitter(seed);
  const out: Point[] = [];
  const n = verts.length;
  const edges = closed ? n : n - 1;
  for (let i = 0; i < edges; i++) {
    const [ax, ay] = verts[i] as [number, number];
    const [bx, by] = verts[(i + 1) % n] as [number, number];
    for (let j = 0; j < perEdge; j++) {
      const t = j / perEdge;
      out.push({ x: ax + (bx - ax) * t + r() * noise, y: ay + (by - ay) * t + r() * noise, p: 0.5, t: out.length * 8 });
    }
  }
  const [ex, ey] = closed ? (verts[0] as [number, number]) : (verts[n - 1] as [number, number]);
  out.push({ x: ex, y: ey, p: 0.5, t: out.length * 8 });
  return out;
}
const curvePts = (f: (t: number) => [number, number], n = 90, noise = 1.2, seed = 5): Point[] => {
  const r = jitter(seed);
  return Array.from({ length: n + 1 }, (_, i) => {
    const [x, y] = f(i / n);
    return { x: x + r() * noise, y: y + r() * noise, p: 0.5, t: i * 8 };
  });
};

describe("멈추면 도형으로 (삼성노트처럼, 잉크 그대로)", () => {
  it("삐뚤게 그은 선 → 곧은 선", () => {
    expect(snapShape(path([[0, 0], [200, 12]], false, 60, 2))?.kind).toBe("line");
  });
  it("ㄱ자 꺾은선 → 곧은 두 변", () => {
    expect(snapShape(path([[0, 0], [150, 0], [150, 120]], false))?.kind).toBe("polyline");
  });
  it("둥글게 휜 획 → 매끈한 곡선", () => {
    const s = snapShape(curvePts((t) => [t * 200, 80 * Math.sin(t * Math.PI)]));
    expect(s?.kind).toBe("curve");
  });
  it("동그라미 → 정원, 납작하면 타원", () => {
    expect(snapShape(curvePts((t) => [100 + 60 * Math.cos(t * 2 * Math.PI), 100 + 58 * Math.sin(t * 2 * Math.PI)]))?.kind).toBe("circle");
    expect(snapShape(curvePts((t) => [100 + 100 * Math.cos(t * 2 * Math.PI), 100 + 45 * Math.sin(t * 2 * Math.PI)]))?.kind).toBe("ellipse");
  });
  it("네모 → 반듯한 사각형, 사다리꼴 → 다각형, 세모 → 다각형", () => {
    expect(snapShape(path([[0, 0], [160, 3], [158, 120], [2, 118]], true))?.kind).toBe("rect");
    expect(snapShape(path([[40, 0], [120, 0], [160, 100], [0, 100]], true))?.kind).toBe("polygon");
    const tri = snapShape(path([[0, 120], [70, 0], [140, 120]], true));
    expect(tri?.kind).toBe("polygon");
  });
  it("한붓에 그은 오각별 → 반듯한 별", () => {
    const tips: Array<[number, number]> = Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + ((i * 4 * Math.PI) / 5);
      return [100 + 80 * Math.cos(a), 100 + 80 * Math.sin(a)];
    });
    expect(snapShape(path(tips, true))?.kind).toBe("star");
  });
  it("하트 → 하트", () => {
    const heart = curvePts((u) => {
      const t = u * Math.PI * 2;
      return [100 + 5 * 16 * Math.sin(t) ** 3, 100 - 5 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
    }, 120, 1.5);
    expect(snapShape(heart)?.kind).toBe("heart");
  });
  it("글씨처럼 복잡한 획은 그대로 (null)", () => {
    const scribble = curvePts((t) => [t * 200, 40 * Math.sin(t * 6 * Math.PI) + 30 * Math.cos(t * 13)], 150);
    expect(snapShape(scribble)).toBeNull();
  });
  it("결과는 잉크 점 — 필압·시간을 이어받는다", () => {
    const s = snapShape(path([[0, 0], [200, 12]], false, 60, 2))!;
    expect(s.points.every((p) => p.p === 0.5)).toBe(true);
    expect(s.points[s.points.length - 1]!.t).toBeGreaterThan(s.points[0]!.t);
  });
});
