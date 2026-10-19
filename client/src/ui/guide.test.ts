import { SceneIRSchema } from "@sketchlab/shared";
import katex from "katex";
import { describe, expect, it } from "vitest";
import { buildFromInput } from "../math/build";
import { GUIDE, SYMBOLS } from "./LatexGuide";

/** 작성법에 보여 주는 예시는 모두 실제로 그려져야 한다 — 틀린 예시를 가르치지 않게 */
describe("ƒ 작성법 예시", () => {
  const graphs = new Set(["그래프 — y= 로 시작하거나 x만 있는 식"]);
  for (const group of GUIDE) {
    for (const row of group.rows) {
      it(`${group.title} · ${row.what}: ${row.code}`, () => {
        const r = buildFromInput(row.code);
        if (!r.ok) throw new Error(r.message);
        expect(SceneIRSchema.safeParse(r.ir).success).toBe(true);
        if (graphs.has(group.title) && !row.code.startsWith("\\int")) expect(r.ir.kind).toBe("plot2d");
        // 미리보기·객체가 KaTeX로 오류 없이 그려진다
        if (r.ir.kind === "formula") expect(() => katex.renderToString(r.ir.kind === "formula" ? r.ir.data.latex : "", { throwOnError: true })).not.toThrow();
      });
    }
  }

  it("기호표는 KaTeX가 모두 그린다", () => {
    for (const s of SYMBOLS) expect(() => katex.renderToString(s, { throwOnError: true })).not.toThrow();
  });
});
