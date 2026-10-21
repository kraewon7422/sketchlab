import { nameMolecule, toSmiles, valid, type El, type Mol, type Naming } from "./iupac";

/**
 * 이름 퍼즐 (Naming Daily처럼) — 구조식을 보고 이름 조각을 차례로 골라 이름을 맞힌다.
 *   초록 = 맞는 조각·맞는 자리, 노랑 = 이름에 있지만 다른 자리, 회색 = 이름에 없음. 6번까지.
 *   힌트: 1번 틀리면 화합물 종류, 2번 → 주 사슬 탄소 수, 3번 → 구조식에 주 사슬·번호
 * 문제는 씨앗(seed)으로 정해진다 — 날짜를 씨앗으로 쓰면 "오늘의 문제". 앱이 만든 분자라 이름이 늘 맞다.
 */

export type Level = "easy" | "medium";
export type Lang = "en" | "ko";
export type Mark = "green" | "yellow" | "gray";

export interface Puzzle {
  smiles: string;
  naming: Naming;
  /** 언어별 답 조각과 고를 조각 (답 + 헷갈리게 하는 것, 섞음) */
  answer: Record<Lang, string[]>;
  tiles: Record<Lang, string[]>;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 오늘의 씨앗 (YYYYMMDD) */
export const todaySeed = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** 분자 하나 만들기 — 주 사슬 + 곁가지 + (중급) 작용기·다중 결합 */
function makeMol(r: () => number, level: Level): Mol {
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)] as T;
  const n = level === "easy" ? 4 + Math.floor(r() * 4) : 5 + Math.floor(r() * 4);
  const mol: Mol = { atoms: [], bonds: [] };
  const add = (el: El, to: number, o = 1) => {
    const i = mol.atoms.push(el) - 1;
    if (to >= 0) mol.bonds.push([to, i, o]);
    return i;
  };
  const chain: number[] = [];
  for (let k = 0; k < n; k++) chain.push(add("C", k ? (chain[k - 1] as number) : -1));
  // 가운데 쪽 탄소에 곁가지 (끝에 붙이면 사슬이 길어질 뿐)
  const inner = () => chain[1 + Math.floor(r() * (n - 2))] as number;
  const subs = level === "easy" ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
  for (let k = 0; k < subs; k++) {
    const kind = pick(level === "easy" ? ["methyl", "methyl", "ethyl", "Cl", "Br"] : ["methyl", "methyl", "ethyl", "Cl", "Br", "F", "isopropyl"]);
    const at = inner();
    if (kind === "methyl") add("C", at);
    else if (kind === "ethyl") add("C", add("C", at));
    else if (kind === "isopropyl") {
      const c = add("C", at);
      add("C", c);
      add("C", c);
    } else add(kind as El, at);
  }
  // 작용기 하나 (쉬움: 가끔 -OH, 중급: 여러 가지)
  const fg = level === "easy" ? pick(["none", "none", "ol", "ene"]) : pick(["ol", "one", "al", "acid", "amine", "ene", "yne", "diol"]);
  const end = chain[0] as number;
  const mid = inner();
  if (fg === "ol") add("O", r() < 0.5 ? end : mid);
  else if (fg === "diol") {
    add("O", end);
    add("O", mid);
  } else if (fg === "one") add("O", mid, 2);
  else if (fg === "al") add("O", end, 2);
  else if (fg === "acid") {
    add("O", end, 2);
    add("O", end);
  } else if (fg === "amine") add("N", r() < 0.5 ? end : mid);
  else if (fg === "ene" || fg === "yne") {
    const k = Math.floor(r() * (n - 1));
    const b = mol.bonds.find(([a, c]) => a === chain[k] && c === chain[k + 1]);
    if (b) b[2] = fg === "ene" ? 2 : 3;
  }
  return mol;
}

const STEMS = ["meth", "eth", "prop", "but", "pent", "hex", "hept", "oct", "non", "dec"];
const KO_STEMS: Array<[string, string]> = [
  ["메트", "에트"],
  ["프로프", "뷰트"],
  ["펜트", "헥스"],
  ["헵트", "옥트"],
  ["메틸", "에틸"],
  ["뷰탄", "펜탄"],
  ["헥산", "헵탄"],
  ["프로판", "뷰탄"],
  ["뷰테인", "펜테인"],
  ["헥세인", "헵테인"],
  ["펜테인", "헥세인"],
  ["옥테인", "노네인"],
];

