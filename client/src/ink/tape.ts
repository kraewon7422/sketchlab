import type { SceneDataOf } from "@sketchlab/shared";
import { distanceToPolyline } from "./geometry";
import type { BBox, Point } from "./types";

/**
 * 마스킹 테이프 기하 (순수 함수) — 캔버스(끌어 붙이기·톡 판정)와 렌더러가 같이 쓴다.
 * 곧은 테이프: 원점(한쪽 끝의 가운데)에서 angle 방향으로 len, 폭 width 인 직사각형 (× transform.scale).
 * 자유 테이프: pts(중심선)를 따라 폭 width인 띠 — 펜처럼 자유롭게 긋는다 (삼성노트 기본).
 */
export type TapeData = SceneDataOf<"tape">;
type P2 = { x: number; y: number };
interface Tf {
  x: number;
  y: number;
  scale: number;
}

/** 이보다 짧게 끌면 붙이지 않는다 (톡 = 테이프 벗기기·붙이기) */
export const TAPE_MIN_LEN = 14;
/** 가로·세로에 이만큼(라디안) 가까우면 반듯하게 붙인다 — 진짜 테이프처럼 대충 붙여도 반듯 */
const SNAP = (6 * Math.PI) / 180;

export function tapeCorners(d: Pick<TapeData, "len" | "width" | "angle">, tf: Tf): P2[] {
  const L = d.len * tf.scale;
  const h = (d.width * tf.scale) / 2;
  const ux = Math.cos(d.angle);
  const uy = Math.sin(d.angle);
  // 길이 방향 u, 폭 방향 n = u를 90° 돌린 것
  const nx = -uy;
  const ny = ux;
  return [
    { x: tf.x + nx * h, y: tf.y + ny * h },
    { x: tf.x + ux * L + nx * h, y: tf.y + uy * L + ny * h },
    { x: tf.x + ux * L - nx * h, y: tf.y + uy * L - ny * h },
    { x: tf.x - nx * h, y: tf.y - ny * h },
  ];
}

type TapeGeom = Pick<TapeData, "len" | "width" | "angle"> & { pts?: TapeData["pts"] | undefined };

/** 자유 테이프 중심선 (월드 좌표) */
export function tapePath(d: TapeGeom, tf: Tf): P2[] | null {
  return d.pts ? d.pts.map(([x, y]) => ({ x: tf.x + x * tf.scale, y: tf.y + y * tf.scale })) : null;
}

export function tapeBox(d: TapeGeom, tf: Tf): BBox {
  const path = tapePath(d, tf);
  if (path) {
    const h = (d.width * tf.scale) / 2;
    return {
      minX: Math.min(...path.map((p) => p.x)) - h,
      minY: Math.min(...path.map((p) => p.y)) - h,
      maxX: Math.max(...path.map((p) => p.x)) + h,
      maxY: Math.max(...path.map((p) => p.y)) + h,
    };
  }
  const c = tapeCorners(d, tf);
  return {
    minX: Math.min(...c.map((p) => p.x)),
    minY: Math.min(...c.map((p) => p.y)),
    maxX: Math.max(...c.map((p) => p.x)),
    maxY: Math.max(...c.map((p) => p.y)),
  };
}

/** 점이 테이프 위인가 (slop만큼 여유) — 비스듬한 테이프는 상자보다 훨씬 좁다 */
export function onTape(d: TapeGeom, tf: Tf, x: number, y: number, slop = 0): boolean {
  const path = tapePath(d, tf);
  if (path) return distanceToPolyline(x, y, path.map((p) => ({ ...p, p: 0.5, t: 0 }))) <= (d.width * tf.scale) / 2 + slop;
  const ux = Math.cos(d.angle);
  const uy = Math.sin(d.angle);
  const along = (x - tf.x) * ux + (y - tf.y) * uy;
  const across = -(x - tf.x) * uy + (y - tf.y) * ux;
  return along >= -slop && along <= d.len * tf.scale + slop && Math.abs(across) <= (d.width * tf.scale) / 2 + slop;
}

/** 테이프 무늬 */
export type TapePattern = NonNullable<TapeData["pattern"]>;
export const TAPE_PATTERNS: Array<[TapePattern, string]> = [
  ["plain", "무늬 없음"],
  ["stripes", "사선"],
  ["dots", "물방울"],
  ["grid", "격자"],
];

/** a에서 b로 끌어 붙인 테이프. 너무 짧으면 null */
export function buildTape(a: P2, b: P2, width: number, color: string, pattern: TapePattern = "stripes"): { data: TapeData; transform: Tf; bbox: BBox } | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < TAPE_MIN_LEN) return null;
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  const quarter = Math.PI / 2;
  const nearest = Math.round(angle / quarter) * quarter;
  if (Math.abs(angle - nearest) < SNAP) angle = nearest;
  const data: TapeData = { len, width, angle, color, pattern, revealed: false };
  const transform = { x: a.x, y: a.y, scale: 1 };
  return { data, transform, bbox: tapeBox(data, transform) };
}

/** 자유롭게 그은 테이프 (월드 좌표의 점들). 너무 짧으면 null */
export function buildFreeTape(points: readonly P2[], width: number, color: string, pattern: TapePattern = "stripes"): { data: TapeData; transform: Tf; bbox: BBox } | null {
  const first = points[0];
  if (!first || points.length < 2) return null;
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot((points[i] as P2).x - (points[i - 1] as P2).x, (points[i] as P2).y - (points[i - 1] as P2).y);
  if (len < TAPE_MIN_LEN) return null;
  const r = (v: number) => Math.round(v * 10) / 10;
  const data: TapeData = {
    len,
    width,
    angle: 0,
    color,
    pattern,
    revealed: false,
    pts: points.map((p) => [r(p.x - first.x), r(p.y - first.y)] as [number, number]),
  };
  const transform = { x: first.x, y: first.y, scale: 1 };
  return { data, transform, bbox: tapeBox(data, transform) };
}

/** 그은 점 → 테이프 미리보기·그리기용 (Point 모양으로) */
export const asPoints = (pts: readonly P2[]): Point[] => pts.map((p, i) => ({ x: p.x, y: p.y, p: 0.5, t: i }));
