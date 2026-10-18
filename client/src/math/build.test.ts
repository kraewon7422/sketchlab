import { SceneIRSchema } from "@sketchlab/shared";
import { describe, expect, it } from "vitest";
import { buildFromInput } from "./build";

const build = (s: string) => {
  const r = buildFromInput(s);
  if (!r.ok) throw new Error(r.message);
  // 만든 IR은 언제나 스키마를 통과해야 한다
  expect(SceneIRSchema.safeParse(r.ir).success).toBe(true);
  return r.ir;
};

describe("입력 → Scene IR", () => {
  it("y = x² − 3 → plot2d, 1:1 비율, 정수 눈금", () => {
    const ir = build("y=x^2-3");
    if (ir.kind !== "plot2d") throw new Error(ir.kind);
    expect(ir.data.view.aspect).toBe("equal");
    expect(ir.data.view.xTicks).toBe("auto");
    expect(ir.source).toBe("manual");
  });

  it("y = sin x → π 눈금, x 범위 −2π~2π", () => {
    const ir = build("y=sin(x)");
    if (ir.kind !== "plot2d") throw new Error(ir.kind);
    expect(ir.data.view.xTicks).toBe("pi");
    expect(ir.data.view.xmax).toBeCloseTo(2 * Math.PI, 9);
  });

  it("y = a sin(bx) → 계수 슬라이더 2개", () => {
    const ir = build("y=a\\sin(bx)");
    if (ir.kind !== "plot2d") throw new Error(ir.kind);
    expect(ir.data.params?.map((p) => p.name)).toEqual(["a", "b"]);
  });

  it("∫₀² x² dx → 음영 [0,2] + 원래 식 캡션", () => {
    const ir = build("\\int_0^2 x^2\\,dx");
    if (ir.kind !== "plot2d") throw new Error(ir.kind);
    expect(ir.data.shade?.[0]).toMatchObject({ fn: 0, from: 0, to: 2 });
    expect(ir.data.caption).toContain("\\int");
    expect(ir.data.view.xmin).toBeLessThan(0);
    expect(ir.data.view.xmax).toBeGreaterThan(2);
  });

  it("∫ t² dt 처럼 변수가 x가 아니어도 x로 그린다", () => {
    const ir = build("\\int_0^1 t^2\\,dt");
    if (ir.kind !== "plot2d") throw new Error(ir.kind);
    expect(ir.data.functions[0]?.latex).toBe("y=x^2");
  });

  it("극좌표 r = 2: 원 전체가 보이는 범위", () => {
    const ir = build("r=2");
    if (ir.kind !== "plot2d") throw new Error(ir.kind);
    expect(ir.data.view.xmax).toBeGreaterThanOrEqual(2.5);
  });

  it("합 공식 → formula", () => {
    expect(build("\\sum_{k=1}^{n} k=\\frac{n(n+1)}{2}").kind).toBe("formula");
  });

  it("깨진 식 → 오류 메시지 (예외 아님)", () => {
    const r = buildFromInput("x^{");
    expect(r.ok).toBe(false);
  });
});
