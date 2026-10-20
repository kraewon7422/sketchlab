import type { Point } from "./types";

/**
 * 필압 획을 "매끈한 외곽선 하나"로 만든다 — 잉크 선명도 v2.
 *
 * v1(outline.ts)은 구간마다 사다리꼴 + 꺾임마다 12각형을 겹쳐 그렸다. 서브패스 수백 개가
 * 각자 안티앨리어싱되면서 겹친 가장자리에 이음새 얼룩이 생겼고, 고해상도 태블릿에서
 * "선이 흐리고 픽셀이 보인다"로 나타났다 (사용자 실기 피드백).
 *
 * v2:
 *   1. 중심선을 centripetal Catmull-Rom으로 촘촘히(≈1.5px 간격) 보간 — 각진 꺾임 제거
 *   2. 필압은 보간 + 이동평균으로 다듬어 굵기가 출렁이지 않게
 *   3. 왼쪽/오른쪽 오프셋 + 양 끝 진짜 원호 캡(SVG A 명령)으로 **닫힌 외곽선 하나**
 *   4. 이음새 없는 단일 가장자리 → 안티앨리어싱 한 번 → 선명
 * 아주 급하게 꺾이는 곳(되돌아오는 획)에서만 조각을 나눈다. 한 외곽선이 스스로 꼬이면
 * nonzero 규칙에서 작은 구멍이 생길 수 있어서다. 조각은 모두 같은 방향으로 감긴다.
 */

export interface SmoothOptions {
  /** 필압 0.5(=필압 미지원)일 때 굵기 px */
  baseWidth: number;
  /** 보간 간격 px */
  spacing?: number;
  /** 이 각도(도) 이상 급하게 꺾이면 조각을 나눈다 */
  splitDeg?: number;
  /** 필압 → 굵기 배율 (없으면 radiusAt의 기본 곡선) — 펜 종류마다 다르다 */
  pressure?: (p: number) => number;
  /** 획 양 끝을 이 길이(px)에 걸쳐 가늘게 (붓) */
  taper?: number;
  /** 납작한 펜촉: 획 방향에 따라 굵기가 바뀐다 (캘리그래피·사각 형광펜). angle = 펜촉 방향(라디안), min = 가장 가늘 때 배율 */
  nib?: { angle: number; min: number };
}

/** 필압 → 반지름 배율. v1과 같은 곡선 (p=0.5에서 1배) — 굵기 느낌이 바뀌지 않게. */
export function radiusAt(pressure: number, halfWidth: number): number {
  const c = pressure < 0 ? 0 : pressure > 1 ? 1 : pressure;
  return halfWidth * Math.min(1.5, Math.max(0.35, 0.5 + c));
}

interface Sample {
  x: number;
  y: number;
  r: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function dot(x: number, y: number, r: number): string {
  return `M${r2(x - r)},${r2(y)}a${r2(r)},${r2(r)} 0 1,0 ${r2(2 * r)},0a${r2(r)},${r2(r)} 0 1,0 ${r2(-2 * r)},0Z`;
}

/** 중심선 보간 (centripetal Catmull-Rom — 점 간격이 고르지 않아도 고리·오버슈트가 안 생긴다) */
function densify(points: readonly Point[], half: number, spacing: number, pressure?: (p: number) => number): Sample[] {
  const R = (p: number) => (pressure ? half * pressure(p < 0 ? 0 : p > 1 ? 1 : p) : radiusAt(p, half));
  const n = points.length;
  const P = (i: number) => points[Math.max(0, Math.min(n - 1, i))] as Point;
  const out: Sample[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const seg = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.max(1, Math.ceil(seg / spacing));
    const d = (a: Point, b: Point) => Math.max(1e-4, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
    const t0 = 0;
    const t1 = t0 + d(p0, p1);
    const t2 = t1 + d(p1, p2);
    const t3 = t2 + d(p2, p3);
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      const t = t1 + (t2 - t1) * u;
      // Barry–Goldman 피라미드
      const lerp = (a: Point, b: Point, ta: number, tb: number) => {
        const w = (t - ta) / (tb - ta);
        return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
      };
      const A1 = lerp(p0, p1, t0, t1);
      const A2 = lerp(p1, p2, t1, t2);
      const A3 = lerp(p2, p3, t2, t3);
      const B1 = { x: A1.x + (A2.x - A1.x) * ((t - t0) / (t2 - t0)), y: A1.y + (A2.y - A1.y) * ((t - t0) / (t2 - t0)) };
      const B2 = { x: A2.x + (A3.x - A2.x) * ((t - t1) / (t3 - t1)), y: A2.y + (A3.y - A2.y) * ((t - t1) / (t3 - t1)) };
      const C = { x: B1.x + (B2.x - B1.x) * u, y: B1.y + (B2.y - B1.y) * u };
      const x = Number.isFinite(C.x) ? C.x : p1.x + (p2.x - p1.x) * u;
      const y = Number.isFinite(C.y) ? C.y : p1.y + (p2.y - p1.y) * u;
      out.push({ x, y, r: R(p1.p + (p2.p - p1.p) * u) });
    }
  }
  const last = P(n - 1);
  out.push({ x: last.x, y: last.y, r: R(last.p) });

  // 필압 이동평균 (반경 ±3 샘플) — 굵기 출렁임 제거
  const rs = out.map((s) => s.r);
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    let cnt = 0;
    for (let k = -3; k <= 3; k++) {
      const v = rs[i + k];
      if (v !== undefined) {
        sum += v;
        cnt++;
      }
    }
    (out[i] as Sample).r = sum / cnt;
  }
  // 같은 자리 중복 제거 (펜을 멈추고 있으면 생긴다 — 법선을 못 구한다)
  return out.filter((s, i) => i === 0 || Math.hypot(s.x - (out[i - 1] as Sample).x, s.y - (out[i - 1] as Sample).y) > 0.05);
}

