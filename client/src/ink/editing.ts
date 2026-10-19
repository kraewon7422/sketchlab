import { distanceToPolyline } from "./geometry";
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
