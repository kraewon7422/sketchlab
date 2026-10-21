/**
 * 사슬 분자 IUPAC 이름 짓기 (2013 권고, 고리 없는 분자) — RDKit 없이 앱이 직접.
 *   되는 것: 알케인·알켄·알카인, 할로젠(F Cl Br I), 알코올 -ol, 아민 -amine, 케톤 -one, 알데하이드 -al, 카복실산 -oic acid
 *   곁가지: 알킬(메틸 … , 아이소프로필·sec-/tert-뷰틸·아이소뷰틸, 복잡하면 (2-메틸프로필) 처럼)
 *   안 되는 것: 고리, 에테르·에스터(산소가 탄소 둘을 잇는 것), 곁가지 속 작용기·다중 결합 → null
 * 차례: 주 작용기 수 → 사슬 길이 → 다중 결합 수 → 이중 결합 수 → 주 작용기 번호 → 다중 결합 번호 → 이중 결합 번호
 *       → 곁가지 수 → 곁가지 번호 → 알파벳 먼저인 곁가지의 번호
 * 이름은 영어·한국어(대한화학회 표기) 두 가지, 퍼즐용 조각(pieces)도 함께.
 */

export type El = "C" | "O" | "N" | "F" | "Cl" | "Br" | "I";
export interface Mol {
  atoms: El[];
  /** [a, b, 결합 차수 1·2·3] */
  bonds: Array<[number, number, number]>;
}

const VALENCE: Record<El, number> = { C: 4, N: 3, O: 2, F: 1, Cl: 1, Br: 1, I: 1 };

// ─────────────────────────────────────────────────────────── SMILES (고리 없는 것만)

/** 사슬 SMILES → 분자. 고리 숫자·방향족(소문자)·점(.)은 null */
export function parseSmiles(smiles: string): Mol | null {
  const s = smiles.trim();
  if (!s || /[0-9%.]|[cnos]/.test(s.replace(/Cl|Br|\[[^\]]*\]/g, ""))) return null;
  const mol: Mol = { atoms: [], bonds: [] };
  const stack: number[] = [];
  let prev = -1;
  let order = 1;
  let i = 0;
  while (i < s.length) {
    const ch = s[i] as string;
    if (ch === "(") {
      if (prev < 0) return null;
      stack.push(prev);
      i++;
      continue;
    }
    if (ch === ")") {
      const p = stack.pop();
      if (p === undefined) return null;
      prev = p;
      i++;
      continue;
    }
    if (ch === "-" || ch === "=" || ch === "#") {
      order = ch === "-" ? 1 : ch === "=" ? 2 : 3;
      i++;
      continue;
    }
    let el: El;
    if (s.startsWith("Cl", i) || s.startsWith("Br", i)) {
      el = s.slice(i, i + 2) as El;
      i += 2;
    } else if (ch === "[") {
      const end = s.indexOf("]", i);
      if (end < 0) return null;
      const m = /^([A-Z][a-z]?)H?\d?$/.exec(s.slice(i + 1, end));
      if (!m || !(m[1] as string in VALENCE)) return null;
      el = m[1] as El;
      i = end + 1;
    } else if ("CONFI".includes(ch)) {
      el = ch as El;
      i++;
    } else return null;
    const idx = mol.atoms.push(el) - 1;
    if (prev >= 0) mol.bonds.push([prev, idx, order]);
    prev = idx;
    order = 1;
  }
  if (stack.length || mol.atoms.length === 0) return null;
  return valid(mol) ? mol : null;
}

/** 원자마다 결합 차수 합이 원자가를 넘지 않는가 */
export function valid(mol: Mol): boolean {
  const used = mol.atoms.map(() => 0);
  for (const [a, b, o] of mol.bonds) {
    used[a]! += o;
    used[b]! += o;
  }
  return mol.atoms.every((el, i) => (used[i] as number) <= VALENCE[el]);
}