function pieceOutline(src: readonly Sample[], nib?: { angle: number; min: number }): string {
  const n = src.length;
  if (n < 2) {
    const a = src[0];
    return a ? dot(a.x, a.y, a.r) : "";
  }
  // 납작한 펜촉: 그 자리의 획 방향과 펜촉 방향이 이루는 각도로 굵기를 정한다
  const s: Sample[] = nib
    ? src.map((c, i) => {
        const a = src[Math.max(0, i - 2)] as Sample;
        const b = src[Math.min(n - 1, i + 2)] as Sample;
        const f = Math.abs(Math.sin(Math.atan2(b.y - a.y, b.x - a.x) - nib.angle));
        return { ...c, r: c.r * (nib.min + (1 - nib.min) * f) };
      })
    : [...src];
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = s[Math.max(0, i - 1)] as Sample;
    const b = s[Math.min(n - 1, i + 1)] as Sample;
    const c = s[i] as Sample;
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    // 법선 = 접선을 화면 기준 +90° 회전
    left.push([c.x - ty * c.r, c.y + tx * c.r]);
    right.push([c.x + ty * c.r, c.y - tx * c.r]);
  }
  const smoothSide = (pts: ReadonlyArray<[number, number]>): string => {
    // 이웃 점의 중점을 끝점으로, 점 자체를 제어점으로 — 2차 베지어로 꺾임 없이 잇는다
    let d = "";
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i] as [number, number];
      const q = pts[i + 1] as [number, number];
      d += `Q${r2(p[0])},${r2(p[1])} ${r2((p[0] + q[0]) / 2)},${r2((p[1] + q[1]) / 2)}`;
    }
    const last = pts[pts.length - 1] as [number, number];
    return d + `L${r2(last[0])},${r2(last[1])}`;
  };
  const end = s[n - 1] as Sample;
  const start = s[0] as Sample;
  const l0 = left[0] as [number, number];
  const rEnd = right[n - 1] as [number, number];
  const rev = [...right].reverse();
  return (
    `M${r2(l0[0])},${r2(l0[1])}` +
    smoothSide(left) +
    `A${r2(end.r)},${r2(end.r)} 0 0,0 ${r2(rEnd[0])},${r2(rEnd[1])}` +
    smoothSide(rev) +
    `A${r2(start.r)},${r2(start.r)} 0 0,0 ${r2(l0[0])},${r2(l0[1])}Z`
  );
}

/** 획 전체 → SVG path d. 빈 획은 빈 문자열. */
export function smoothStrokePath(points: readonly Point[], options: SmoothOptions): string {
  const half = options.baseWidth / 2;
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) return dot(first.x, first.y, radiusAt(first.p, half));

  const dense = densify(points, half, options.spacing ?? 1.5, options.pressure);
  if (options.taper && dense.length > 2) {
    // 붓: 시작과 끝을 가늘게 (전체 길이의 1/3을 넘지 않게)
    const acc = [0];
    for (let i = 1; i < dense.length; i++) acc.push((acc[i - 1] as number) + Math.hypot((dense[i] as Sample).x - (dense[i - 1] as Sample).x, (dense[i] as Sample).y - (dense[i - 1] as Sample).y));
    const L = acc[acc.length - 1] as number;
    const t = Math.min(options.taper, L / 3);
    if (t > 0) dense.forEach((d, i) => (d.r *= 0.15 + 0.85 * Math.min(1, (acc[i] as number) / t, (L - (acc[i] as number)) / t)));
  }
  if (dense.length < 2) {
    const a = dense[0] ?? { x: first.x, y: first.y, r: radiusAt(first.p, half) };
    return dot(a.x, a.y, a.r);
  }

  // 급히 꺾이는 곳에서 조각 나누기 (팔 길이 ≈ 3샘플)
  const splitCos = Math.cos(((options.splitDeg ?? 100) * Math.PI) / 180);
  const pieces: Sample[][] = [];
  let cur: Sample[] = [dense[0] as Sample];
  const k = 3;
  for (let i = 1; i < dense.length; i++) {
    const c = dense[i] as Sample;
    cur.push(c);
    const a = dense[i - k];
    const b = dense[i + k];
    if (a && b && i - k >= 0) {
      const ux = c.x - a.x;
      const uy = c.y - a.y;
      const vx = b.x - c.x;
      const vy = b.y - c.y;
      const lu = Math.hypot(ux, uy);
      const lv = Math.hypot(vx, vy);
      if (lu > 0 && lv > 0 && (ux * vx + uy * vy) / (lu * lv) < splitCos && cur.length > k) {
        pieces.push(cur);
        cur = [c]; // 꺾인 점에서 두 조각이 겹친다 — 둥근 캡이 이음새를 덮는다
      }
    }
  }
  pieces.push(cur);
  return pieces.map((pc) => pieceOutline(pc, options.nib)).join("");
}

/** 획의 중심선만 (점선·파선 펜용 — 굵기는 SVG stroke-width로) */
export function centerlinePath(points: readonly Point[]): string {
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) return `M${r2(first.x)},${r2(first.y)}l0.01,0`;
  const dense = densify(points, 1, 2);
  return `M${dense.map((d) => `${r2(d.x)},${r2(d.y)}`).join("L")}`;
}
