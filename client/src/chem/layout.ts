/**
 * 분자 → 교과서 골격식 선화 (마스터스펙 v4 §13). 순수 함수 — RDKit 없이 테스트할 수 있다.
 *
 * 원자 배치(2D 좌표)는 RDKit이 한다 (손으로 짠 SMILES 해석기는 금지 — v4 §13.1).
 * 여기서는 그 결과(get_json)를 받아 "어떻게 보이게 그릴지"만 정한다:
 *   - 탄소는 꼭짓점으로만 (골격식). 다른 원소는 기호 + 붙은 H 개수 (OH, NH₂)
 *   - 이중결합: 고리 안이면 안쪽에 짧은 선, 끝 원자(C=O)면 가운데 대칭 두 줄
 *   - 방향족 고리는 원 표기를 고를 수 있다 (벤젠 안의 원)
 */

export type P2 = [number, number];

export interface AtomLabel {
  at: P2;
  symbol: string;
  /** 붙은 수소 개수 (0이면 안 씀) */
  hydrogens: number;
  /** 수소를 기호 왼쪽에 쓸지 (HO−처럼, 이웃이 오른쪽에 있을 때) */
  hLeft: boolean;
  /** "+", "−", "2+" … 없으면 "" */
  charge: string;
}

export interface ChemDrawing {
  lines: Array<[P2, P2]>;
  labels: AtomLabel[];
  circles: Array<{ c: P2; r: number }>;
  width: number;
  height: number;
}

export interface LayoutOptions {
  /** 결합 길이 px */
  bond: number;
  /** 모든 원자 기호(C, H 포함)를 쓴다 — 완전 구조식 */
  showCarbons: boolean;
  /** 방향족 고리를 원으로 */
  aromaticCircle: boolean;
  multiGap: number;
  innerTrim: number;
  labelGap: number;
  circleRatio: number;
}

const SYMBOLS = (
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr " +
  "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba"
).split(" ");

export function elementSymbol(z: number): string {
  return SYMBOLS[z - 1] ?? "?";
}

interface RdAtom {
  z?: number;
  impHs?: number;
  chg?: number;
}
interface RdBond {
  atoms: [number, number];
  bo?: number;
}
interface RdJson {
  defaults?: { atom?: RdAtom; bond?: { bo?: number } };
  molecules: Array<{
    atoms: RdAtom[];
    bonds?: RdBond[];
    conformers?: Array<{ coords: number[][] }>;
    extensions?: Array<{ aromaticBonds?: number[]; atomRings?: number[][] }>;
  }>;
}

/** RDKit 좌표의 결합 길이 (normalize_depiction 기준) */
const RD_BOND = 1.5;

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P2, k: number): P2 => [a[0] * k, a[1] * k];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];

function chargeText(c: number): string {
  if (!c) return "";
  const sign = c > 0 ? "+" : "−";
  return Math.abs(c) === 1 ? sign : `${Math.abs(c)}${sign}`;
}