export function hydrogens(mol: Mol, i: number): number {
  let used = 0;
  for (const [a, b, o] of mol.bonds) if (a === i || b === i) used += o;
  return VALENCE[mol.atoms[i] as El] - used;
}

function neighbors(mol: Mol, i: number): Array<{ j: number; o: number }> {
  const out: Array<{ j: number; o: number }> = [];
  for (const [a, b, o] of mol.bonds) {
    if (a === i) out.push({ j: b, o });
    else if (b === i) out.push({ j: a, o });
  }
  return out;
}

/** 분자 → SMILES (원자 0부터, 원자 순서 = 처음 나오는 차례) */
export function toSmiles(mol: Mol, start = 0): string {
  if (mol.atoms.length === 0) return "";
  const seen = new Set<number>();
  const sym = (o: number) => (o === 2 ? "=" : o === 3 ? "#" : "");
  const walk = (i: number): string => {
    seen.add(i);
    const next = neighbors(mol, i).filter((n) => !seen.has(n.j));
    let out = mol.atoms[i] as string;
    next.forEach((n, k) => {
      if (seen.has(n.j)) return;
      const part = sym(n.o) + walk(n.j);
      out += k < next.length - 1 ? `(${part})` : part;
    });
    return out;
  };
  return walk(start);
}

// ─────────────────────────────────────────────────────────── 이름 짓기

type Principal = "acid" | "al" | "one" | "ol" | "amine";
const RANK: Principal[] = ["acid", "al", "one", "ol", "amine"];
/** 주 작용기가 아닐 때의 접두사 */
const AS_PREFIX: Record<Principal, string> = { acid: "carboxy", al: "oxo", one: "oxo", ol: "hydroxy", amine: "amino" };

export interface NamePart {
  /** 영어 이름 */
  en: string;
  ko: string;
  /** 알파벳 순서 열쇠 */
  key: string;
  locant: number;
  complex: boolean;
}

export interface Naming {
  en: string;
  ko: string;
  /** 퍼즐 조각 (영어·한국어) — 이어 붙이면 이름 (하이픈·쉼표 무시) */
  pieces: { en: string[]; ko: string[] };
  /** 주 사슬 원자 (1번부터 차례로) */
  chain: number[];
  principal: Principal | null;
  /** 이름 짓는 차례 설명 (한국어) */
  steps: string[];
  /** 화합물 종류 (힌트) */
  family: string;
}

const STEM = ["", "meth", "eth", "prop", "but", "pent", "hex", "hept", "oct", "non", "dec", "undec", "dodec", "tridec", "tetradec", "pentadec", "hexadec", "heptadec", "octadec", "nonadec", "icos"];
const KO_ANE = ["", "메테인", "에테인", "프로페인", "뷰테인", "펜테인", "헥세인", "헵테인", "옥테인", "노네인", "데케인", "운데케인", "도데케인"];
const KO_AN = ["", "메탄", "에탄", "프로판", "뷰탄", "펜탄", "헥산", "헵탄", "옥탄", "노난", "데칸", "운데칸", "도데칸"];
const KO_EN = ["", "메트", "에트", "프로프", "뷰트", "펜트", "헥스", "헵트", "옥트", "논", "데크", "운데크", "도데크"];
const KO_A = ["", "메타", "에타", "프로파", "뷰타", "펜타", "헥사", "헵타", "옥타", "노나", "데카", "운데카", "도데카"];
const MULT = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa"];
const KO_MULT = ["", "", "다이", "트라이", "테트라", "펜타", "헥사", "헵타", "옥타"];
const BIS = ["", "", "bis", "tris", "tetrakis"];
const KO_BIS = ["", "", "비스", "트리스", "테트라키스"];
const HALO: Record<string, [string, string]> = { F: ["fluoro", "플루오로"], Cl: ["chloro", "클로로"], Br: ["bromo", "브로모"], I: ["iodo", "아이오도"] };
const PREFIX_KO: Record<string, string> = { hydroxy: "하이드록시", oxo: "옥소", amino: "아미노", carboxy: "카복시" };
const ALKYL_KO = ["", "메틸", "에틸", "프로필", "뷰틸", "펜틸", "헥실", "헵틸", "옥틸", "노닐", "데실", "운데실", "도데실"];
const FAMILY: Record<Principal, string> = { acid: "카복실산 (-oic acid, -산)", al: "알데하이드 (-al, -알)", one: "케톤 (-one, -온)", ol: "알코올 (-ol, -올)", amine: "아민 (-amine, -아민)" };

