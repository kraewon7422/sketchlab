import { nameMolecule, valid, type El, type Mol, type Naming } from "./iupac";

/**
 * 이름 → 구조 (사슬 분자) — "3-methylbutan-1-ol", "4-에틸-2-메틸헥세인", "buta-1,3-diene" …
 * 이름을 조각(위치 번호·배수·곁가지·줄기·an/en/yn·접미사)으로 나눠 분자를 짓고, 다시 이름을 지어 맞는지 본다.
 * 규칙에 어긋난 이름(예: 2-ethylpropane)도 구조는 그리고, 올바른 이름을 알려 준다.
 */

const STEMS = ["meth", "eth", "prop", "but", "pent", "hex", "hept", "oct", "non", "dec", "undec", "dodec"];
const MULTS: Record<string, number> = { di: 2, tri: 3, tetra: 4 };
const BIS: Record<string, number> = { bis: 2, tris: 3, tetrakis: 4 };
const ALKYLS = ["methyl", "ethyl", "propyl", "butyl", "pentyl", "hexyl", "heptyl", "octyl", "nonyl", "decyl", "undecyl", "dodecyl"];
const SPECIAL = ["isopropyl", "isobutyl", "secbutyl", "tertbutyl"];
const HETERO = ["fluoro", "chloro", "bromo", "iodo", "hydroxy", "oxo", "amino"];
const ENDINGS = ["ane", "ene", "yne", "an", "en", "yn", "a", "e", "ol", "one", "al", "amine", "oicacid", "yl"];

/** 한국어 표기 → 영어 조각 (긴 것부터 바꾼다) */
const KO: Array<[string, string]> = [
  ["다이오산", "dioicacid"],
  ["아이소프로필", "isopropyl"],
  ["아이소뷰틸", "isobutyl"],
  ["sec-뷰틸", "secbutyl"],
  ["tert-뷰틸", "tertbutyl"],
  ["테트라키스", "tetrakis"],
  ["트리스", "tris"],
  ["비스", "bis"],
  ["플루오로", "fluoro"],
  ["클로로", "chloro"],
  ["브로모", "bromo"],
  ["아이오도", "iodo"],
  ["하이드록시", "hydroxy"],
  ["아미노", "amino"],
  ["옥소", "oxo"],
  ["운데케인", "undecane"],
  ["도데케인", "dodecane"],
  ["메테인", "methane"],
  ["에테인", "ethane"],
  ["프로페인", "propane"],
  ["뷰테인", "butane"],
  ["펜테인", "pentane"],
  ["헥세인", "hexane"],
  ["헵테인", "heptane"],
  ["옥테인", "octane"],
  ["노네인", "nonane"],
  ["데케인", "decane"],
  ["운데실", "undecyl"],
  ["도데실", "dodecyl"],
  ["메틸", "methyl"],
  ["에틸", "ethyl"],
  ["프로필", "propyl"],
  ["뷰틸", "butyl"],
  ["펜틸", "pentyl"],
  ["헥실", "hexyl"],
  ["헵틸", "heptyl"],
  ["옥틸", "octyl"],
  ["노닐", "nonyl"],
  ["데실", "decyl"],
  ["운데칸", "undecan"],
  ["도데칸", "dodecan"],
  ["메탄", "methan"],
  ["에탄", "ethan"],
  ["프로판", "propan"],
  ["뷰탄", "butan"],
  ["펜탄", "pentan"],
  ["헥산", "hexan"],
  ["헵탄", "heptan"],
  ["옥탄", "octan"],
  ["노난", "nonan"],
  ["데칸", "decan"],
  ["에타인", "ethyne"],
  ["에텐", "ethene"],
  ["프로펜", "propene"],
  ["운데카", "undeca"],
  ["도데카", "dodeca"],
  ["메타", "metha"],
  ["에타", "etha"],
  ["프로파", "propa"],
  ["뷰타", "buta"],
  ["펜타", "penta"],
  ["헥사", "hexa"],
  ["헵타", "hepta"],
  ["옥타", "octa"],
  ["노나", "nona"],
  ["데카", "deca"],
  ["운데크", "undec"],
  ["도데크", "dodec"],
  ["메트", "meth"],
  ["에트", "eth"],
  ["프로프", "prop"],
  ["뷰트", "but"],
  ["펜트", "pent"],
  ["헥스", "hex"],
  ["헵트", "hept"],
  ["옥트", "oct"],
  ["데크", "dec"],
  ["논", "non"],
  ["다이", "di"],
  ["트라이", "tri"],
  ["테트라", "tetra"],
  ["아민", "amine"],
  ["아인", "yne"],
  ["엔", "ene"],
  ["올", "ol"],
  ["온", "one"],
  ["알", "al"],
  ["산", "oicacid"],
];

type Tok = { t: "num"; v: number[] } | { t: "word"; v: string } | { t: "open" } | { t: "close" };

