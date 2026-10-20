import { SceneIRSchema } from "@sketchlab/shared";
import { describe, expect, it } from "vitest";
import { buildFromInput } from "./build";
import { chaosGame, figureNote, figureTitle, GOSPER, genusSdf, golden, inMandelbrot, julia, koch, kochStats, knotInfo, lifeRandom, lifeStep, logistic, logisticOrbit, lorenz, LORENZ0, lorenzRegime, mandelbrot, paintMesh, parseFigure, sierpinski, sierpinskiArea, surfaceMesh } from "./figures";

describe("유명한 그림", () => {
  it("이름으로 고르기 (한글·영어)", () => {
    expect(parseFigure("뫼비우스 띠")?.name).toBe("mobius");
    expect(parseFigure("Klein bottle")?.name).toBe("klein");
    expect(parseFigure("구멍 3개 도넛")).toMatchObject({ name: "genus", n: 3 });
    expect(parseFigure("만델브로 집합")?.zoom).toEqual({ cx: -0.6, cy: 0, s: 3.2 });
    expect(parseFigure("game of life")?.cells?.length).toBe(GOSPER.length);
    expect(parseFigure("y=x^2")).toBeNull();
    for (const s of ["세잎 매듭", "코흐 눈송이", "시에르핀스키", "황금 나선", "로렌츠", "로지스틱 사상", "오일러 공식", "종수 2"]) {
      const r = buildFromInput(s);
      expect(r.ok && r.ir.kind, s).toBe("figure");
      if (r.ok) expect(SceneIRSchema.safeParse(r.ir).success).toBe(true);
    }
  });

  it("3D 곡면: 반지름 1 안, 칠한 조각 수 = 그물 칸 수", () => {
    for (const name of ["mobius", "klein", "trefoil"] as const) {
      const g = surfaceMesh(name);
      const r = Math.max(...g.flat().map((p) => Math.hypot(...p)));
      expect(r).toBeCloseTo(1, 1);
      const patches = paintMesh(g, { yaw: 0.4, pitch: 0.3 }, 100, 150, 150, 200);
      expect(patches.length).toBe((g.length - 1) * ((g[0]?.length ?? 1) - 1));
    }
  });

  it("종수: 구멍 안은 밖(양수), 고리 위는 안(음수)", () => {
    expect(genusSdf(0)([0, 0, 0])).toBeLessThan(0);
    expect(genusSdf(1)([0, 0, 0])).toBeGreaterThan(0);
    const g2 = genusSdf(2);
    expect(g2([-0.475, 0, 0])).toBeGreaterThan(0); // 첫 구멍 가운데
    expect(g2([0.475, 0, 0])).toBeGreaterThan(0); // 둘째 구멍
    expect(g2([-0.475, 0, 0.5])).toBeLessThan(0); // 고리
  });

  it("프랙탈: 코흐 꼭짓점 3·4ⁿ, 시에르핀스키 3ⁿ, 황금 나선 피보나치", () => {
    expect(koch(0)).toHaveLength(3);
    expect(koch(3)).toHaveLength(3 * 4 ** 3);
    expect(sierpinski(4)).toHaveLength(81);
    const g = golden(8);
    expect(g.squares.map((s) => s.s)).toEqual([1, 1, 2, 3, 5, 8, 13, 21]);
  });

  it("만델브로: 원점(c = 0)은 집합 안(어두움), 멀리는 밖(밝음)", () => {
    const img = mandelbrot({ cx: 0, cy: 0, s: 4 }, 21, 21);
    expect(img[(10 * 21 + 10) * 4]).toBe(20);
    expect(img[0]).not.toBe(20);
  });

  it("로지스틱: r=2.5 쪽은 한 점(x=0.6)에 모이고 r=4 쪽은 넓게 퍼진다", () => {
    const w = 50;
    const h = 100;
    const img = logistic(w, h);
    const column = (px: number) => Array.from({ length: h }, (_, py) => img[(py * w + px) * 4 + 3] as number).filter((a) => a > 0).length;
    expect(column(0)).toBeLessThanOrEqual(2);
    expect(column(w - 1)).toBeGreaterThan(50);
  });

  it("로렌츠: 두 날개(x가 양수·음수 모두)를 오간다", () => {
    const pts = lorenz(LORENZ0).a;
    expect(pts.some((p) => p[0] > 0.3) && pts.some((p) => p[0] < -0.3)).toBe(true);
    expect(Math.max(...pts.flat().map(Math.abs))).toBeCloseTo(1, 5);
  });

  it("로렌츠: ρ에 따라 원점 · 고정점 · 혼돈, 나비 효과는 혼돈에서만 갈라진다", () => {
    expect(lorenzRegime(LORENZ0).rhoH).toBeCloseTo(24.74, 2);
    expect(lorenzRegime({ ...LORENZ0, r: 0.5 }).kind).toBe("origin");
    expect(lorenzRegime({ ...LORENZ0, r: 15 }).kind).toBe("fixed");
    expect(lorenzRegime(LORENZ0).kind).toBe("chaos");
    const chaos = lorenz(LORENZ0, true);
    expect(chaos.b).not.toBeNull();
    expect(chaos.split).toBeGreaterThan(5);
    expect(chaos.split).toBeLessThan(45);
    expect(lorenz({ ...LORENZ0, r: 15 }, true).split).toBeNull();
    // ρ = 15: 끝에는 한 점(고정점) 근처에서 거의 움직이지 않는다
    const a = lorenz({ ...LORENZ0, r: 15 }).a;
    const [p, q] = [a[a.length - 2]!, a[a.length - 1]!];
    expect(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])).toBeLessThan(1e-4);
  });

  it("로지스틱: 주기와 랴푸노프 지수", () => {
    expect(logisticOrbit(2.8).period).toBe(1);
    expect(logisticOrbit(2.8).values[0]).toBeCloseTo(1 - 1 / 2.8, 5);
    expect(logisticOrbit(3.2).period).toBe(2);
    expect(logisticOrbit(3.5).period).toBe(4);
    expect(logisticOrbit(3.55).period).toBe(8);
    expect(logisticOrbit(3.835).period).toBe(3); // 주기 3 창
    const chaos = logisticOrbit(3.9);
    expect(chaos.period).toBeNull();
    expect(chaos.lyap).toBeGreaterThan(0.3);
    expect(logisticOrbit(3.2).lyap).toBeLessThan(0);
    // r 구간을 좁혀도 그린다 (3.4~3.6 = 모두 주기 4 이상 → 칸마다 점 여러 개)
    const img = logistic(20, 100, 3.5, 3.52);
    const col = Array.from({ length: 100 }, (_, py) => img[(py * 20 + 5) * 4 + 3] as number).filter((v) => v > 0).length;
    expect(col).toBeGreaterThanOrEqual(4);
  });

  it("줄리아: c = 0 은 단위원 (가운데 안, 모서리 밖), c가 집합 밖이면 끊어진 먼지", () => {
    const img = julia({ x: 0, y: 0 }, 31, 31);
    expect(img[(15 * 31 + 15) * 4]).toBe(20);
    expect(img[0]).not.toBe(20);
    expect(inMandelbrot({ x: -1, y: 0 })).toBe(true);
    expect(inMandelbrot({ x: 0.5, y: 0.5 })).toBe(false);
  });

  it("매듭·띠: 이름과 교차 수, 꼬임 수에 따라 면 수", () => {
    expect(knotInfo(2, 3)).toEqual({ title: "세잎 매듭 (3₁)", crossings: 3 });
    expect(knotInfo(3, 4).crossings).toBe(8);
    expect(knotInfo(2, 5).title).toContain("오엽");
    const m = surfaceMesh("trefoil", 2, 5);
    expect(m.length).toBe(60 * 5 + 1);
    expect(figureTitle({ name: "mobius", p: { tw: 2 } })).toContain("2번");
    expect(figureNote({ name: "mobius", p: { tw: 3 } })).toContain("하나");
    expect(figureNote({ name: "mobius", p: { tw: 2 } })).toContain("둘");
    expect(figureNote({ name: "genus", n: 3 })).toContain("−4");
  });

  it("프랙탈 수치와 혼돈 게임", () => {
    expect(kochStats(0)).toEqual({ perimeter: 1, area: 1 });
    expect(kochStats(1).area).toBeCloseTo(4 / 3, 10);
    expect(kochStats(50).area).toBeCloseTo(1.6, 5);
    expect(sierpinskiArea(2)).toBeCloseTo(9 / 16, 10);
    // 혼돈 게임의 점은 가운데 빈 삼각형(중점 삼각형 안)에 하나도 없다
    const pts = chaosGame(3000);
    const inHole = pts.filter(([x, y]) => y < 0.23 && y > -0.46 && Math.abs(x) < (y + 0.5) / Math.sqrt(3) - 0.02);
    expect(inHole.length).toBe(0);
    expect(lifeRandom(0.3, 1).length).toBeGreaterThan(200);
  });

  it("라이프 게임: 깜빡이(세로 3칸)는 가로 3칸이 되고, 다시 세로로", () => {
    const blinker: Array<[number, number]> = [
      [4, 5],
      [5, 5],
      [6, 5],
    ];
    const once = lifeStep(blinker);
    expect(once).toEqual([
      [5, 4],
      [5, 5],
      [5, 6],
    ]);
    expect(lifeStep(once)).toEqual(blinker);
    // 글라이더 총은 30세대마다 글라이더를 하나 더 쏜다 → 칸 수가 늘어난다
    let g = GOSPER as Array<[number, number]>;
    for (let i = 0; i < 60; i++) g = lifeStep(g);
    expect(g.length).toBeGreaterThan(GOSPER.length);
  });
});
