import { describe, expect, it } from "vitest";
import { migrateIR, parseStoredIR } from "./migrate";

const v3 = { version: "3.0", confidence: 0.8, source: "vlm" } as const;

describe("migrateIR v3 → v4", () => {
  it("버전만 다른 객체는 버전만 올린다", () => {
    const ir = parseStoredIR({ ...v3, kind: "formula", data: { latex: "x^2" } });
    expect(ir?.version).toBe("4.0");
    expect(ir?.kind).toBe("formula");
  });

  it("plot3d는 space3d.surfaces로 흡수되고 범위는 가장 큰 절댓값", () => {
    const ir = parseStoredIR({
      ...v3,
      kind: "plot3d",
      data: {
        surfaces: [{ latex: "x^2+y^2", kind: "explicit" }],
        view: { xmin: -2, xmax: 2, ymin: -3, ymax: 3, zmin: 0, zmax: 8 },
        resolution: 48,
      },
    });
    if (ir?.kind !== "space3d") throw new Error("space3d로 바뀌지 않았다");
    expect(ir.data.surfaces).toEqual([{ latex: "x^2+y^2" }]);
    expect(ir.data.view.range).toBe(8);
  });

  it("chem.display → chem.style", () => {
    const ir = parseStoredIR({ ...v3, kind: "chem", data: { smiles: "c1ccccc1", display: "kekule" } });
    if (ir?.kind !== "chem") throw new Error("kind 분기 실패");
    expect(ir.data.style).toBe("kekule");
    expect("display" in ir.data).toBe(false);
  });

  it("입력 객체를 변형하지 않는다", () => {
    const raw = { ...v3, kind: "chem", data: { smiles: "C", display: "skeletal" } };
    const before = JSON.stringify(raw);
    migrateIR(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("모르는 버전·쓰레기 입력은 통과시키지 않는다", () => {
    expect(parseStoredIR({ ...v3, version: "2.0", kind: "formula", data: { latex: "x" } })).toBeNull();
    expect(parseStoredIR(null)).toBeNull();
    expect(parseStoredIR("formula")).toBeNull();
    expect(parseStoredIR({ ...v3, kind: "chem", data: { primitives: [] } })).toBeNull();
  });
});
