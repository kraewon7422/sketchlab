import type { Shape2DData, Shape2DPrimitive } from "@sketchlab/shared";
import { primitivePolyline } from "../render/shape2dGeometry";
import { bboxOfPoints, distanceToPolyline } from "./geometry";
import type { BBox, CanvasItem, Point, Stroke } from "./types";

/**
 * 고르고·옮기고·복제하기 (노트 앱의 선택 편집) — 순수 함수. 스토어와 캔버스가 같이 쓴다.
 */

const moveBox = (b: BBox, dx: number, dy: number): BBox => ({ minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy });
const moveStroke = (s: Stroke, dx: number, dy: number): Stroke => ({
  ...s,
  points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  bbox: moveBox(s.bbox, dx, dy),
});

/** 항목 하나를 (dx, dy)만큼 — 잉크는 획 좌표, 객체는 놓인 자리와 원본 획까지 */
export function translateItem<T extends CanvasItem>(item: T, dx: number, dy: number): T {
  if (dx === 0 && dy === 0) return item;
  if (item.kind === "ink") {
    return { ...item, strokes: item.strokes.map((s) => moveStroke(s, dx, dy)), bbox: moveBox(item.bbox, dx, dy) };
  }
  return {
    ...item,
    transform: { ...item.transform, x: item.transform.x + dx, y: item.transform.y + dy },
    bbox: moveBox(item.bbox, dx, dy),
    sourceStrokes: item.sourceStrokes.map((s) => moveStroke(s, dx, dy)),
  };
}

/** 복제 — 새 id로 (획 id도 새로), 살짝 비켜서 */
export function cloneItem<T extends CanvasItem>(item: T, newId: (prefix: string) => string, dx: number, dy: number): T {
  const moved = translateItem(item, dx, dy);
  if (moved.kind === "ink") return { ...moved, id: newId("ink"), strokes: moved.strokes.map((s) => ({ ...s, id: newId("s") })) };
  return { ...moved, id: newId("obj"), sourceStrokes: moved.sourceStrokes.map((s) => ({ ...s, id: newId("s") })) };
}

/**
 * 크기 바꾸기 — (ox, oy)를 고정점으로 k배.
 *   손글씨: 점과 펜 굵기 · 그래프·구조식·입체·도형: transform.scale · 수식·글 상자: 글자 크기
 */
export function scaleItem<T extends CanvasItem>(item: T, k: number, ox: number, oy: number): T {
  if (k === 1) return item;
  const sx = (x: number) => ox + (x - ox) * k;
  const sy = (y: number) => oy + (y - oy) * k;
  const box = (b: BBox): BBox => ({ minX: sx(b.minX), minY: sy(b.minY), maxX: sx(b.maxX), maxY: sy(b.maxY) });
  const scaleStroke = (s: Stroke): Stroke => ({
    ...s,
    points: s.points.map((p) => ({ ...p, x: sx(p.x), y: sy(p.y) })),
    bbox: box(s.bbox),
    ...(s.width !== undefined || s.tool === "pen" ? { width: (s.width ?? 2.6) * k } : {}),
  });
  if (item.kind === "ink") return { ...item, strokes: item.strokes.map(scaleStroke), bbox: box(item.bbox) };

  const ir = item.ir;
  let nextIr = ir;
  let scale = item.transform.scale;
  if (ir.kind === "formula" || ir.kind === "chemEq") {
    // 크기를 바꿔도 모양(한 줄/가운데 정렬)이 바뀌지 않게 inline을 지금 값으로 고정해 둔다
    const inline = ir.data.inline ?? ir.data.fontSize !== undefined;
    nextIr = { ...ir, data: { ...ir.data, fontSize: Math.max(6, (ir.data.fontSize ?? 22) * k), inline } } as typeof ir;
  } else if (ir.kind === "text") {
    const html = ir.data.html?.replace(/font-size:\s*([\d.]+)px/g, (_, v: string) => `font-size:${Math.round(Number(v) * k * 10) / 10}px`);
    nextIr = {
      ...ir,
      data: {
        ...ir.data,
        fontSize: Math.max(6, (ir.data.fontSize ?? 20) * k),
        ...(ir.data.width ? { width: ir.data.width * k } : {}),
        ...(html !== undefined ? { html } : {}),
      },
    };
  } else {
    scale = item.transform.scale * k; // 그래프 폭·결합 길이·입체 크기·도형 배율
  }
  return {
    ...item,
    ir: nextIr,
    transform: { x: sx(item.transform.x), y: sy(item.transform.y), scale },
    bbox: box(item.bbox),
    sourceStrokes: item.sourceStrokes.map(scaleStroke),
  };
}

