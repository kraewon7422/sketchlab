import initRDKit from "@rdkit/rdkit";
import { beforeAll, describe, expect, it } from "vitest";
import { chem } from "../render/theme";
import { layoutMolecule, type ChemDrawing } from "./layout";
import { CHEM_EXAMPLES, chemFromInput, looksLikeSmiles, MOLECULES } from "./names";
import { moleculeJson } from "./rdkit";

let rd: Awaited<ReturnType<typeof initRDKit>>;
beforeAll(async () => {
  rd = await initRDKit();
}, 60_000);

function draw(smiles: string, opts: { full?: boolean; circle?: boolean } = {}): ChemDrawing {
  const json = moleculeJson(rd, smiles, opts.full ?? false);
  if (!json) throw new Error("bad smiles");
  return layoutMolecule(json, { ...chem, showCarbons: opts.full ?? false, aromaticCircle: opts.circle ?? false });
}

describe("분자 목록", () => {
  it("모든 이름의 SMILES를 RDKit이 읽고, 그림으로 펼칠 수 있다", () => {
    for (const [smiles, name] of MOLECULES) {
      const mol = rd.get_mol(smiles);
      expect(mol?.is_valid(), `${name} ${smiles}`).toBe(true);
      mol?.delete();
      const d = draw(smiles);
      expect(d.lines.length + d.labels.length, name).toBeGreaterThan(0);
    }
  });

  it("예시 칩의 이름은 모두 목록에 있다 · 이름이 겹치지 않는다", () => {
    for (const n of CHEM_EXAMPLES) expect(chemFromInput(n)?.name, n).toBe(n);
    // 띄어쓰기만 다른 같은 분자의 이름("이산화 탄소"·"이산화탄소")은 괜찮다 — 다른 분자끼리 겹치면 안 된다
    const names = MOLECULES.flatMap(([, ...ns]) => [...new Set(ns.map((x) => x.toLowerCase().replace(/\s+/g, "")))]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("화학 입력 구분", () => {
  it("이름(한국어·영어)과 SMILES를 알아본다", () => {
    expect(chemFromInput("벤젠")).toEqual({ smiles: "c1ccccc1", name: "벤젠" });
    expect(chemFromInput("Ethanol")?.name).toBe("에탄올");
    expect(chemFromInput("CC(=O)O")).toEqual({ smiles: "CC(=O)O", guessed: true });
    expect(chemFromInput("smiles: N#N")?.smiles).toBe("N#N");
  });

  it("수식은 화학으로 오인하지 않는다", () => {
    for (const s of ["y=x^2", "x^2+y^2=4", "sin(x)", "cos", "A(2,3,4)", String.raw`\int_0^2 x^2 dx`, "y=2^x", "H2O"]) {
      expect(looksLikeSmiles(s), s).toBe(false);
    }
  });
});

describe("골격식 그리기 (RDKit 배치 + 교과서 관행)", () => {
  it("벤젠: 육각형 6결합 + 안쪽 이중선 3개 = 선 9개, 탄소 기호 없음", () => {
    const d = draw("c1ccccc1");
    expect(d.lines).toHaveLength(9);
    expect(d.labels).toHaveLength(0);
    expect(d.circles).toHaveLength(0);
  });

  it("벤젠 원 표기: 이중선 대신 원 하나", () => {
    const d = draw("c1ccccc1", { circle: true });
    expect(d.lines).toHaveLength(6);
    expect(d.circles).toHaveLength(1);
    const r = d.circles[0]?.r ?? 0;
    expect(r).toBeGreaterThan(chem.bond * 0.4);
    expect(r).toBeLessThan(chem.bond * 0.7);
  });

  it("고리 이중결합의 둘째 선은 고리 안쪽에 있다", () => {
    const d = draw("c1ccccc1");
    const all = d.lines.flat();
    const cx = all.reduce((s, p) => s + p[0], 0) / all.length;
    const cy = all.reduce((s, p) => s + p[1], 0) / all.length;
    const dist = d.lines.map(([p, q]) => Math.hypot((p[0] + q[0]) / 2 - cx, (p[1] + q[1]) / 2 - cy)).sort((a, b) => a - b);
    // 짧은 안쪽 선 3개는 바깥 6변보다 중심에 가깝다
    expect(dist[2]).toBeLessThan((dist[3] ?? 0) - 3);
  });

  it("결합 길이는 설정한 px 그대로", () => {
    const d = draw("CCCC");
    for (const [p, q] of d.lines) expect(Math.hypot(q[0] - p[0], q[1] - p[1])).toBeCloseTo(chem.bond, 0);
  });

  it("에탄올: O에 H가 붙어 OH, 결합선은 기호 앞에서 끊긴다", () => {
    const d = draw("CCO");
    expect(d.labels).toHaveLength(1);
    expect(d.labels[0]).toMatchObject({ symbol: "O", hydrogens: 1 });
    const o = d.labels[0]?.at as [number, number];
    const nearest = Math.min(...d.lines.flat().map((p) => Math.hypot(p[0] - o[0], p[1] - o[1])));
    expect(nearest).toBeGreaterThan(chem.bond * 0.25);
  });

  it("아세트산 C=O는 가운데 대칭 두 줄", () => {
    const d = draw("CC(=O)O");
    expect(d.lines).toHaveLength(4);
    const o = d.labels.find((l) => l.hydrogens === 0)?.at as [number, number];
    // 끝 O 쪽 두 줄은 O에서 같은 거리
    const ends = d.lines.map(([p, q]) => Math.min(Math.hypot(p[0] - o[0], p[1] - o[1]), Math.hypot(q[0] - o[0], q[1] - o[1])));
    const toO = ends.filter((e) => e < chem.bond * 0.5).sort((a, b) => a - b);
    expect(toO).toHaveLength(2);
    expect(Math.abs((toO[0] ?? 0) - (toO[1] ?? 0))).toBeLessThan(0.5);
  });

  it("삼중결합은 선 3개", () => {
    expect(draw("C#C").lines).toHaveLength(3);
  });

  it("전하를 쓴다 (나이트로기 N⁺, O⁻)", () => {
    const d = draw("O=[N+]([O-])c1ccccc1");
    expect(d.labels.map((l) => l.charge).sort()).toEqual(["", "+", "−"]);
  });

  it("완전 구조식은 C·H를 모두 쓴다 (메테인 = C 1 + H 4)", () => {
    const d = draw("C", { full: true });
    expect(d.labels.map((l) => l.symbol).sort()).toEqual(["C", "H", "H", "H", "H"]);
    expect(d.lines).toHaveLength(4);
  });

  it("혼자인 탄소·물 분자는 기호로 (CH₄, H₂O)", () => {
    expect(draw("C").labels[0]).toMatchObject({ symbol: "C", hydrogens: 4 });
    expect(draw("O").labels[0]).toMatchObject({ symbol: "O", hydrogens: 2, hLeft: true }); // H₂O
    expect(draw("Cl").labels[0]).toMatchObject({ symbol: "Cl", hydrogens: 1, hLeft: true }); // HCl
    expect(draw("N").labels[0]).toMatchObject({ symbol: "N", hydrogens: 3, hLeft: false }); // NH₃
    expect(draw("C").labels[0]).toMatchObject({ hLeft: false }); // CH₄
  });

  it("목록의 모든 분자가 그려진다", () => {
    for (const name of ["나프탈렌", "카페인", "포도당", "아스피린", "피리딘"]) {
      const c = chemFromInput(name);
      expect(c, name).not.toBeNull();
      const d = draw(c?.smiles ?? "");
      expect(d.width, name).toBeGreaterThan(chem.bond);
      expect(d.lines.length, name).toBeGreaterThan(5);
    }
  });

  it("잘못된 SMILES는 null", () => {
    expect(moleculeJson(rd, "C1CC(", false)).toBeNull();
  });
});
