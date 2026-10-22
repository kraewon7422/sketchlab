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
 *   다이오드·LED·제너·트랜지스터 = 꺾은선 모형 (켜짐/꺼짐·활성/포화 상태를 정해 풀고, 상태가 맞을 때까지 다시 푼다).
 * 논리: 출력이 다시 입력으로 돌아오는 회로(래치)도 값이 안정될 때까지 되풀이, D 플립플롭은 CLK이 0→1일 때.
 */

export const ELECTRIC_PARTS = ["battery", "ac", "switch", "resistor", "rheostat", "capacitor", "inductor", "bulb", "diode", "led", "zener", "npn", "pnp", "fuse", "motor", "ammeter", "voltmeter", "ground", "node"] as const;
export const LOGIC_PARTS = ["in", "clock", "out", "and", "or", "not", "nand", "nor", "xor", "xnor", "dff", "node"] as const;

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
    case "clock":
      return [[2, 0]];
    case "ground":
      return [[0, -1]];
    case "npn":
    case "pnp":
      // B(베이스) · C(컬렉터) · E(이미터)
      return [[-2, 0], [1, -2], [1, 2]];
    case "out":
      return [[-2, 0]];
    case "not":
      return [[-2, 0], [2, 0]];
    case "and":
    case "or":
    case "nand":
    case "nor":
    case "xor":
    case "xnor":
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
  const k = part.size ?? 1;
  return baseTerminals(part.type).map((t) => {
    const [dx, dy] = rot90([t[0] * k, t[1] * k], part.rot ?? 0);
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
  if (w.via) {
    // 옮긴 전선: 단자에서 나가는 방향으로 먼저 → 지나는 점 → 들어가는 단자 방향으로 (모두 가로·세로)
    const [vx, vy] = w.via;
    // 두 가지 길 (가로 먼저 / 세로 먼저) 중 되돌아가는(같은 줄을 왕복하는) 곳이 없고 짧은 길
    const tidy = (pts: XY[]) => {
      const out: XY[] = [];
      for (const p of pts) {
        const last = out[out.length - 1];
        if (last && last[0] === p[0] && last[1] === p[1]) continue;
        const prev = out[out.length - 2];
        if (prev && last && ((prev[0] === last[0] && last[0] === p[0]) || (prev[1] === last[1] && last[1] === p[1]))) {
          // 한 줄 위 세 점: 가운데가 양 끝 사이면 빼고, 아니면 왕복 (벌점)
          out.pop();
        }
        out.push(p);
      }
      return out;
    };
    const cost = (pts: XY[]) => {
      let len = 0;
      let back = 0;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1] as XY;
        const [x1, y1] = pts[i] as XY;
        len += Math.abs(x1 - x0) + Math.abs(y1 - y0);
        const q = pts[i + 1];
        if (q && ((x0 === x1 && x1 === q[0] && Math.sign(y1 - y0) === -Math.sign(q[1] - y1)) || (y0 === y1 && y1 === q[1] && Math.sign(x1 - x0) === -Math.sign(q[0] - x1)))) back++;
      }
      return len + back * 1000;
    };
    const r1: XY[] = [A.p, [vx, ay], [vx, vy], [vx, by], B.p];
    const r2: XY[] = [A.p, [ax, vy], [vx, vy], [bx, vy], B.p];
    return tidy(cost(r1) <= cost(r2) ? r1 : r2);
  }
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
export const DEFAULTS: Partial<Record<PartType, number>> = { battery: 6, ac: 5, resistor: 10, rheostat: 100, capacitor: 100, inductor: 100, bulb: 10, zener: 5.1, npn: 100, pnp: 100, fuse: 1, motor: 10 };
export const UNIT: Partial<Record<PartType, string>> = { battery: "V", ac: "V", resistor: "Ω", rheostat: "Ω", capacitor: "μF", inductor: "mH", bulb: "Ω", zener: "V", npn: "β", pnp: "β", fuse: "A", motor: "Ω" };

