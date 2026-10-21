import { toSmiles } from "./iupac";
import { parseName } from "./iupacParse";

/**
 * 화학 구조식 입력 (마스터스펙 v4 §13) — 이름("벤젠", "ethanol") 또는 SMILES("c1ccccc1").
 * 이름 목록은 교과서에 자주 나오는 분자만. 그 밖은 SMILES로 입력한다.
 */

/** [SMILES, 한국어 이름, 다른 이름들…] — 첫 한국어 이름이 그림 아래 캡션이 된다 */
export const MOLECULES: Array<[smiles: string, name: string, ...aliases: string[]]> = [
  ["C", "메테인", "메탄", "methane"],
  ["CC", "에테인", "에탄", "ethane"],
  ["CCC", "프로페인", "프로판", "propane"],
  ["CCCC", "뷰테인", "부탄", "butane"],
  ["C=C", "에텐", "에틸렌", "ethene", "ethylene"],
  ["C#C", "에타인", "아세틸렌", "ethyne", "acetylene"],
  ["CO", "메탄올", "methanol"],
  ["CCO", "에탄올", "ethanol"],
  ["OCC(O)CO", "글리세롤", "glycerol"],
  ["C=O", "폼알데하이드", "포름알데히드", "formaldehyde"],
  ["CC=O", "아세트알데하이드", "acetaldehyde"],
  ["CC(C)=O", "아세톤", "acetone"],
  ["OC=O", "폼산", "포름산", "formic acid"],
  ["CC(=O)O", "아세트산", "초산", "acetic acid"],
  ["CCOC(C)=O", "아세트산 에틸", "ethyl acetate"],
  ["CCOCC", "다이에틸 에터", "diethyl ether"],
  ["ClC(Cl)Cl", "클로로폼", "chloroform"],
  ["C=CCl", "염화 바이닐", "vinyl chloride"],
  ["C1CCCCC1", "사이클로헥세인", "cyclohexane"],
  ["c1ccccc1", "벤젠", "benzene"],
  ["Cc1ccccc1", "톨루엔", "toluene"],
  ["Oc1ccccc1", "페놀", "phenol"],
  ["Nc1ccccc1", "아닐린", "aniline"],
  ["OC(=O)c1ccccc1", "벤조산", "benzoic acid"],
  ["O=[N+]([O-])c1ccccc1", "나이트로벤젠", "nitrobenzene"],
  ["C=Cc1ccccc1", "스타이렌", "styrene"],
  ["c1ccc2ccccc2c1", "나프탈렌", "naphthalene"],
  ["c1ccncc1", "피리딘", "pyridine"],
  ["CC(=O)Oc1ccccc1C(=O)O", "아스피린", "아세틸살리실산", "aspirin"],
  ["OC(=O)c1ccccc1O", "살리실산", "salicylic acid"],
  ["Cn1cnc2c1c(=O)n(C)c(=O)n2C", "카페인", "caffeine"],
  ["OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O", "포도당", "글루코스", "glucose"],
  ["NCC(=O)O", "글라이신", "글리신", "glycine"],
  ["NC(N)=O", "요소", "urea"],
  ["O", "물", "water"],
  ["N", "암모니아", "ammonia"],
  ["O=C=O", "이산화 탄소", "이산화탄소", "carbon dioxide"],
  // 작용기 예시·자주 쓰는 물질
  ["CCCCCCCC", "옥테인", "옥탄", "octane"],
  ["CC(C)O", "아이소프로필 알코올", "이소프로판올", "isopropanol"],
  ["CCCCO", "뷰탄올", "부탄올", "butanol"],
  ["OCCO", "에틸렌 글라이콜", "에틸렌글리콜", "ethylene glycol"],
  ["CN", "메틸아민", "methylamine"],
  ["O=Cc1ccccc1", "벤즈알데하이드", "benzaldehyde"],
  ["CC(O)C(=O)O", "젖산", "락트산", "lactic acid"],
  ["OC(=O)CC(O)(CC(=O)O)C(=O)O", "시트르산", "구연산", "citric acid"],
  ["OC(=O)C(=O)O", "옥살산", "oxalic acid"],
  ["CCCCCCCCCCCCCCCCCC(=O)O", "스테아르산", "stearic acid"],
  ["c1ccc2cc3ccccc3cc2c1", "안트라센", "anthracene"],
  ["c1ccoc1", "퓨란", "furan"],
  ["c1ccsc1", "싸이오펜", "티오펜", "thiophene"],
  ["OO", "과산화 수소", "과산화수소", "hydrogen peroxide"],
  ["OS(=O)(=O)O", "황산", "sulfuric acid"],
  ["O[N+](=O)[O-]", "질산", "nitric acid"],
  ["COc1cc(C=O)ccc1O", "바닐린", "vanillin"],
  ["CC(C)C1CCC(C)CC1O", "멘톨", "menthol"],
  ["Oc1ccc(cc1)C1(OC(=O)c2ccccc12)c1ccc(O)cc1", "페놀프탈레인", "phenolphthalein"],
  // 아미노산
  ["CC(N)C(=O)O", "알라닌", "alanine"],
  ["CC(C)C(N)C(=O)O", "발린", "valine"],
  ["CC(C)CC(N)C(=O)O", "류신", "leucine"],
  ["OCC(N)C(=O)O", "세린", "serine"],
  ["SCC(N)C(=O)O", "시스테인", "cysteine"],
  ["NC(Cc1ccccc1)C(=O)O", "페닐알라닌", "phenylalanine"],
  ["NC(Cc1c[nH]c2ccccc12)C(=O)O", "트립토판", "tryptophan"],
  ["NC(CCC(=O)O)C(=O)O", "글루탐산", "glutamic acid"],
  ["NCCCCC(N)C(=O)O", "라이신", "lysine"],
  // DNA·RNA 염기
  ["Nc1ncnc2[nH]cnc12", "아데닌", "adenine"],
  ["NC1=Nc2[nH]cnc2C(=O)N1", "구아닌", "guanine"],
  ["NC1=NC(=O)NC=C1", "사이토신", "시토신", "cytosine"],
  ["CC1=CNC(=O)NC1=O", "티민", "thymine"],
  ["O=C1C=CNC(=O)N1", "우라실", "uracil"],
  // 당
  ["OC[C@H]1O[C@@](O)(CO)[C@@H](O)[C@@H]1O", "과당", "프럭토스", "fructose"],
  ["OC[C@H]1OC(O)[C@H](O)[C@@H]1O", "리보스", "ribose"],
  ["OC[C@H]1O[C@@](CO)(O[C@H]2O[C@H](CO)[C@@H](O)[C@H](O)[C@H]2O)[C@@H](O)[C@@H]1O", "설탕", "수크로스", "sucrose"],
  // 약·호르몬·비타민
  ["CC(C)Cc1ccc(cc1)C(C)C(=O)O", "이부프로펜", "ibuprofen"],
  ["CC(=O)Nc1ccc(O)cc1", "아세트아미노펜", "타이레놀", "paracetamol", "acetaminophen"],
  ["CC1(C)S[C@@H]2[C@H](NC(=O)Cc3ccccc3)C(=O)N2[C@H]1C(=O)O", "페니실린 G", "페니실린", "penicillin"],
  ["CN1CCC[C@H]1c1cccnc1", "니코틴", "nicotine"],
  ["NCCc1ccc(O)c(O)c1", "도파민", "dopamine"],
  ["NCCc1c[nH]c2ccc(O)cc12", "세로토닌", "serotonin"],
  ["CNC[C@H](O)c1ccc(O)c(O)c1", "아드레날린", "에피네프린", "adrenaline", "epinephrine"],
  ["OC[C@H](O)[C@H]1OC(=O)C(O)=C1O", "비타민 C", "아스코르브산", "vitamin c", "ascorbic acid"],
  ["CC(C)CCC[C@@H](C)[C@H]1CC[C@H]2[C@@H]3CC=C4C[C@@H](O)CC[C@]4(C)[C@H]3CC[C@]12C", "콜레스테롤", "cholesterol"],
  ["COc1cc(CNC(=O)CCCC/C=C/C(C)C)ccc1O", "캡사이신", "capsaicin"],
];

