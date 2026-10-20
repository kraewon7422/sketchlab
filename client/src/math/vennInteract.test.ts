import { describe, expect, it } from "vitest";
import { parseVenn, regionAt, regionMask, simplestExpr, toggleRegion, vennCircles } from "./venn";

describe("벤 다이어그램 직접 칠하기", () => {
  const abc = ["A", "B", "C"];
  const maskOf = (expr: string) => regionMask({ sets: abc, expr });

  it("빈 세 집합으로 시작 ('벤 3')", () => {
    expect(parseVenn("벤 3")).toEqual({ sets: abc, expr: "∅" });
    expect(parseVenn("벤 AB")).toEqual({ sets: ["A", "B"], expr: "∅" });
  });

  it("칠한 영역 → 가장 짧은 식 (교과서 모양)", () => {
    expect(simplestExpr(abc, maskOf("A∩B"))).toBe("A∩B");
    expect(simplestExpr(abc, maskOf("(A∪B)∩C"))).toMatch(/^(\(A∪B\)∩C|C∩\(A∪B\))$/);
    expect(simplestExpr(abc, maskOf("(A∪B∪C)ᶜ"))).toBe("(A∪B∪C)ᶜ");
    expect(simplestExpr(abc, maskOf("A−B−C")).length).toBeLessThanOrEqual(5);
  });

  it("모든 256가지 칠하기가 식으로 — 그 식을 다시 읽으면 같은 영역", () => {
    for (let mask = 0; mask < 256; mask++) {
      const expr = simplestExpr(abc, mask);
      expect(regionMask({ sets: abc, expr }), `${mask} → ${expr}`).toBe(mask);
    }
  });

  it("영역 톡: 가운데(셋 다) 칠하기 → A∩B∩C, 한 번 더 → ∅", () => {
    const [a, b, c] = vennCircles(3) as Array<{ cx: number; cy: number }>;
    const mid = { x: ((a?.cx ?? 0) + (b?.cx ?? 0) + (c?.cx ?? 0)) / 3, y: ((a?.cy ?? 0) + (b?.cy ?? 0) + (c?.cy ?? 0)) / 3 };
    const region = regionAt(3, mid.x, mid.y);
    expect(region).toBe(7);
    const once = toggleRegion({ sets: abc, expr: "∅" }, region);
    expect(once).toBe("A∩B∩C");
    expect(toggleRegion({ sets: abc, expr: once }, region)).toBe("∅");
    // 바깥 영역(번호 0)
    expect(regionAt(3, 0.02, 0.02)).toBe(0);
  });
});
