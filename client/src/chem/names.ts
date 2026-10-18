/**
 * 화학 구조식 입력 (마스터스펙 v4 §13) — 이름("벤젠", "ethanol") 또는 SMILES("c1ccccc1").
 * 이름 목록은 교과서에 자주 나오는 분자만. 그 밖은 SMILES로 입력한다.
 */

/** [SMILES, 한국어 이름, 다른 이름들…] — 첫 한국어 이름이 그림 아래 캡션이 된다 */
const MOLECULES: Array<[smiles: string, name: string, ...aliases: string[]]> = [
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
];

const key = (s: string) => s.toLowerCase().replace(/\s+/g, "");
const BY_NAME = new Map<string, { smiles: string; name: string }>();
for (const [smiles, name, ...aliases] of MOLECULES) {
  for (const n of [name, ...aliases]) BY_NAME.set(key(n), { smiles, name });
}

/** FormulaSheet 칩에 보일 분자 */
export const CHEM_EXAMPLES = ["벤젠", "에탄올", "아세트산", "페놀", "나프탈렌", "아스피린", "카페인", "포도당"] as const;

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
  const prefixed = /^smiles\s*:\s*(\S+)$/i.exec(t);
  if (prefixed) return { smiles: prefixed[1] as string };
  return looksLikeSmiles(t) ? { smiles: t, guessed: true } : null;
}
