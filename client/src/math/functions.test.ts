import { describe, expect, it } from "vitest";
import { analyze, normalizeInput, toFunction } from "./latex";

const f = (input: string) => {
  const a = analyze(input);
  if (a.kind !== "explicit") throw new Error(`그래프 아님: ${a.kind}`);
  const g = toFunction(a.rhs, ["x", ...a.params]);
  return (x: number) => g(x);
};

describe("컴퓨터·해석 함수 이름", () => {
  it("활성화 함수: sigmoid, relu, leaky relu, softplus, swish, gelu, tanh", () => {
    expect(f("y=sigmoid(x)")(0)).toBeCloseTo(0.5);
    expect(f("y=sigmoid(2x)")(1)).toBeCloseTo(1 / (1 + Math.exp(-2)));
    expect([f("y=relu(x)")(-3), f("y=relu(x)")(2)]).toEqual([0, 2]);
    expect(f("y=leakyrelu(x)")(-2)).toBeCloseTo(-0.02);
    expect(f("y=softplus(x)")(0)).toBeCloseTo(Math.log(2));
    expect(f("y=swish(x)")(1)).toBeCloseTo(1 / (1 + Math.exp(-1)));
    expect(f("y=gelu(x)")(1)).toBeCloseTo(0.8413, 3);
    expect(f("y=tanh(x)")(1)).toBeCloseTo(Math.tanh(1));
  });

  it("계단·부호, 제타·감마·erf", () => {
    expect([f("y=step(x)")(-1), f("y=step(x)")(2)]).toEqual([0, 1]);
    expect(f("y=sign(x)")(-4)).toBe(-1);
    expect(f("y=zeta(x)")(2)).toBeCloseTo(Math.PI ** 2 / 6);
    expect(f("y=zeta(x)")(-2)).toBeCloseTo(0);
    expect(f("y=gamma(x)")(5)).toBeCloseTo(24);
    expect(f("y=erf(x)")(0)).toBeCloseTo(0);
  });

  it("괄호 안 식·중첩도", () => {
    expect(normalizeInput("y=relu(sin(x))")).toContain("\\max(0,\\sin(x))");
    expect(f("y=sigmoid(relu(x))")(-5)).toBeCloseTo(0.5);
  });
});
