import { describe, expect, it } from "vitest";
import { RecognizeResultSchema, SceneIRSchema } from "./ir";

const meta = { version: "3.0", confidence: 0.9, source: "vlm" } as const;

describe("SceneIR 판별 유니온 (D1 회귀)", () => {
  it("올바른 shape2d를 통과시킨다", () => {
    const r = SceneIRSchema.safeParse({
      ...meta,
      kind: "shape2d",
      data: {
        primitives: [
          { t: "polygon", pts: [[0, 0], [1, 0], [0.5, 1]], closed: true },
        ],
      },
    });
    expect(r.success).toBe(true);
  });

  it("kind와 data가 어긋나면 차단한다 — v2에서 통과하던 페이로드", () => {
    const r = SceneIRSchema.safeParse({
      ...meta,
      kind: "chem",
      data: { primitives: [{ t: "circle", c: [0, 0], r: 1 }] },
    });
    expect(r.success).toBe(false);
  });

  it("알 수 없는 kind를 차단한다", () => {
    const r = SceneIRSchema.safeParse({
      ...meta,
      kind: "hologram",
      data: { latex: "x" },
    });
    expect(r.success).toBe(false);
  });

  it("version이 3.0이 아니면 차단한다", () => {
    const r = SceneIRSchema.safeParse({
      ...meta,
      version: "2.0",
      kind: "formula",
      data: { latex: "\\int_0^1 x\\,dx" },
    });
    expect(r.success).toBe(false);
  });

  it("confidence 범위를 강제한다", () => {
    const r = SceneIRSchema.safeParse({
      ...meta,
      confidence: 1.4,
      kind: "formula",
      data: { latex: "x" },
    });
    expect(r.success).toBe(false);
  });
});

describe("교육 규범 기본값", () => {
  it("plot2d의 aspect 기본값은 equal 이다 (E1 — 원이 타원으로 보이면 실격)", () => {
    const r = SceneIRSchema.parse({
      ...meta,
      kind: "plot2d",
      data: {
        functions: [{ latex: "x^2", kind: "explicit" }],
        view: { xmin: -5, xmax: 5, ymin: -5, ymax: 5 },
      },
    });
    expect(r.kind).toBe("plot2d");
    if (r.kind !== "plot2d") return;
    expect(r.data.view.aspect).toBe("equal");
    expect(r.data.grid).toBe(false);
  });

  it("solid3d는 모서리·숨은선을 기본으로 켠다", () => {
    const r = SceneIRSchema.parse({
      ...meta,
      kind: "solid3d",
      data: { solid: "cube", params: { size: 1 } },
    });
    if (r.kind !== "solid3d") throw new Error("kind 분기 실패");
    expect(r.data.showEdges).toBe(true);
    expect(r.data.showHiddenEdges).toBe(true);
  });

  it("chem은 skeletal 표기를 기본으로 한다", () => {
    const r = SceneIRSchema.parse({
      ...meta,
      kind: "chem",
      data: { smiles: "c1ccccc1", commonName: "벤젠 (benzene)" },
    });
    if (r.kind !== "chem") throw new Error("kind 분기 실패");
    expect(r.data.display).toBe("skeletal");
  });
});

describe("RecognizeResult", () => {
  const best = {
    ...meta,
    kind: "formula",
    data: { latex: "y = x^2 - 3" },
  };

  it("alternatives 없이도 유효하다", () => {
    expect(RecognizeResultSchema.safeParse({ best }).success).toBe(true);
  });

  it("alternatives는 최대 2개다", () => {
    const r = RecognizeResultSchema.safeParse({
      best,
      alternatives: [best, best, best],
    });
    expect(r.success).toBe(false);
  });
});