const key = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const BY_NAME = new Map<string, { smiles: string; name: string }>();
for (const [smiles, name, ...aliases] of MOLECULES) {
  for (const n of [name, ...aliases]) BY_NAME.set(key(n), { smiles, name });
}

/** FormulaSheet 칩에 보일 분자 */
export const CHEM_EXAMPLES = [
  "벤젠",
  "에탄올",
  "아세트산",
  "페놀",
  "나프탈렌",
  "아스피린",
  "카페인",
  "포도당",
  "설탕",
  "비타민 C",
  "이부프로펜",
  "아세트아미노펜",
  "페니실린 G",
  "도파민",
  "세로토닌",
  "아드레날린",
  "콜레스테롤",
  "캡사이신",
  "바닐린",
  "멘톨",
  "글라이신",
  "트립토판",
  "아데닌",
  "구아닌",
  "사이토신",
  "티민",
  "우라실",
  "페놀프탈레인",
] as const;

/**
 * SMILES처럼 생긴 입력인지 (RDKit을 부르기 전 빠른 거르기).
 * 수식(y=x^2, x+1, sin x)과 겹치지 않게: 원소 기호·고리 번호·결합 기호만, 그리고 탄소나 방향족 c가 있어야 한다.
 */
export function looksLikeSmiles(input: string): boolean {
  const s = input.trim();
  if (s.length < 2 || /\s/.test(s)) return false;
  if (!/^[BCNOPSFIHclnospbr0-9()[\]=#@+\-/\\.%]+$/.test(s)) return false;
  if (!/[Cc]/.test(s)) return false;
  // 소문자만 있는 건 단어일 가능성 (예: "cos")
  if (!/[A-Z]/.test(s) && !/\d/.test(s)) return false;
  return true;
}

/**
 * 이름 또는 SMILES → 그릴 분자. 화학 입력이 아니면 null.
 * guessed: SMILES처럼 생겨서 추측한 것 — RDKit이 못 읽으면 수식으로 다시 시도한다.
 */
export function chemFromInput(input: string): { smiles: string; name?: string; guessed?: boolean } | null {
  const t = input.trim();
  if (!t) return null;
  const named = BY_NAME.get(key(t));
  if (named) return named;
  // IUPAC 이름 (사슬 분자) — "3-methylbutan-1-ol", "2-메틸프로페인"
  const p = parseName(t);
  if (p) {
    const smiles = toSmiles(p.mol);
    if (p.exact || !p.naming) return { smiles };
    // 규칙에 어긋난 이름: 구조는 그리고, 캡션에 바로잡은 이름
    return { smiles, name: `“${t}” → 올바른 이름: ${p.naming.ko} (${p.naming.en})` };
  }
  const prefixed = /^smiles\s*:\s*(\S+)$/i.exec(t);
  if (prefixed) return { smiles: prefixed[1] as string };
  return looksLikeSmiles(t) ? { smiles: t, guessed: true } : null;
}
