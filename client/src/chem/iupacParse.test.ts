import { describe, expect, it } from "vitest";
import { nameSmiles, toSmiles } from "./iupac";
import { parseName } from "./iupacParse";

describe("이름 → 구조", () => {
  // 이름 → 분자 → 다시 이름: 처음 이름과 같아야 한다
  it.each([
    "2-methylpropane",
    "4-ethyl-2-methylhexane",
    "2,2-dimethylpropane",
    "but-2-ene",
    "buta-1,3-diene",
    "pent-1-en-4-yne",
    "3-methylbutan-1-ol",
    "butane-2,3-diol",
    "but-3-en-2-ol",
    "propan-2-one",
    "pentane-2,4-dione",
    "butanal",
    "butanoic acid",
    "butanedioic acid",
    "2-methylpropanoic acid",
    "propan-2-amine",
    "1,2-dichloroethane",
    "trichloromethane",
    "4-hydroxybutan-2-one",
    "5-isopropylnonane",
    "4-tert-butyloctane",
    "ethanol",
    "ethene",
    "ethyne",
    "5-(2-methylpropyl)nonane",
  ])("%s", (name) => {
    const p = parseName(name);
    expect(p, name).not.toBeNull();
    expect(p!.naming?.en).toBe(name.replace("5-(2-methylpropyl)nonane", "5-isobutylnonane"));
  });
  it("한국어 이름도", () => {
    for (const [ko, en] of [
      ["2-메틸프로페인", "2-methylpropane"],
      ["4-에틸-2-메틸헥세인", "4-ethyl-2-methylhexane"],
      ["3-메틸뷰탄-1-올", "3-methylbutan-1-ol"],
      ["뷰트-2-엔", "but-2-ene"],
      ["뷰타-1,3-다이엔", "buta-1,3-diene"],
      ["프로판-2-온", "propan-2-one"],
      ["뷰탄산", "butanoic acid"],
      ["뷰테인다이오산", "butanedioic acid"],
      ["트라이클로로메테인", "trichloromethane"],
    ]) {
      const p = parseName(ko as string);
      expect(p?.naming?.en, ko).toBe(en);
      expect(p?.exact, ko).toBe(true);
    }
  });
  it("규칙에 어긋난 이름도 그리고, 올바른 이름을 알려 준다", () => {
    const p = parseName("2-ethylpropane")!;
    expect(p.exact).toBe(false);
    expect(p.naming?.en).toBe("2-methylbutane");
    expect(parseName("1-butene")?.naming?.en).toBe("but-1-ene");
  });
  it("화학 이름이 아니면 null", () => {
    for (const s of ["y=x^2", "sin x", "AND", "회로", "벤젠", "hello", "2x+3"]) expect(parseName(s), s).toBeNull();
  });
  it("SMILES로 내보내 RDKit이 그린다", () => {
    const p = parseName("3-methylbutan-1-ol")!;
    expect(nameSmiles(toSmiles(p.mol))?.en).toBe("3-methylbutan-1-ol");
  });
});
