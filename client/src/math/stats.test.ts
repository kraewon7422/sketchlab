import { SceneIRSchema } from "@sketchlab/shared";
import { describe, expect, it } from "vitest";
import { buildFromInput } from "./build";
import { binomialPmf, buildDist, discreteCaption, normalCdf, parseDist, poissonPmf, probability, rangeCaption } from "./stats";

describe("직접 고르기 (막대 톡 · 구간 끌기)", () => {
  it("분포를 그래프에 함께 저장, 연속분포는 질문이 없어도 μ±σ를 칠해 둔다", () => {
    const n = buildDist("N(0,1)");
    if (n?.kind !== "plot2d") throw new Error("그래프 아님");
    expect(n.data.dist).toEqual({ kind: "normal", p: [0, 1], latex: expect.any(String) });
    expect(n.data.shade?.[0]).toMatchObject({ from: -1, to: 1 });
    expect(n.data.caption).toContain("0.6827");
    expect(SceneIRSchema.safeParse(n).success).toBe(true);
  });

  it("막대: 하나·이어진 것·떨어진 것", () => {
    const b = buildDist("B(4,0.5)");
    if (b?.kind !== "plot2d" || !b.data.dist) throw new Error("그래프 아님");
    expect(discreteCaption(b.data.dist, [])).not.toContain("P(");
    expect(discreteCaption(b.data.dist, [2])).toContain("P(X=2)\\approx 0.3750");
    expect(discreteCaption(b.data.dist, [3, 2, 4])).toContain("P(2\\le X\\le 4)\\approx 0.6875");
    expect(discreteCaption(b.data.dist, [0, 4])).toContain("P(X\\in\\{0,4\\})\\approx 0.1250");
  });

  it("구간: 끝을 거꾸로 끌어도 작은 쪽부터", () => {
    const n = buildDist("N(170,6^2)");
    if (n?.kind !== "plot2d" || !n.data.dist) throw new Error("그래프 아님");
    expect(rangeCaption(n.data.dist, 182, 164)).toContain("P(164<X<182)\\approx 0.8186");
  });
});

describe("확률분포", () => {
  it("정규분포 확률 (표준정규분포표와 같은 값)", () => {
    expect(normalCdf(1, 0, 1) - normalCdf(-1, 0, 1)).toBeCloseTo(0.6827, 4);
    expect(normalCdf(1.96, 0, 1)).toBeCloseTo(0.975, 3);
    const p = parseDist("X~N(170, 6^2), P(164<X<182)");
    if (!p?.query) throw new Error("못 읽음");
    expect(p.dist).toEqual({ kind: "normal", mu: 170, sigma: 6 });
    expect(probability(p.dist, p.query)).toBeCloseTo(0.8186, 3);
  });

  it("N(μ, σ²)는 분산, N(μ, σ^2)는 표준편차의 제곱 — 둘 다 같게 읽는다", () => {
    expect(parseDist("N(0,4)")?.dist).toEqual({ kind: "normal", mu: 0, sigma: 2 });
    expect(parseDist("N(0,2^2)")?.dist).toEqual({ kind: "normal", mu: 0, sigma: 2 });
    expect(parseDist("N(0,2²)")?.dist).toEqual({ kind: "normal", mu: 0, sigma: 2 });
  });

  it("이항분포·포아송분포 확률", () => {
    expect(binomialPmf(3, 10, 0.3)).toBeCloseTo(0.2668, 4);
    const b = parseDist("B(10, 0.3), P(X≤3)");
    if (!b?.query) throw new Error("못 읽음");
    expect(probability(b.dist, b.query)).toBeCloseTo(0.6496, 4);
    expect(poissonPmf(2, 3)).toBeCloseTo(0.224, 3);
    const po = parseDist("Po(3), P(X=2)");
    if (!po?.query) throw new Error("못 읽음");
    expect(probability(po.dist, po.query)).toBeCloseTo(0.224, 3);
  });

  it("P(-1<Z<1)만 쓰면 표준정규분포", () => {
    expect(parseDist("P(-1<Z<1)")?.dist).toEqual({ kind: "normal", mu: 0, sigma: 1 });
  });

  it("그래프: 연속분포는 곡선+음영, 이산분포는 막대 (구하는 범위는 강조)", () => {
    const n = buildDist("N(170,6^2), P(164<X<182)");
    if (n?.kind !== "plot2d") throw new Error("plot2d 아님");
    expect(SceneIRSchema.safeParse(n).success).toBe(true);
    expect(n.data.shade?.[0]).toMatchObject({ from: 164, to: 182 });
    expect(n.data.caption).toContain("0.81");
    const b = buildDist("B(10,0.3), P(X≤3)");
    if (b?.kind !== "plot2d") throw new Error("plot2d 아님");
    expect(SceneIRSchema.safeParse(b).success).toBe(true);
    expect(b.data.bars).toHaveLength(11);
    expect(b.data.bars?.filter((x) => x.on).map((x) => x.x)).toEqual([0, 1, 2, 3]);
    // ƒ 입력에서도 같은 길로
    const r = buildFromInput("B(10,0.3)");
    expect(r.ok && r.ir.kind === "plot2d" && r.ir.data.bars?.length).toBe(11);
    expect(buildDist("y=x^2")).toBeNull();
  });
});
