import { describe, expect, it } from "vitest";
import { buildFromInput } from "./build";
import { analyze, toFunction } from "./latex";
import { jumpDots, sampleFunction } from "./sample";

const fnOf = (input: string) => {
  const a = analyze(input);
  if (a.kind !== "explicit") throw new Error(a.kind);
  const f = toFunction(a.rhs, ["x"]);
  return (x: number) => f(x);
};
const view = { xmin: -3.5, xmax: 3.5, ymin: -3.5, ymax: 3.5 };

describe("가우스 기호 [x] · 소수 부분 x − [x]", () => {
  it("[x]는 x를 넘지 않는 가장 큰 정수 (그래프 식에서만, 행렬은 그대로)", () => {
    const f = fnOf("y=[x]");
    expect([f(1.5), f(-0.5), f(2), f(-2)]).toEqual([1, -1, 2, -2]);
    expect(fnOf("y=x-[x]")(-0.25)).toBeCloseTo(0.75, 10);
    expect(fnOf("y=floor(x)")(2.9)).toBe(2);
    expect(fnOf("y=frac(x)")(3.25)).toBeCloseTo(0.25, 10);
    const m = buildFromInput("[[2,1],[1,3]]");
    expect(m.ok && m.ir.kind).not.toBe("plot2d");
  });

  it("계단 사이를 세로선으로 잇지 않는다", () => {
    const s = sampleFunction(fnOf("y=[x]"), view, { widthPx: 400, heightPx: 400 });
    for (const run of s.runs)
      for (let i = 1; i < run.length; i++) {
        const [x0, y0] = run[i - 1]!;
        const [x1, y1] = run[i]!;
        // 이어진 선분은 거의 수평이어야 한다
        expect(Math.abs(y1 - y0) < 1e-9 || Math.abs(x1 - x0) > 1e-3).toBe(true);
      }
    expect(s.breaks.length).toBeGreaterThanOrEqual(6);
  });

  it("계단 끝: 정수 x에서 채운 점(함수값), 빈 점(왼쪽에서 오던 값)", () => {
    const f = fnOf("y=[x]");
    const s = sampleFunction(f, view, { widthPx: 400, heightPx: 400 });
    const dots = jumpDots(f, view, s.breaks);
    const at1 = dots.filter((d) => Math.abs(d.x - 1) < 1e-9);
    expect(at1).toEqual(expect.arrayContaining([{ x: 1, y: 1, filled: true }, { x: 1, y: 0, filled: false }]));
    // 연속 함수에는 점이 없다
    const g = fnOf("y=x^2");
    expect(jumpDots(g, view, sampleFunction(g, view, { widthPx: 400, heightPx: 400 }).breaks)).toEqual([]);
  });
});