export type LedColor = NonNullable<Part["color"]>;
/** LED 색마다 켜지는 문턱 전압 (빨강이 가장 낮고 파랑·흰색이 가장 높다) */
export const LED_VF: Record<LedColor, number> = { red: 1.8, yellow: 2.0, green: 2.1, blue: 3.0, white: 3.0 };
export const LED_MAX = 0.05; // LED는 50 mA를 넘으면 탄다 (보통 20 mA로 쓴다)
const DIODE_MAX = 3; // 다이오드·제너 3 A
const DIODE_VF = 0.7; // 실리콘 다이오드 문턱 전압
const R_DIODE = 0.5; // 켜진 다이오드의 작은 저항
const R_LED = 10;
const R_ZENER = 1;
const VBE = 0.7; // 트랜지스터 베이스-이미터 문턱
const R_BE = 10;
const VCE_SAT = 0.2; // 포화일 때 컬렉터-이미터 전압
const R_SAT = 1;
const G_FUSE = 100; // 퓨즈 0.01 Ω

const R_SOURCE = 0.05; // 전지 내부 저항
const G_CLOSED = 1e4; // 닫힌 스위치 (0.1 mΩ)
const G_OPEN = 1e-12; // 열린 스위치 (새는 전류가 축전기를 몇 분 만에 채우지 않게)
const G_AMMETER = 1e3; // 1 mΩ
const G_VOLTMETER = 1e-7; // 10 MΩ
const G_MIN = 1e-9; // 떠 있는 마디가 풀리게
const G_OFF = 1e-9; // 꺼진 다이오드·트랜지스터

export interface ElectricState {
  t: number;
  /** 축전기 양단 전압 (id → V) */
  vc: Record<string, number>;
  /** 코일 전류 (id → A) */
  il: Record<string, number>;
  /** 다이오드: 0 꺼짐 1 켜짐 2 항복(제너) · 트랜지스터: 0 차단 1 활성 2 포화 */
  sw: Record<string, number>;
  /** 너무 큰 전류로 끊어진(탄) 퓨즈·LED·다이오드 */
  broken: Record<string, boolean>;
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
  /** 다이오드·트랜지스터 상태 (ElectricState.sw와 같은 뜻) */
  mode: Record<string, number>;
  /** 트랜지스터 베이스 전류 */
  ib: Record<string, number>;
  broken: Record<string, boolean>;
}

