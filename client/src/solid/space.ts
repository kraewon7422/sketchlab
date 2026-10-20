import type { SceneDataOf } from "@sketchlab/shared";
import type { Mesh, Vec3 } from "./mesh";
import { drawSolid, rotate, type P2, type View3 } from "./project";

/**
 * 공간좌표 그림 (마스터스펙 v4 §12.5) — 교과서 "좌표공간의 점" 그림.
 *
 * 수학 좌표 (x, y, z), z가 위. 그리기 좌표계(y 위, z 보는 사람 쪽)로 옮길 때
 *   수학 y → 오른쪽, 수학 z → 위, 수학 x → 보는 사람 쪽(기본 시점에서 왼쪽 아래)
 * 이라서 기본 시점에서 x축이 왼쪽 아래로 내려오는 교과서 배치가 된다.
 *
 * 점 P(a, b, c)에는 세 좌표평면으로 내린 수선과 축까지의 선을 점선으로 그린다 —
 * 원점과 P를 마주 보는 꼭짓점으로 하는 직육면체의 모서리 9개.
 */

type SpaceData = SceneDataOf<"space3d">;

export function toRender([x, y, z]: readonly [number, number, number]): Vec3 {
  return [y, z, x];
}

export interface SpaceDrawing {
  axes: Array<{ name: "x" | "y" | "z"; from: P2; to: P2; neg: P2 }>;
  dashed: P2[][];
  solid: P2[][];
  points: Array<{ at: P2; label: string }>;
  /** 축 위 좌표 눈금 (수선의 발) */
  ticks: Array<{ at: P2; label: string; axis: "x" | "y" | "z" }>;
  origin: P2;
  /** 벡터 화살표 (머리 + 이름) */
  arrows: Array<{ from: P2; to: P2; label: string }>;
  /** 평행육면체 모서리: 보이는 것 실선, 가려진 것 점선 */
  edges: { visible: P2[][]; hidden: P2[][] };
}

