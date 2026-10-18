import type { SolidKind } from "@sketchlab/shared";

/**
 * 입체 카탈로그 → 다면체 메시 (마스터스펙 v4 §12, 카탈로그 매칭 원칙).
 *
 * 곡면(원기둥 옆면, 구 등)은 잘게 쪼갠 면들의 "매끈한 묶음(smooth group)"으로 표현한다.
 * 같은 묶음 안의 면 사이 모서리는 진짜 모서리가 아니라서 그리지 않고, 앞뒤가 바뀌는
 * 곳(윤곽선 = 실루엣)만 그린다. 다른 묶음/평면 사이 모서리(원기둥 테두리 등)는 진짜 모서리.
 * 이 한 가지 규칙으로 각기둥·원기둥·구 모두 교과서 선화가 나온다 (project.ts).
 *
 * 좌표: y 위쪽, 원점 = 입체 중심. 면 꼭짓점은 바깥에서 볼 때 반시계 방향.
 */

export type Vec3 = [number, number, number];

export interface Face {
  v: number[];
  /** -1 = 평면(모든 테두리가 진짜 모서리), 그 외 = 같은 곡면 묶음 */
  smooth: number;
}

export interface Decoration {
  /** 교과서에만 있는 보조선 (구의 적도) — 점마다 바깥 법선으로 앞/뒤를 판정해 실선/점선 */
  points: Vec3[];
  normals: Vec3[];
  closed: boolean;
}

export interface Mesh {
  vertices: Vec3[];
  faces: Face[];
  decorations: Decoration[];
}

const TAU = Math.PI * 2;

function ring(n: number, r: number, y: number, phase = 0): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * TAU;
    return [r * Math.cos(a), y, -r * Math.sin(a)] as Vec3;
  });
}

/** 위·아래 다각형을 옆면으로 잇는 "기둥류" (각기둥·각뿔대·원기둥·원뿔대). r2 = 0이면 뿔. */
function loft(n: number, r1: number, r2: number, h: number, smooth: boolean, phase = 0): Mesh {
  const bottom = ring(n, r1, -h / 2, phase);
  const apex = r2 === 0;
  const top = apex ? [[0, h / 2, 0] as Vec3] : ring(n, r2, h / 2, phase);
  const vertices = [...bottom, ...top];
  const faces: Face[] = [];
  const sg = smooth ? 1 : -1;
  // 아랫면 (바깥=아래에서 보면 반시계 → 위에서 보면 시계)
  faces.push({ v: Array.from({ length: n }, (_, i) => n - 1 - i), smooth: -1 });
  if (apex) {
    for (let i = 0; i < n; i++) faces.push({ v: [i, (i + 1) % n, n], smooth: sg });
  } else {
    faces.push({ v: Array.from({ length: n }, (_, i) => n + i), smooth: -1 });
    for (let i = 0; i < n; i++) faces.push({ v: [i, (i + 1) % n, n + ((i + 1) % n), n + i], smooth: sg });
  }
  return { vertices, faces, decorations: [] };
}

function boxMesh(w: number, h: number, d: number): Mesh {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  const vertices: Vec3[] = [
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z],
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
  ];
  const faces: Face[] = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ].map((v) => ({ v, smooth: -1 }));
  return { vertices, faces, decorations: [] };
}

function sphereMesh(r: number, hemisphere: boolean): Mesh {
  const seg = 64;
  const rings = hemisphere ? 16 : 32;
  const vertices: Vec3[] = [[0, r, 0]];
  const latEnd = hemisphere ? Math.PI / 2 : Math.PI;
  for (let j = 1; j <= rings; j++) {
    const lat = (j / rings) * latEnd;
    if (!hemisphere && j === rings) break;
    for (let i = 0; i < seg; i++) {
      const lon = (i / seg) * TAU;
      vertices.push([r * Math.sin(lat) * Math.cos(lon), r * Math.cos(lat), -r * Math.sin(lat) * Math.sin(lon)]);
    }
  }
  const faces: Face[] = [];
  const idx = (j: number, i: number) => 1 + (j - 1) * seg + (i % seg);
  for (let i = 0; i < seg; i++) faces.push({ v: [0, idx(1, i), idx(1, i + 1)], smooth: 1 });
  const lastRing = hemisphere ? rings : rings - 1;
  for (let j = 1; j < lastRing; j++) {
    for (let i = 0; i < seg; i++) faces.push({ v: [idx(j, i), idx(j + 1, i), idx(j + 1, i + 1), idx(j, i + 1)], smooth: 1 });
  }
  if (hemisphere) {
    faces.push({ v: Array.from({ length: seg }, (_, i) => idx(lastRing, seg - 1 - i)), smooth: -1 });
  } else {
    const south = vertices.length;
    vertices.push([0, -r, 0]);
    for (let i = 0; i < seg; i++) faces.push({ v: [idx(lastRing, i), south, idx(lastRing, i + 1)], smooth: 1 });
  }
  // 적도(반구는 밑면 테두리가 이미 있으므로 생략) — 교과서 구 그림의 보조선
  const decorations: Decoration[] = hemisphere
    ? []
    : [
        {
          points: Array.from({ length: 128 }, (_, i) => [r * Math.cos((i / 128) * TAU), 0, -r * Math.sin((i / 128) * TAU)] as Vec3),
          normals: Array.from({ length: 128 }, (_, i) => [Math.cos((i / 128) * TAU), 0, -Math.sin((i / 128) * TAU)] as Vec3),
          closed: true,
        },
      ];
  return { vertices, faces, decorations };
}

