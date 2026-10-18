import { describe, expect, it } from "vitest";
import { findAsymptotes } from "./asymptotes";
import { isTrigOnly, niceStep, numberTicks, piLabel, piTicks } from "./axes";
import { marchingSquares } from "./implicit";
import { simpson } from "./integrate";
import { sampleFunction, sampleParametric, type View } from "./sample";
import { fitView } from "./view";

const view: View = { xmin: -5, xmax: 5, ymin: -3.75, ymax: 3.75 };
const opts = { widthPx: 480, heightPx: 360 };

describe("적응 샘플링 — 수직선 없음, 매끈함", () => {
  it("tan x: 위아래를 잇는 수직선이 하나도 없다 (교과서 함정 #7)", () => {
    const { runs } = sampleFunction(Math.tan, view, opts);
    const yspan = view.ymax - view.ymin;
    for (const run of runs) {
      for (let i = 1; i < run.length; i++) {
        const dy = Math.abs((run[i] as [number, number])[1] - (run[i - 1] as [number, number])[1]);
        expect(dy).toBeLessThan(yspan * 0.6);
      }
    }
    // 화면 안에 tan의 가지가 여러 개 → 구간도 여러 개
    expect(runs.length).toBeGreaterThanOrEqual(3);
  });

  it("1/x: 0에서 끊기고 양쪽 가지가 따로 그려진다", () => {
    const { runs, breaks } = sampleFunction((x) => 1 / x, view, opts);
    expect(runs.length).toBe(2);
    expect(breaks.some((b) => Math.abs(b.x) < 0.01)).toBe(true);
  });

  it("급하게 휘는 곳은 촘촘하게, 직선은 성기게 샘플한다", () => {
    const line = sampleFunction((x) => 0.5 * x, view, opts).runs.flat().length;
    const curvy = sampleFunction((x) => Math.sin(20 * x), view, opts).runs.flat().length;
    expect(curvy).toBeGreaterThan(line);
  });

  it("√x: 정의되지 않는 왼쪽은 비우고, 0 근처까지 정확히 다가간다", () => {
    const { runs } = sampleFunction(Math.sqrt, view, opts);
    expect(runs.length).toBe(1);
    const first = (runs[0] as Array<[number, number]>)[0] as [number, number];
    expect(first[0]).toBeLessThan(0.01);
  });

  it("화면 밖으로 나가는 선분은 경계에서 잘린다 (클램프로 납작해지지 않음)", () => {
    const { runs } = sampleFunction((x) => x * x * x, view, opts);
    const ys = runs.flat().map((p) => p[1]);
    expect(Math.max(...ys)).toBeLessThanOrEqual(view.ymax + 0.25 * 7.5 + 1e-9);
  });

  it("매개변수 곡선(원)은 닫힌 하나의 구간", () => {
    const runs = sampleParametric(Math.cos, Math.sin, 0, 2 * Math.PI, view);
    expect(runs.length).toBe(1);
  });
});

describe("점근선 — 교과서 점선", () => {
  const asym = (f: (x: number) => number, v = view) => findAsymptotes(f, v, sampleFunction(f, v, opts));

  it("1/x: 수직 x = 0, 수평 y = 0", () => {
    const a = asym((x) => 1 / x);
    expect(a.vertical).toEqual([0]);
    expect(a.horizontal).toEqual([0]);
  });

  it("tan x: 수직 점근선이 정확히 ±π/2 (π/12 배수로 스냅)", () => {
    const a = asym(Math.tan);
    for (const x of [-Math.PI / 2, Math.PI / 2]) expect(a.vertical.some((v) => Math.abs(v - x) < 1e-12)).toBe(true);
    expect(a.horizontal).toEqual([]);
  });

  it("log₂x: x = 0에서 수직 점근선 (한쪽만 정의돼도)", () => {
    expect(asym((x) => Math.log2(x)).vertical).toEqual([0]);
  });

  it("2^x: 왼쪽 끝에서만 y = 0 수평 점근선", () => {
    const a = asym((x) => 2 ** x);
    expect(a.horizontal).toEqual([0]);
    expect(a.vertical).toEqual([]);
  });

  it("점근선이 아닌 것들: √x, x², 계단 함수, 상수", () => {
    for (const f of [Math.sqrt, (x: number) => x * x, Math.floor, () => 2]) {
      const a = asym(f);
      expect(a.vertical, String(f)).toEqual([]);
      expect(a.horizontal, String(f)).toEqual([]);
    }
  });

  it("(2x+1)/(x−1): x = 1, y = 2", () => {
    const a = asym((x) => (2 * x + 1) / (x - 1));
    expect(a.vertical).toEqual([1]);
    expect(a.horizontal).toEqual([2]);
  });
});

