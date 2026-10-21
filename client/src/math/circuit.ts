import type { SceneDataOf } from "@sketchlab/shared";

/**
 * 회로 (전기·논리) 계산 — 화면과 떨어진 순수 함수.
 *
 * 부품은 격자 위에 놓이고(x, y 정수), 단자 자리는 부품 종류·회전으로 정해진다.
 * 같은 칸에 놓인 단자끼리, 그리고 전선으로 이은 단자끼리는 한 마디(node)다.
 *
 * 전기: 마디 해석(교과서 키르히호프 법칙을 행렬로) + 시간 단계(후진 오일러)
 *   저항·전구·스위치·전류계·전압계 = 저항, 전지·교류 전원 = 작은 내부 저항이 있는 전원(노턴 등가),
 *   축전기 C/dt 컨덕턴스 + 전류원 · 코일 dt/L 컨덕턴스 + 전류원 → 충전·방전·교류가 시간에 따라 보인다.
 * 논리: 출력이 다시 입력으로 돌아오는 회로(래치)도 값이 안정될 때까지 되풀이, D 플립플롭은 CLK이 0→1일 때.
 */

export const ELECTRIC_PARTS = ["battery", "ac", "switch", "resistor", "rheostat", "capacitor", "inductor", "bulb", "ammeter", "voltmeter", "node"] as const;
export const LOGIC_PARTS = ["in", "out", "and", "or", "not", "nand", "nor", "xor", "dff", "node"] as const;

export type CircuitData = SceneDataOf<"circuit">;
export type Part = CircuitData["parts"][number];
export type PartType = Part["type"];
export type Wire = CircuitData["wires"][number];

type XY = [number, number];

/** 회전 전 단자 자리 (부품 가운데 기준, 격자 칸) */
function baseTerminals(type: PartType): XY[] {
  switch (type) {
    case "node":
      return [[0, 0]];
    case "rheostat":
      return [[-2, 0], [2, 0], [0, -2]];
    case "in":
      return [[2, 0]];
    case "out":
      return [[-2, 0]];
    case "not":
      return [[-2, 0], [2, 0]];
    case "and":
    case "or":
    case "nand":
    case "nor":
    case "xor":
      return [[-2, -1], [-2, 1], [2, 0]];
    case "dff":
      // D, CLK → Q, Q̄
      return [[-2, -1], [-2, 1], [2, -1], [2, 1]];
    default:
      return [[-2, 0], [2, 0]];
  }
}

/** (x, y)를 시계 방향 90° × k (화면 y 아래) */
export function rot90([x, y]: XY, k: number): XY {
  let p: XY = [x, y];
  for (let i = 0; i < (((k % 4) + 4) % 4); i++) p = [-p[1], p[0]];
  return p;
}

export function terminals(part: Part): XY[] {
  return baseTerminals(part.type).map((t) => {
    const [dx, dy] = rot90(t, part.rot ?? 0);
    return [part.x + dx, part.y + dy];
  });
}

export const termKey = (id: string, k: number): string => `${id}:${k}`;

/** 단자가 부품 밖으로 향하는 방향 (마디는 [0, 0] = 아무 쪽) */
export function terminalOut(part: Part, k: number): XY {
  if (part.type === "node") return [0, 0];
  const [dx, dy] = rot90(baseTerminals(part.type)[k] ?? [1, 0], part.rot ?? 0);
  return Math.abs(dx) >= Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
}

/**
 * 전선 하나의 꺾인 길 (격자 점들) — 한 번 꺾는다.
 * 두 꺾는 자리 중 양 끝 단자에서 부품 밖으로 나가는 쪽을 고른다 (부품 몸통을 가로지르지 않게).
 */
export function wirePath(data: CircuitData, w: Wire): XY[] {
  const end = (ref: string): { p: XY; o: XY } | null => {
    const [id, ks] = ref.split(":");
    const part = data.parts.find((q) => q.id === id);
    if (!part) return null;
    const k = Number(ks);
    const p = terminals(part)[k];
    return p ? { p, o: terminalOut(part, k) } : null;
  };
  const A = end(w.a);
  const B = end(w.b);
  if (!A || !B) return [];
  const [ax, ay] = A.p;
  const [bx, by] = B.p;
  if (ax === bx || ay === by) return [A.p, B.p];
  const bad = (c: XY) => {
    const da = (c[0] - ax) * A.o[0] + (c[1] - ay) * A.o[1];
    const db = (c[0] - bx) * B.o[0] + (c[1] - by) * B.o[1];
    return (da < 0 ? 1 : 0) + (db < 0 ? 1 : 0);
  };
  const c1: XY = [bx, ay]; // 가로 먼저
  const c2: XY = [ax, by]; // 세로 먼저
  const prefer1 = A.o[1] === 0; // 가로로 나가는 단자는 가로 먼저
  const corner = bad(c1) < bad(c2) || (bad(c1) === bad(c2) && prefer1) ? c1 : c2;
  return [A.p, corner, B.p];
}