/** 수학 좌표 → 화면 (축마다 다른 범위면 그 축만 늘인다) + 회전 뒤 깊이 */
function projector(data: SpaceData, view: View3, scale: number, cx: number, cy: number) {
  const range = data.view.range;
  const ax = data.view.axes;
  const k = ax ? [range / ax.x, range / ax.y, range / ax.z] : [1, 1, 1];
  const R = (p: readonly [number, number, number]): Vec3 => rotate(toRender([p[0] * (k[0] as number), p[1] * (k[1] as number), p[2] * (k[2] as number)]), view);
  const toScreen = (r: Vec3): P2 => [cx + r[0] * scale, cy - r[1] * scale];
  const S = (p: readonly [number, number, number]): P2 => toScreen(R(p));
  const bounds = { x: ax?.x ?? range, y: ax?.y ?? range, z: ax?.z ?? range };
  return { R, S, bounds, toScreen };
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace("-", "−");

export function drawSpace(data: SpaceData, view: View3, scale: number, cx: number, cy: number): SpaceDrawing {
  const range = data.view.range;
  // 축마다 범위가 다르면 그 축만 늘이고 줄인다 (그림 크기는 range 기준 그대로, 눈금 글자는 실제 값)
  const ax = data.view.axes;
  const { S, R, toScreen } = projector(data, view, scale, cx, cy);
  const axes = (["x", "y", "z"] as const).map((name, i) => {
    const pos: [number, number, number] = [0, 0, 0];
    const neg: [number, number, number] = [0, 0, 0];
    // 축 끝은 그 축의 실제 범위 (S가 range 길이로 맞춘다)
    const a = ax ? ax[name] : range;
    pos[i] = a;
    neg[i] = -a * 0.35;
    return { name, from: S([0, 0, 0]), to: S(pos), neg: S(neg) };
  });

  const dashed: P2[][] = [];
  const solid: P2[][] = [];
  const points: SpaceDrawing["points"] = [];
  const ticks: SpaceDrawing["ticks"] = [];
  const near = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((v, i) => v - (b[i] as number))) < 1e-9;
  /** 축 위에 놓인 선분 — 축과 겹쳐 그리면 축 위에 점선이 얹혀 지저분해진다 */
  const onAxis = (a: readonly number[], b: readonly number[]) =>
    [0, 1, 2].some((k) => [0, 1, 2].every((j) => j === k || (a[j] === 0 && b[j] === 0)));
  const seen = new Set<string>();
  const seg = (a: [number, number, number], b: [number, number, number], into: P2[][]) => {
    // 점이 좌표평면 위에 있으면 직육면체가 납작해져 길이 0·중복·축 위 선분이 생긴다 → 건너뛴다
    if (near(a, b) || onAxis(a, b)) return;
    const key = [a.join(","), b.join(",")].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    into.push([S(a), S(b)]);
  };

  for (const p of data.points ?? []) {
    const [x, y, z] = p.at;
    points.push({ at: S(p.at), label: `${p.label ?? ""}(${fmt(x)}, ${fmt(y)}, ${fmt(z)})` });
    if (data.showProjections) {
      // 직육면체 [0,x]×[0,y]×[0,z]의 모서리 중 축 위가 아닌 9개
      seg([x, y, z], [x, y, 0], dashed);
      seg([x, y, z], [0, y, z], dashed);
      seg([x, y, z], [x, 0, z], dashed);
      seg([x, y, 0], [x, 0, 0], dashed);
      seg([x, y, 0], [0, y, 0], dashed);
      seg([0, y, z], [0, y, 0], dashed);
      seg([0, y, z], [0, 0, z], dashed);
      seg([x, 0, z], [x, 0, 0], dashed);
      seg([x, 0, z], [0, 0, z], dashed);
      if (x !== 0) ticks.push({ at: S([x, 0, 0]), label: fmt(x), axis: "x" });
      if (y !== 0) ticks.push({ at: S([0, y, 0]), label: fmt(y), axis: "y" });
      if (z !== 0) ticks.push({ at: S([0, 0, z]), label: fmt(z), axis: "z" });
    }
  }
  const arrows = (data.vectors ?? []).map((v) => ({ from: S(v.from), to: S(v.to), label: v.label ?? "" }));
  for (const s of data.segments ?? []) solid.push([S(s.a), S(s.b)]);

  // 평행육면체: 볼록 입체라 입체도형과 같은 정확한 숨은선 (면이 보는 쪽을 향하는가)
  const edges: SpaceDrawing["edges"] = { visible: [], hidden: [] };
  for (const sh of data.shapes ?? []) {
    if (sh.t !== "parallelepiped") continue;
    const corners: Array<[number, number, number]> = [];
    for (let m = 0; m < 8; m++) {
      const p: [number, number, number] = [...sh.o];
      for (let i = 0; i < 3; i++) p[i] = (p[i] as number) + (m & 1 ? sh.a[i]! : 0) + (m & 2 ? sh.b[i]! : 0) + (m & 4 ? sh.c[i]! : 0);
      corners.push(p);
    }
    const rv = corners.map(R);
    const quads = [
      [0, 1, 3, 2],
      [4, 5, 7, 6],
      [0, 1, 5, 4],
      [2, 3, 7, 6],
      [0, 2, 6, 4],
      [1, 3, 7, 5],
    ];
    if (Math.abs(dot(sh.a, cross(sh.b, sh.c))) < 1e-9) {
      // 세 벡터가 한 평면 위 — 납작해서 앞뒤가 없다, 모서리만
      for (const q of quads) edges.visible.push([...q, q[0] as number].map((i) => toScreen(rv[i] as Vec3)));
      continue;
    }
    const center = rv.reduce<Vec3>((s, p) => [s[0] + p[0] / 8, s[1] + p[1] / 8, s[2] + p[2] / 8], [0, 0, 0]);
    // 바깥을 향하게 감는 방향을 맞춘다 (세 벡터의 방향에 따라 뒤집힌다)
    const faces = quads.map((q) => {
      const [p0, p1, , p3] = q.map((i) => rv[i] as Vec3) as [Vec3, Vec3, Vec3, Vec3];
      const mid = q.reduce<Vec3>((s, i) => { const p = rv[i] as Vec3; return [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4]; }, [0, 0, 0]);
      return { v: dot(cross(sub(p1, p0), sub(p3, p0)), sub(mid, center)) < 0 ? [...q].reverse() : q, smooth: -1 };
    });
    const mesh: Mesh = { vertices: rv, faces, decorations: [] };
    // 이미 돌린 좌표라 시점은 그대로 (0, 0)
    const d = drawSolid(mesh, { yaw: 0, pitch: 0 }, scale, toScreen([0, 0, 0])[0], toScreen([0, 0, 0])[1]);
    edges.visible.push(...d.visible);
    edges.hidden.push(...d.hidden);
  }

  return { axes, dashed, solid, points, ticks, origin: S([0, 0, 0]), arrows, edges };
}

