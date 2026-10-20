import { describe, expect, it } from "vitest";
import { parseSpecial, special, zeta } from "./special";

describe("특수 곡선", () => {
  it("ζ(2) = π²/6, ζ(−1) = −1/12 (해석적 연속)", () => {
    expect(zeta([2, 0])[0]).toBeCloseTo(Math.PI ** 2 / 6, 6);
    expect(zeta([-1, 0])[0]).toBeCloseTo(-1 / 12, 6);
  });

  it("임계선의 첫 영점들 (t ≈ 14.1347, 21.0220, 25.0109)에서 |ζ| ≈ 0", () => {
    for (const t of [14.134725, 21.02204, 25.010858]) expect(special("zetaCritical", t, {})).toBeLessThan(1e-4);
    expect(special("zetaCritical", 18, {})).toBeGreaterThan(0.5);
  });

  it("푸리에 사각파: 항이 많을수록 1에 가깝다 (가운데), 테일러: N이 크면 sin", () => {
    expect(Math.abs(special("fourierSquare", Math.PI / 2, { N: 200 }) - 1)).toBeLessThan(0.01);
    expect(special("taylorSin", 2, { N: 10 })).toBeCloseTo(Math.sin(2), 8);
    expect(special("taylorSin", 2, { N: 1 })).toBe(2);
  });

  it("입력 이름", () => {
    expect(parseSpecial("리만 제타 임계선")).toBe("zetaCritical");
    expect(parseSpecial("제타 영점")).toBe("zetaCritical");
    expect(parseSpecial("푸리에 급수")).toBe("fourierSquare");
    expect(parseSpecial("taylor sin")).toBe("taylorSin");
    expect(parseSpecial("y=x^2")).toBeNull();
  });
});