/**
 * 마디 나누기: 단자 → 마디 번호. 같은 칸의 단자, 전선으로 이은 단자는 한 마디.
 */
export function nodesOf(data: CircuitData): { nodeOf: Map<string, number>; count: number } {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    let x = a;
    while (parent.get(x) !== r) {
      const nx = parent.get(x) as string;
      parent.set(x, r);
      x = nx;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return;
    parent.set(find(a), find(b));
  };
  const byCell = new Map<string, string>();
  for (const p of data.parts)
    terminals(p).forEach(([x, y], k) => {
      const key = termKey(p.id, k);
      parent.set(key, key);
      const cell = `${x},${y}`;
      const other = byCell.get(cell);
      if (other) union(key, other);
      else byCell.set(cell, key);
    });
  for (const w of data.wires) union(w.a, w.b);
  const nodeOf = new Map<string, number>();
  const ids = new Map<string, number>();
  for (const key of parent.keys()) {
    const r = find(key);
    if (!ids.has(r)) ids.set(r, ids.size);
    nodeOf.set(key, ids.get(r) as number);
  }
  return { nodeOf, count: ids.size };
}

// ─────────────────────────────────────────────────────────── 전기

/** 부품 기본값 */
export const DEFAULTS: Partial<Record<PartType, number>> = { battery: 6, ac: 5, resistor: 10, rheostat: 100, capacitor: 100, inductor: 100, bulb: 10 };
export const UNIT: Partial<Record<PartType, string>> = { battery: "V", ac: "V", resistor: "Ω", rheostat: "Ω", capacitor: "μF", inductor: "mH", bulb: "Ω" };

const R_SOURCE = 0.05; // 전지 내부 저항
const G_CLOSED = 1e4; // 닫힌 스위치 (0.1 mΩ)
const G_OPEN = 1e-12; // 열린 스위치 (새는 전류가 축전기를 몇 분 만에 채우지 않게)
const G_AMMETER = 1e3; // 1 mΩ
const G_VOLTMETER = 1e-7; // 10 MΩ
const G_MIN = 1e-9; // 떠 있는 마디가 풀리게

export interface ElectricState {
  t: number;
  /** 축전기 양단 전압 (id → V) */
  vc: Record<string, number>;
  /** 코일 전류 (id → A) */
  il: Record<string, number>;
}

export interface ElectricReading {
  /** 마디 전압 */
  v: number[];
  /** 부품마다: 단자 0 → 1 방향 전류(A), 양단 전압(V, 단자0 − 단자1) */
  part: Record<string, { i: number; v: number; p: number }>;
  /** 가변저항: 단자0→미끄럼, 미끄럼→단자1 전류 */
  rheo: Record<string, { i0: number; i1: number }>;
  /** 단자에서 부품으로 들어가는 전류 (전선 위 흐름 계산용) */
  into: Map<string, number>;
}

export function newElectricState(): ElectricState {
  return { t: 0, vc: {}, il: {} };
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i] as number]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-30) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => (Math.abs(row[i]!) < 1e-30 ? 0 : row[n]! / row[i]!));
}

/**
 * 시간을 dt만큼 나아가며 한 번 푼다 (후진 오일러). state를 바꾼다.
 * 접지 = 첫 전원의 − 단자 (없으면 마디 0).
 */