describe("눈금", () => {
  it("nice number 간격", () => {
    expect(niceStep(10)).toBe(1);
    expect(niceStep(20)).toBe(2);
    expect(niceStep(50)).toBe(5);
    expect(niceStep(0.8)).toBeCloseTo(0.1, 12);
  });

  it("0은 빼고 (원점 O 따로), 음수는 진짜 마이너스 기호, 소수 찌꺼기 없음", () => {
    const t = numberTicks(-1, 1, 0.2);
    expect(t.map((x) => x.label)).toEqual(["−1", "−0.8", "−0.6", "−0.4", "−0.2", "0.2", "0.4", "0.6", "0.8", "1"]);
  });

  it("π 라벨이 교과서 표기", () => {
    expect([1, 2, 3, 4, -1, -2, -3].map(piLabel)).toEqual(["π/2", "π", "3π/2", "2π", "−π/2", "−π", "−3π/2"]);
    expect(piTicks(-Math.PI, Math.PI).map((t) => t.label)).toEqual(["−π", "−π/2", "π/2", "π"]);
  });

  it("삼각함수만 있으면 π 눈금, 다항 항이 섞이면 아니다", () => {
    expect(isTrigOnly(["Sin", "x"])).toBe(true);
    expect(isTrigOnly(["Multiply", 2, ["Cos", ["Multiply", 3, "x"]]])).toBe(true);
    expect(isTrigOnly(["Add", ["Sin", "x"], ["Power", "x", 2]])).toBe(false);
    expect(isTrigOnly(["Power", "x", 2])).toBe(false);
  });
});

describe("보기 범위 — 1:1 축 비율", () => {
  it("단위 길이가 x와 y에서 같은 픽셀 (원이 원으로)", () => {
    const v = fitView([(x) => x * x - 3], { aspect: 0.75 });
    expect((v.ymax - v.ymin) / (v.xmax - v.xmin)).toBeCloseTo(0.75, 9);
  });

  it("y = x² − 3: 꼭짓점(−3)과 x축이 둘 다 보인다", () => {
    const v = fitView([(x) => x * x - 3], { aspect: 0.75 });
    expect(v.ymin).toBeLessThan(-3);
    expect(v.ymax).toBeGreaterThan(0);
  });

  it("y = 1/x: 원점 중심", () => {
    const v = fitView([(x) => 1 / x], { aspect: 0.75 });
    expect(Math.abs(v.ymin + v.ymax)).toBeLessThan(1);
  });
});

describe("음함수·적분", () => {
  it("x² + y² = 4: 반지름 2인 원 위의 점들, 한 줄로 이어짐", () => {
    const lines = marchingSquares((x, y) => x * x + y * y - 4, view, 96, 72);
    const pts = lines.flat();
    expect(pts.length).toBeGreaterThan(50);
    for (const [x, y] of pts) expect(Math.abs(Math.hypot(x, y) - 2)).toBeLessThan(0.02);
    expect(lines.length).toBeLessThanOrEqual(2);
  });

  it("∫₀² x² dx = 8/3", () => {
    expect(simpson((x) => x * x, 0, 2)).toBeCloseTo(8 / 3, 10);
  });

  it("정의되지 않는 점이 있으면 NaN (조용히 틀린 값을 내지 않는다)", () => {
    expect(simpson((x) => 1 / x, -1, 1)).toBeNaN();
  });
});
