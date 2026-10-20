import { describe, expect, it } from "vitest";
import { checkSteps, cleanLine, splitEquals, verifyAnswer } from "./stepCheck";

const statuses = (lines: string[]) => checkSteps(lines).map((r) => r.status);

describe("풀이 검산", () => {
  it("식 변형: 전개가 맞으면 ✓, 틀리면 ✗ + 반례", () => {
    expect(statuses(["(x+1)^2", "x^2+2x+1"])).toEqual(["start", "ok"]);
    const r = checkSteps(["(x+1)^2", "x^2+x+1"]);
    expect(r[1]?.status).toBe("bad");
    expect(r[1]?.note).toMatch(/x\s=\s.*에서 .* ≠ /);
  });

  it("= 로 이어 쓴 줄과 한 줄 사슬", () => {
    expect(statuses(["(a+b)^2", "= a^2+2ab+b^2"])).toEqual(["start", "ok"]);
    expect(statuses(["(a-b)(a+b) = a^2-b^2"])).toEqual(["ok"]);
    expect(statuses(["(a-b)(a+b) = a^2 - 2ab - b^2"])).toEqual(["bad"]);
    expect(statuses(["2\\cdot 3 + 4 = 10 = 5\\cdot 2"])).toEqual(["ok"]);
  });

  it("일차방정식 풀이: 이항이 맞으면 ✓, 부호 실수는 ✗", () => {
    expect(statuses(["2x+3=7", "2x=4", "x=2"])).toEqual(["start", "ok", "ok"]);
    const bad = checkSteps(["2x+3=7", "2x=10", "x=5"]);
    expect(bad.map((r) => r.status)).toEqual(["start", "bad", "ok"]);
    expect(bad[1]?.note).toMatch(/x\s=\s2/);
  });

  it("이차방정식: 해를 하나 빠뜨리거나 더하면 ✗", () => {
    expect(statuses(["x^2-5x+6=0", "(x-2)(x-3)=0"])).toEqual(["start", "ok"]);
    expect(statuses(["x^2=9", "x=3"])).toEqual(["start", "bad"]); // −3을 잃었다
    expect(statuses(["x^2-4x+4=0", "(x-2)^2=0"])).toEqual(["start", "ok"]); // 접하는 해(중근)
  });

  it("두 변수 방정식: 양변을 같은 수로 나누면 ✓", () => {
    expect(statuses(["2x+4y=8", "x+2y=4"])).toEqual(["start", "ok"]);
    expect(statuses(["2x+4y=8", "x+2y=8"])).toEqual(["start", "bad"]);
  });

  it("삼각함수·지수 항등식, 숫자 계산", () => {
    expect(statuses(["\\sin^2 x + \\cos^2 x", "1"])).toEqual(["start", "ok"]);
    expect(statuses(["e^{2x}", "(e^x)^2"])).toEqual(["start", "ok"]);
    expect(statuses(["3+4\\cdot 2 = 14"])).toEqual(["bad"]);
  });

  it("미분 계산 (합성함수)", () => {
    // d/dx sin(x²) = 2x cos(x²) — 계산 결과 줄끼리의 비교
    expect(statuses(["2x\\cos(x^2)", "\\cos(x^2)\\cdot 2x"])).toEqual(["start", "ok"]);
    expect(statuses(["2x\\cos(x^2)", "\\cos(2x)"])).toEqual(["start", "bad"]);
  });

  it("연습 문제 답 확인", () => {
    expect(verifyAnswer("3x-5=10", "x=5")).toBe(true);
    expect(verifyAnswer("3x-5=10", "x=4")).toBe(false);
    expect(verifyAnswer("x^2-5x+6=0", "x=2, x=3")).toBe(true);
    expect(verifyAnswer("x^2-5x+6=0", "x=2")).toBe(false); // 해를 빠뜨림
    expect(verifyAnswer("x^2=16", "x=\\pm 4")).toBe(true);
    expect(verifyAnswer("2^3+\\frac{1}{2}", "8.5")).toBe(true);
    expect(verifyAnswer("2^3+\\frac{1}{2}", "\\frac{17}{2}")).toBe(true);
    expect(verifyAnswer("2^3+\\frac{1}{2}", "9")).toBe(false);
    expect(verifyAnswer("x+y=3", "x=1")).toBeNull(); // 확인할 수 없음
  });

  it("읽지 못한 줄은 ?, 앞 표시(⇒ ∴)와 마침표는 떼어 읽는다", () => {
    expect(cleanLine("\\therefore x=2.")).toEqual({ body: "x=2", continues: false });
    expect(cleanLine("= x+1")).toEqual({ body: "x+1", continues: true });
    expect(splitEquals("f(x=1) = 2")).toEqual(["f(x", "1) = 2"].length === 2 ? ["f(x=1)", "2"] : []);
    expect(statuses(["x+1", "@@@"])).toEqual(["start", "unknown"]);
  });
});
