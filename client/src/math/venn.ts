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
