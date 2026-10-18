import { describe, expect, it } from "vitest";
import { analyze, definiteIntegral, normalizeInput, toFunction } from "./latex";

describe("입력 철자 보정", () => {
  it("평문 함수 이름에 역슬래시, sqrt() → \\sqrt{}, pi → \\pi", () => {
    expect(normalizeInput("y=sin(x)")).toBe("y=\\sin(x)");
    expect(normalizeInput("y = sqrt(x+1)")).toBe("y = \\sqrt{x+1}");
    expect(normalizeInput("y=2*pi*x")).toBe("y=2*\\pi*x");
    expect(normalizeInput("y=x**2")).toBe("y=x^2");
  });

  it("이미 LaTeX인 부분은 그대로", () => {
    expect(normalizeInput("y=\\sin x")).toBe("y=\\sin x");
    expect(normalizeInput("\\int_0^2 x^2\\,dx")).toBe("\\int_0^2 x^2\\,dx");
  });
});

describe("식 분류", () => {
  it("y = x² − 3 → 명시적 함수, 계수 없음", () => {
    const a = analyze("y=x^2-3");
    expect(a.kind).toBe("explicit");
    if (a.kind !== "explicit") return;
    expect(a.params).toEqual([]);
    expect(toFunction(a.rhs, ["x"])(2)).toBe(1);
  });

  it("f(x)= 형식, 등호 없는 식도 명시적 함수", () => {
    expect(analyze("f(x)=x^2").kind).toBe("explicit");
    expect(analyze("x^3-x").kind).toBe("explicit");
  });

  it("y = a sin(bx) → 계수 a, b가 슬라이더 후보, 삼각함수라 π 눈금", () => {
    const a = analyze("y=a\\sin(bx)");
    if (a.kind !== "explicit") throw new Error(a.kind);
    expect(a.params).toEqual(["a", "b"]);
    expect(a.trig).toBe(true);
    expect(toFunction(a.rhs, ["x", ...a.params])(Math.PI / 2, 2, 1)).toBeCloseTo(2, 12);
  });

  it("x² + y² = 4 → 음함수", () => {
    const a = analyze("x^2+y^2=4");
    if (a.kind !== "implicit") throw new Error(a.kind);
    expect(toFunction(a.F, ["x", "y"])(2, 0)).toBeCloseTo(0, 12);
  });

  it("x = 3 (수직선)도 음함수로 그린다", () => {
    expect(analyze("x=3").kind).toBe("implicit");
  });

  it("r = 1 + cos θ → 극좌표", () => {
    expect(analyze("r=1+\\cos\\theta").kind).toBe("polar");
  });

  it("∫₀² x² dx → 정적분, 정확한 값 8/3", () => {
    const a = analyze("\\int_0^2 x^2\\,dx");
    if (a.kind !== "integral") throw new Error(a.kind);
    expect([a.from, a.to]).toEqual([0, 2]);
    const v = definiteIntegral(a.body, a.variable, a.from, a.to);
    expect(v.value).toBeCloseTo(8 / 3, 10);
    expect(v.exact).toBe("\\frac{8}{3}");
  });

  it("극한이 π인 적분도 숫자로", () => {
    const a = analyze("\\int_0^{\\pi}\\sin x\\,dx");
    if (a.kind !== "integral") throw new Error(a.kind);
    expect(a.to).toBeCloseTo(Math.PI, 12);
    expect(definiteIntegral(a.body, a.variable, a.from, a.to).value).toBeCloseTo(2, 10);
  });

  it("그래프가 아닌 식(합 공식)은 수식으로만", () => {
    expect(analyze("\\sum_{k=1}^{n} k=\\frac{n(n+1)}{2}").kind).toBe("formula");
  });

  it("깨진 식은 오류 (조용히 넘어가지 않는다)", () => {
    expect(analyze("x^{").kind).toBe("error");
    expect(analyze("   ").kind).toBe("error");
  });

  it("실수 그래프: 정의되지 않는 값은 NaN (복소수 아님)", () => {
    const sq = analyze("y=\\sqrt{x}");
    if (sq.kind !== "explicit") throw new Error(sq.kind);
    expect(toFunction(sq.rhs, ["x"])(-1)).toBeNaN();
    const ln = analyze("y=\\ln x");
    if (ln.kind !== "explicit") throw new Error(ln.kind);
    expect(toFunction(ln.rhs, ["x"])(-1)).toBeNaN();
  });

  it("세제곱근은 실수 (교과서): (−8)^(1/3) = −2", () => {
    const a = analyze("y=x^{1/3}");
    if (a.kind !== "explicit") throw new Error(a.kind);
    expect(toFunction(a.rhs, ["x"])(-8)).toBeCloseTo(-2, 12);
  });
});
