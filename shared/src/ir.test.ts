import { describe, expect, it } from "vitest";
import { RecognizeResultSchema, SceneIRSchema } from "./ir";

const meta = { version: "4.0", confidence: 0.9, source: "vlm" } as const;

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

  it("version이 4.0이 아니면 차단한다 — 구버전은 migrate.ts를 거쳐야 한다", () => {
    const r = SceneIRSchema.safeParse({
      ...meta,
      version: "3.0",
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
    // 예전에 저장된 그래프도 축·식이 그대로 보여야 한다
    expect(r.data.showAxes).toBe(true);
    expect(r.data.showCaption).toBe(true);
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

  it("chem은 skeletal 표기 + 원 표기 꺼짐이 기본이다", () => {
    const r = SceneIRSchema.parse({
      ...meta,
      kind: "chem",
      data: { smiles: "c1ccccc1", commonName: "벤젠 (benzene)" },
    });
    if (r.kind !== "chem") throw new Error("kind 분기 실패");
    expect(r.data.style).toBe("skeletal");
    expect(r.data.aromaticCircle).toBe(false);
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

describe("v4 신규 kind·필드", () => {
  it("space3d는 범위 기본 5, 수선 표시 꺼짐이 기본이다", () => {
    const r = SceneIRSchema.parse({
      ...meta,
      kind: "space3d",
      data: { view: {}, points: [{ at: [1, 2, 3], label: "A" }] },
    });
    if (r.kind !== "space3d") throw new Error("kind 분기 실패");
    expect(r.data.view.range).toBe(5);
    expect(r.data.showProjections).toBe(false);
  });

  it("chemEq는 빈 반응식을 거부한다", () => {
    expect(SceneIRSchema.safeParse({ ...meta, kind: "chemEq", data: { ce: "" } }).success).toBe(false);
    expect(
      SceneIRSchema.safeParse({ ...meta, kind: "chemEq", data: { ce: "2H2 + O2 -> 2H2O" } }).success,
    ).toBe(true);
  });

  it("plot2d 계수 슬라이더는 한 글자 이름만, 최대 4개", () => {
    const base = {
      ...meta,
      kind: "plot2d",
      data: {
        functions: [{ latex: "a\\sin(bx)", kind: "explicit" }],
        view: { xmin: -5, xmax: 5, ymin: -5, ymax: 5 },
      },
    };
    const p = (name: string) => ({ name, value: 1, min: -5, max: 5, step: 0.1 });
    const ok = { ...base, data: { ...base.data, params: [p("a"), p("b")] } };
    const longName = { ...base, data: { ...base.data, params: [p("ab")] } };
    const tooMany = { ...base, data: { ...base.data, params: ["a", "b", "c", "d", "k"].map(p) } };
    expect(SceneIRSchema.safeParse(ok).success).toBe(true);
    expect(SceneIRSchema.safeParse(longName).success).toBe(false);
    expect(SceneIRSchema.safeParse(tooMany).success).toBe(false);
  });

  it("넓이 음영은 x축 기준 + 값 표시가 기본이다", () => {
    const r = SceneIRSchema.parse({
      ...meta,
      kind: "plot2d",
      data: {
        functions: [{ latex: "x^2", kind: "explicit" }],
        view: { xmin: -1, xmax: 3, ymin: -1, ymax: 5 },
        shade: [{ fn: 0, from: 0, to: 2 }],
      },
    });
    if (r.kind !== "plot2d") throw new Error("kind 분기 실패");
    expect(r.data.shade?.[0]?.against).toBe("axis");
    expect(r.data.shade?.[0]?.showValue).toBe(true);
    expect(r.data.view.xTicks).toBe("auto");
  });

  it("shape2d는 도형이 하나도 없으면 거부한다", () => {
    expect(
      SceneIRSchema.safeParse({ ...meta, kind: "shape2d", data: { primitives: [] } }).success,
    ).toBe(false);
  });

  it("카탈로그 밖 입체는 거부한다 (카탈로그 매칭 원칙)", () => {
    expect(
      SceneIRSchema.safeParse({ ...meta, kind: "solid3d", data: { solid: "torus", params: {} } })
        .success,
    ).toBe(false);
    expect(
      SceneIRSchema.safeParse({ ...meta, kind: "solid3d", data: { solid: "conicalFrustum", params: {} } })
        .success,
    ).toBe(true);
  });
});
