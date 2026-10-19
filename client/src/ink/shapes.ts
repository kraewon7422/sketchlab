import type { Shape2DData } from "@sketchlab/shared";

/**
 * 도형 도구 (제안 #3) — 끌어서 정확한 도형을 바로 그린다 (손으로 그리고 정리하는 대신).
 * 결과는 인식된 도형과 같은 IR(shape2d)이라 고르기·옮기기·크기·색·내보내기가 모두 그대로 된다.
 *
 * 좌표: 시작점 a, 끝점 b (월드). 반환 primitives는 왼쪽 위 (ox, oy)를 원점으로 한 로컬 좌표.
 */
export type ShapeKind = "line" | "arrow" | "rect" | "ellipse" | "triangle" | "axes";

export const SHAPE_KINDS: Array<[ShapeKind, string]> = [
  ["line", "직선"],
  ["arrow", "화살표"],
  ["rect", "사각형"],
  ["ellipse", "원·타원"],
  ["triangle", "삼각형"],
  ["axes", "좌표축"],
];

type V = [number, number];

export interface BuiltShape {
  data: Shape2DData;
  ox: number;
  oy: number;
  width: number;
  height: number;
}

/**
 * square: 정사각형·정원·45° 직선으로 맞춘다 (펜 버튼이나 Shift를 누른 채)
 * 너무 작으면(손 떨림) null.
 */
export function buildShape(kind: ShapeKind, a: { x: number; y: number }, bRaw: { x: number; y: number }, square = false): BuiltShape | null {
  let b = bRaw;
  if (square) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (kind === "line" || kind === "arrow") {
      // 0°·45°·90° 중 가까운 방향으로
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      b = { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
    } else {
      const s = Math.max(Math.abs(dx), Math.abs(dy));
      b = { x: a.x + Math.sign(dx || 1) * s, y: a.y + Math.sign(dy || 1) * s };
    }
  }
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  if (Math.hypot(w, h) < 8) return null;
  const L = (p: { x: number; y: number }): V => [p.x - minX, p.y - minY];

  let data: Shape2DData;
  switch (kind) {
    case "line":
      data = { primitives: [{ t: "line", a: L(a), b: L(b) }] };
      break;
    case "arrow":
      data = { primitives: [{ t: "arrow", a: L(a), b: L(b) }] };
      break;
    case "rect":
      data = { primitives: [{ t: "polygon", pts: [[0, 0], [w, 0], [w, h], [0, h]], closed: true }] };
      break;
    case "ellipse":
      if (w < 2 || h < 2) return null;
      data = {
        primitives: [Math.abs(w - h) < 1 ? { t: "circle", c: [w / 2, h / 2], r: w / 2 } : { t: "ellipse", c: [w / 2, h / 2], rx: w / 2, ry: h / 2, rot: 0 }],
      };
      break;
    case "triangle":
      data = { primitives: [{ t: "polygon", pts: [[w / 2, 0], [w, h], [0, h]], closed: true }] };
      break;
    case "axes": {
      // 끈 상자 가운데에 원점, 양 끝 화살표, 축 이름 x·y와 원점 O
      const cx = w / 2;
      const cy = h / 2;
      data = {
        primitives: [
          { t: "arrow", a: [0, cy], b: [w, cy] },
          { t: "arrow", a: [cx, h], b: [cx, 0] },
        ],
        labels: [
          { text: "x", at: [w - 4, cy + 18] },
          { text: "y", at: [cx + 16, 16] },
          { text: "O", at: [cx - 14, cy + 16] },
        ],
      };
      break;
    }
  }
  return { data, ox: minX, oy: minY, width: w, height: h };
}