function tokenize(input: string): Tok[] | null {
  let s = input.trim().toLowerCase();
  if (/[가-힣]/.test(s)) {
    for (const [k, e] of KO) s = s.split(k).join(` ${e} `);
    if (/[가-힣]/.test(s)) return null;
  }
  s = s.replace(/\bsec-/g, "sec").replace(/\btert-|\bt-/g, "tert").replace(/\bn-/g, "").replace(/oic\s+acid/g, "oicacid").replace(/\s+/g, "");
  const words = [...MORPH].sort((a, b) => b.length - a.length);
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i] as string;
    if (ch === "-" || ch === "," && !/\d/.test(s[i + 1] ?? "")) {
      i++;
      continue;
    }
    if (ch === "(") {
      out.push({ t: "open" });
      i++;
      continue;
    }
    if (ch === ")") {
      out.push({ t: "close" });
      i++;
      continue;
    }
    const num = /^\d+(?:,\d+)*/.exec(s.slice(i));
    if (num) {
      out.push({ t: "num", v: num[0].split(",").map(Number) });
      i += num[0].length;
      continue;
    }
    const w = words.find((m) => s.startsWith(m, i));
    if (!w) return null;
    out.push({ t: "word", v: w });
    i += w.length;
  }
  return out;
}
const MORPH = [...STEMS, ...Object.keys(MULTS), ...Object.keys(BIS), ...ALKYLS, ...SPECIAL, ...HETERO, ...ENDINGS, "dioicacid"];

interface Sub {
  kind: string;
  locant: number;
  /** 복잡한 곁가지: 사슬 길이와 그 위의 곁가지 */
  chain?: number;
  subs?: Sub[];
}

/** 접두사 묶음 읽기 — 줄기(사슬)를 만나면 멈춘다 */
function readPrefixes(toks: Tok[], pos: { i: number }, stopAtYl: boolean): Sub[] | null {
  const subs: Sub[] = [];
  let locs: number[] | null = null;
  let mult = 1;
  while (pos.i < toks.length) {
    const t = toks[pos.i] as Tok;
    if (t.t === "num") {
      locs = t.v;
      pos.i++;
      continue;
    }
    if (t.t === "open") {
      pos.i++;
      const inner = readComplex(toks, pos);
      if (!inner) return null;
      const at = locs ?? Array.from({ length: mult }, () => 1);
      for (const l of at) subs.push({ ...inner, locant: l });
      locs = null;
      mult = 1;
      continue;
    }
    if (t.t === "close") break;
    const w = t.v;
    if (w in MULTS || w in BIS) {
      mult = MULTS[w] ?? BIS[w] ?? 1;
      pos.i++;
      continue;
    }
    if (ALKYLS.includes(w) || SPECIAL.includes(w) || HETERO.includes(w)) {
      // 사슬 이름(propyl)이 마지막이고 곁가지 안이면 그것이 곁가지의 줄기
      if (stopAtYl && ALKYLS.includes(w) && (toks[pos.i + 1]?.t ?? "close") === "close") break;
      const at = locs ?? Array.from({ length: mult }, () => 1);
      if (locs && locs.length !== mult && !(mult === 1 && locs.length === 1)) return null;
      for (const l of at) subs.push({ kind: w, locant: l });
      locs = null;
      mult = 1;
      pos.i++;
      continue;
    }
    break;
  }
  return subs;
}

/** 괄호 속 곁가지 "(2-methylpropyl)" */
function readComplex(toks: Tok[], pos: { i: number }): Sub | null {
  const subs = readPrefixes(toks, pos, true);
  const t = toks[pos.i];
  if (!subs || !t || t.t !== "word" || !ALKYLS.includes(t.v)) return null;
  pos.i++;
  if (toks[pos.i]?.t !== "close") return null;
  pos.i++;
  return { kind: "complex", locant: 1, chain: ALKYLS.indexOf(t.v) + 1, subs };
}

export interface Parsed {
  mol: Mol;
  /** 이 구조의 올바른 이름 */
  naming: Naming | null;
  /** 입력이 올바른 이름과 같은가 (하이픈·쉼표·띄어쓰기 무시) */
  exact: boolean;
}