export function layoutMolecule(json: string, opt: LayoutOptions): ChemDrawing {
  const doc = JSON.parse(json) as RdJson;
  const mol = doc.molecules[0];
  if (!mol) throw new Error("분자가 비어 있어요");
  const atomDefault = doc.defaults?.atom ?? {};
  const bondDefault = doc.defaults?.bond?.bo ?? 1;
  const atoms = mol.atoms.map((a) => ({
    z: a.z ?? atomDefault.z ?? 6,
    h: a.impHs ?? atomDefault.impHs ?? 0,
    chg: a.chg ?? atomDefault.chg ?? 0,
  }));
  const bonds = (mol.bonds ?? []).map((b) => ({ a: b.atoms[0], b: b.atoms[1], order: b.bo ?? bondDefault }));
  const ext = mol.extensions?.find((e) => e.atomRings || e.aromaticBonds) ?? {};
  const rings = ext.atomRings ?? [];
  const aromaticBonds = new Set(ext.aromaticBonds ?? []);
  const raw = mol.conformers?.[0]?.coords ?? atoms.map(() => [0, 0]);

  // RDKit 좌표(y 위) → 화면 px (y 아래)
  const k = opt.bond / RD_BOND;
  const pos: P2[] = raw.map((c) => [(c[0] ?? 0) * k, -(c[1] ?? 0) * k]);
  const nbrs: number[][] = atoms.map(() => []);
  for (const b of bonds) {
    nbrs[b.a]?.push(b.b);
    nbrs[b.b]?.push(b.a);
  }

  // 기호를 쓰는 원자: 탄소가 아닌 것, 전하가 있는 것, 혼자인 탄소(CH₄), 완전 구조식이면 전부
  const labeled = atoms.map((a, i) => opt.showCarbons || a.z !== 6 || a.chg !== 0 || (nbrs[i]?.length ?? 0) === 0);

  // 원으로 그릴 방향족 고리: 고리의 모든 결합이 방향족
  const ringBonds = (ring: number[]) =>
    ring.map((ai, j) => {
      const bj = ring[(j + 1) % ring.length] as number;
      return bonds.findIndex((b) => (b.a === ai && b.b === bj) || (b.a === bj && b.b === ai));
    });
  const circleRings = opt.aromaticCircle ? rings.filter((r) => ringBonds(r).every((bi) => bi >= 0 && aromaticBonds.has(bi))) : [];
  const circledBonds = new Set(circleRings.flatMap(ringBonds));
  const centroid = (ring: number[]): P2 => mul(ring.reduce<P2>((s, i) => add(s, pos[i] as P2), [0, 0]), 1 / ring.length);

  const gapAt = (i: number) => (labeled[i] ? opt.labelGap * opt.bond : 0);
  /** a→b 선분을 기호 있는 끝에서 잘라낸다 */
  const trimmed = (a: number, b: number, offset: P2 = [0, 0], extra = 0): [P2, P2] => {
    const pa = add(pos[a] as P2, offset);
    const pb = add(pos[b] as P2, offset);
    const d = sub(pb, pa);
    const L = len(d) || 1;
    const u = mul(d, 1 / L);
    const ta = Math.max(gapAt(a), extra);
    const tb = Math.max(gapAt(b), extra);
    return [add(pa, mul(u, ta)), sub(pb, mul(u, tb))];
  };

  const lines: Array<[P2, P2]> = [];
  bonds.forEach((b, bi) => {
    const pa = pos[b.a] as P2;
    const pb = pos[b.b] as P2;
    const d = sub(pb, pa);
    const L = len(d) || 1;
    const n: P2 = [-d[1] / L, d[0] / L];
    const gap = opt.multiGap * opt.bond;
    const order = circledBonds.has(bi) ? 1 : b.order;

    if (order === 3) {
      lines.push(trimmed(b.a, b.b));
      lines.push(trimmed(b.a, b.b, mul(n, gap)));
      lines.push(trimmed(b.a, b.b, mul(n, -gap)));
      return;
    }
    if (order !== 2) {
      lines.push(trimmed(b.a, b.b));
      return;
    }

    // 이중결합은 어느 쪽에 둘째 선을 놓을지가 관건
    const ring = rings.filter((r) => r.includes(b.a) && r.includes(b.b)).sort((x, y) => x.length - y.length)[0];
    let side = 0;
    if (ring) {
      side = Math.sign(cross(d, sub(centroid(ring), pa)));
    } else {
      const terminal = (nbrs[b.a]?.length ?? 0) === 1 || (nbrs[b.b]?.length ?? 0) === 1;
      const labeledEnd = labeled[b.a] || labeled[b.b];
      if (!(terminal && labeledEnd)) {
        // 이웃 원자들이 몰린 쪽 (사슬의 C=C는 지그재그 안쪽으로)
        let s = 0;
        for (const [self, other] of [
          [b.a, b.b],
          [b.b, b.a],
        ] as const) {
          for (const m of nbrs[self] ?? []) if (m !== other) s += Math.sign(cross(d, sub(pos[m] as P2, pa)));
        }
        side = Math.sign(s);
      }
    }

    if (side === 0) {
      // 대칭 두 줄 (C=O, O=C=O)
      lines.push(trimmed(b.a, b.b, mul(n, gap / 2)));
      lines.push(trimmed(b.a, b.b, mul(n, -gap / 2)));
    } else {
      lines.push(trimmed(b.a, b.b));
      lines.push(trimmed(b.a, b.b, mul(n, side * gap), opt.innerTrim * opt.bond));
    }
  });

  const labels: AtomLabel[] = [];
  atoms.forEach((a, i) => {
    if (!labeled[i]) return;
    const meanDx = (nbrs[i] ?? []).reduce((s, m) => s + ((pos[m] as P2)[0] - (pos[i] as P2)[0]), 0);
    labels.push({
      at: pos[i] as P2,
      symbol: elementSymbol(a.z),
      hydrogens: a.h,
      hLeft: meanDx > opt.bond * 0.1,
      charge: chargeText(a.chg),
    });
  });

  const circles = circleRings.map((r) => {
    const c = centroid(r);
    const apothem = Math.min(
      ...r.map((ai, j) => {
        const p = pos[ai] as P2;
        const q = pos[r[(j + 1) % r.length] as number] as P2;
        return len(sub(mul(add(p, q), 0.5), c));
      }),
    );
    return { c, r: apothem * opt.circleRatio };
  });

  // 여백: 기호·수소가 삐져나갈 자리
  const margin = opt.bond * 0.75;
  const xs = pos.map((p) => p[0]);
  const ys = pos.map((p) => p[1]);
  const minX = Math.min(...xs) - margin;
  const minY = Math.min(...ys) - margin;
  const shift = (p: P2): P2 => [p[0] - minX, p[1] - minY];
  return {
    lines: lines.map(([p, q]) => [shift(p), shift(q)]),
    labels: labels.map((l) => ({ ...l, at: shift(l.at) })),
    circles: circles.map((c) => ({ ...c, c: shift(c.c) })),
    width: Math.max(...xs) + margin - minX,
    height: Math.max(...ys) + margin - minY,
  };
}
