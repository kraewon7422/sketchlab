import { describe, expect, it } from "vitest";
import { buildFromInput } from "./build";
import { buildSpace, triple } from "./space3d";
import { drawSpace, spaceFaces } from "../solid/space";

const space = (input: string) => {
  const r = buildSpace(input);
  if (!r || "error" in r || r.kind !== "space3d") throw new Error(`공간 그림 아님: ${JSON.stringify(r)}`);
  return r.data;
};

describe("공간 곡면·입체 알아보기", () => {
  it("구: 중심과 반지름을 식에서 읽는다", () => {
    const d = space("(x-1)^2+y^2+(z+2)^2=9");
    expect(d.shapes).toEqual([{ t: "sphere", c: [1, 0, -2], r: 3 }]);
  });

  it("펼친 구 식도 (x²+y²+z²−2x=8)", () => {
    const s = space("x^2+y^2+z^2-2x=8").shapes?.[0];
    expect(s?.t).toBe("sphere");
    if (s?.t === "sphere") {
      expect(s.c).toEqual([1, 0, 0]);
      expect(s.r).toBeCloseTo(3);
    }
  });

  it("원기둥: 빠진 변수 축과 나란하게 (z가 없으면 공간 식이 아니라 평면 그래프)", () => {
    const d = space("x^2+z^2=4");
    expect(d.shapes).toEqual([{ t: "cylinder", axis: "y", c: [0, 0, 0], r: 2 }]);
    expect(buildSpace("x^2+y^2=4")).toBeNull();
    // "공간"을 붙이거나 z가 든 식과 함께면 공간의 원기둥
    expect(space("공간 x^2+y^2=4").shapes).toEqual([{ t: "cylinder", axis: "z", c: [0, 0, 0], r: 2 }]);
    expect(space("x^2+y^2=4, z=1").shapes?.[0]?.t).toBe("cylinder");
  });

  it("평면 하나는 공간 그림, 평면 셋은 연립방정식으로", () => {
    expect(space("x+2y-z=4").planes).toEqual([{ normal: [1, 2, -1], d: 4 }]);
    expect(buildSpace("x+y+z=6, 2x-y+z=3, x+2y-z=2")).toBeNull();
    const sys = buildFromInput("x+y+z=6, 2x-y+z=3, x+2y-z=2");
    expect(sys.ok && sys.ir.kind).toBe("formula");
  });

  it("z = f(x, y) 곡면 (포물면·안장면·삼각함수)", () => {
    for (const f of ["z=x^2+y^2", "z=x^2-y^2", "z=\\sin x\\cos y", "z=sin(x)*cos(y)"]) expect(space(f).surfaces).toHaveLength(1);
  });

  it("구와 평면을 함께", () => {
    const d = space("x^2+y^2+z^2=9, z=1");
    expect(d.shapes?.[0]?.t).toBe("sphere");
    expect(d.planes).toHaveLength(1);
  });

  it("못 그리는 식은 알려 준다 (원뿔 x²+y²=z²)", () => {
    const r = buildSpace("x^2+y^2=z^2");
    expect(r && "error" in r).toBe(true);
  });

  it("평행육면체: 부피 = |a·(b×c)|", () => {
    expect(triple([1, 0, 0], [1, 2, 0], [0, 1, 2])).toBe(4);
    const d = space("평행육면체 (1,0,0),(1,2,0),(0,1,2)");
    expect(d.shapes?.[0]?.t).toBe("parallelepiped");
    expect(d.caption).toContain("=4");
    expect(d.vectors).toHaveLength(3);
  });

  it("그리기: 평행육면체는 숨은 모서리가 점선, 구는 칠한 조각들 (먼 것부터)", () => {
    const view = { yaw: -0.7, pitch: 0.35 };
    const pp = space("평행육면체 (2,0,0),(1,2,0),(0,1,2)");
    const d = drawSpace(pp, view, 30, 150, 150);
    expect(d.edges.visible.length).toBeGreaterThan(0);
    expect(d.edges.hidden.length).toBeGreaterThan(0);
    expect(d.arrows.map((a) => a.label)).toEqual(["a", "b", "c"]);
    const faces = spaceFaces(space("x^2+y^2+z^2=4"), view, 30, 150, 150, []);
    expect(faces).toHaveLength(28 * 14);
    expect(faces[0]?.fill).toMatch(/^hsl\(/);
    // 곡면: z축 범위를 곡면 높이에 맞춰서 잘리지 않는다 (x, y ±3 → z 최대 18)
    const bowl = space("z=x^2+y^2");
    expect(bowl.view.axes).toEqual({ x: 3, y: 3, z: 20 });
    expect(spaceFaces(bowl, view, 30, 150, 150, [(x, y) => x * x + y * y])).toHaveLength(26 * 26);
    // 범위를 줄이면(축 패널) 넘치는 곳은 비운다
    const small = { ...bowl, view: { range: 3, axes: { x: 3, y: 3, z: 4 } } };
    expect(spaceFaces(small, view, 30, 150, 150, [(x, y) => x * x + y * y]).length).toBeLessThan(26 * 26);
  });

  it("공간 식이 아닌 것은 건드리지 않는다", () => {
    expect(buildSpace("y=x^2")).toBeNull();
    expect(buildSpace("2x+3y=7, x-y=1")).toBeNull();
  });
});
