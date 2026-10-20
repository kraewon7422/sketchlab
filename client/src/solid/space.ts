import type { SceneDataOf } from "@sketchlab/shared";
import type { Vec3 } from "./mesh";
import { rotate, type P2, type View3 } from "./project";

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
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace("-", "−");

export function drawSpace(data: SpaceData, view: View3, scale: number, cx: number, cy: number): SpaceDrawing {
  const range = data.view.range;
  // 축마다 범위가 다르면 그 축만 늘이고 줄인다 (그림 크기는 range 기준 그대로, 눈금 글자는 실제 값)
  const ax = data.view.axes;
  const k = ax ? [range / ax.x, range / ax.y, range / ax.z] : [1, 1, 1];
  const S = (p: readonly [number, number, number]): P2 => {
    const r = rotate(toRender([p[0] * (k[0] as number), p[1] * (k[1] as number), p[2] * (k[2] as number)]), view);
    return [cx + r[0] * scale, cy - r[1] * scale];
  };
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
  for (const v of data.vectors ?? []) solid.push([S(v.from), S(v.to)]);
  for (const s of data.segments ?? []) solid.push([S(s.a), S(s.b)]);

  return { axes, dashed, solid, points, ticks, origin: S([0, 0, 0]) };
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