type V = readonly [number, number, number];
const sub = (a: V, b: V): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface SpaceFace {
  d: string;
  fill: string;
  stroke: string;
}

/** 칠할 색 (곡면마다 다른 색 — 겹쳐 보여도 구별되게) */
const HUES = [212, 18, 145, 275];
const LIGHT: Vec3 = (() => {
  const l: Vec3 = [-0.4, 0.75, 0.55];
  const n = Math.hypot(...l);
  return [l[0] / n, l[1] / n, l[2] / n];
})();

/**
 * 곡면·평면·구·원기둥 → 칠한 사각형 조각들 (먼 것부터 — 화가 알고리즘).
 * fns: surfaces 순서대로 z = f(x, y) (식 계산 모듈은 무거워서 부르는 쪽이 넘긴다).
 */
export function spaceFaces(data: SpaceData, view: View3, scale: number, cx: number, cy: number, fns: ReadonlyArray<(x: number, y: number) => number>): SpaceFace[] {
  const { R, toScreen, bounds } = projector(data, view, scale, cx, cy);
  type Q = { pts: Vec3[]; hue: number };
  type P = [number, number, number];
  const quads: Q[] = [];
  let piece = 0;
  const B = [bounds.x, bounds.y, bounds.z];
  /** 조각을 상자 [−B, B]³ 안으로 잘라낸다 (서덜랜드–호지먼, 면 6개) — 가장자리가 계단처럼 되지 않게 */
  const clip = (poly: P[]): P[] => {
    let out = poly;
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [1, -1]) {
        const lim = (B[axis] as number) * 1.0001;
        const inside = (p: P) => sign * p[axis]! <= lim;
        const next: P[] = [];
        for (let k = 0; k < out.length; k++) {
          const a = out[k] as P;
          const b = out[(k + 1) % out.length] as P;
          if (inside(a)) next.push(a);
          if (inside(a) !== inside(b)) {
            const t = (sign * lim - a[axis]!) / (b[axis]! - a[axis]!);
            next.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
          }
        }
        out = next;
        if (out.length < 3) return [];
      }
    return out;
  };
  /** (u, v) 격자 → 조각들. at이 null(계산 안 되는 곳)이면 그 칸은 비운다 */
  const grid = (nu: number, nv: number, at: (u: number, v: number) => P | null, clipped = true) => {
    const hue = HUES[piece++ % HUES.length] as number;
    const pts: Array<Array<P | null>> = [];
    for (let i = 0; i <= nu; i++) {
      const row: Array<P | null> = [];
      for (let j = 0; j <= nv; j++) {
        const p = at(i / nu, j / nv);
        row.push(p && Number.isFinite(p[0] + p[1] + p[2]) ? p : null);
      }
      pts.push(row);
    }
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const c = [pts[i]?.[j], pts[i + 1]?.[j], pts[i + 1]?.[j + 1], pts[i]?.[j + 1]];
        if (!c.every((p): p is P => !!p)) continue;
        const poly = clipped ? clip(c) : c;
        if (poly.length >= 3) quads.push({ pts: poly.map(R), hue });
      }
  };
  const lerp = (a: number, t: number) => -a + 2 * a * t;

  for (const f of fns) {
    grid(26, 26, (u, v) => {
      const x = lerp(bounds.x, u);
      const y = lerp(bounds.y, v);
      return [x, y, f(x, y)];
    });
  }
  for (const pl of data.planes ?? []) {
    // 계수가 가장 큰 변수로 푼다 (x = 2 같은 평면도 그려지게)
    const n = pl.normal;
    const i = [0, 1, 2].reduce((m, k) => (Math.abs(n[k]!) > Math.abs(n[m]!) ? k : m), 0);
    const [o0, o1] = [0, 1, 2].filter((k) => k !== i) as [number, number];
    grid(20, 20, (u, v) => {
      const p: P = [0, 0, 0];
      p[o0] = lerp(B[o0] as number, u);
      p[o1] = lerp(B[o1] as number, v);
      p[i] = (pl.d - n[o0]! * p[o0] - n[o1]! * p[o1]) / n[i]!;
      return p;
    });
  }
  for (const sh of data.shapes ?? []) {
    if (sh.t === "sphere") {
      grid(28, 14, (u, v) => {
        const th = u * 2 * Math.PI;
        const ph = v * Math.PI;
        return [sh.c[0] + sh.r * Math.sin(ph) * Math.cos(th), sh.c[1] + sh.r * Math.sin(ph) * Math.sin(th), sh.c[2] + sh.r * Math.cos(ph)];
      });
    } else if (sh.t === "cylinder") {
      const i = ["x", "y", "z"].indexOf(sh.axis);
      const [o0, o1] = [0, 1, 2].filter((k) => k !== i) as [number, number];
      grid(28, 6, (u, v) => {
        const th = u * 2 * Math.PI;
        const p: P = [...sh.c];
        p[o0] = sh.c[o0]! + sh.r * Math.cos(th);
        p[o1] = sh.c[o1]! + sh.r * Math.sin(th);
        p[i] = lerp(B[i] as number, v);
        return p;
      });
    }
  }

  // 잘린 조각은 3~8각형 — 깊이는 꼭짓점 평균, 법선은 뉴웰 방법
  const depth = (q: Q) => q.pts.reduce((s, p) => s + p[2], 0) / q.pts.length;
  const newell = (pts: Vec3[]): Vec3 => {
    const n: Vec3 = [0, 0, 0];
    pts.forEach((a, k) => {
      const b = pts[(k + 1) % pts.length] as Vec3;
      n[0] += (a[1] - b[1]) * (a[2] + b[2]);
      n[1] += (a[2] - b[2]) * (a[0] + b[0]);
      n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    });
    return n;
  };
  return quads
    .map((q) => ({ q, z: depth(q) }))
    .sort((a, b) => a.z - b.z)
    .map(({ q }) => {
      const n = newell(q.pts);
      const I = Math.abs(dot(n, LIGHT)) / (Math.hypot(...n) || 1);
      const L = Math.round(40 + 40 * I);
      const s = q.pts.map(toScreen);
      return {
        d: `M${s.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}Z`,
        fill: `hsl(${q.hue} 62% ${L}%)`,
        stroke: `hsl(${q.hue} 45% ${Math.max(22, L - 22)}%)`,
      };
    });
}

/** "A(2,3,4), B(-1, 2, 0)" 같은 입력 → 점 목록. 그 외 글자가 섞이면 null */
export function parsePoints(input: string): Array<{ label: string; at: [number, number, number] }> | null {
  const num = String.raw`-?\d+(?:\.\d+)?`;
  const one = new RegExp(String.raw`([A-Za-z]?)\s*\(\s*(${num})\s*,\s*(${num})\s*,\s*(${num})\s*\)`, "g");
  const rest = input.replace(one, "").replace(/[\s,;]/g, "");
  if (rest.length > 0) return null;
  const out = [...input.matchAll(one)].map((m) => ({
    label: m[1] ?? "",
    at: [Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number],
  }));
  return out.length > 0 ? out : null;
}
