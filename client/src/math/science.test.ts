import { describe, expect, it } from "vitest";
import { det2, det3, det3Expansion, euclidFigure, GD_FUNCTIONS, gdPath, ORBITALS, orbitalMesh, polyArea } from "./science";

describe("경사하강법", () => {
  const bowl = GD_FUNCTIONS[0]!;
  it("알맞은 학습률이면 최솟값으로 수렴", () => {
    const r = gdPath(bowl, 0.1, 0, [2, 0], 200);
    expect(r.status).toBe("converged");
    expect(Math.abs(r.pts.at(-1)![0])).toBeLessThan(1e-3);
  });
  it("학습률 1이면 제자리에서 튕긴다(진동), 너무 크면 발산", () => {
    expect(gdPath(bowl, 1, 0, [2, 0], 40).status).toBe("oscillating");
    expect(gdPath(bowl, 1.2, 0, [2, 0], 400).status).toBe("diverged");
  });
  it("두 골짜기: 시작점에 따라 다른 골짜기 (지역 최솟값)", () => {
    const well = GD_FUNCTIONS[1]!;
    const right = gdPath(well, 0.02, 0, [1.9, 0], 600).pts.at(-1)![0];
    const left = gdPath(well, 0.02, 0, [-1.9, 0], 600).pts.at(-1)![0];
    expect(right).toBeCloseTo(1.1309, 2);
    expect(left).toBeCloseTo(-1.3008, 2);
  });
  it("길쭉한 그릇: 모멘텀이 있으면 더 적은 걸음으로", () => {
    const bowl2 = GD_FUNCTIONS[2]!;
    const steps = (mom: number) => {
      const r = gdPath(bowl2, 0.05, mom, [-2.6, 1.4], 2000).pts;
      return r.findIndex(([x, y]) => Math.hypot(x, y) < 0.01);
    };
    expect(steps(0.8)).toBeLessThan(steps(0));
  });
});

describe("원자 오비탈", () => {
  it("s 1개 · p 3개 · d 5개 · f 7개", () => {
    expect(ORBITALS.map((g) => g.length)).toEqual([1, 3, 5, 7]);
  });
  it("모양: 가장 먼 점이 1, pz는 위아래로 부호가 반대", () => {
    const pz = ORBITALS[1]![0]!;
    const { grid, sign } = orbitalMesh(pz, 16, 8);
    const far = Math.max(...grid.flat().map((p) => Math.hypot(...p)));
    expect(far).toBeCloseTo(1, 6);
    expect(sign[0]![0]).toBe(1); // 북극(z+) 쪽
    expect(sign[0]![8]).toBe(-1); // 남극
  });
});

describe("행렬식", () => {
  it("2×2 · 3×3과 전개", () => {
    expect(det2(2, 1, 1, 3)).toBe(5);
    // 2·(3·2 − 2·1) − 0 + 1·(1·1 − 3·1) = 8 − 2 = 6
    expect(det3([2, 0, 1, 1, 3, 2, 1, 1, 2])).toBe(6);
    expect(det3Expansion([2, 0, 1, 1, 3, 2, 1, 1, 2])).toContain("= 6");
    expect(det3([2, 0, 1, 1, 3, 2, 1, 1, 1])).toBe(0);
  });
});

describe("유클리드의 피타고라스 증명", () => {
  it("어느 자리에서나 a² + b² = c², 큰 정사각형의 두 직사각형 = 두 작은 정사각형", () => {
    for (const t of [0.4, 1, Math.PI / 2, 2.3]) {
      const g = euclidFigure(t);
      expect(g.a2 + g.b2).toBeCloseTo(g.c2, 10);
      expect(polyArea([g.K, g.B, g.E, g.L])).toBeCloseTo(g.a2, 10);
      expect(polyArea([g.A, g.K, g.L, g.D])).toBeCloseTo(g.b2, 10);
      // 정사각형 BC의 넓이 = a² (꼭짓점이 바깥에 제대로)
      expect(polyArea([g.B, g.C, g.G, g.F])).toBeCloseTo(g.a2, 10);
      // 합동 삼각형 ABF와 CBE의 넓이는 각각 a²의 절반
      expect(polyArea([g.A, g.B, g.F])).toBeCloseTo(g.a2 / 2, 10);
      expect(polyArea([g.C, g.B, g.E])).toBeCloseTo(g.a2 / 2, 10);
      // 정사각형은 삼각형 바깥쪽 (F가 A에서 멀다)
      expect(Math.hypot(g.F[0] - g.A[0], g.F[1] - g.A[1])).toBeGreaterThan(Math.hypot(g.C[0] - g.A[0], g.C[1] - g.A[1]));
    }
  });
});