interface Analysis {
  carbons: number[];
  /** 탄소 → 붙은 작용기·할로젠 이름들 (oxo hydroxy amino F Cl Br I, 카복실산은 acid) */
  groups: Map<number, string[]>;
  cAdj: Map<number, Array<{ j: number; o: number }>>;
}

function analyze(mol: Mol): Analysis | null {
  if (!valid(mol)) return null;
  const carbons = mol.atoms.flatMap((el, i) => (el === "C" ? [i] : []));
  if (carbons.length === 0 || carbons.length > 20) return null;
  const groups = new Map<number, string[]>(carbons.map((c) => [c, []]));
  for (let i = 0; i < mol.atoms.length; i++) {
    const el = mol.atoms[i] as El;
    if (el === "C") continue;
    const nb = neighbors(mol, i);
    // 다른 원자 하나(탄소)에만 붙어야 한다 — 에테르·에스터·과산화물은 아직
    if (nb.length !== 1 || mol.atoms[nb[0]!.j] !== "C") return null;
    const { j, o } = nb[0]!;
    const g = groups.get(j) as string[];
    if (el === "O") g.push(o === 2 ? "oxo" : "hydroxy");
    else if (el === "N") {
      if (o !== 1) return null; // 나이트릴(C≡N)·이민은 아직
      g.push("amino");
    } else g.push(el);
  }
  // 카복실산: 같은 탄소에 =O 와 −OH
  for (const [c, g] of groups) {
    const ox = g.indexOf("oxo");
    const oh = g.indexOf("hydroxy");
    if (ox >= 0 && oh >= 0) {
      g.splice(Math.max(ox, oh), 1);
      g.splice(Math.min(ox, oh), 1);
      g.push("acid");
      groups.set(c, g);
    }
  }
  const cAdj = new Map<number, Array<{ j: number; o: number }>>(carbons.map((c) => [c, neighbors(mol, c).filter((n) => mol.atoms[n.j] === "C")]));
  // 탄소끼리 한 덩어리여야 한다, 고리 없음
  const seen = new Set<number>([carbons[0] as number]);
  const queue = [carbons[0] as number];
  let edges = 0;
  for (const c of carbons) edges += (cAdj.get(c) as unknown[]).length;
  while (queue.length) {
    const c = queue.pop() as number;
    for (const n of cAdj.get(c) ?? [])
      if (!seen.has(n.j)) {
        seen.add(n.j);
        queue.push(n.j);
      }
  }
  if (seen.size !== carbons.length || edges / 2 !== carbons.length - 1) return null;
  return { carbons, groups, cAdj };
}

/** 탄소 c에 붙은 작용기 중 주 작용기 종류 (알데하이드/케톤은 사슬 끝인지로 나눈다) */
function kinds(an: Analysis, c: number): Principal[] {
  const out: Principal[] = [];
  const deg = (an.cAdj.get(c) ?? []).length;
  for (const g of an.groups.get(c) ?? []) {
    if (g === "acid") out.push("acid");
    else if (g === "oxo") out.push(deg <= 1 ? "al" : "one");
    else if (g === "hydroxy") out.push("ol");
    else if (g === "amino") out.push("amine");
  }
  return out;
}