/** 이름 → 분자. 사슬 분자 이름이 아니면 null */
export function parseName(input: string): Parsed | null {
  const toks = tokenize(input);
  if (!toks || toks.length === 0) return null;
  const pos = { i: 0 };
  const subs = readPrefixes(toks, pos, false);
  if (!subs) return null;
  // 줄기
  const st = toks[pos.i];
  if (!st || st.t !== "word" || !STEMS.includes(st.v)) return null;
  const n = STEMS.indexOf(st.v) + 1;
  pos.i++;
  const dbl: number[] = [];
  const tpl: number[] = [];
  const groups: Array<{ kind: string; locant: number }> = [];
  let locs: number[] | null = null;
  let mult = 1;
  let sawEnding = false;
  while (pos.i < toks.length) {
    const t = toks[pos.i] as Tok;
    pos.i++;
    if (t.t === "num") {
      locs = t.v;
      continue;
    }
    if (t.t !== "word") return null;
    const w = t.v;
    if (w in MULTS) {
      mult = MULTS[w] as number;
      continue;
    }
    const at = () => locs ?? Array.from({ length: mult }, (_, k) => (k === 0 ? 1 : n));
    if (w === "a" || w === "e") continue;
    if (w === "an" || w === "ane") sawEnding = true;
    else if (w === "en" || w === "ene") {
      dbl.push(...at());
      sawEnding = true;
    } else if (w === "yn" || w === "yne") {
      tpl.push(...at());
      sawEnding = true;
    } else if (w === "ol" || w === "one" || w === "amine") for (const l of at()) groups.push({ kind: w, locant: l });
    else if (w === "al" || w === "oicacid" || w === "dioicacid") {
      // 사슬 끝 탄소 — 하나면 1번, 둘이면 양 끝
      const two = w === "dioicacid" || mult === 2;
      const kind = w === "al" ? "al" : "acid";
      groups.push({ kind, locant: 1 });
      if (two) groups.push({ kind, locant: n });
    } else return null;
    locs = null;
    mult = 1;
  }
  if (!sawEnding && groups.length === 0) return null;
  const mol = build(n, subs, dbl, tpl, groups);
  if (!mol) return null;
  const naming = nameMolecule(mol);
  const strip = (s: string) => s.toLowerCase().replace(/[-,\s()]/g, "");
  const exact = !!naming && (strip(naming.en) === strip(input) || strip(naming.ko) === strip(input));
  return { mol, naming, exact };
}

function build(n: number, subs: Sub[], dbl: number[], tpl: number[], groups: Array<{ kind: string; locant: number }>): Mol | null {
  const mol: Mol = { atoms: [], bonds: [] };
  const add = (el: El, to: number, order = 1) => {
    const i = mol.atoms.push(el) - 1;
    if (to >= 0) mol.bonds.push([to, i, order]);
    return i;
  };
  const chain: number[] = [];
  for (let k = 0; k < n; k++) chain.push(add("C", k ? (chain[k - 1] as number) : -1));
  const at = (l: number) => (l >= 1 && l <= n ? (chain[l - 1] as number) : -1);
  const setOrder = (l: number, o: number) => {
    const b = mol.bonds.find(([a, c]) => a === at(l) && c === at(l + 1));
    if (!b || l >= n) return false;
    b[2] = o;
    return true;
  };
  for (const l of dbl) if (!setOrder(l, 2)) return null;
  for (const l of tpl) if (!setOrder(l, 3)) return null;
  const linear = (len: number, to: number) => {
    let p = to;
    const made: number[] = [];
    for (let k = 0; k < len; k++) made.push((p = add("C", p)));
    return made;
  };
  const addSub = (s: Sub, to: number): boolean => {
    if (to < 0) return false;
    switch (s.kind) {
      case "fluoro":
      case "chloro":
      case "bromo":
      case "iodo":
        add(({ fluoro: "F", chloro: "Cl", bromo: "Br", iodo: "I" } as const)[s.kind], to);
        return true;
      case "hydroxy":
        add("O", to);
        return true;
      case "oxo":
        add("O", to, 2);
        return true;
      case "amino":
        add("N", to);
        return true;
      case "isopropyl": {
        const c = add("C", to);
        add("C", c);
        add("C", c);
        return true;
      }
      case "secbutyl": {
        const c = add("C", to);
        add("C", c);
        linear(2, c);
        return true;
      }
      case "isobutyl": {
        const c = add("C", to);
        const d = add("C", c);
        add("C", d);
        add("C", d);
        return true;
      }
      case "tertbutyl": {
        const c = add("C", to);
        add("C", c);
        add("C", c);
        add("C", c);
        return true;
      }
      case "complex": {
        const made = linear(s.chain ?? 1, to);
        return (s.subs ?? []).every((q) => addSub(q, made[q.locant - 1] ?? -1));
      }
      default: {
        const len = ALKYLS.indexOf(s.kind) + 1;
        if (len <= 0) return false;
        linear(len, to);
        return true;
      }
    }
  };
  for (const s of subs) if (!addSub(s, at(s.locant))) return null;
  for (const g of groups) {
    const c = at(g.locant);
    if (c < 0) return null;
    if (g.kind === "ol") add("O", c);
    else if (g.kind === "amine") add("N", c);
    else if (g.kind === "one" || g.kind === "al") add("O", c, 2);
    else if (g.kind === "acid") {
      add("O", c, 2);
      add("O", c);
    }
  }
  return valid(mol) ? mol : null;
}
