import { describe, expect, it } from "vitest";
import { nameSmiles, parseSmiles, toSmiles } from "./iupac";

const en = (s: string) => nameSmiles(s)?.en;
const ko = (s: string) => nameSmiles(s)?.ko;

describe("IUPAC 이름 — 영어", () => {
  it.each([
    ["C", "methane"],
    ["CC", "ethane"],
    ["CCCC", "butane"],
    ["CC(C)C", "2-methylpropane"],
    ["CC(C)CC", "2-methylbutane"],
    ["CC(C)(C)C", "2,2-dimethylpropane"],
    ["CCC(CC)CC(C)C", "4-ethyl-2-methylhexane"],
    ["CC(C)C(C)CC", "2,3-dimethylpentane"],
    ["C=C", "ethene"],
    ["C=CC", "prop-1-ene"],
    ["CC=CC", "but-2-ene"],
    ["C=CC=C", "buta-1,3-diene"],
    ["C#C", "ethyne"],
    ["CC#CC", "but-2-yne"],
    ["C=CCC#C", "pent-1-en-4-yne"],
    ["CO", "methanol"],
    ["CCO", "ethanol"],
    ["CC(C)O", "propan-2-ol"],
    ["CC(C)CCO", "3-methylbutan-1-ol"],
    ["CC(O)C(C)O", "butane-2,3-diol"],
    ["C=CC(C)O", "but-3-en-2-ol"],
    ["CC(C)=O", "propan-2-one"],
    ["CCC(=O)CC", "pentan-3-one"],
    ["CC(=O)CC(C)=O", "pentane-2,4-dione"],
    ["CC=O", "ethanal"],
    ["CCCC=O", "butanal"],
    ["CC(=O)O", "ethanoic acid"],
    ["CCCC(=O)O", "butanoic acid"],
    ["OC(=O)CCC(=O)O", "butanedioic acid"],
    ["CC(C)C(=O)O", "2-methylpropanoic acid"],
    ["CCN", "ethanamine"],
    ["CC(N)C", "propan-2-amine"],
    ["CCCl", "chloroethane"],
    ["ClCCCl", "1,2-dichloroethane"],
    ["ClC(Cl)Cl", "trichloromethane"],
    ["CC(Br)CC", "2-bromobutane"],
    ["OCCCl", "2-chloroethan-1-ol"],
    ["CC(=O)CCO", "4-hydroxybutan-2-one"],
    ["CCCCC(C(C)C)CCCC", "5-isopropylnonane"],
    ["CCC(C(C)C)CCC", "3-ethyl-2-methylhexane"],
    ["CCCC(C(C)(C)C)CCCC", "4-tert-butyloctane"],
    ["CCCCC(CC(C)C)CCCC", "5-isobutylnonane"],
    ["CCCCCC(C(C)CC)CCCCC", "6-sec-butylundecane"],
  ])("%s → %s", (smiles, name) => {
    expect(en(smiles)).toBe(name);
  });
  it("가장 긴 사슬을 고른다 (그려진 모양과 상관없이)", () => {
    // 위로 꺾인 곁가지가 실은 주 사슬의 일부
    expect(en("C(CC)(CCC)C")).toBe("3-methylhexane");
  });
});

describe("IUPAC 이름 — 한국어 (대한화학회)", () => {
  it.each([
    ["CC(C)C", "2-메틸프로페인"],
    ["CCC(CC)CC(C)C", "4-에틸-2-메틸헥세인"],
    ["CCO", "에탄올"],
    ["CC(C)O", "프로판-2-올"],
    ["CC(C)CCO", "3-메틸뷰탄-1-올"],
    ["CC(O)C(C)O", "뷰테인-2,3-다이올"],
    ["CC=CC", "뷰트-2-엔"],
    ["C=CC=C", "뷰타-1,3-다이엔"],
    ["C=C", "에텐"],
    ["C#C", "에타인"],
    ["CC(C)=O", "프로판-2-온"],
    ["CCCC(=O)O", "뷰탄산"],
    ["OC(=O)CCC(=O)O", "뷰테인다이오산"],
    ["CCCC=O", "뷰탄알"],
    ["ClC(Cl)Cl", "트라이클로로메테인"],
  ])("%s → %s", (smiles, name) => {
    expect(ko(smiles)).toBe(name);
  });
});

describe("IUPAC — 조각·설명·지원 범위", () => {
  it("퍼즐 조각을 이으면 이름 (하이픈·쉼표 무시)", () => {
    for (const s of ["CC(C)CCO", "CCC(CC)CC(C)C", "C=CC(C)O", "CC(=O)CC(C)=O", "OC(=O)CCC(=O)O", "C=CCC#C"]) {
      const n = nameSmiles(s)!;
      const strip = (t: string) => t.replace(/[-,\s]/g, "");
      expect(strip(n.pieces.en.join(""))).toBe(strip(n.en));
      expect(strip(n.pieces.ko.join(""))).toBe(strip(n.ko));
    }
    expect(nameSmiles("CC(C)CCO")!.pieces.en).toEqual(["3", "methyl", "butan", "1", "ol"]);
  });
  it("주 사슬과 번호: 3-methylbutan-1-ol은 OH 쪽 탄소가 1번", () => {
    const n = nameSmiles("CC(C)CCO")!;
    expect(n.chain).toEqual([4, 3, 1, 0]);
    expect(n.principal).toBe("ol");
    expect(n.steps.length).toBeGreaterThan(2);
  });
  it("고리·에테르·에스터는 아직 null", () => {
    expect(nameSmiles("C1CCCCC1")).toBeNull();
    expect(nameSmiles("c1ccccc1")).toBeNull();
    expect(nameSmiles("COC")).toBeNull();
    expect(nameSmiles("CC(=O)OC")).toBeNull();
  });
  it("SMILES 읽고 쓰기", () => {
    const m = parseSmiles("CC(C)C(=O)O")!;
    expect(m.atoms).toEqual(["C", "C", "C", "C", "O", "O"]);
    expect(toSmiles(m)).toBe("CC(C)C(=O)O");
    expect(parseSmiles("C(C)(C)(C)(C)C")).toBeNull(); // 탄소 원자가 넘침
  });
});