/** 나무에서 두 탄소 사이 길 */
function allPaths(an: Analysis): number[][] {
  const out: number[][] = [];
  for (const s of an.carbons) {
    const walk = (c: number, from: number, path: number[]) => {
      out.push(path);
      for (const n of an.cAdj.get(c) ?? []) if (n.j !== from) walk(n.j, c, [...path, n.j]);
    };
    walk(s, -1, [s]);
  }
  return out;
}

const cmpList = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
  return 0;
};

interface Alkyl {
  en: string;
  ko: string;
  key: string;
  complex: boolean;
}

/** 곁가지 알킬 이름 — root가 주 사슬 from에 붙은 탄소. 곁가지 안에 작용기·다중 결합이 있으면 null */
function alkyl(an: Analysis, root: number, from: number): Alkyl | null {
  // 곁가지 탄소 모으기
  const sub: number[] = [];
  const parent = new Map<number, number>();
  const stack: Array<[number, number]> = [[root, from]];
  while (stack.length) {
    const [c, p] = stack.pop() as [number, number];
    sub.push(c);
    parent.set(c, p);
    if ((an.groups.get(c) ?? []).length) return null;
    for (const n of an.cAdj.get(c) ?? []) {
      if (n.j === p) {
        if (n.o !== 1) return null;
        continue;
      }
      if (n.o !== 1) return null;
      stack.push([n.j, c]);
    }
  }
  const kids = (c: number) => (an.cAdj.get(c) ?? []).map((n) => n.j).filter((j) => j !== parent.get(c));
  const n = sub.length;
  const linear = sub.every((c) => kids(c).length <= 1);
  if (linear && n <= 12) return { en: `${STEM[n]}yl`, ko: ALKYL_KO[n] as string, key: `${STEM[n]}yl`, complex: false };
  // 흔한 이름 (교과서)
  const rk = kids(root);
  const leaf = (c: number) => kids(c).length === 0;
  if (n === 3 && rk.length === 2 && rk.every(leaf)) return { en: "isopropyl", ko: "아이소프로필", key: "isopropyl", complex: false };
  if (n === 4 && rk.length === 3 && rk.every(leaf)) return { en: "tert-butyl", ko: "tert-뷰틸", key: "butyl", complex: false };
  if (n === 4 && rk.length === 2 && rk.some(leaf) && rk.some((k) => kids(k).length === 1 && leaf(kids(k)[0] as number))) return { en: "sec-butyl", ko: "sec-뷰틸", key: "butyl", complex: false };
  if (n === 4 && rk.length === 1 && kids(rk[0] as number).length === 2 && kids(rk[0] as number).every(leaf)) return { en: "isobutyl", ko: "아이소뷰틸", key: "isobutyl", complex: false };
  // 복잡한 곁가지: root부터 가장 긴 사슬을 1번으로, 그 위의 곁가지를 다시 이름 짓는다
  const longest = (c: number): number[] => {
    let best: number[] = [];
    for (const k of kids(c)) {
      const p = longest(k);
      if (p.length > best.length) best = p;
    }
    return [c, ...best];
  };
  const chain = longest(root);
  if (chain.length > 12) return null;
  const parts: NamePart[] = [];
  chain.forEach((c, i) => {
    for (const k of kids(c)) {
      if (chain.includes(k)) continue;
      const a = alkyl(an, k, c);
      if (!a) return;
      parts.push({ en: a.en, ko: a.ko, key: a.key, locant: i + 1, complex: a.complex });
    }
  });
  const pre = prefixText(parts);
  const en = `(${pre.en}${STEM[chain.length]}yl)`;
  return { en, ko: `(${pre.ko}${ALKYL_KO[chain.length]})`, key: en.replace(/[^a-z]/g, ""), complex: true };
}

