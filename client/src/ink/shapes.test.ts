import { describe, expect, it } from "vitest";
import { buildShape } from "./shapes";

const a = { x: 100, y: 100 };

describe("도형 도구", () => {
  it("사각형: 왼쪽 위가 원점인 로컬 좌표", () => {
    const s = buildShape("rect", a, { x: 40, y: 160 });
    expect(s).toMatchObject({ ox: 40, oy: 100, width: 60, height: 60 });
    expect(s?.data.primitives[0]).toMatchObject({ t: "polygon", closed: true, pts: [[0, 0], [60, 0], [60, 60], [0, 60]] });
  });

  it("같은 폭·높이의 타원은 원으로", () => {
    expect(buildShape("ellipse", a, { x: 160, y: 160 })?.data.primitives[0]).toMatchObject({ t: "circle", r: 30 });
    expect(buildShape("ellipse", a, { x: 200, y: 140 })?.data.primitives[0]).toMatchObject({ t: "ellipse", rx: 50, ry: 20 });
  });

  it("정사각형·정원으로 맞추기", () => {
    expect(buildShape("rect", a, { x: 160, y: 130 }, true)).toMatchObject({ width: 60, height: 60 });
    expect(buildShape("ellipse", a, { x: 160, y: 130 }, true)?.data.primitives[0]?.t).toBe("circle");
  });

  it("직선은 45° 단위로 맞출 수 있다", () => {
    const s = buildShape("line", a, { x: 200, y: 110 }, true);
    const p = s?.data.primitives[0];
    if (p?.t !== "line") throw new Error("line expected");
    expect(p.a[1]).toBeCloseTo(p.b[1], 6); // 수평
  });

  it("좌표축: 화살표 둘과 x·y·O 이름", () => {
    const s = buildShape("axes", a, { x: 300, y: 300 });
    expect(s?.data.primitives.map((p) => p.t)).toEqual(["arrow", "arrow"]);
    expect(s?.data.labels?.map((l) => l.text)).toEqual(["x", "y", "O"]);
  });

  it("손떨림 정도로 짧으면 만들지 않는다", () => {
    expect(buildShape("line", a, { x: 103, y: 102 })).toBeNull();
  });
});