/** 헷갈리게 하는 조각: 번호 ±1, 줄기 하나 더/덜, 곁가지·접미사 바꾸기 */
function decoys(answer: string[], lang: Lang, r: () => number): string[] {
  const out = new Set<string>();
  const swaps: Array<[string, string]> =
    lang === "en"
      ? [
          ["methyl", "ethyl"],
          ["dimethyl", "trimethyl"],
          ["chloro", "bromo"],
          ["fluoro", "chloro"],
          ["ol", "one"],
          ["al", "ol"],
          ["one", "al"],
          ["ene", "yne"],
          ["en", "yn"],
          ["amine", "amide"],
          ["oic acid", "ol"],
          ["diol", "dione"],
        ]
      : [
          ["메틸", "에틸"],
          ["다이메틸", "트라이메틸"],
          ["클로로", "브로모"],
          ["플루오로", "클로로"],
          ["올", "온"],
          ["알", "올"],
          ["온", "알"],
          ["엔", "아인"],
          ["아민", "아마이드"],
          ["산", "올"],
          ["다이올", "다이온"],
          ...KO_STEMS,
        ];
  for (const p of answer) {
    if (/^\d+(,\d+)*$/.test(p)) {
      const nums = p.split(",").map(Number);
      out.add(nums.map((v, i) => (i === nums.length - 1 ? v + 1 : v)).join(","));
      if ((nums[0] as number) > 1) out.add(nums.map((v, i) => (i === 0 ? v - 1 : v)).join(","));
      continue;
    }
    for (const [a, b] of swaps) {
      if (p === a) out.add(b);
      if (p === b) out.add(a);
    }
    if (lang === "en")
      for (let k = 0; k < STEMS.length; k++) {
        const s = STEMS[k] as string;
        if (p.startsWith(s) && !STEMS.some((t) => t.length > s.length && p.startsWith(t))) {
          const rest = p.slice(s.length);
          if (k + 1 < STEMS.length) out.add(`${STEMS[k + 1]}${rest}`);
          if (k > 0) out.add(`${STEMS[k - 1]}${rest}`);
        }
      }
  }
  for (const a of answer) out.delete(a);
  const list = [...out];
  // 섞어서 4~5개
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [list[i], list[j]] = [list[j] as string, list[i] as string];
  }
  return list.slice(0, 4 + Math.floor(r() * 2));
}

function shuffle<T>(a: T[], r: () => number): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [b[i], b[j]] = [b[j] as T, b[i] as T];
  }
  return b;
}

export function makePuzzle(seed: number, level: Level): Puzzle {
  const r = rng(seed * 7 + (level === "easy" ? 1 : 2));
  for (let tries = 0; tries < 200; tries++) {
    const mol = makeMol(r, level);
    if (!valid(mol)) continue;
    const naming = nameMolecule(mol);
    if (!naming) continue;
    const n = naming.pieces.en.length;
    if (n < 2 || n > (level === "easy" ? 6 : 9) || /[()]/.test(naming.en)) continue;
    const answer = { en: naming.pieces.en, ko: naming.pieces.ko };
    const tiles = { en: shuffle([...answer.en, ...decoys(answer.en, "en", r)], r), ko: shuffle([...answer.ko, ...decoys(answer.ko, "ko", r)], r) };
    return { smiles: toSmiles(mol), naming, answer, tiles };
  }
  // 거의 일어나지 않지만 — 2-메틸뷰테인
  const mol: Mol = { atoms: ["C", "C", "C", "C", "C"], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 1], [1, 4, 1]] };
  const naming = nameMolecule(mol) as Naming;
  return { smiles: toSmiles(mol), naming, answer: { en: naming.pieces.en, ko: naming.pieces.ko }, tiles: { en: naming.pieces.en, ko: naming.pieces.ko } };
}

/** 워들처럼 칸마다 색 — 같은 조각이 여러 번 나오면 개수만큼만 노랑 */
export function grade(guess: string[], answer: string[]): Mark[] {
  const marks: Mark[] = guess.map(() => "gray");
  const left = new Map<string, number>();
  answer.forEach((a, i) => {
    if (guess[i] === a) marks[i] = "green";
    else left.set(a, (left.get(a) ?? 0) + 1);
  });
  guess.forEach((g, i) => {
    if (marks[i] === "green") return;
    const k = left.get(g) ?? 0;
    if (k > 0) {
      marks[i] = "yellow";
      left.set(g, k - 1);
    }
  });
  return marks;
}

export const solved = (guess: string[], answer: string[]) => guess.length === answer.length && guess.every((g, i) => g === answer[i]);
