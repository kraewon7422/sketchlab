import type { Shape2DData, Shape2DPrimitive } from "@sketchlab/shared";
import { distanceToSegment } from "../ink/geometry";

/**
 * 평면도형 객체의 좌표 변환·히트 판정 (순수 함수).
 *
 * IR은 객체 로컬 좌표(1 = transform.scale px)로 저장된다 (v4 §8.1).
 * 화면(월드)으로 바꾸는 곳은 여기 한 곳뿐이다 — 렌더러와 지우개가 같은 변환을 쓴다.
 */

export interface ObjectTransform {
  x: number;
  y: number;
  scale: number;
}

export function localToWorld([lx, ly]: readonly [number, number], tf: ObjectTransform): { x: number; y: number } {
  return { x: tf.x + lx * tf.scale, y: tf.y + ly * tf.scale };
}

/** 월드 좌표의 점에서 도형 한 조각의 선까지 거리 */
export function distanceToPrimitive(p: Shape2DPrimitive, tf: ObjectTransform, x: number, y: number): number {
  const W = (v: readonly [number, number]) => localToWorld(v, tf);
  switch (p.t) {
    case "line":
    case "arrow": {
      const a = W(p.a);
      const b = W(p.b);
      return distanceToSegment(x, y, a.x, a.y, b.x, b.y);
    }
    case "circle": {
      const c = W(p.c);
      return Math.abs(Math.hypot(x - c.x, y - c.y) - p.r * tf.scale);
    }
    case "arc": {
      const c = W(p.c);
      const r = p.r * tf.scale;
      const ang = Math.atan2(y - c.y, x - c.x);
      // 각도가 호 범위 안이면 원까지 거리, 아니면 가까운 끝점까지 거리
      let rel = ang - p.from;
      while (rel < 0) rel += 2 * Math.PI;
      if (rel <= p.to - p.from) return Math.abs(Math.hypot(x - c.x, y - c.y) - r);
      const e1 = { x: c.x + r * Math.cos(p.from), y: c.y + r * Math.sin(p.from) };
      const e2 = { x: c.x + r * Math.cos(p.to), y: c.y + r * Math.sin(p.to) };
      return Math.min(Math.hypot(x - e1.x, y - e1.y), Math.hypot(x - e2.x, y - e2.y));
    }
    case "polygon": {
      const pts = p.pts.map(W);
      let best = Number.POSITIVE_INFINITY;
      const n = pts.length;
      const edges = p.closed ? n : n - 1;
      for (let i = 0; i < edges; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        if (!a || !b) continue;
        best = Math.min(best, distanceToSegment(x, y, a.x, a.y, b.x, b.y));
      }
      return best;
    }
  }
}

export function distanceToShape2D(data: Shape2DData, tf: ObjectTransform, x: number, y: number): number {
  return data.primitives.reduce((best, p) => Math.min(best, distanceToPrimitive(p, tf, x, y)), Number.POSITIVE_INFINITY);
}
