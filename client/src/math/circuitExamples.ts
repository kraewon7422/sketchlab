import type { CircuitData, Part, Wire } from "./circuit";

/**
 * 회로 예시 — 교과서 그림처럼 직사각형 고리, 단자는 격자 칸에 맞춘다.
 * 세로 부품(rot 1)은 단자 0이 위, 단자 1이 아래. 전지 단자 0 = (+).
 */

const P = (id: string, type: Part["type"], x: number, y: number, extra: Partial<Part> = {}): Part => ({ id, type, x, y, ...extra });
const W = (a: string, b: string): Wire => ({ a, b });

export const CIRCUIT_EXAMPLES: Record<string, CircuitData> = {
  직렬: {
    mode: "electric",
    w: 18,
    h: 11,
    parts: [P("E", "battery", 2, 5, { rot: 1, value: 6 }), P("S", "switch", 6, 1, { on: true }), P("R1", "resistor", 11, 1, { value: 10 }), P("R2", "resistor", 15, 5, { rot: 1, value: 20 }), P("A", "ammeter", 9, 9)],
    wires: [W("E:0", "S:0"), W("S:1", "R1:0"), W("R1:1", "R2:0"), W("R2:1", "A:1"), W("A:0", "E:1")],
  },
  병렬: {
    mode: "electric",
    w: 16,
    h: 10,
    parts: [P("E", "battery", 2, 5, { rot: 1, value: 6 }), P("L1", "bulb", 8, 5, { rot: 1, value: 10 }), P("L2", "bulb", 13, 5, { rot: 1, value: 20 }), P("S", "switch", 13, 1, { on: true }), P("A", "ammeter", 5, 7)],
    wires: [W("E:0", "L1:0"), W("L1:0", "S:0"), W("S:1", "L2:0"), W("E:1", "A:0"), W("A:1", "L1:1"), W("L1:1", "L2:1")],
  },
  RC: {
    mode: "electric",
    w: 21,
    h: 10,
    parts: [P("E", "battery", 2, 5, { rot: 1, value: 6 }), P("S", "switch", 6, 1, { on: false }), P("R", "resistor", 11, 1, { value: 10000 }), P("C", "capacitor", 15, 5, { rot: 1, value: 100 }), P("V", "voltmeter", 19, 5, { rot: 1, label: "V_C" })],
    wires: [W("E:0", "S:0"), W("S:1", "R:0"), W("R:1", "C:0"), W("C:1", "E:1"), W("C:0", "V:0"), W("C:1", "V:1")],
  },
  교류: {
    mode: "electric",
    w: 19,
    h: 10,
    parts: [P("U", "ac", 2, 5, { rot: 1, value: 5, freq: 1 }), P("R", "resistor", 7, 1, { value: 1000 }), P("C", "capacitor", 12, 5, { rot: 1, value: 100 }), P("V", "voltmeter", 16, 5, { rot: 1, label: "V_C" }), P("A", "ammeter", 7, 9)],
    wires: [W("U:0", "R:0"), W("R:1", "C:0"), W("C:1", "A:1"), W("A:0", "U:1"), W("C:0", "V:0"), W("C:1", "V:1")],
  },
  가변저항: {
    mode: "electric",
    w: 23,
    h: 11,
    parts: [
      P("E", "battery", 2, 5, { rot: 1, value: 6 }),
      P("P", "rheostat", 7, 5, { rot: 1, value: 1000, pos: 0.5 }),
      P("A", "ammeter", 12, 5),
      P("C", "capacitor", 16, 7, { rot: 1, value: 470 }),
      P("V", "voltmeter", 20, 7, { rot: 1, label: "V" }),
      P("N1", "node", 7, 9),
    ],
    wires: [W("E:0", "P:0"), W("P:2", "A:0"), W("A:1", "C:0"), W("C:0", "V:0"), W("C:1", "V:1"), W("P:1", "N1:0"), W("N1:0", "C:1"), W("E:1", "N1:0")],
  },
  // ── 논리
  AND: gate("and"),
  OR: gate("or"),
  NOT: {
    mode: "logic",
    w: 15,
    h: 5,
    parts: [P("A", "in", 2, 2, { label: "A" }), P("G", "not", 7, 2), P("Y", "out", 12, 2, { label: "Y" })],
    wires: [W("A:0", "G:0"), W("G:1", "Y:0")],
  },
  NAND: gate("nand"),
  NOR: gate("nor"),
  XOR: gate("xor"),
  반가산기: {
    mode: "logic",
    w: 17,
    h: 8,
    parts: [P("A", "in", 1, 1, { label: "A" }), P("B", "in", 1, 5, { label: "B" }), P("nA", "node", 4, 1), P("nB", "node", 3, 5), P("X", "xor", 8, 1), P("D", "and", 8, 5), P("S", "out", 14, 1, { label: "S (합)" }), P("C", "out", 14, 5, { label: "C (올림)" })],
    wires: [W("A:0", "nA:0"), W("nA:0", "X:0"), W("nA:0", "D:0"), W("B:0", "nB:0"), W("nB:0", "X:1"), W("nB:0", "D:1"), W("X:2", "S:0"), W("D:2", "C:0")],
  },
  전가산기: {
    mode: "logic",
    w: 29,
    h: 12,
    parts: [
      P("A", "in", 1, 2, { label: "A" }),
      P("B", "in", 1, 5, { label: "B" }),
      P("Ci", "in", 1, 11, { label: "Cin" }),
      P("nA", "node", 4, 2),
      P("nB", "node", 5, 5),
      P("X1", "xor", 8, 3),
      P("D1", "and", 8, 7),
      P("n1", "node", 12, 3),
      P("nC", "node", 13, 11),
      P("X2", "xor", 16, 4),
      P("D2", "and", 16, 9),
      P("O", "or", 22, 8),
      P("S", "out", 27, 4, { label: "S (합)" }),
      P("Co", "out", 27, 8, { label: "Cout" }),
    ],
    wires: [
      W("A:0", "nA:0"),
      W("nA:0", "X1:0"),
      W("D1:0", "nA:0"),
      W("B:0", "nB:0"),
      W("X1:1", "nB:0"),
      W("D1:1", "nB:0"),
      W("X1:2", "n1:0"),
      W("X2:0", "n1:0"),
      W("D2:0", "n1:0"),
      W("Ci:0", "nC:0"),
      W("X2:1", "nC:0"),
      W("D2:1", "nC:0"),
      W("X2:2", "S:0"),
      W("D1:2", "O:0"),
      W("D2:2", "O:1"),
      W("O:2", "Co:0"),
    ],
  },
  "SR 래치": {
    mode: "logic",
    w: 19,
    h: 12,
    parts: [
      P("R", "in", 1, 2, { label: "R (지우기)" }),
      P("S", "in", 1, 10, { label: "S (켜기)" }),
      P("N1", "nor", 8, 3),
      P("N2", "nor", 8, 9),
      P("nQ", "node", 12, 3),
      P("m1", "node", 12, 5),
      P("m2", "node", 5, 5),
      P("nQb", "node", 13, 9),
      P("k1", "node", 13, 6),
      P("k2", "node", 4, 6),
      P("Q", "out", 16, 3, { label: "Q (기억)" }),
      P("Qb", "out", 16, 9, { label: "Q̄" }),
    ],
    wires: [
      W("R:0", "N1:0"),
      W("S:0", "N2:1"),
      W("N1:2", "nQ:0"),
      W("nQ:0", "Q:0"),
      W("nQ:0", "m1:0"),
      W("m1:0", "m2:0"),
      W("N2:0", "m2:0"),
      W("N2:2", "nQb:0"),
      W("nQb:0", "Qb:0"),
      W("nQb:0", "k1:0"),
      W("k1:0", "k2:0"),
      W("N1:1", "k2:0"),
    ],
  },
  "D 플립플롭": {
    mode: "logic",
    w: 17,
    h: 7,
    parts: [P("D", "in", 1, 2, { label: "D" }), P("K", "in", 1, 5, { label: "CLK" }), P("F", "dff", 8, 3), P("Q", "out", 14, 2, { label: "Q" }), P("Qb", "out", 14, 5, { label: "Q̄" })],
    wires: [W("D:0", "F:0"), W("K:0", "F:1"), W("F:2", "Q:0"), W("F:3", "Qb:0")],
  },
};

