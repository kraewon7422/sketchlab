import { describe, expect, it } from "vitest";
import { parseVenn, vennContains, vennLatex } from "./venn";

/** 영역 이름 → 그 영역의 점이 칠해지는가 (예: "A" = A에만, "AB" = A∩B에만, "" = 바깥) */
const shaded = (input: string, region: string): boolean => {
  const v = parseVenn(input);
  if (!v) throw new Error(`못 읽음: ${input}`);
  return vennContains(v, (s) => region.includes(s));
};

describe("벤 다이어그램", () => {
  it("교집합·합집합·차집합·여집합", () => {
    expect(["A", "B", "AB", ""].map((r) => shaded("A∩B", r))).toEqual([false, false, true, false]);
    expect(["A", "B", "AB", ""].map((r) => shaded("A∪B", r))).toEqual([true, true, true, false]);
    expect(["A", "B", "AB", ""].map((r) => shaded("A-B", r))).toEqual([true, false, false, false]);
    expect(["A", "B", "AB", ""].map((r) => shaded("벤 A^c", r))).toEqual([false, true, false, true]);
    expect(["A", "B", "AB", ""].map((r) => shaded("(A\\cup B)^{c}", r))).toEqual([false, false, false, true]);
  });

  it("∩가 ∪보다 먼저 · 세 집합", () => {
    // A ∪ (B∩C)
    expect(shaded("A∪B∩C", "A")).toBe(true);
    expect(shaded("A∪B∩C", "B")).toBe(false);
    expect(shaded("A∪B∩C", "BC")).toBe(true);
    const v = parseVenn("(A\\cup B)\\cap C");
    expect(v?.sets).toEqual(["A", "B", "C"]);
    expect(shaded("(A\\cup B)\\cap C", "AC")).toBe(true);
    expect(shaded("(A\\cup B)\\cap C", "C")).toBe(false);
  });

  it("집합 식이 아니면 null · LaTeX로 다시 쓰기", () => {
    expect(parseVenn("y=x^2")).toBeNull();
    expect(parseVenn("A")).toBeNull();
    expect(parseVenn("2x-y=1")).toBeNull();
    expect(vennLatex(parseVenn("A∩Bᶜ") as NonNullable<ReturnType<typeof parseVenn>>)).toBe("A\\cap B^{c}");
  });
});