export function stepElectric(data: CircuitData, state: ElectricState, dt: number): ElectricReading {
  const { nodeOf, count } = nodesOf(data);
  const node = (p: Part, k: number) => nodeOf.get(termKey(p.id, k)) ?? -1;
  const src = data.parts.find((p) => p.type === "battery" || p.type === "ac");
  const ground = src ? node(src, 1) : 0;
  const n = count;
  const G = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const I = new Array<number>(n).fill(0);
  const t = state.t + dt;
  const stampG = (a: number, b: number, g: number) => {
    if (a < 0 || b < 0 || a === b) return;
    G[a]![a]! += g;
    G[b]![b]! += g;
    G[a]![b]! -= g;
    G[b]![a]! -= g;
  };
  /** a에서 b로 흐르는 전류원 (외부에서 a로 빼서 b로 넣음) */
  const stampI = (a: number, b: number, i: number) => {
    if (a >= 0) I[a]! -= i;
    if (b >= 0) I[b]! += i;
  };
  const srcV = (p: Part) => {
    const V = p.value ?? DEFAULTS[p.type] ?? 0;
    return p.type === "ac" ? V * Math.sin(2 * Math.PI * (p.freq ?? 1) * t) : V;
  };
  const gOf = (p: Part): number => {
    switch (p.type) {
      case "resistor":
      case "bulb":
        return 1 / Math.max(1e-3, p.value ?? DEFAULTS[p.type] ?? 10);
      case "switch":
        return p.on ? G_CLOSED : G_OPEN;
      case "ammeter":
        return G_AMMETER;
      case "voltmeter":
        return G_VOLTMETER;
      default:
        return 0;
    }
  };
  for (const p of data.parts) {
    const a = node(p, 0);
    const b = node(p, 1);
    switch (p.type) {
      case "resistor":
      case "bulb":
      case "switch":
      case "ammeter":
      case "voltmeter":
        stampG(a, b, gOf(p));
        break;
      case "rheostat": {
        const R = Math.max(1e-3, p.value ?? DEFAULTS.rheostat ?? 100);
        const pos = Math.min(1, Math.max(0, p.pos ?? 0.5));
        const w = node(p, 2);
        stampG(a, w, 1 / Math.max(1e-3, R * pos));
        stampG(w, b, 1 / Math.max(1e-3, R * (1 - pos)));
        break;
      }
      case "battery":
      case "ac": {
        // 단자 0 = +, 노턴: (+)로 V/r를 밀어 넣는 전류원 + 컨덕턴스 1/r
        stampG(a, b, 1 / R_SOURCE);
        stampI(b, a, srcV(p) / R_SOURCE);
        break;
      }
      case "capacitor": {
        const C = Math.max(1e-12, (p.value ?? DEFAULTS.capacitor ?? 100) * 1e-6);
        const g = C / dt;
        stampG(a, b, g);
        // 지난 전압을 지키려는 전류원 (a→b 방향 −g·v)
        stampI(b, a, g * (state.vc[p.id] ?? 0));
        break;
      }
      case "inductor": {
        const L = Math.max(1e-9, (p.value ?? DEFAULTS.inductor ?? 100) * 1e-3);
        stampG(a, b, dt / L);
        stampI(a, b, state.il[p.id] ?? 0);
        break;
      }
      default:
        break;
    }
  }
  for (let i = 0; i < n; i++) G[i]![i]! += G_MIN;
  // 접지 마디를 0 V로 고정 (그 줄을 v = 0으로)
  if (ground >= 0 && ground < n) {
    for (let j = 0; j < n; j++) G[ground]![j] = 0;
    G[ground]![ground] = 1;
    I[ground] = 0;
  }
  const v = n > 0 ? solve(G, I) : [];
  const V = (k: number) => (k >= 0 ? (v[k] ?? 0) : 0);

  const part: ElectricReading["part"] = {};
  const rheo: ElectricReading["rheo"] = {};
  const into = new Map<string, number>();
  for (const p of data.parts) {
    const a = node(p, 0);
    const b = node(p, 1);
    const vab = V(a) - V(b);
    let i: number;
    switch (p.type) {
      case "resistor":
      case "bulb":
      case "switch":
      case "ammeter":
      case "voltmeter":
        i = gOf(p) * vab;
        break;
      case "battery":
      case "ac":
        // 전원 안에서 − → + 로 흐르는 전류 = 바깥으로 + 단자에서 나가는 전류 (단자0→1 방향으로는 −)
        i = -(srcV(p) - vab) / R_SOURCE;
        break;
      case "capacitor": {
        const C = Math.max(1e-12, (p.value ?? DEFAULTS.capacitor ?? 100) * 1e-6);
        i = (C / dt) * (vab - (state.vc[p.id] ?? 0));
        state.vc[p.id] = vab;
        break;
      }
      case "inductor": {
        const L = Math.max(1e-9, (p.value ?? DEFAULTS.inductor ?? 100) * 1e-3);
        i = (state.il[p.id] ?? 0) + (dt / L) * vab;
        state.il[p.id] = i;
        break;
      }
      case "rheostat": {
        const R = Math.max(1e-3, p.value ?? DEFAULTS.rheostat ?? 100);
        const pos = Math.min(1, Math.max(0, p.pos ?? 0.5));
        const w = node(p, 2);
        const i0 = (V(a) - V(w)) / Math.max(1e-3, R * pos);
        const i1 = (V(w) - V(b)) / Math.max(1e-3, R * (1 - pos));
        rheo[p.id] = { i0, i1 };
        into.set(termKey(p.id, 0), i0);
        into.set(termKey(p.id, 1), -i1);
        into.set(termKey(p.id, 2), i1 - i0);
        part[p.id] = { i: i0, v: vab, p: i0 * (V(a) - V(w)) + i1 * (V(w) - V(b)) };
        continue;
      }
      default:
        continue;
    }
    part[p.id] = { i, v: vab, p: i * vab };
    into.set(termKey(p.id, 0), i);
    into.set(termKey(p.id, 1), -i);
  }
  state.t = t;
  return { v, part, rheo, into };
}