/** 접두사 묶기: 같은 것끼리 "2,3-dimethyl", 알파벳 순서로 "-"로 잇는다 */
function prefixText(parts: NamePart[], withLocants = true): { en: string; ko: string; pieces: { en: string[]; ko: string[] } } {
  const byName = new Map<string, NamePart[]>();
  for (const p of parts) byName.set(p.en, [...(byName.get(p.en) ?? []), p]);
  const groups = [...byName.values()].sort((a, b) => {
    const ka = (a[0] as NamePart).complex && a.length > 1 ? `${MULT[a.length]}${(a[0] as NamePart).key}` : (a[0] as NamePart).key;
    const kb = (b[0] as NamePart).complex && b.length > 1 ? `${MULT[b.length]}${(b[0] as NamePart).key}` : (b[0] as NamePart).key;
    return ka.localeCompare(kb);
  });
  const en: string[] = [];
  const ko: string[] = [];
  const pieces = { en: [] as string[], ko: [] as string[] };
  for (const g of groups) {
    const p = g[0] as NamePart;
    const locs = g.map((q) => q.locant).sort((a, b) => a - b).join(",");
    const m = g.length;
    const e = p.complex ? (m > 1 ? `${BIS[m]}${p.en}` : p.en) : `${MULT[m]}${p.en}`;
    const k = p.complex ? (m > 1 ? `${KO_BIS[m]}${p.ko}` : p.ko) : `${KO_MULT[m]}${p.ko}`;
    en.push(withLocants ? `${locs}-${e}` : e);
    ko.push(withLocants ? `${locs}-${k}` : k);
    if (withLocants) {
      pieces.en.push(locs);
      pieces.ko.push(locs);
    }
    pieces.en.push(e);
    pieces.ko.push(k);
  }
  return { en: en.join("-"), ko: ko.join("-"), pieces };
}

