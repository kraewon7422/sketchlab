import { describe, expect, it } from "vitest";
import { equalAspect, validRange, zoomRange, zoomView } from "./axisZoom";

describe("축별 확대·축소", () => {
  it("가운데를 그대로 두고 범위만 줄이고 늘린다", () => {
    expect(zoomRange(-5, 5, 0.8)).toEqual([-4, 4]);
    expect(zoomRange(0, 10, 2)).toEqual([-5, 15]);
    expect(zoomRange(-0.1, 0.2, 1)).toEqual([-0.1, 0.2]); // 소수 찌꺼기 없이
  });

  it("x만 / y만 / 둘 다", () => {
    const v = { xmin: -5, xmax: 5, ymin: -2, ymax: 4 };
    expect(zoomView(v, "x", 2)).toEqual({ xmin: -10, xmax: 10, ymin: -2, ymax: 4 });
    expect(zoomView(v, "y", 0.5)).toEqual({ xmin: -5, xmax: 5, ymin: -0.5, ymax: 2.5 });
    expect(zoomView(v, "both", 2)).toEqual({ xmin: -10, xmax: 10, ymin: -5, ymax: 7 });
  });

  it("1:1 맞추기: y 길이 = x 길이 × 상자 비율, y 가운데 유지", () => {
    expect(equalAspect({ xmin: -5, xmax: 5, ymin: 0, ymax: 100 }, 0.75)).toEqual({ xmin: -5, xmax: 5, ymin: 46.25, ymax: 53.75 });
  });

  it("직접 친 범위 검사", () => {
    expect(validRange(-1, 1)).toBe(true);
    expect(validRange(1, 1)).toBe(false);
    expect(validRange(2, 1)).toBe(false);
    expect(validRange(Number.NaN, 1)).toBe(false);
  });
});