/**
 * 전선 위 전류 (a → b 방향, A). 한 마디 안의 전선이 나무 모양이면 끝에서부터 벗겨 내며 정한다.
 * (고리를 이루는 전선은 0 — 그림에서 흐름 점이 안 움직일 뿐 계산에는 영향이 없다)
 */
export function wireCurrents(data: CircuitData, into: Map<string, number>): number[] {
  const out = new Array<number>(data.wires.length).fill(0);
  // 단자마다 남은 "마디로 내보내야 할" 전류 = 부품에서 마디로 나오는 전류 = −into
  const excess = new Map<string, number>();
  for (const [k, v] of into) excess.set(k, -v);
  const adj = new Map<string, number[]>();
  data.wires.forEach((w, i) => {
    for (const end of [w.a, w.b]) {
      const list = adj.get(end) ?? [];
      list.push(i);
      adj.set(end, list);
    }
  });
  const done = new Array<boolean>(data.wires.length).fill(false);
  for (let guard = 0; guard < data.wires.length * 2 + 4; guard++) {
    let progressed = false;
    for (const [term, list] of adj) {
      const open = list.filter((i) => !done[i]);
      if (open.length !== 1) continue;
      const i = open[0] as number;
      const w = data.wires[i] as Wire;
      const e = excess.get(term) ?? 0;
      // 이 단자의 넘치는 전류는 이 전선 하나로만 나간다
      const fromA = w.a === term;
      out[i] = fromA ? e : -e;
      const other = fromA ? w.b : w.a;
      excess.set(other, (excess.get(other) ?? 0) + e);
      excess.set(term, 0);
      done[i] = true;
      progressed = true;
    }
    if (!progressed) break;
  }
  return out;
}

// ─────────────────────────────────────────────────────────── 논리

export interface LogicState {
  /** 마디 값 (지난 계산) */
  net: number[];
  /** D 플립플롭: 저장된 Q, 지난 CLK */
  q: Record<string, number>;
  clk: Record<string, number>;
}

export function newLogicState(): LogicState {
  return { net: [], q: {}, clk: {} };
}

const GATE: Record<string, (a: number, b: number) => number> = {
  and: (a, b) => a & b,
  or: (a, b) => a | b,
  nand: (a, b) => 1 - (a & b),
  nor: (a, b) => 1 - (a | b),
  xor: (a, b) => a ^ b,
};

/**
 * 논리 회로 값 — 안정될 때까지 되풀이 (래치처럼 출력이 입력으로 돌아와도).
 * 반환: 마디 값, 끝까지 흔들렸는가(발진).
 */
