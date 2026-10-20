import { describe, expect, it } from "vitest";
import { buildFromInput } from "./build";
import { analyze, toFunction } from "./latex";

/** 부등식이 (x, y)에서 참인가 — 그래프가 칠하는 규칙 그대로 */
function holds(input: string, x: number, y: number): boolean {
  const a = analyze(input);
  if (a.kind !== "inequality") throw new Error(`부등식 아님: ${a.kind}`);
  return a.parts.every((p) => {
    const v = toFunction(p.F, ["x", "y"])(x, y);
    return p.strict ? v < 0 : v <= 0;
  });
}

describe("부등식 영역", () => {
  it("y > x² — 포물선 위쪽", () => {
    expect(holds("y>x^2", 0, 1)).toBe(true);
    expect(holds("y>x^2", 2, 1)).toBe(false);
    expect(holds("y>x^2", 1, 1)).toBe(false); // 경계는 < 라 안 칠한다
    expect(holds("y\\ge x^2", 1, 1)).toBe(true);
  });

  it("원 안·사슬 부등식·바닥 함수", () => {
    expect(holds("x^2+y^2\\le 4", 1, 1)).toBe(true);
    expect(holds("x^2+y^2\\le 4", 2, 1)).toBe(false);
    expect(holds("1<x+y<3", 1, 1)).toBe(true);
    expect(holds("1<x+y<3", 2, 2)).toBe(false);
    expect(holds("1<x+y<3", 0, 0.5)).toBe(false);
    expect(holds("y\\ge\\lfloor x\\rfloor", 2.7, 2.1)).toBe(true);
    expect(holds("y\\ge\\lfloor x\\rfloor", 2.7, 1.9)).toBe(false);
  });

  it("부등식 → 영역 그래프 (함수 종류 inequality)", () => {
    const r = buildFromInput("y>x^2");
    if (!r.ok || r.ir.kind !== "plot2d") throw new Error("plot2d 아님");
    expect(r.ir.data.functions[0]?.kind).toBe("inequality");
    // x, y가 없는 부등식은 그냥 식
    const f = buildFromInput("a^2+b^2\\ge 2ab");
    expect(f.ok && f.ir.kind).toBe("formula");
  });
});
