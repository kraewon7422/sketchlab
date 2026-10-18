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

type P2 = { x: number; y: number };

/**
 * Catmull-Rom 제어점 → 3차 베지어 조각들 (균일 CR: c1 = p1 + (p2−p0)/6, c2 = p2 − (p3−p1)/6).
 * 같은 점이 연속되면 그쪽 접선이 짧아져 뾰족한 모서리가 된다 — 곡선 IR의 모서리 표기와 짝.
 */
export function catmullRomBeziers(pts: readonly P2[], closed: boolean): Array<[P2, P2, P2, P2]> {
  const n = pts.length;
  const P = (i: number): P2 =>
    closed ? (pts[((i % n) + n) % n] as P2) : (pts[Math.max(0, Math.min(n - 1, i))] as P2);
  const out: Array<[P2, P2, P2, P2]> = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    out.push([
      p1,
      { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p2,
    ]);
  }
  return out;
}

const cubicAt = ([a, b, c, d]: readonly [P2, P2, P2, P2], t: number): P2 => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

/** 곡선류 도형을 촘촘한 꺾은선으로 (월드 좌표) — 지우개 히트 판정용 */
export function primitivePolyline(p: Shape2DPrimitive, tf: ObjectTransform): P2[] {
  const W = (v: readonly [number, number]) => localToWorld(v, tf);
  switch (p.t) {
    case "parabola": {
      const a = W(p.p0);
      const c = W(p.c);
      const b = W(p.p1);
      return Array.from({ length: 33 }, (_, i) => {
        const t = i / 32;
        const u = 1 - t;
        return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
      });
    }
    case "ellipse": {
      const c = W(p.c);
      const rx = p.rx * tf.scale;
      const ry = p.ry * tf.scale;
      return Array.from({ length: 65 }, (_, i) => {
        const th = (i / 64) * 2 * Math.PI;
        const ex = rx * Math.cos(th);
        const ey = ry * Math.sin(th);
        return { x: c.x + ex * Math.cos(p.rot) - ey * Math.sin(p.rot), y: c.y + ex * Math.sin(p.rot) + ey * Math.cos(p.rot) };
      });
    }
    case "curve": {
      const out: P2[] = [];
      for (const bz of catmullRomBeziers(p.pts.map(W), p.closed)) {
        for (let i = 0; i <= 8; i++) out.push(cubicAt(bz, i / 8));
      }
      return out;
    }
    default:
      return [];
  }
}

function distanceToPolylinePts(x: number, y: number, pts: readonly P2[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i] as P2;
    const b = pts[i + 1] as P2;
    best = Math.min(best, distanceToSegment(x, y, a.x, a.y, b.x, b.y));
  }
  return best;
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
    case "parabola":
    case "ellipse":
    case "curve":
      return distanceToPolylinePts(x, y, primitivePolyline(p, tf));
  }
}

export function distanceToShape2D(data: Shape2DData, tf: ObjectTransform, x: number, y: number): number {
  return data.primitives.reduce((best, p) => Math.min(best, distanceToPrimitive(p, tf, x, y)), Number.POSITIVE_INFINITY);
}
