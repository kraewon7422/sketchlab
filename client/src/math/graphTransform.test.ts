import { describe, expect, it } from "vitest";
import { buildFromInput } from "./build";
import { analyze, toFunction } from "./latex";
import { mirrorLatex, numbersToParams, paramsToNumbers, shiftLatex, shiftNames } from "./graphTransform";

/** 식을 숫자 함수로 (문자 값 넣어서) */
const fnOf = (latex: string, params: Record<string, number> = {}) => {
  const a = analyze(latex);
  if (a.kind !== "explicit") throw new Error(`explicit가 아님: ${latex}`);
  const f = toFunction(a.rhs, ["x", ...a.params]);
  return (x: number) => f(x, ...a.params.map((n) => params[n] as number));
};

describe("계수 조정", () => {
  it("숫자 → 문자 (지수는 그대로), 값이 같은 그래프", () => {
    const r = numbersToParams("y=2x^2+3x-1")!;
    expect(r.latex).toBe("y=ax^2+bx-c");
    expect(r.params.map((p) => [p.name, p.value])).toEqual([
      ["a", 2],
      ["b", 3],
      ["c", 1],
    ]);
    const f = fnOf(r.latex, { a: 2, b: 3, c: 1 });
    expect(f(1.5)).toBeCloseTo(2 * 2.25 + 4.5 - 1);
    expect(buildFromInput(r.latex).ok).toBe(true);
  });
  it("명령 속 글자·이미 쓴 문자는 피한다", () => {
    const r = numbersToParams("y=2\\sin(3x)", ["a"])!;
    expect(r.latex).toBe("y=b\\sin(cx)");
  });
  it("숫자로 되돌리기 — 음수는 부호를 합친다", () => {
    expect(paramsToNumbers("y=ax^2+bx-c", [{ name: "a", value: 2 }, { name: "b", value: -3 }, { name: "c", value: -1.5 }])).toBe("y=2x^2-3x+1.5");
    expect(paramsToNumbers("y=a\\sin(bx)", [{ name: "a", value: -1 }, { name: "b", value: 2 }])).toBe("y=-1\\sin(2x)");
  });
});

describe("평행이동", () => {
  it("y=f(x) → y=f(x−h)+k, 꼭짓점이 (h, k)로", () => {
    const names = shiftNames("y=x^2")!;
    const s = shiftLatex("y=x^2", names)!;
    expect(s).toBe("y=(x-h)^2+k");
    const f = fnOf(s, { h: 2, k: -1 });
    expect(f(2)).toBeCloseTo(-1);
    expect(f(3)).toBeCloseTo(0);
  });
  it("\\exp 속 x는 건드리지 않는다, h·k가 쓰였으면 u·v", () => {
    expect(shiftLatex("y=\\exp(x)", { h: "h", k: "k" })).toBe("y=\\exp((x-h))+k");
    expect(shiftNames("y=hx+k")).toEqual({ h: "u", k: "v" });
  });
});

describe("대칭이동", () => {
  const at = (latex: string, x: number) => fnOf(latex)(x);
  it("x축 대칭: y = −f(x)", () => {
    const m = mirrorLatex("y=x^2+1", "xAxis")!;
    expect(at(m, 2)).toBeCloseTo(-5);
    expect(mirrorLatex(m, "xAxis")).toBe("y=x^2+1"); // 두 번이면 제자리
  });
  it("y축 대칭: y = f(−x)", () => {
    const m = mirrorLatex("y=x^3+x", "yAxis")!;
    expect(at(m, 2)).toBeCloseTo(-10);
    expect(mirrorLatex(m, "yAxis")).toBe("y=x^3+x");
  });
  it("원점 대칭: y = −f(−x)", () => {
    const m = mirrorLatex("y=x^2+1", "origin")!;
    expect(at(m, 2)).toBeCloseTo(-5);
  });
  it("y=x 대칭: x와 y를 바꾼다 (역함수)", () => {
    expect(mirrorLatex("y=x^2", "yEqualsX")).toBe("x=y^2");
    expect(mirrorLatex("y=e^{x}", "yEqualsX")).toBe("x=e^{y}");
    expect(buildFromInput("x=y^2").ok).toBe(true);
  });
});