/** 사슬 분자의 IUPAC 이름. 지원하지 않는 분자면 null */
export function nameMolecule(mol: Mol): Naming | null {
  const an = analyze(mol);
  if (!an) return null;
  // 주 작용기 = 있는 것 중 가장 높은 것
  let principal: Principal | null = null;
  for (const r of RANK) if (an.carbons.some((c) => kinds(an, c).includes(r))) {
    principal = r;
    break;
  }
  const bondOrder = (a: number, b: number) => (an.cAdj.get(a) ?? []).find((n) => n.j === b)?.o ?? 0;

  type Cand = { chain: number[]; key: number[][]; parts: NamePart[]; suffixLocs: number[]; dbl: number[]; tpl: number[] };
  let best: Cand | null = null;
  for (const chain of allPaths(an)) {
    const pos = new Map(chain.map((c, i) => [c, i + 1]));
    // 주 사슬 밖의 탄소에 주 작용기가 있으면 안 된다 (밖의 것은 다른 사슬을 고를 때 셈에서 진다)
    const suffixLocs: number[] = [];
    const parts: NamePart[] = [];
    let ok = true;
    for (const c of chain) {
      const L = pos.get(c) as number;
      const ks = kinds(an, c);
      for (const k of ks) {
        if (k === principal) suffixLocs.push(L);
        else {
          const name = AS_PREFIX[k];
          parts.push({ en: name, ko: PREFIX_KO[name] as string, key: name, locant: L, complex: false });
        }
      }
      for (const g of an.groups.get(c) ?? []) {
        const h = HALO[g];
        if (h) parts.push({ en: h[0], ko: h[1], key: h[0], locant: L, complex: false });
      }
      for (const n of an.cAdj.get(c) ?? []) {
        if (pos.has(n.j)) continue;
        if (n.o !== 1) {
          ok = false;
          break;
        }
        const a = alkyl(an, n.j, c);
        if (!a) {
          ok = false;
          break;
        }
        parts.push({ en: a.en, ko: a.ko, key: a.key, locant: L, complex: a.complex });
      }
      if (!ok) break;
    }
    if (!ok) continue;
    // 알데하이드·카복실산 탄소는 사슬 끝 (1번)이어야 한다
    if ((principal === "al" || principal === "acid") && suffixLocs.some((l) => l !== 1 && l !== chain.length)) continue;
    const dbl: number[] = [];
    const tpl: number[] = [];
    for (let i = 0; i + 1 < chain.length; i++) {
      const o = bondOrder(chain[i] as number, chain[i + 1] as number);
      if (o === 2) dbl.push(i + 1);
      if (o === 3) tpl.push(i + 1);
    }
    const mult = [...dbl, ...tpl].sort((a, b) => a - b);
    const prefLocs = parts.map((p) => p.locant).sort((a, b) => a - b);
    const alpha = [...parts].sort((a, b) => a.key.localeCompare(b.key) || a.locant - b.locant).map((p) => p.locant);
    const key = [[-suffixLocs.length], [-chain.length], [-mult.length], [-dbl.length], [...suffixLocs].sort((a, b) => a - b), mult, dbl, [-parts.length], prefLocs, alpha];
    const better = !best || key.reduce((acc, k, i) => acc || cmpList(k, (best as Cand).key[i] as number[]), 0) < 0;
    if (better) best = { chain, key, parts, suffixLocs: [...suffixLocs].sort((a, b) => a - b), dbl, tpl };
  }
  if (!best) return null;
  const { chain, parts, suffixLocs, dbl, tpl } = best;
  const n = chain.length;
  if (principal && suffixLocs.length === 0) return null;

  // 위치 번호를 빼도 되는가: 메테인, 또는 탄소 2개에 가지·작용기·다중 결합이 모두 합쳐 하나뿐
  const total = parts.length + suffixLocs.length + dbl.length + tpl.length;
  const bare = n === 1 || (n === 2 && total <= 1);
  const terminalSuffix = principal === "al" || principal === "acid";

  const pre = prefixText(parts, !bare);
  const en: string[] = [pre.en];
  const ko: string[] = [pre.ko];
  const pieces = { en: [...pre.pieces.en], ko: [...pre.pieces.ko] };

  // 모체: 줄기 + an/en/yn
  const mDbl = dbl.length;
  const mTpl = tpl.length;
  const needA = mDbl > 1 || mTpl > 1; // buta-1,3-diene
  const stemEn = `${STEM[n]}${needA ? "a" : ""}`;
  const koOk = n <= 12;
  const stemKo = koOk ? ((needA ? KO_A[n] : mDbl || mTpl ? KO_EN[n] : "") ?? "") : stemEn;
  const sufCount = suffixLocs.length;
  const sufMult = sufCount > 1 ? MULT[sufCount] : "";
  const sufKoMult = sufCount > 1 ? KO_MULT[sufCount] : "";
  const suffixEn = principal === "acid" ? "oic acid" : principal ?? "";
  const suffixKo = principal === "acid" ? (sufCount > 1 ? "오산" : "산") : principal === "al" ? "알" : principal === "one" ? "온" : principal === "ol" ? "올" : principal === "amine" ? "아민" : "";
  // 마지막 e: 뒤에 오는 접미사가 모음으로 시작하면 뺀다 (butan-1-ol), 다이·트라이 같은 배수 접두사(자음)면 남긴다 (butane-2,3-diol)
  const keepE = !principal || sufCount > 1;
  const ends: string[] = [];
  const koEnds: string[] = [];
  const pEn: string[] = [];
  const pKo: string[] = [];
  const loc = (l: number[]) => l.join(",");
  if (!mDbl && !mTpl) {
    pEn.push(`${stemEn}an${keepE ? "e" : ""}`);
    pKo.push(koOk ? (principal && !keepE ? (KO_AN[n] as string) : (KO_ANE[n] as string)) : `${stemEn}an${keepE ? "e" : ""}`);
    ends.push(pEn[0] as string);
    koEnds.push(pKo[0] as string);
  } else {
    pEn.push(stemEn);
    pKo.push(stemKo);
    let e = stemEn;
    let k = stemKo;
    if (mDbl) {
      const last = !mTpl;
      const w = `${mDbl > 1 ? MULT[mDbl] : ""}en${last && keepE ? "e" : ""}`;
      const wk = `${mDbl > 1 ? KO_MULT[mDbl] : ""}엔`;
      if (bare) {
        e += w;
        k = n === 2 ? "에텐" : k + wk;
      } else {
        e += `-${loc(dbl)}-${w}`;
        k += `-${loc(dbl)}-${wk}`;
        pEn.push(loc(dbl));
        pKo.push(loc(dbl));
      }
      pEn.push(w);
      pKo.push(wk);
    }
    if (mTpl) {
      const w = `${mTpl > 1 ? MULT[mTpl] : ""}yn${keepE ? "e" : ""}`;
      const wk = `${mTpl > 1 ? KO_MULT[mTpl] : ""}아인`;
      if (bare) {
        e += w;
        k = n === 2 ? "에타인" : k + wk;
      } else {
        e += `-${loc(tpl)}-${w}`;
        k += `-${loc(tpl)}-${wk}`;
        pEn.push(loc(tpl));
        pKo.push(loc(tpl));
      }
      pEn.push(w);
      pKo.push(wk);
    }
    ends.push(e);
    koEnds.push(k);
  }
  let nameEn = ends.join("");
  let nameKo = koEnds.join("");
  if (principal) {
    const s = `${sufMult}${suffixEn}`;
    const sk = `${sufKoMult}${suffixKo}`;
    const showLoc = !bare && !terminalSuffix;
    nameEn += showLoc ? `-${loc(suffixLocs)}-${s}` : s;
    // 한국어: 프로판-2-올, 뷰테인-2,3-다이올, 에탄올, 뷰탄산, 뷰테인다이오산
    nameKo += showLoc ? `-${loc(suffixLocs)}-${sk}` : sk;
    if (showLoc) {
      pEn.push(loc(suffixLocs));
      pKo.push(loc(suffixLocs));
    }
    pEn.push(s);
    pKo.push(sk);
  }
  // 접두사 뒤에 바로 모체 (4-ethyl-2-methylhexane)
  const full = (pre.en ? pre.en : "") + nameEn;
  const fullKo = (pre.ko ? pre.ko : "") + nameKo;
  en.length = 0;
  ko.length = 0;
  pieces.en.push(...pEn);
  pieces.ko.push(...pKo);

  // 설명
  const steps: string[] = [];
  if (principal) steps.push(`주 작용기: ${FAMILY[principal]} — 이름 끝(접미사)에 와요`);
  steps.push(`주 사슬: 탄소 ${n}개${principal ? " (주 작용기를 가장 많이 포함하면서)" : ""}${mDbl || mTpl ? " · 다중 결합 포함" : ""} → ${STEM[n]}-`);
  const why = principal ? "주 작용기" : mDbl || mTpl ? "다중 결합" : parts.length ? "곁가지" : "";
  if (why && !bare) steps.push(`번호: ${why}가 가장 작은 번호를 받는 쪽 끝부터 1, 2, 3 …`);
  if (parts.length) steps.push(`곁가지: ${parts.map((p) => `${p.locant}번 ${p.en}`).join(", ")} — 알파벳 순서로 앞에, 같은 것은 di·tri로 묶어요`);
  return {
    en: full,
    ko: fullKo,
    pieces,
    chain,
    principal,
    steps,
    family: principal ? FAMILY[principal] : mTpl ? "알카인 (-yne, -아인)" : mDbl ? "알켄 (-ene, -엔)" : parts.some((p) => HALO[mol.atoms[0] ?? "C"] || /fluoro|chloro|bromo|iodo/.test(p.en)) ? "할로젠화 알킬 (fluoro·chloro…)" : "알케인 (-ane, -에인)",
  };
}

export function nameSmiles(smiles: string): Naming | null {
  const m = parseSmiles(smiles);
  return m ? nameMolecule(m) : null;
}
