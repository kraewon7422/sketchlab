/**
 * 벤 다이어그램 — 집합 식을 읽어 그 영역을 칠한다.
 *
 *   A∩B   A∪B   A−B   Aᶜ (A^c, A')   (A∪B)∩C   AΔB
 *   LaTeX도 받는다: \cap \cup \setminus ^{c} \triangle
 * ∩가 ∪·−·Δ보다 먼저 계산된다 (곱셈이 덧셈보다 먼저인 것처럼). 집합은 A·B·C (2개 또는 3개).
 */

type Node = { t: "set"; name: string } | { t: "U" } | { t: "empty" } | { t: "not"; a: Node } | { t: "op"; op: "∩" | "∪" | "−" | "Δ"; a: Node; b: Node };

export interface Venn {
  sets: string[];
  /** 정리한 식 (∩ ∪ − Δ ᶜ) */
  expr: string;
}

/** 입력을 기호 하나씩으로 (LaTeX·한글 표기도 같은 기호로) */
function normalize(input: string): string {
  return input
    .replace(/^\s*(벤\s*다이어그램|벤|venn)\s*:?/i, "")
    .replace(/\\cap|∩|⋂/g, "∩")
    .replace(/\\cup|∪|⋃/g, "∪")
    .replace(/\\setminus|\\backslash|\\-|−|-/g, "−")
    .replace(/\\triangle|\\Delta|△|Δ/g, "Δ")
    .replace(/\\emptyset|\\varnothing|∅|ø/g, "∅")
    .replace(/\^\{?c\}?|ᶜ|'/g, "ᶜ")
    .replace(/\\left|\\right|\\[,;! ]|\s+/g, "");
}

function parse(src: string): Node | null {
  let i = 0;
  const peek = () => src[i];
  const expr = (): Node | null => {
    let a = term();
    while (a && (peek() === "∪" || peek() === "−" || peek() === "Δ")) {
      const op = src[i++] as "∪" | "−" | "Δ";
      const b = term();
      if (!b) return null;
      a = { t: "op", op, a, b };
    }
    return a;
  };
  const term = (): Node | null => {
    let a = factor();
    while (a && peek() === "∩") {
      i++;
      const b = factor();
      if (!b) return null;
      a = { t: "op", op: "∩", a, b };
    }
    return a;
  };
  const factor = (): Node | null => {
    let a = atom();
    while (a && peek() === "ᶜ") {
      i++;
      a = { t: "not", a };
    }
    return a;
  };
  const atom = (): Node | null => {
    const c = peek();
    if (c === "(" || c === "{") {
      i++;
      const e = expr();
      if (peek() !== ")" && peek() !== "}") return null;
      i++;
      return e;
    }
    if (c === "U") {
      i++;
      return { t: "U" };
    }
    if (c === "∅") {
      i++;
      return { t: "empty" };
    }
    if (c && /[A-CPQR]/.test(c)) {
      i++;
      return { t: "set", name: c };
    }
    return null;
  };
  const tree = expr();
  return tree && i === src.length ? tree : null;
}

function setsOf(n: Node, out: Set<string>): Set<string> {
  if (n.t === "set") out.add(n.name);
  else if (n.t === "not") setsOf(n.a, out);
  else if (n.t === "op") {
    setsOf(n.a, out);
    setsOf(n.b, out);
  }
  return out;
}

/** 집합 식이면 그 벤 다이어그램, 아니면 null (∩·∪·−·ᶜ·Δ 중 하나는 있어야 — 그냥 "A"는 아님, "벤 A"는 됨) */
export function parseVenn(input: string): Venn | null {
  // "벤 3" · "벤 ABC" → 빈 세 집합 (영역을 톡톡 눌러 칠한다), "벤 2" · "벤 AB" → 빈 두 집합
  const blank = /^\s*(?:벤\s*다이어그램|벤|venn)\s*:?\s*(3|2|A\s*,?\s*B\s*,?\s*C|A\s*,?\s*B)\s*$/i.exec(input);
  if (blank) return { sets: /3|C/i.test(blank[1] as string) ? ["A", "B", "C"] : ["A", "B"], expr: "∅" };
  const named = /^\s*(벤|venn)/i.test(input);
  const src = normalize(input);
  if (!src || (!named && !/[∩∪Δᶜ]|\\setminus/.test(src.replace(/−/g, named ? "−" : "")) && !/[A-C]−[A-C]/.test(src))) return null;
  const tree = parse(src);
  if (!tree) return null;
  const used = [...setsOf(tree, new Set())].sort();
  if (used.length === 0 || used.length > 3) return null;
  // 두 집합만 쓰면 두 원, C까지 쓰면 세 원 (A·B는 늘 그린다)
  const sets = used.length === 3 || used.includes("C") || used.includes("R") ? (used.length === 3 ? used : ["A", "B", "C"]) : used.length === 1 ? (used[0] === "A" ? ["A", "B"] : ["A", used[0] as string]) : used;
  return { sets, expr: src };
}

/** 점이 영역 안인가 — member: 집합 이름 → 그 점이 그 집합에 속하는가 */
export function vennContains(v: Venn, member: (set: string) => boolean): boolean {
  const tree = parse(v.expr);
  if (!tree) return false;
  const ev = (n: Node): boolean => {
    switch (n.t) {
      case "set":
        return member(n.name);
      case "U":
        return true;
      case "empty":
        return false;
      case "not":
        return !ev(n.a);
      case "op": {
        const a = ev(n.a);
        const b = ev(n.b);
        return n.op === "∩" ? a && b : n.op === "∪" ? a || b : n.op === "−" ? a && !b : a !== b;
      }
    }
  };
  return ev(tree);
}

// ─────────────────────────────────────────────────────────── 영역 톡 → 식 (직접 칠하기)

/**
 * 영역 번호 m: i번째 집합 안이면 m의 i번째 비트가 1 (집합 2개면 영역 4개, 3개면 8개 — 바깥 영역은 0).
 * 식이 칠하는 영역들을 비트 묶음(mask)으로: mask의 m번째 비트 = 영역 m을 칠하는가.
 */
export function regionMask(v: Venn): number {
  let mask = 0;
  const n = v.sets.length;
  for (let m = 0; m < 1 << n; m++) if (vennContains(v, (s) => ((m >> v.sets.indexOf(s)) & 1) === 1)) mask |= 1 << m;
  return mask;
}

/** 점(단위 좌표: 폭 = 1)이 있는 영역 번호 */
export function regionAt(n: number, x: number, y: number): number {
  let m = 0;
  vennCircles(n).forEach((k, i) => {
    if ((x - k.cx) ** 2 + (y - k.cy) ** 2 <= k.r ** 2) m |= 1 << i;
  });
  return m;
}

interface Cand {
  s: string;
  /** 우선순위: 3 = 하나(집합·여집합·괄호), 2 = ∩, 1 = ∪·− */
  p: number;
}
const simplestCache = new Map<string, Map<number, Cand>>();

/**
 * 칠한 영역들 → 가장 짧은 집합 식 (교과서 기호 ∩ ∪ − ᶜ 만). 집합 3개면 256가지를 처음 한 번 모두 찾아 둔다.
 * 짧은 식 둘을 이어 붙이며 넓혀 가고, 같은 영역을 칠하는 식은 가장 짧은 것만 남긴다.
 */
export function simplestExpr(sets: readonly string[], mask: number): string {
  const n = sets.length;
  const full = (1 << (1 << n)) - 1;
  const key = sets.join("");
  let best = simplestCache.get(key);
  if (!best) {
    const found = new Map<number, Cand>();
    // 교과서에서 익숙한 쪽을 고르게: −와 ᶜ는 조금 더 긴 것으로 친다 (∩·∪ > − > ᶜ)
    const cost = (x: string) => x.length + 1.5 * (x.match(/ᶜ/g)?.length ?? 0) + 1.8 * (x.match(/−/g)?.length ?? 0);
    const put = (t: number, c: Cand) => {
      const old = found.get(t);
      if (!old || cost(c.s) < cost(old.s)) found.set(t, c);
    };
    put(full, { s: "U", p: 3 });
    put(0, { s: "∅", p: 3 });
    sets.forEach((name, i) => {
      let t = 0;
      for (let m = 0; m < 1 << n; m++) if ((m >> i) & 1) t |= 1 << m;
      put(t, { s: name, p: 3 });
    });
    // 괄호: 우선순위가 낮은 식을 안에 넣을 때만 (∩는 ∪·−보다 먼저, ᶜ는 가장 먼저)
    const wrap = (c: Cand, need: number) => (c.p >= need ? c.s : `(${c.s})`);
    for (let round = 0; round < 4; round++) {
      const cur = [...found];
      for (const [ta, a] of cur) {
        put(~ta & full, { s: `${wrap(a, 3)}ᶜ`, p: 3 });
        for (const [tb, b] of cur) {
          if (a.s.length + b.s.length > 18) continue;
          put(ta & tb, { s: `${wrap(a, 2)}∩${wrap(b, 2)}`, p: 2 });
          put(ta | tb, { s: `${wrap(a, 1)}∪${wrap(b, 2)}`, p: 1 });
          put(ta & ~tb & full, { s: `${wrap(a, 1)}−${wrap(b, 2)}`, p: 1 });
        }
      }
    }
    simplestCache.set(key, found);
    best = found;
  }
  const hit = best.get(mask & full);
  if (hit) return hit.s;
  // 혹시 못 찾으면 칠한 작은 영역들의 합 (늘 맞는 식)
  const parts: string[] = [];
  for (let m = 0; m < 1 << n; m++) if ((mask >> m) & 1) parts.push(`(${sets.map((s, i) => ((m >> i) & 1 ? s : `${s}ᶜ`)).join("∩")})`);
  return parts.join("∪") || "∅";
}

/** 영역 하나를 칠하거나 지운 새 식 */
export function toggleRegion(v: Venn, region: number): string {
  return simplestExpr(v.sets, regionMask(v) ^ (1 << region));
}

/** 화면 아래에 보일 LaTeX */
export function vennLatex(v: Venn): string {
  return v.expr.replace(/∩/g, "\\cap ").replace(/∪/g, "\\cup ").replace(/−/g, "-").replace(/Δ/g, "\\triangle ").replace(/ᶜ/g, "^{c}").replace(/∅/g, "\\emptyset ");
}

/** 원 배치 (단위 상자 1 × 0.72 안, 반지름 r) */
export function vennCircles(n: number): Array<{ cx: number; cy: number; r: number }> {
  if (n === 3)
    return [
      { cx: 0.39, cy: 0.27, r: 0.19 },
      { cx: 0.61, cy: 0.27, r: 0.19 },
      { cx: 0.5, cy: 0.45, r: 0.19 },
    ];
  return [
    { cx: 0.38, cy: 0.36, r: 0.24 },
    { cx: 0.62, cy: 0.36, r: 0.24 },
  ];
}
