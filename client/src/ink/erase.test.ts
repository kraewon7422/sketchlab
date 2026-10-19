import { describe, expect, it } from "vitest";
import { cutStroke } from "./erase";
import type { Point } from "./types";

const pt = (x: number, y: number): Point => ({ x, y, p: 0.5, t: x });

describe("영역 지우기 — 획 자르기", () => {
  it("긴 직선(점 2개)의 한가운데를 지우면 두 조각으로 나뉜다", () => {
    const pieces = cutStroke([pt(0, 0), pt(100, 0)], 50, 0, 10);
    expect(pieces).toHaveLength(2);
    const [left, right] = pieces as [Point[], Point[]];
    expect(left[left.length - 1]?.x).toBeCloseTo(40, 6);
    expect(right[0]?.x).toBeCloseTo(60, 6);
    expect(right[right.length - 1]?.x).toBe(100);
  });

  it("안 닿으면 null (그대로 둔다)", () => {
    expect(cutStroke([pt(0, 0), pt(100, 0)], 50, 30, 10)).toBeNull();
  });

  it("끝을 지우면 한 조각만 남는다", () => {
    const pieces = cutStroke([pt(0, 0), pt(100, 0)], 100, 0, 10);
    expect(pieces).toHaveLength(1);
    expect(pieces?.[0]?.[pieces[0].length - 1]?.x).toBeCloseTo(90, 6);
  });

  it("획 전체가 원 안이면 빈 목록 (획이 사라진다)", () => {
    expect(cutStroke([pt(0, 0), pt(5, 0), pt(8, 2)], 4, 0, 20)).toEqual([]);
  });

  it("여러 점 획의 중간 점들을 지운다", () => {
    const line = Array.from({ length: 11 }, (_, i) => pt(i * 10, 0));
    const pieces = cutStroke(line, 50, 0, 12);
    expect(pieces).toHaveLength(2);
    // 왼쪽 조각은 x ≤ 38, 오른쪽은 x ≥ 62
    expect(Math.max(...(pieces?.[0] ?? []).map((p) => p.x))).toBeCloseTo(38, 6);
    expect(Math.min(...(pieces?.[1] ?? []).map((p) => p.x))).toBeCloseTo(62, 6);
  });

  it("필압도 잘린 자리에서 이어진다 (보간)", () => {
    const a = { x: 0, y: 0, p: 0.2, t: 0 };
    const b = { x: 100, y: 0, p: 0.8, t: 100 };
    const pieces = cutStroke([a, b], 50, 0, 10);
    expect(pieces?.[0]?.[1]?.p).toBeCloseTo(0.44, 6);
  });
});
