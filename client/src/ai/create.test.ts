import { describe, expect, it } from "vitest";
import { CreatePlan, planToObjects } from "./create";

const item = (p: Partial<CreatePlan["items"][number]>): CreatePlan["items"][number] => ({
  type: "text",
  name: "",
  korean: "",
  smiles: "",
  ce: "",
  latex: "",
  text: "",
  ...p,
});

describe("AI 계획 → 페이지에 놓을 객체", () => {
  it("반응식·그래프·수식·글자를 각각 알맞은 객체로", async () => {
    const plan: CreatePlan = {
      items: [
        item({ type: "reaction", ce: "CH3CH2OH + [O] -> CH3CHO + H2O" }),
        item({ type: "graph", latex: String.raw`y=e^{-0.3x}\cos(2x)` }),
        item({ type: "formula", latex: "E=mc^2" }),
        item({ type: "text", text: "1차 알코올 → 알데하이드" }),
      ],
      note: "",
    };
    const { objects, skipped } = await planToObjects(plan, 480);
    expect(skipped).toEqual([]);
    expect(objects.map((o) => o.ir.kind)).toEqual(["chemEq", "plot2d", "formula", "text"]);
    for (const o of objects) {
      expect(o.width).toBeGreaterThan(0);
      expect(o.width).toBeLessThanOrEqual(480);
      expect(o.ir.source).toBe("vlm");
    }
  });

  it("빈 항목은 건너뛰고, 그래프로 못 그리는 식은 이유를 남긴다", async () => {
    const plan: CreatePlan = { items: [item({ type: "reaction", ce: "" }), item({ type: "graph", latex: String.raw`\frac{` })], note: "" };
    const { objects, skipped } = await planToObjects(plan, 480);
    expect(objects).toHaveLength(0);
    expect(skipped).toEqual([String.raw`\frac{`]);
  });

  it("모델 답 형식 검사: 항목은 8개까지", () => {
    const many = { items: Array.from({ length: 9 }, () => item({})), note: "" };
    expect(CreatePlan.safeParse(many).success).toBe(false);
  });
});
