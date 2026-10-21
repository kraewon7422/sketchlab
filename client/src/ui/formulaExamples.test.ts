import { SceneIRSchema } from "@sketchlab/shared";
import { describe, expect, it } from "vitest";
import { buildFromInput } from "../math/build";
import { GROUPS } from "./formulaExamples";
import { chemFromInput } from "../chem/names";

describe("ƒ 예시 단추", () => {
  it("같은 예시·같은 이름은 한 번만 (묶음끼리 겹치지 않는다)", () => {
    const inputs = GROUPS.flatMap((g) => g.examples.map(([, input]) => input));
    const labels = GROUPS.flatMap((g) => g.examples.map(([label]) => label));
    expect(new Set(inputs).size).toBe(inputs.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(GROUPS.map((g) => g.title)).size).toBe(GROUPS.length);
  });

  it("삼각·역삼각·쌍곡선 함수가 모두 있다", () => {
    const trig = GROUPS.find((g) => g.title.startsWith("삼각함수"))?.examples.map(([l]) => l) ?? [];
    expect(trig).toEqual(["sin", "cos", "tan", "csc", "sec", "cot", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh"]);
  });

  for (const g of GROUPS) {
    for (const [label, input] of g.examples) {
      it(`${g.title} · ${label} 이(가) 그려진다`, () => {
        // 화학 이름(IUPAC)은 시트가 구조식으로 먼저 보낸다
        if (chemFromInput(input)) return;
        const r = buildFromInput(input);
        if (!r.ok) throw new Error(r.message);
        expect(SceneIRSchema.safeParse(r.ir).success).toBe(true);
      });
    }
  }
});
