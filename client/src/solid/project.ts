import type { Mesh, Vec3 } from "./mesh";

/**
 * 입체 → 교과서 선화 (평행 투영 + 정확한 숨은선) — 마스터스펙 v4 §12.2·§12.6.
 *
 *   면이 보는 사람 쪽을 향하는가 = 회전된 법선의 z > 0  (볼록 입체에서는 이게 곧 가시성)
 *   진짜 모서리: 붙은 면 중 하나라도 앞을 보면 실선, 둘 다 뒤면 점선(숨은선)
 *   곡면 안의 가짜 모서리: 붙은 두 면의 앞뒤가 다를 때만 = 윤곽선(실루엣) → 실선
 *
 * three.js·WebGL 없이 벡터 선만 나온다 → 화면에서 선명하고, 회전할 때 매 프레임 다시 계산해도
 * 모서리 수백 개 수준이라 가볍고, 그대로 SVG로 내보낼 수 있다.
 */

export interface View3 {
  /** y축 회전 (라디안) */
  yaw: number;
  /** 위에서 내려다보는 정도 (라디안, + = 위에서) */
  pitch: number;
}

export type P2 = [number, number];

export interface LineDrawing {
  visible: P2[][];
  hidden: P2[][];
  /** 테스트·디버그용: 분류된 모서리 수 */
  stats: { visibleEdges: number; hiddenEdges: number; silhouetteEdges: number };
}

interface EdgeInfo {
  a: number;
  b: number;
  faces: number[];
}

const edgeCache = new WeakMap<Mesh, EdgeInfo[]>();

function edgesOf(mesh: Mesh): EdgeInfo[] {
  const cached = edgeCache.get(mesh);
  if (cached) return cached;
  const map = new Map<string, EdgeInfo>();
  mesh.faces.forEach((f, fi) => {
    for (let i = 0; i < f.v.length; i++) {
      const p = f.v[i] as number;
      const q = f.v[(i + 1) % f.v.length] as number;
      const a = Math.min(p, q);
      const b = Math.max(p, q);
      const key = `${a}|${b}`;
      const e = map.get(key) ?? { a, b, faces: [] };
      e.faces.push(fi);
      map.set(key, e);
    }
  });
  const list = [...map.values()];
  edgeCache.set(mesh, list);
  return list;
}

export function rotate(p: Vec3, view: View3): Vec3 {
  const cy = Math.cos(view.yaw);
  const sy = Math.sin(view.yaw);
  const x1 = p[0] * cy + p[2] * sy;
  const z1 = -p[0] * sy + p[2] * cy;
  const cp = Math.cos(view.pitch);
  const sp = Math.sin(view.pitch);
  return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp];
}

/** Newell 법선 — 다각형이 살짝 비평면이어도 안정적 */
function normalZ(face: readonly number[], rv: readonly Vec3[]): number {
  let nz = 0;
  for (let i = 0; i < face.length; i++) {
    const p = rv[face[i] as number] as Vec3;
    const q = rv[face[(i + 1) % face.length] as number] as Vec3;
    nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  return nz;
}

/** 같은 스타일의 선분들을 이어 긴 꺾은선으로 — 점선 무늬가 조각마다 다시 시작하지 않게 */
function chain(segments: Array<[number, number]>): number[][] {
  const adj = new Map<number, number[]>();
  segments.forEach(([a, b], i) => {
    adj.set(a, [...(adj.get(a) ?? []), i]);
    adj.set(b, [...(adj.get(b) ?? []), i]);
  });
  const used = new Uint8Array(segments.length);
  const lines: number[][] = [];
  const walk = (line: number[], atEnd: boolean) => {
    for (;;) {
      const tip = atEnd ? (line[line.length - 1] as number) : (line[0] as number);
      const next = (adj.get(tip) ?? []).find((i) => !used[i]);
      if (next === undefined) return;
      used[next] = 1;
      const [a, b] = segments[next] as [number, number];
      const other = a === tip ? b : a;
      if (atEnd) line.push(other);
      else line.unshift(other);
    }
  };
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [...(segments[i] as [number, number])];
    walk(line, true);
    walk(line, false);
    lines.push(line);
  }
  return lines;
}

export function drawSolid(mesh: Mesh, view: View3, scale: number, cx: number, cy: number): LineDrawing {
  const rv = mesh.vertices.map((p) => rotate(p, view));
  const front = mesh.faces.map((f) => normalZ(f.v, rv) > 1e-9);
  const vis: Array<[number, number]> = [];
  const hid: Array<[number, number]> = [];
  let silhouettes = 0;

  for (const e of edgesOf(mesh)) {
    const [f1, f2] = e.faces;
    const face1 = mesh.faces[f1 as number];
    const face2 = f2 === undefined ? undefined : mesh.faces[f2];
    const smooth = face1 && face2 && face1.smooth >= 0 && face1.smooth === face2.smooth;
    const fr1 = front[f1 as number] ?? false;
    const fr2 = f2 === undefined ? fr1 : (front[f2] ?? false);
    if (smooth) {
      if (fr1 !== fr2) {
        vis.push([e.a, e.b]);
        silhouettes++;
      }
    } else if (fr1 || fr2) {
      vis.push([e.a, e.b]);
    } else {
      hid.push([e.a, e.b]);
    }
  }

  const toScreen = (p: Vec3): P2 => [cx + p[0] * scale, cy - p[1] * scale];
  const out: LineDrawing = {
    visible: chain(vis).map((l) => l.map((i) => toScreen(rv[i] as Vec3))),
    hidden: chain(hid).map((l) => l.map((i) => toScreen(rv[i] as Vec3))),
    stats: { visibleEdges: vis.length, hiddenEdges: hid.length, silhouetteEdges: silhouettes },
  };

  // 보조선(구의 적도): 점마다 법선의 앞뒤로 실선/점선 구간을 나눈다
  for (const deco of mesh.decorations) {
    const pts = deco.points.map((p) => toScreen(rotate(p, view)));
    const fr = deco.normals.map((nrm) => rotate(nrm, view)[2] > 0);
    const n = pts.length;
    const total = deco.closed ? n : n - 1;
    let run: P2[] = [];
    let style: boolean | null = null;
    const flush = () => {
      if (run.length >= 2 && style !== null) (style ? out.visible : out.hidden).push(run);
    };
    for (let i = 0; i <= total; i++) {
      const k = i % n;
      const s = fr[k] as boolean;
      if (style !== null && s !== style) {
        run.push(pts[k] as P2);
        flush();
        run = [pts[k] as P2];
      } else {
        run.push(pts[k] as P2);
      }
      style = s;
    }
    flush();
  }
  return out;
}

/** 입체가 상자에 들어오게 하는 배율 (회전해도 넘치지 않게 외접구 기준) */
export function fitScale(mesh: Mesh, box: number): number {
  const r = Math.max(...mesh.vertices.map((p) => Math.hypot(...p)));
  return (box * 0.42) / (r || 1);
}