/** 정다면체 — 꼭짓점 좌표 + 볼록 껍질 면(평면) */
function platonic(kind: "tetrahedron" | "octahedron" | "dodecahedron" | "icosahedron", size: number): Mesh {
  const phi = (1 + Math.sqrt(5)) / 2;
  let vs: Vec3[];
  switch (kind) {
    case "tetrahedron":
      vs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
      break;
    case "octahedron":
      vs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      break;
    case "icosahedron":
      vs = [];
      for (const a of [-1, 1]) for (const b of [-phi, phi]) vs.push([0, a, b], [a, b, 0], [b, 0, a]);
      break;
    case "dodecahedron":
      vs = [];
      for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) vs.push([a, b, c]);
      for (const a of [-1, 1]) for (const b of [-1, 1]) vs.push([0, a / phi, b * phi], [a / phi, b * phi, 0], [b * phi, 0, a / phi]);
      break;
  }
  const scale = size / Math.max(...vs.map((v) => Math.hypot(...v)));
  const vertices = vs.map((v) => v.map((c) => c * scale) as Vec3);
  return { vertices, faces: convexHullFaces(vertices), decorations: [] };
}

/**
 * 볼록 다면체의 면 찾기 (정다면체용, 꼭짓점 ≤ 20이라 단순 전수 탐색으로 충분).
 * 세 점이 정하는 평면에 대해 모든 점이 한쪽에 있으면 그 평면 위의 점들이 한 면.
 */
function convexHullFaces(vs: readonly Vec3[]): Face[] {
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const seen = new Set<string>();
  const faces: Face[] = [];
  const n = vs.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const a = vs[i] as Vec3;
        let nrm = cross(sub(vs[j] as Vec3, a), sub(vs[k] as Vec3, a));
        const len = Math.hypot(...nrm);
        if (len < 1e-9) continue;
        nrm = nrm.map((c) => c / len) as Vec3;
        const d = dot(nrm, a);
        let pos = 0;
        let neg = 0;
        const on: number[] = [];
        vs.forEach((p, idx) => {
          const s = dot(nrm, p) - d;
          if (s > 1e-6) pos++;
          else if (s < -1e-6) neg++;
          else on.push(idx);
        });
        if (pos > 0 && neg > 0) continue;
        if (pos > 0) nrm = nrm.map((c) => -c) as Vec3; // 바깥을 향하게
        const key = [...on].sort((p, q) => p - q).join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        // 면 위 점들을 법선 기준 반시계로 정렬
        const c = on.reduce<Vec3>((acc, idx) => [acc[0] + (vs[idx] as Vec3)[0], acc[1] + (vs[idx] as Vec3)[1], acc[2] + (vs[idx] as Vec3)[2]], [0, 0, 0]).map((x) => x / on.length) as Vec3;
        const u = sub(vs[on[0] as number] as Vec3, c);
        const w = cross(nrm, u);
        on.sort((p, q) => {
          const dp = sub(vs[p] as Vec3, c);
          const dq = sub(vs[q] as Vec3, c);
          return Math.atan2(dot(dp, w), dot(dp, u)) - Math.atan2(dot(dq, w), dot(dq, u));
        });
        faces.push({ v: on, smooth: -1 });
      }
  return faces;
}

/** IR의 solid + params → 메시. 치수 기본값은 교과서 그림 비율. */
export function solidMesh(kind: SolidKind, params: Record<string, number> = {}): Mesh {
  const p = (name: string, fallback: number) => {
    const v = params[name];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
  };
  const n = Math.round(Math.min(12, Math.max(3, p("n", 4))));
  switch (kind) {
    case "cube":
      return boxMesh(p("size", 2), p("size", 2), p("size", 2));
    case "box":
      return boxMesh(p("w", 3), p("h", 2), p("d", 1.6));
    case "prism":
      return loft(Math.round(Math.min(12, Math.max(3, p("n", 3)))), p("r", 1.3), p("r", 1.3), p("h", 2.4), false, Math.PI / 2);
    case "pyramid":
      return loft(n, p("r", 1.5), 0, p("h", 2.4), false, n === 4 ? Math.PI / 4 : Math.PI / 2);
    case "frustum":
      return loft(n, p("r", 1.5), p("r2", 0.8), p("h", 2), false, n === 4 ? Math.PI / 4 : Math.PI / 2);
    case "cylinder":
      return loft(96, p("r", 1.2), p("r", 1.2), p("h", 2.6), true);
    case "cone":
      return loft(96, p("r", 1.3), 0, p("h", 2.6), true);
    case "conicalFrustum":
      return loft(96, p("r", 1.4), p("r2", 0.8), p("h", 2), true);
    case "sphere":
      return sphereMesh(p("r", 1.5), false);
    case "hemisphere":
      return sphereMesh(p("r", 1.5), true);
    case "tetrahedron":
    case "octahedron":
    case "dodecahedron":
    case "icosahedron":
      return platonic(kind, p("size", 1.6));
  }
}

/** 화면 표시용 이름 */
export const SOLID_NAMES: Record<SolidKind, string> = {
  cube: "정육면체",
  box: "직육면체",
  tetrahedron: "정사면체",
  octahedron: "정팔면체",
  dodecahedron: "정십이면체",
  icosahedron: "정이십면체",
  prism: "삼각기둥",
  pyramid: "사각뿔",
  frustum: "사각뿔대",
  cylinder: "원기둥",
  cone: "원뿔",
  conicalFrustum: "원뿔대",
  sphere: "구",
  hemisphere: "반구",
};
