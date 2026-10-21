import { describe, expect, it } from "vitest";
import { nameSmiles } from "./iupac";
import { grade, makePuzzle, solved, todaySeed } from "./namingPuzzle";

describe("이름 퍼즐", () => {
  it("문제마다 답 조각이 고를 조각 안에 다 있고, 이름이 구조와 맞다", () => {
    for (let seed = 1; seed <= 60; seed++)
      for (const level of ["easy", "medium"] as const) {
        const p = makePuzzle(seed, level);
        expect(nameSmiles(p.smiles)?.en).toBe(p.naming.en);
        for (const lang of ["en", "ko"] as const) {
          const pool = [...p.tiles[lang]];
          for (const a of p.answer[lang]) {
            const k = pool.indexOf(a);
            expect(k, `${seed} ${level} ${lang} ${a}`).toBeGreaterThanOrEqual(0);
            pool.splice(k, 1);
          }
          expect(pool.length, `${seed} ${level} 헷갈리는 조각`).toBeGreaterThanOrEqual(1);
        }
      }
  });
  it("같은 씨앗 = 같은 문제 (오늘의 문제)", () => {
    expect(makePuzzle(20261021, "easy")).toEqual(makePuzzle(20261021, "easy"));
    expect(todaySeed(new Date(2026, 9, 21))).toBe(20261021);
  });
  it("중급은 작용기·다중 결합이 있다", () => {
    const fam = new Set<string>();
    for (let s = 1; s <= 40; s++) fam.add(makePuzzle(s, "medium").naming.family);
    expect(fam.size).toBeGreaterThanOrEqual(4);
  });
  it("색 매기기 (워들 규칙)", () => {
    const ans = ["3", "methyl", "butan", "1", "ol"];
    expect(grade(["3", "methyl", "butan", "1", "ol"], ans)).toEqual(["green", "green", "green", "green", "green"]);
    expect(grade(["1", "methyl", "butan", "3", "one"], ans)).toEqual(["yellow", "green", "green", "yellow", "gray"]);
    expect(grade(["2", "2", "dimethyl"], ["2", "3", "dimethyl"])).toEqual(["green", "gray", "green"]);
    expect(solved(["3", "methyl", "butan", "1", "ol"], ans)).toBe(true);
    expect(solved(["3", "methyl", "butan", "1"], ans)).toBe(false);
  });
});