export function evalLogic(data: CircuitData, state: LogicState): { net: number[]; oscillating: boolean } {
  const { nodeOf, count } = nodesOf(data);
  const node = (p: Part, k: number) => nodeOf.get(termKey(p.id, k)) ?? -1;
  // 출력이 닿는 마디 — 아무것도 대지 않은 마디는 0
  const out = (p: Part): number[] => (p.type === "in" ? [0] : p.type === "not" ? [1] : GATE[p.type] ? [2] : p.type === "dff" ? [2, 3] : []);
  const driven = new Set<number>();
  for (const p of data.parts) for (const k of out(p)) driven.add(node(p, k));
  const net = Array.from({ length: count }, (_, i) => (driven.has(i) ? (state.net[i] ?? 0) : 0));
  const val = (p: Part, k: number) => {
    const n = node(p, k);
    return n >= 0 ? (net[n] ?? 0) : 0;
  };
  const set = (n: number, v: number) => {
    if (n < 0 || net[n] === v) return false;
    net[n] = v;
    return true;
  };
  // 게이트를 하나씩 차례로 (진짜 게이트도 동시에 바뀌지 않는다) — 래치가 0·1 사이를 헛돌지 않고 한쪽으로 자리 잡는다
  let oscillating = true;
  for (let iter = 0; iter < 64; iter++) {
    let changed = false;
    for (const p of data.parts) {
      if (p.type === "in") changed = set(node(p, 0), p.on ? 1 : 0) || changed;
      else if (p.type === "not") changed = set(node(p, 1), 1 - val(p, 0)) || changed;
      else if (GATE[p.type]) changed = set(node(p, 2), (GATE[p.type] as (a: number, b: number) => number)(val(p, 0), val(p, 1))) || changed;
      else if (p.type === "dff") {
        const q = state.q[p.id] ?? 0;
        changed = set(node(p, 2), q) || changed;
        changed = set(node(p, 3), 1 - q) || changed;
      }
    }
    if (!changed) {
      oscillating = false;
      break;
    }
  }
  // D 플립플롭: CLK 0 → 1 이면 D를 저장 (다음 계산부터 반영)
  let changed = false;
  for (const p of data.parts) {
    if (p.type !== "dff") continue;
    const clk = val(p, 1);
    if ((state.clk[p.id] ?? 0) === 0 && clk === 1) {
      const d = val(p, 0);
      if ((state.q[p.id] ?? 0) !== d) changed = true;
      state.q[p.id] = d;
    }
    state.clk[p.id] = clk;
  }
  state.net = net;
  if (changed) return evalLogic(data, state);
  return { net, oscillating };
}

/** 출력 LED의 값 */
export function outputs(data: CircuitData, net: number[]): Record<string, number> {
  const { nodeOf } = nodesOf(data);
  const r: Record<string, number> = {};
  for (const p of data.parts) if (p.type === "out") r[p.id] = net[nodeOf.get(termKey(p.id, 0)) ?? -1] ?? 0;
  return r;
}

/** 진리표 — 입력 5개 이하, 기억 소자가 없을 때. 입력·출력은 이름 순 */
export function truthTable(data: CircuitData): { inputs: string[]; outputs: string[]; rows: number[][] } | null {
  const ins = data.parts.filter((p) => p.type === "in").sort((a, b) => (a.label ?? a.id).localeCompare(b.label ?? b.id));
  const outs = data.parts.filter((p) => p.type === "out").sort((a, b) => (a.label ?? a.id).localeCompare(b.label ?? b.id));
  if (ins.length === 0 || ins.length > 5 || outs.length === 0 || hasFeedback(data)) return null;
  const rows: number[][] = [];
  for (let m = 0; m < 1 << ins.length; m++) {
    const bits = ins.map((_, i) => (m >> (ins.length - 1 - i)) & 1);
    const trial: CircuitData = { ...data, parts: data.parts.map((p) => (p.type === "in" ? { ...p, on: bits[ins.indexOf(p)] === 1 } : p)) };
    const r = evalLogic(trial, newLogicState());
    if (r.oscillating) return null;
    const o = outputs(trial, r.net);
    rows.push([...bits, ...outs.map((p) => o[p.id] ?? 0)]);
  }
  return { inputs: ins.map((p) => p.label ?? p.id), outputs: outs.map((p) => p.label ?? p.id), rows };
}

/** 출력이 다시 자기 입력으로 돌아오는 고리(기억)가 있는가 — 있으면 진리표 대신 지금 상태를 보여 준다 */
export function hasFeedback(data: CircuitData): boolean {
  if (data.parts.some((p) => p.type === "dff")) return true;
  const { nodeOf } = nodesOf(data);
  const node = (p: Part, k: number) => nodeOf.get(termKey(p.id, k)) ?? -1;
  const gates = data.parts.filter((p) => p.type === "not" || GATE[p.type]);
  const outOf = (p: Part) => node(p, p.type === "not" ? 1 : 2);
  const insOf = (p: Part) => (p.type === "not" ? [node(p, 0)] : [node(p, 0), node(p, 1)]);
  // 게이트 → 그 출력을 입력으로 받는 게이트
  const next = new Map(gates.map((g) => [g.id, gates.filter((h) => insOf(h).includes(outOf(g)))]));
  const state = new Map<string, number>(); // 1 = 보는 중, 2 = 끝
  const visit = (g: Part): boolean => {
    if (state.get(g.id) === 1) return true;
    if (state.get(g.id) === 2) return false;
    state.set(g.id, 1);
    for (const h of next.get(g.id) ?? []) if (visit(h)) return true;
    state.set(g.id, 2);
    return false;
  };
  return gates.some(visit);
}
