import { SceneIRSchema } from "@sketchlab/shared";
import { describe, expect, it } from "vitest";
import { buildFromInput } from "./build";
import { GOSPER, genusSdf, golden, koch, lifeStep, logistic, lorenzPoints, mandelbrot, paintMesh, parseFigure, sierpinski, surfaceMesh } from "./figures";

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
    const pts = lorenzPoints();
    expect(pts.some((p) => p[0] > 0.3) && pts.some((p) => p[0] < -0.3)).toBe(true);
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