export function newElectricState(): ElectricState {
  return { t: 0, vc: {}, il: {}, sw: {}, broken: {} };
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
  const earths = data.parts.filter((p) => p.type === "ground");
  // 접지 기호가 있으면 그곳이 0 V, 없으면 첫 전원의 − 단자
  const ground = earths[0] ? node(earths[0], 0) : src ? node(src, 1) : 0;
  const n = count;
  state.sw ??= {};
  state.broken ??= {};
  const sw = state.sw;
  const broken = state.broken;
  let G: number[][] = [];
  let I: number[] = [];
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
      case "motor":
        return 1 / Math.max(1e-3, p.value ?? DEFAULTS.motor ?? 10);
      case "fuse":
        return broken[p.id] ? G_OPEN : G_FUSE;
      case "ammeter":
        return G_AMMETER;
      case "voltmeter":
        return G_VOLTMETER;
      default:
        return 0;
    }
  };
  /** a→b 전압 v에 따라 흐르는 전류 i = g·(v − v0) 를 넣는다 (켜진 다이오드 등) */
  const stampLine = (a: number, b: number, g: number, v0: number) => {
    stampG(a, b, g);
    stampI(b, a, g * v0);
  };
  /** c에서 e로 흐르는 전류 gm·(V(x) − V(y) − v0) (트랜지스터 활성 영역) */
  const stampVCCS = (c: number, e: number, x: number, y: number, gm: number, v0: number) => {
    const add = (r: number, k: number, val: number) => {
      if (r >= 0 && k >= 0) G[r]![k]! += val;
    };
    add(c, x, gm);
    add(c, y, -gm);
    add(e, x, -gm);
    add(e, y, gm);
    if (c >= 0) I[c]! += gm * v0;
    if (e >= 0) I[e]! -= gm * v0;
  };
  const isDiode = (p: Part) => p.type === "diode" || p.type === "led" || p.type === "zener";
  const isBjt = (p: Part) => p.type === "npn" || p.type === "pnp";
  const diodeOf = (p: Part) => (p.type === "led" ? { vf: LED_VF[p.color ?? "red"], r: R_LED } : { vf: DIODE_VF, r: p.type === "zener" ? R_ZENER : R_DIODE });
  const vz = (p: Part) => p.value ?? DEFAULTS.zener ?? 5.1;
  /** 트랜지스터 마디: BE 다이오드 (양극 an → 음극 ca), 주 전류 길 x → y. NPN: B→E, C→E · PNP: E→B, E→C */
  const bjt = (p: Part) => {
    const B = node(p, 0);
    const C = node(p, 1);
    const E = node(p, 2);
    return p.type === "npn" ? { an: B, ca: E, x: C, y: E } : { an: E, ca: B, x: E, y: C };
  };
  const beta = (p: Part) => p.value ?? DEFAULTS[p.type] ?? 100;

  const build = () => {
    G = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    I = new Array<number>(n).fill(0);
    for (const p of data.parts) {
      const a = node(p, 0);
      const b = node(p, 1);
      switch (p.type) {
        case "resistor":
        case "bulb":
        case "switch":
        case "ammeter":
        case "voltmeter":
        case "motor":
        case "fuse":
          stampG(a, b, gOf(p));
          break;
        case "diode":
        case "led":
        case "zener": {
          const m = broken[p.id] ? 0 : (sw[p.id] ?? 0);
          const d = diodeOf(p);
          if (m === 1) stampLine(a, b, 1 / d.r, d.vf);
          else if (m === 2) stampLine(a, b, 1 / R_ZENER, -vz(p));
          else stampG(a, b, G_OFF);
          break;
        }
        case "npn":
        case "pnp": {
          const m = sw[p.id] ?? 0;
          const j = bjt(p);
          stampG(j.x, j.y, G_OFF);
          if (m === 0) {
            stampG(j.an, j.ca, G_OFF);
            break;
          }
          stampLine(j.an, j.ca, 1 / R_BE, VBE);
          if (m === 1) stampVCCS(j.x, j.y, j.an, j.ca, beta(p) / R_BE, VBE);
          else stampLine(j.x, j.y, 1 / R_SAT, VCE_SAT);
          break;
        }
        case "ground": {
          // 다른 접지 기호도 모두 0 V (땅으로 이어져 있다)
          const gnd = node(p, 0);
          if (gnd !== ground) stampG(gnd, ground, G_CLOSED);
          break;
        }
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
    return n > 0 ? solve(G, I) : [];
  };

  // 다이오드·트랜지스터 상태를 가정해 풀고, 결과와 맞지 않으면 상태를 바꿔 다시 (보통 2~3번)
  let v: number[] = [];
  const V = (k: number) => (k >= 0 ? (v[k] ?? 0) : 0);
  for (let iter = 0; iter < 40; iter++) {
    v = build();
    let changed = false;
    for (const p of data.parts) {
      let m = sw[p.id] ?? 0;
      if (isDiode(p)) {
        if (broken[p.id]) continue;
        const vab = V(node(p, 0)) - V(node(p, 1));
        const { vf, r } = diodeOf(p);
        // 켜진 채로 남으려면 실제로 흐르는 전류(0.1 μA 넘게)가 있어야 한다 — 새는 전류만으로 켜진 척하지 않게
        const fwd = m === 1 ? (vab - vf) / r > 1e-7 : vab > vf + 1e-6;
        const rev = m === 2 ? -(vab + vz(p)) / R_ZENER > 1e-7 : vab < -vz(p) - 1e-6;
        m = fwd ? 1 : p.type === "zener" && rev ? 2 : 0;
      } else if (isBjt(p)) {
        const j = bjt(p);
        const vbe = V(j.an) - V(j.ca);
        const vxy = V(j.x) - V(j.y);
        const ib = (vbe - VBE) / R_BE;
        if (m === 0) m = vbe > VBE ? 1 : 0;
        else if (ib < 0) m = 0;
        else if (m === 1 && vxy < VCE_SAT) m = 2;
        else if (m === 2 && (vxy - VCE_SAT) / R_SAT > beta(p) * ib) m = 1;
      } else continue;
      if (m !== (sw[p.id] ?? 0)) {
        sw[p.id] = m;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const part: ElectricReading["part"] = {};
  const rheo: ElectricReading["rheo"] = {};
  const into = new Map<string, number>();
  const mode: ElectricReading["mode"] = {};
  const ibs: ElectricReading["ib"] = {};
  let earthI = 0;
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
      case "motor":
        i = gOf(p) * vab;
        break;
      case "fuse":
        i = gOf(p) * vab;
        if (Math.abs(i) > (p.value ?? DEFAULTS.fuse ?? 1)) broken[p.id] = true;
        break;
      case "diode":
      case "led":
      case "zener": {
        const m = broken[p.id] ? 0 : (sw[p.id] ?? 0);
        const d = diodeOf(p);
        i = m === 1 ? (vab - d.vf) / d.r : m === 2 ? (vab + vz(p)) / R_ZENER : G_OFF * vab;
        mode[p.id] = m;
        if (Math.abs(i) > (p.type === "led" ? LED_MAX : DIODE_MAX)) broken[p.id] = true;
        break;
      }
      case "npn":
      case "pnp": {
        const m = sw[p.id] ?? 0;
        const j = bjt(p);
        const vbe = V(j.an) - V(j.ca);
        const vxy = V(j.x) - V(j.y);
        const ib = m === 0 ? G_OFF * vbe : (vbe - VBE) / R_BE;
        const ic = (m === 1 ? (beta(p) / R_BE) * (vbe - VBE) : m === 2 ? (vxy - VCE_SAT) / R_SAT : 0) + G_OFF * vxy;
        mode[p.id] = m;
        ibs[p.id] = ib;
        part[p.id] = { i: ic, v: vxy, p: ic * vxy + ib * vbe };
        const kB = termKey(p.id, 0);
        const kC = termKey(p.id, 1);
        const kE = termKey(p.id, 2);
        if (p.type === "npn") {
          into.set(kB, ib);
          into.set(kC, ic);
          into.set(kE, -ib - ic);
        } else {
          into.set(kE, ib + ic);
          into.set(kB, -ib);
          into.set(kC, -ic);
        }
        continue;
      }
      case "ground": {
        // 땅으로 들어가는 전류 — 첫 접지 기호가 다른 접지에서 들어온 만큼 내보낸다
        if (p === earths[0]) continue;
        const gi = G_CLOSED * (V(node(p, 0)) - V(ground));
        into.set(termKey(p.id, 0), gi);
        earthI += gi;
        continue;
      }
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
  if (earths[0] && earthI !== 0) into.set(termKey(earths[0].id, 0), -earthI);
  state.t = t;
  return { v, part, rheo, into, mode, ib: ibs, broken: { ...broken } };
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
  xnor: (a, b) => 1 - (a ^ b),
};

/** 클록 출력 — 1초에 freq번 0→1→0 (반은 1, 반은 0) */
export const clockValue = (p: Part, time: number): number => Math.floor(time * 2 * (p.freq ?? 1)) % 2;

/**
 * 논리 회로 값 — 안정될 때까지 되풀이 (래치처럼 출력이 입력으로 돌아와도).
 * 반환: 마디 값, 끝까지 흔들렸는가(발진).
 */
export function evalLogic(data: CircuitData, state: LogicState, time = 0): { net: number[]; oscillating: boolean } {
  const { nodeOf, count } = nodesOf(data);
  const node = (p: Part, k: number) => nodeOf.get(termKey(p.id, k)) ?? -1;
  // 출력이 닿는 마디 — 아무것도 대지 않은 마디는 0
  const out = (p: Part): number[] => (p.type === "in" || p.type === "clock" ? [0] : p.type === "not" ? [1] : GATE[p.type] ? [2] : p.type === "dff" ? [2, 3] : []);
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
      else if (p.type === "clock") changed = set(node(p, 0), clockValue(p, time)) || changed;
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
  if (changed) return evalLogic(data, state, time);
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
  if (ins.length === 0 || ins.length > 5 || outs.length === 0 || hasFeedback(data) || data.parts.some((p) => p.type === "clock")) return null;
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

// ─────────────────────────────────────────────────────────── 회로도 그리기 규칙 (실제 회로도처럼)

const cellKey = ([x, y]: XY) => `${x},${y}`;

/** 단자마다 이어진 개수 = 닿은 전선 수 + 같은 칸의 다른 단자 수 */
export function connectionCounts(data: CircuitData): Map<string, number> {
  const out = new Map<string, number>();
  const byCell = new Map<string, string[]>();
  for (const p of data.parts)
    terminals(p).forEach((t, k) => {
      const key = termKey(p.id, k);
      out.set(key, 0);
      const c = cellKey(t);
      byCell.set(c, [...(byCell.get(c) ?? []), key]);
    });
  for (const keys of byCell.values()) for (const k of keys) out.set(k, (out.get(k) ?? 0) + keys.length - 1);
  for (const w of data.wires)
    for (const end of [w.a, w.b])
      if (out.has(end)) out.set(end, (out.get(end) ?? 0) + 1);
  return out;
}

/**
 * 아무것도 이어지지 않은 마디(점)와 없는 단자를 가리키는 전선을 치운다 — 부품·전선을 지운 뒤 점이 남지 않게.
 */
export function cleanupNodes(data: CircuitData): CircuitData {
  let d = data;
  for (let guard = 0; guard < 10; guard++) {
    const ids = new Set(d.parts.map((p) => p.id));
    const wires = d.wires.filter((w) => ids.has(w.a.split(":")[0] as string) && ids.has(w.b.split(":")[0] as string));
    const counts = connectionCounts({ ...d, wires });
    const parts = d.parts.filter((p) => p.type !== "node" || (counts.get(termKey(p.id, 0)) ?? 0) > 0);
    if (parts.length === d.parts.length && wires.length === d.wires.length) return d;
    d = { ...d, parts, wires };
  }
  return d;
}

/**
 * 이어지지 않은 채 겹치는 전선 — 가로 전선에 반원 다리(hop)를 그린다 (실제 회로도 관례).
 * 반환: 전선 번호 → 그 전선의 가로 구간 위 교차점들 (격자 좌표)
 */
export function wireHops(data: CircuitData, paths: readonly XY[][]): Map<number, XY[]> {
  type Seg = { w: number; a: XY; b: XY };
  const hs: Seg[] = [];
  const vs: Seg[] = [];
  paths.forEach((pts, w) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1] as XY;
      const b = pts[i] as XY;
      if (a[1] === b[1] && a[0] !== b[0]) hs.push({ w, a, b });
      else if (a[0] === b[0] && a[1] !== b[1]) vs.push({ w, a, b });
    }
  });
  const { nodeOf } = nodesOf(data);
  const nodeOfWire = (w: number) => nodeOf.get((data.wires[w] as Wire).a);
  const out = new Map<number, XY[]>();
  const inside = (v: number, p: number, q: number) => v > Math.min(p, q) + 1e-9 && v < Math.max(p, q) - 1e-9;
  for (const h of hs)
    for (const v of vs) {
      if (h.w === v.w) continue;
      const x = v.a[0];
      const y = h.a[1];
      if (!inside(x, h.a[0], h.b[0]) || !inside(y, v.a[1], v.b[1])) continue;
      // 같은 마디(전기적으로 이어진 전선)끼리는 다리를 놓지 않는다
      if (nodeOfWire(h.w) === nodeOfWire(v.w)) continue;
      out.set(h.w, [...(out.get(h.w) ?? []), [x, y]]);
    }
  return out;
}