/**
 * 2D 아핀 변환 [a, b, c, d, e, f]: (x, y) → (a·x + c·y + e, b·x + d·y + f).
 * 돌리기·한쪽으로 늘이기(삼성노트의 선택 상자)에 쓴다.
 */
export type Affine = readonly [number, number, number, number, number, number];

export const affineApply = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** (cx, cy)를 중심으로 θ만큼 돌리기 */
export function rotationAbout(theta: number, cx: number, cy: number): Affine {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

/** (ax, ay)를 고정점으로 가로 sx·세로 sy배 */
export function scaleAbout(sx: number, sy: number, ax: number, ay: number): Affine {
  return [sx, 0, 0, sy, ax - sx * ax, ay - sy * ay];
}

/** 돌리고 늘일 수 있는 항목 — 손글씨와 정리한 도형(직선·포물선·원…). 그래프·수식·글은 모양이 일그러지므로 제외 */
export function canTransformFreely(item: CanvasItem): boolean {
  return item.kind === "ink" || (item.kind === "object" && item.ir.kind === "shape2d");
}

/**
 * 행렬 A(2×2)로 원 하나를 옮긴 모양 = 타원. A·Aᵀ의 고윳값·고유벡터가 반지름·방향이다.
 * (원을 한쪽으로 누르면 진짜 타원, 돌린 타원을 다시 누르면 새 축의 타원)
 */
function ellipseOf(a: number, b: number, c: number, d: number): { rx: number; ry: number; rot: number } {
  // A = [[a, c], [b, d]] (열벡터 기준), B = A·Aᵀ
  const p = a * a + c * c;
  const q = a * b + c * d;
  const r = b * b + d * d;
  const mid = (p + r) / 2;
  const rad = Math.sqrt(((p - r) / 2) ** 2 + q * q);
  return { rx: Math.sqrt(Math.max(0, mid + rad)), ry: Math.sqrt(Math.max(0, mid - rad)), rot: 0.5 * Math.atan2(2 * q, p - r) };
}

/** 정리한 도형을 아핀 변환 — 모든 도형이 정확한 도형으로 남는다 (그림으로 뭉개지지 않는다) */
function transformShape(data: Shape2DData, tf: { x: number; y: number; scale: number }, m: Affine): { data: Shape2DData; box: BBox } {
  const W = (v: readonly [number, number]): [number, number] => affineApply(m, tf.x + v[0] * tf.scale, tf.y + v[1] * tf.scale);
  const s = tf.scale;
  const prims: Shape2DPrimitive[] = data.primitives.map((p): Shape2DPrimitive => {
    switch (p.t) {
      case "line":
      case "arrow":
        return { ...p, a: W(p.a), b: W(p.b) };
      case "polygon":
      case "curve":
        return { ...p, pts: p.pts.map(W) };
      case "parabola":
        return { ...p, p0: W(p.p0), c: W(p.c), p1: W(p.p1) };
      case "circle": {
        const e = ellipseOf(m[0] * p.r * s, m[1] * p.r * s, m[2] * p.r * s, m[3] * p.r * s);
        return Math.abs(e.rx - e.ry) < 0.5 ? { t: "circle", c: W(p.c), r: e.rx } : { t: "ellipse", c: W(p.c), rx: e.rx, ry: e.ry, rot: e.rot };
      }
      case "ellipse": {
        // A = M₂ · R(rot) · diag(rx, ry)
        const cr = Math.cos(p.rot);
        const sr = Math.sin(p.rot);
        const u = [cr * p.rx * s, sr * p.rx * s];
        const w = [-sr * p.ry * s, cr * p.ry * s];
        const e = ellipseOf(m[0] * (u[0] as number) + m[2] * (u[1] as number), m[1] * (u[0] as number) + m[3] * (u[1] as number), m[0] * (w[0] as number) + m[2] * (w[1] as number), m[1] * (w[0] as number) + m[3] * (w[1] as number));
        return { t: "ellipse", c: W(p.c), rx: Math.max(0.5, e.rx), ry: Math.max(0.5, e.ry), rot: e.rot };
      }
      case "arc": {
        // 호는 점 24개로 바꿔 매끈한 곡선으로 (한쪽으로 누르면 원호가 아니게 되므로)
        const pts: [number, number][] = Array.from({ length: 25 }, (_, i) => {
          const a = p.from + ((p.to - p.from) * i) / 24;
          return W([p.c[0] + p.r * Math.cos(a), p.c[1] + p.r * Math.sin(a)]);
        });
        return { t: "curve", pts, closed: false };
      }
    }
  });
  const marks = data.marks
    ?.map((mk) => {
      if (!mk.dirs) return { ...mk, at: W(mk.at) };
      const dir = (v: readonly [number, number]): [number, number] => {
        const x = m[0] * v[0] + m[2] * v[1];
        const y = m[1] * v[0] + m[3] * v[1];
        const L = Math.hypot(x, y) || 1;
        return [x / L, y / L];
      };
      const d1 = dir(mk.dirs[0]);
      const d2 = dir(mk.dirs[1]);
      // 한쪽으로 눌러 더는 직각이 아니면 직각 표시를 뗀다
      if (Math.abs(d1[0] * d2[0] + d1[1] * d2[1]) > 0.05) return null;
      return { ...mk, at: W(mk.at), dirs: [d1, d2] as [[number, number], [number, number]] };
    })
    .filter((mk): mk is NonNullable<typeof mk> => mk !== null);
  const labels = data.labels?.map((l) => ({ ...l, at: W(l.at) }));
  // 새 원점(왼쪽 위)과 로컬 좌표
  const unit = { x: 0, y: 0, scale: 1 };
  const all = prims.flatMap((p) => primitivePolyline(p, unit));
  const xs = [...all.map((q) => q.x), ...(labels ?? []).map((l) => l.at[0])];
  const ys = [...all.map((q) => q.y), ...(labels ?? []).map((l) => l.at[1])];
  const box: BBox = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  const L = (v: readonly [number, number]): [number, number] => [v[0] - box.minX, v[1] - box.minY];
  const local = prims.map((p): Shape2DPrimitive => {
    switch (p.t) {
      case "line":
      case "arrow":
        return { ...p, a: L(p.a), b: L(p.b) };
      case "polygon":
      case "curve":
        return { ...p, pts: p.pts.map(L) };
      case "parabola":
        return { ...p, p0: L(p.p0), c: L(p.c), p1: L(p.p1) };
      case "circle":
      case "ellipse":
      case "arc":
        return { ...p, c: L(p.c) };
    }
  });
  return {
    data: {
      ...data,
      primitives: local,
      ...(marks ? { marks: marks.map((mk) => ({ ...mk, at: L(mk.at) })) } : {}),
      ...(labels ? { labels: labels.map((l) => ({ ...l, at: L(l.at) })) } : {}),
    },
    box,
  };
}

/** 돌리기·늘이기 — 손글씨(점·굵기)와 정리한 도형만. 다른 항목은 그대로 */
export function transformItem<T extends CanvasItem>(item: T, m: Affine): T {
  const widthK = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const strokeT = (st: Stroke): Stroke => {
    const points = st.points.map((p) => {
      const [x, y] = affineApply(m, p.x, p.y);
      return { ...p, x, y };
    });
    return { ...st, points, bbox: bboxOfPoints(points), ...(st.width !== undefined || st.tool === "pen" ? { width: (st.width ?? 2.6) * widthK } : {}) };
  };
  if (item.kind === "ink") {
    const strokes = item.strokes.map(strokeT);
    const boxes = strokes.map((st) => st.bbox);
    return { ...item, strokes, bbox: { minX: Math.min(...boxes.map((b) => b.minX)), minY: Math.min(...boxes.map((b) => b.minY)), maxX: Math.max(...boxes.map((b) => b.maxX)), maxY: Math.max(...boxes.map((b) => b.maxY)) } };
  }
  if (item.kind === "object" && item.ir.kind === "shape2d") {
    const { data, box } = transformShape(item.ir.data, item.transform, m);
    return { ...item, ir: { ...item.ir, data }, transform: { x: box.minX, y: box.minY, scale: 1 }, bbox: box, sourceStrokes: item.sourceStrokes.map(strokeT) };
  }
  return item;
}

/** 다시 칠하기에 쓸 수 있는 항목인가 (손글씨·정리한 도형·글 상자) */
export function canRecolor(item: CanvasItem): boolean {
  return item.kind === "ink" || (item.kind === "object" && (item.ir.kind === "shape2d" || item.ir.kind === "text"));
}

/**
 * 다시 칠하기 — 색과(손글씨면) 굵기를 바꾼다. 바꿀 수 없는 항목은 그대로.
 * 형광펜 자국은 색만 바꾸고 굵기는 그대로 둔다 (펜 굵기를 형광펜에 주면 가늘어진다).
 */
export function recolorItem<T extends CanvasItem>(item: T, color: string | undefined, width: number | undefined): T {
  if (item.kind === "ink") {
    return {
      ...item,
      strokes: item.strokes.map((s) => ({
        ...s,
        ...(color ? { color } : {}),
        ...(width !== undefined && s.tool !== "highlighter" ? { width } : {}),
      })),
    };
  }
  if (item.kind === "object" && color && (item.ir.kind === "shape2d" || item.ir.kind === "text")) {
    return { ...item, ir: { ...item.ir, data: { ...item.ir.data, color } } } as T;
  }
  return item;
}

/** 점이 다각형(올가미) 안에 있는가 — 짝수-홀수 규칙 */
export function pointInPolygon(x: number, y: number, poly: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as { x: number; y: number };
    const b = poly[j] as { x: number; y: number };
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * 올가미 안의 항목들.
 *   잉크 묶음: 점의 절반 이상이 올가미 안 (글자를 대충 둘러도 잡힌다)
 *   객체:     상자 중심이 올가미 안
 */
export function itemsInLasso(items: readonly CanvasItem[], poly: readonly Point[]): string[] {
  if (poly.length < 3) return [];
  return items
    .filter((item) => {
      if (item.locked) return false; // 잠근 것은 올가미에 안 잡힌다 (톡 쳐서 골라 풀기)
      if (item.kind === "object") {
        const b = item.bbox;
        return pointInPolygon((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, poly);
      }
      const pts = item.strokes.flatMap((s) => s.points);
      if (pts.length === 0) return false;
      // 긴 획은 점이 많으니 고르게 솎아 센다
      const step = Math.max(1, Math.floor(pts.length / 200));
      let inside = 0;
      let total = 0;
      for (let i = 0; i < pts.length; i += step) {
        const p = pts[i] as Point;
        total += 1;
        if (pointInPolygon(p.x, p.y, poly)) inside += 1;
      }
      return inside / total >= 0.5;
    })
    .map((i) => i.id);
}

/**
 * 톡 친 자리의 항목 (위에 있는 것부터).
 *   객체: 상자 안 (+여유)
 *   잉크: 획에서 slop 이내 — 글씨 사이 빈 곳을 눌러도 그 묶음이 잡히면 안 된다
 */
export function hitItem(items: readonly CanvasItem[], x: number, y: number, slop: number): CanvasItem | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as CanvasItem;
    const b = item.bbox;
    if (x < b.minX - slop || x > b.maxX + slop || y < b.minY - slop || y > b.maxY + slop) continue;
    if (item.kind === "object") return item;
    for (const s of item.strokes) {
      if (distanceToPolyline(x, y, s.points) <= slop + (s.width ?? 2.6)) return item;
    }
  }
  return undefined;
}

/** 여러 항목을 감싸는 상자 */
export function selectionBox(items: readonly CanvasItem[], ids: readonly string[]): BBox | null {
  const chosen = items.filter((i) => ids.includes(i.id));
  if (chosen.length === 0) return null;
  return chosen.reduce<BBox>(
    (acc, i) => ({ minX: Math.min(acc.minX, i.bbox.minX), minY: Math.min(acc.minY, i.bbox.minY), maxX: Math.max(acc.maxX, i.bbox.maxX), maxY: Math.max(acc.maxY, i.bbox.maxY) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}
