import { simplifyRDP } from "./simplify";
import type { Point } from "./types";

/**
 * 그리고 멈추면 깔끔한 도형으로 (삼성노트처럼) — 획은 그대로 잉크, 같은 펜으로 모양만 반듯하게.
 *   열린 획: 곧은 선 · 꺾은선(모서리가 뚜렷하면) · 매끈한 곡선(3차 베지어 맞춤)
 *   닫힌 획: 원·타원 · 사각형(직각이면 반듯하게) · 다각형 · 별(오각별을 한붓에) · 하트
 * 어느 것도 잘 맞지 않으면 null (손글씨 그대로).
 */

export type SnapKind = "line" | "polyline" | "curve" | "circle" | "ellipse" | "rect" | "polygon" | "star" | "heart";
export interface Snapped {
  kind: SnapKind;
  points: Point[];
}

type P = { x: number; y: number };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

function segDist(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
/** 점들이 꺾은선(닫히면 고리)에서 평균 얼마나 떨어졌나 */
function meanDistToPath(pts: readonly P[], path: readonly P[], closed: boolean): number {
  const segs: Array<[P, P]> = [];
  for (let i = 0; i + 1 < path.length; i++) segs.push([path[i] as P, path[i + 1] as P]);
  if (closed && path.length > 2) segs.push([path[path.length - 1] as P, path[0] as P]);
  let s = 0;
  for (const p of pts) s += Math.min(...segs.map(([a, b]) => segDist(p, a, b)));
  return s / pts.length;
}

function bbox(pts: readonly P[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** 꼭짓점 사이를 촘촘히 (모서리는 두 번 — 매끈하게 그리는 단계에서 둥글어지지 않게) */
function densePath(verts: readonly P[], closed: boolean, step: number): P[] {
  const out: P[] = [];
  const n = verts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = verts[i] as P;
    const b = verts[(i + 1) % n] as P;
    const k = Math.max(1, Math.ceil(dist(a, b) / step));
    out.push(a, a);
    for (let j = 1; j < k; j++) out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  const end = closed ? (verts[0] as P) : (verts[n - 1] as P);
  out.push(end, end);
  return out;
}

const toPoints = (ps: readonly P[], src: readonly Point[]): Point[] => {
  const p = src.reduce((s, q) => s + q.p, 0) / src.length;
  const t0 = src[0]?.t ?? 0;
  const t1 = src[src.length - 1]?.t ?? t0 + ps.length;
  return ps.map((q, i) => ({ x: q.x, y: q.y, p, t: t0 + ((t1 - t0) * i) / Math.max(1, ps.length - 1) }));
};

/** 끝점을 고정한 3차 베지어 최소제곱 맞춤 (Schneider) */
function fitBezier(pts: readonly P[]): { c: [P, P, P, P]; err: number } {
  const n = pts.length;
  const p0 = pts[0] as P;
  const p3 = pts[n - 1] as P;
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push((acc[i - 1] as number) + dist(pts[i - 1] as P, pts[i] as P));
  const L = acc[n - 1] || 1;
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  let bx1 = 0;
  let by1 = 0;
  let bx2 = 0;
  let by2 = 0;
  for (let i = 0; i < n; i++) {
    const t = (acc[i] as number) / L;
    const b0 = (1 - t) ** 3;
    const b1 = 3 * t * (1 - t) ** 2;
    const b2 = 3 * t * t * (1 - t);
    const b3 = t ** 3;
    const p = pts[i] as P;
    const rx = p.x - b0 * p0.x - b3 * p3.x;
    const ry = p.y - b0 * p0.y - b3 * p3.y;
    a11 += b1 * b1;
    a12 += b1 * b2;
    a22 += b2 * b2;
    bx1 += b1 * rx;
    by1 += b1 * ry;
    bx2 += b2 * rx;
    by2 += b2 * ry;
  }
  const det = a11 * a22 - a12 * a12 || 1e-9;
  const p1 = { x: (bx1 * a22 - bx2 * a12) / det, y: (by1 * a22 - by2 * a12) / det };
  const p2 = { x: (a11 * bx2 - a12 * bx1) / det, y: (a11 * by2 - a12 * by1) / det };
  const c: [P, P, P, P] = [p0, p1, p2, p3];
  const curve = sampleBezier(c, 48);
  return { c, err: meanDistToPath(pts, curve, false) };
}
function sampleBezier([a, b, c, d]: readonly [P, P, P, P], n: number): P[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return {
      x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
      y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y,
    };
  });
}

/** 닫힌 고리의 꼭짓점 (원점에서 가장 먼 점부터 잘라 RDP) */
export function loopVertices(pts: readonly Point[], eps: number): P[] {
  const c = bbox(pts);
  let far = 0;
  pts.forEach((p, i) => {
    if (Math.hypot(p.x - c.cx, p.y - c.cy) > Math.hypot((pts[far] as Point).x - c.cx, (pts[far] as Point).y - c.cy)) far = i;
  });
  const rot = [...pts.slice(far), ...pts.slice(0, far), pts[far] as Point];
  const v = simplifyRDP(rot, eps).map((q) => ({ x: q.x, y: q.y }));
  v.pop(); // 끝 = 처음
  // 아주 가까운 꼭짓점은 하나로
  const near = v.filter((q, i) => i === 0 || dist(q, v[i - 1] as P) > eps * 1.2);
  // 거의 곧은 자리(160° 넘게 펴진 곳)의 꼭짓점은 빼기 — 떨림이 만든 가짜 모서리
  let out = near;
  for (let changed = true; changed && out.length > 3; ) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const n = out.length;
      if (angleAt(out[(i + n - 1) % n] as P, out[i] as P, out[(i + 1) % n] as P) > 160) {
        out = out.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return out;
}

function angleAt(a: P, b: P, c: P): number {
  const u = Math.atan2(a.y - b.y, a.x - b.x);
  const v = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs(u - v);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return (d * 180) / Math.PI;
}

function heartTemplate(b: ReturnType<typeof bbox>): P[] {
  // x = 16 sin³t, y = 13cos t − 5cos 2t − 2cos 3t − cos 4t  (위가 +) → 상자에 맞춘다
  const raw = Array.from({ length: 96 }, (_, i) => {
    const t = (i / 96) * Math.PI * 2;
    return { x: 16 * Math.sin(t) ** 3, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) };
  });
  const r = bbox(raw);
  return raw.map((q) => ({ x: b.minX + ((q.x - r.minX) / r.w) * b.w, y: b.minY + ((q.y - r.minY) / r.h) * b.h }));
}

/** minDiag: 이보다 작은 획(글씨 한 획)은 도형으로 바꾸지 않는다 (월드 px) */
export function snapShape(src: readonly Point[], minDiag = 10): Snapped | null {
  if (src.length < 4) return null;
  const pts = src;
  const b = bbox(pts);
  const diag = Math.hypot(b.w, b.h);
  if (diag < Math.max(10, minDiag)) return null;
  let length = 0;
  for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1] as P, pts[i] as P);
  const step = Math.max(1, diag / 90);
  const first = pts[0] as Point;
  const last = pts[pts.length - 1] as Point;
  const closed = dist(first, last) < Math.max(10, diag * 0.2) && length > diag * 1.6;

  if (!closed) {
    // 곧은 선
    const dev = Math.max(...pts.map((p) => segDist(p, first, last)));
    const chord = dist(first, last);
    if (chord > 8 && dev < chord * 0.07) return { kind: "line", points: toPoints(densePath([first, last], false, step), src) };
    // 모서리가 뚜렷한 꺾은선 (ㄱ · V · ㄹ 모양)
    const verts = simplifyRDP(pts, diag * 0.07).map((q) => ({ x: q.x, y: q.y }));
    if (verts.length >= 3 && verts.length <= 6) {
      const sharp = verts.slice(1, -1).every((v, i) => angleAt(verts[i] as P, v, verts[i + 2] as P) < 145);
      if (sharp && meanDistToPath(pts, verts, false) < diag * 0.025) return { kind: "polyline", points: toPoints(densePath(verts, false, step), src) };
    }
    // 매끈한 곡선
    const bz = fitBezier(pts);
    // 곡선은 거의 그대로 맞을 때만 (글씨 획이 곡선으로 바뀌지 않게)
    if (bz.err < diag * 0.025) return { kind: "curve", points: toPoints(sampleBezier(bz.c, 64), src) };
    return null;
  }

  // ── 닫힌 도형: 후보마다 평균 어긋남(대각선 대비)을 재서 가장 잘 맞는 것
  const rx = b.w / 2;
  const ry = b.h / 2;
  const ellipse = Array.from({ length: 96 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    return { x: b.cx + rx * Math.cos(a), y: b.cy + ry * Math.sin(a) };
  });
  const ellipseErr = meanDistToPath(pts, ellipse, true) / diag;

  const verts = loopVertices(pts, diag * 0.07);
  const polyErr = verts.length >= 3 ? meanDistToPath(pts, verts, true) / diag : Infinity;

  // 오각별 (한붓에 그은 별): 꼭짓점 다섯이 중심을 144°씩 건너뛰며 돈다
  if (verts.length === 5) {
    // 별의 가운데 = 끝점 다섯의 평균 (오각별은 위아래가 비대칭이라 상자 가운데와 다르다)
    const sc = { x: verts.reduce((s2, v) => s2 + v.x, 0) / 5, y: verts.reduce((s2, v) => s2 + v.y, 0) / 5 };
    const ang = verts.map((v) => Math.atan2(v.y - sc.y, v.x - sc.x));
    const steps = ang.map((a, i) => {
      let d = (ang[(i + 1) % 5] as number) - a;
      while (d <= -Math.PI) d += 2 * Math.PI;
      while (d > Math.PI) d -= 2 * Math.PI;
      return Math.abs((d * 180) / Math.PI);
    });
    if (steps.every((s) => s > 110)) {
      const R = verts.reduce((s2, v) => s2 + Math.hypot(v.x - sc.x, v.y - sc.y), 0) / 5;
      const a0 = ang[0] as number;
      const dir = Math.sign(((ang[1] as number) - a0 + 3 * Math.PI) % (2 * Math.PI) - Math.PI) || 1;
      const star: P[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? R : R * 0.4;
        const a = a0 + (dir * i * Math.PI) / 5;
        star.push({ x: sc.x + r * Math.cos(a), y: sc.y + r * Math.sin(a) });
      }
      return { kind: "star", points: toPoints(densePath(star, true, step), src) };
    }
  }

  const heart = heartTemplate(b);
  const heartErr = meanDistToPath(pts, heart, true) / diag;

  const polyOk = verts.length >= 3 && verts.length <= 8 && polyErr < 0.035;
  if (heartErr < 0.045 && heartErr < ellipseErr * 0.8 && (!polyOk || heartErr < polyErr)) return { kind: "heart", points: toPoints([...heart, heart[0] as P], src) };
  if (polyOk && (polyErr < ellipseErr * 0.75 || ellipseErr > 0.05)) {
    // 거의 직각인 사각형은 반듯하게 (기울기가 작으면 수평·수직으로)
    if (verts.length === 4 && verts.every((v, i) => Math.abs(angleAt(verts[(i + 3) % 4] as P, v, verts[(i + 1) % 4] as P) - 90) < 14)) {
      const tilt = Math.atan2((verts[1] as P).y - (verts[0] as P).y, (verts[1] as P).x - (verts[0] as P).x);
      const near = Math.round(tilt / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(tilt - near) < (8 * Math.PI) / 180) {
        const rect = [
          { x: b.minX, y: b.minY },
          { x: b.maxX, y: b.minY },
          { x: b.maxX, y: b.maxY },
          { x: b.minX, y: b.maxY },
        ];
        return { kind: "rect", points: toPoints(densePath(rect, true, step), src) };
      }
    }
    return { kind: "polygon", points: toPoints(densePath(verts, true, step), src) };
  }
  if (ellipseErr < 0.05) {
    // 가로세로가 비슷하면 정원
    const round = Math.abs(b.w - b.h) / Math.max(b.w, b.h) < 0.15;
    const r = (rx + ry) / 2;
    const ring = Array.from({ length: 97 }, (_, i) => {
      const a = (i / 96) * Math.PI * 2;
      return { x: b.cx + (round ? r : rx) * Math.cos(a), y: b.cy + (round ? r : ry) * Math.sin(a) };
    });
    return { kind: round ? "circle" : "ellipse", points: toPoints(ring, src) };
  }
  return null;
}