function gate(type: Part["type"]): CircuitData {
  return {
    mode: "logic",
    w: 15,
    h: 6,
    parts: [P("A", "in", 2, 2, { label: "A" }), P("B", "in", 2, 4, { label: "B" }), P("G", type, 7, 3), P("Y", "out", 12, 3, { label: "Y" })],
    wires: [W("A:0", "G:0"), W("B:0", "G:1"), W("G:2", "Y:0")],
  };
}

/** 입력 글 → 예시 이름 */
export function circuitFromInput(input: string): CircuitData | null {
  const s = input.trim().replace(/\s+/g, " ");
  const table: Array<[RegExp, string]> = [
    [/^(직렬|직렬 ?회로|series)$/i, "직렬"],
    [/^(병렬|병렬 ?회로|parallel)$/i, "병렬"],
    [/^(rc|rc ?회로|축전기 ?(충전|회로)|충전 ?회로)$/i, "RC"],
    [/^(교류|교류 ?회로|ac|ac ?회로)$/i, "교류"],
    [/^(가변 ?저항|가변 ?저항 ?회로|퍼텐쇼미터|포텐쇼미터|potentiometer)$/i, "가변저항"],
    [/^(회로|회로도|전기 ?회로|직류 ?회로|dc ?회로|circuit)$/i, "직렬"],
    [/^(and|and ?게이트)$/i, "AND"],
    [/^(or|or ?게이트)$/i, "OR"],
    [/^(not|not ?게이트|인버터)$/i, "NOT"],
    [/^(nand|nand ?게이트)$/i, "NAND"],
    [/^(nor|nor ?게이트)$/i, "NOR"],
    [/^(xor|xor ?게이트|배타적 ?논리합)$/i, "XOR"],
    [/^(논리 ?회로|논리 ?게이트|logic|logic ?gates?)$/i, "AND"],
    [/^(반가산기|half ?adder)$/i, "반가산기"],
    [/^(전가산기|full ?adder)$/i, "전가산기"],
    [/^(sr ?래치|래치|기억 ?소자|메모리|memory|sr ?latch)$/i, "SR 래치"],
    [/^(d ?플립 ?플롭|플립 ?플롭|d ?flip ?flop|flip ?flop)$/i, "D 플립플롭"],
  ];
  for (const [re, name] of table) if (re.test(s)) return structuredClone(CIRCUIT_EXAMPLES[name] as CircuitData);
  return null;
}
