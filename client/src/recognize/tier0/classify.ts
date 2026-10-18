import { IR_VERSION, type SceneIR, type Shape2DMark, type Shape2DPrimitive } from "@sketchlab/shared";
import type { BBox, Stroke } from "../../ink/types";
import {
  at,
  dist,
  findCorners,
  fitCircle,
  fitEllipse,
  fitLine,
  fitParabola,
  gaussianSmooth,
  interiorAngle,
  intersectLines,
  mod,
  normAngle,
  parabolaBezier,
  pathLength,
  polygonArea,
  projectOnLine,
  resample,
  turningAngles,
  unit,
  type LineFit,
  type V,
} from "./fit";

/**
 * Tier 0 — 로컬 기하 인식 (마스터스펙 v4 §9.1). <30ms, 오프라인, 순수 함수.
 *
 *   획 하나씩 분류 → 획끼리 조합(화살표·선분으로 그린 다각형) → 스냅(정사각형 등)
 *
 * 원칙
 *  - 그룹 안에 하나라도 "기하로 설명 안 되는 획"(곡선 글씨 등)이 있으면 **전체를 포기**한다.
 *    반만 반듯해진 글씨는 원본보다 나쁘다. 그런 그룹은 P3b의 VLM 몫이다.
 *  - **스냅 시 크기·위치·회전 보존.** 기울여 그린 사각형은 기울어진 직사각형이 된다.
 *    축 정렬을 강제하지 않는다.
 *  - 임계값은 전부 도형 크기 대비 비율 → 크게 그리든 작게 그리든 같은 판정.
 *
 * 지원: 선분, 화살표, 원, 호, 3~6각형(정삼각형·직사각형·정사각형 스냅, 직각 표시), 꺾은선.
 * 7각형 이상은 원과 구분이 안 되어 지원하지 않는다(대부분 원으로 판정됨).
 */

export interface Tier0Options {
  /** |시작−끝| < 길이×이 값 이면 닫힌 획 */
  closeRatio: number;
  /** 재표본화 점 개수 */
  samples: number;
  /** 꺾임각 측정 팔 길이 (재표본 점 개수 대비 비율) */
  armRatio: number;
  /** 이 각도 이상 꺾이면 꼭짓점 후보 (도) */
  cornerDeg: number;
  /** 열린 획의 꼭짓점 날카로움: 짧은 팔 꺾임 / 긴 팔 꺾임 하한 */
  sharpRatio: number;
  /** 열린 꺾은선의 모서리 깎임 상한: |교점−펜 경로의 모서리| / 짧은 인접 변 */
  roundCut: number;
  /** 꺾임 측정 팔 길이 하한 px (긴 팔 / 짧은 팔) */
  minArmPx: number;
  minShortArmPx: number;
  /** 원 판정: 중심거리 std/mean 상한 (꼭짓점이 3개 미만일 때) */
  circleResidual: number;
  /** 이보다 둥글면 꼭짓점이 잡혀도 원 */
  roundResidual: number;
  /** 직선 판정: 최대 이탈 / 길이 */
  lineDev: number;
  /** 다각형 변의 직선성: 최대 이탈 / 변 길이 */
  edgeDev: number;
  /** 호 판정: 원 맞춤 잔차 상한 */
  arcResidual: number;
  minArcSweepDeg: number;
  /** 이보다 작은 획(대각선 px)은 점 — 인식 포기 */
  minSize: number;
  rightAngleTolDeg: number;
  rectTolDeg: number;
  squareTol: number;
  equilateralTol: number;
  /** 선분 끝점을 같은 꼭짓점으로 볼 거리 / 평균 선분 길이 */
  joinRatio: number;
  /** 화살촉 크기 상한 / 몸통 길이 */
  arrowHeadRatio: number;
  /** 화살촉 날개와 몸통 사이 각 상한 (도) */
  arrowWingDeg: number;
  /** 포물선 판정: RMS 오차 / 도형 크기 상한 */
  parabolaRms: number;
  /** 호와 포물선이 둘 다 맞으면 호를 고르는 여유 (호 오차 ≤ 포물선 오차 × 이 값) */
  arcPreference: number;
  /** 타원 판정: 정규화 반지름 std/mean 상한, 그리고 최소 장단축비(이보다 동그라면 원) */
  ellipseResidual: number;
  ellipseMinRatio: number;
  /** 글씨 추정: 획 3개 이상 + 획 크기 중앙값이 이보다 작고(px) 곡선 획이 있으면 손대지 않는다 */
  textMaxSize: number;
  /** 매끈한 곡선 안에서 모서리로 남길 기준 — 도형 꼭짓점보다 엄격 (꺾임각·날카로움) */
  curveCornerDeg: number;
  curveSharpRatio: number;
}

export const TIER0_DEFAULTS: Tier0Options = {
  closeRatio: 0.15,
  samples: 96,
  armRatio: 0.05,
  cornerDeg: 55,
  sharpRatio: 0.6,
  roundCut: 0.12,
  minArmPx: 6,
  minShortArmPx: 3,
  circleResidual: 0.12,
  roundResidual: 0.035,
  lineDev: 0.06,
  edgeDev: 0.09,
  arcResidual: 0.08,
  minArcSweepDeg: 40,
  minSize: 12,
  rightAngleTolDeg: 10,
  rectTolDeg: 12,
  squareTol: 0.1,
  equilateralTol: 0.08,
  joinRatio: 0.15,
  arrowHeadRatio: 0.45,
  arrowWingDeg: 65,
  parabolaRms: 0.03,
  arcPreference: 1.1,
  ellipseResidual: 0.07,
  ellipseMinRatio: 1.15,
  textMaxSize: 45,
  curveCornerDeg: 70,
  curveSharpRatio: 0.75,
};

/** 획 하나의 분류 결과 (월드 좌표) */
export type StrokeShape =
  | { kind: "line"; a: V; b: V; residual: number }
  | { kind: "circle"; c: V; r: number; residual: number }
  | { kind: "arc"; c: V; r: number; from: number; to: number; residual: number }
  | { kind: "polygon"; pts: V[]; residual: number }
  | { kind: "polyline"; pts: V[]; residual: number }
  | { kind: "parabola"; p0: V; c: V; p1: V; residual: number }
  | { kind: "ellipse"; c: V; rx: number; ry: number; rot: number; residual: number }
  | { kind: "curve"; pts: V[]; closed: boolean; residual: number };

export interface Tier0Result {
  ir: SceneIR;
  /** 객체 로컬 좌표 → 월드: world = local × scale + (x, y) */
  transform: { x: number; y: number; scale: number };
}

// ─────────────────────────────────────────────────────────── 획 하나

export function classifyStroke(
  raw: readonly V[],
  options: Partial<Tier0Options> = {},
): StrokeShape | null {
  const o = { ...TIER0_DEFAULTS, ...options };
  if (raw.length < 2) return null;

  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (diag < o.minSize) return null;

  const len = pathLength(raw);
  const closed = dist(at(raw, 0), at(raw, raw.length - 1)) < o.closeRatio * len && len > 3 * o.minSize;
  const pts = resample(closed ? trimOvershoot(raw) : raw, o.samples, closed);
  // 팔 길이는 "둘레 대비 비율"이 기본이지만, 아주 작은 획(화살촉 등)에서는 손떨림(~1px)보다
  // 짧아져 잡음만 재게 된다. 그래서 px 하한을 함께 둔다 (상한: 재표본 점의 1/6).
  const spacing = pathLength(pts, closed) / (closed ? pts.length : pts.length - 1) || 1;
  const maxK = Math.floor(o.samples / 6);
  const k = Math.min(maxK, Math.max(2, Math.round(o.armRatio * o.samples), Math.ceil(o.minArmPx / spacing)));
  const wide = turningAngles(pts, k, closed);
  let corners = findCorners(wide, o.cornerDeg, k, closed);

  if (!closed) {
    // 진짜 모서리는 짧은 팔로 재도 거의 같은 각이 나오고, 둥근 굽이(S자·글씨)는 팔 길이에
    // 비례해 작아진다. 열린 획에서만 거른다 — 닫힌 도형의 둥근 모서리는 원/다각형 판정이 따로 처리.
    const kShort = Math.min(k - 1, Math.max(1, Math.round(k / 2.5), Math.ceil(o.minShortArmPx / spacing)));
    const short = turningAngles(pts, kShort, closed);
    corners = corners.filter((i) => at(short, i) >= o.sharpRatio * at(wide, i));
  }

  if (closed) {
    // 길쭉한 타원을 먼저 본다 — 원 판정의 잔차 허용 범위 안에 살짝 찌그러진 타원이 들어오기 때문
    const ellipse = fitEllipse(pts);
    if (
      ellipse &&
      corners.length < 3 &&
      ellipse.residual < o.ellipseResidual &&
      ellipse.rx / ellipse.ry > o.ellipseMinRatio
    ) {
      return { kind: "ellipse", c: ellipse.c, rx: ellipse.rx, ry: ellipse.ry, rot: ellipse.rot, residual: ellipse.residual };
    }
    const circle = fitCircle(pts);
    if (
      circle &&
      (circle.residual < o.roundResidual || (circle.residual < o.circleResidual && corners.length < 3))
    ) {
      return { kind: "circle", c: circle.c, r: circle.r, residual: circle.residual };
    }
    if (corners.length >= 3 && corners.length <= 6) {
      const polygon = polygonFromCorners(pts, corners, k, o);
      if (polygon) return polygon;
    }
    // 원·타원·다각형이 아닌 닫힌 모양(하트, D자, 구름…) → 모양 그대로 매끈하게
    return curveFrom(trimOvershoot(raw), true, o);
  }

  if (corners.length === 0) {
    const line = fitLine(pts);
    if (line && line.maxDev <= o.lineDev * len) {
      return {
        kind: "line",
        a: projectOnLine(at(pts, 0), line),
        b: projectOnLine(at(pts, pts.length - 1), line),
        residual: line.maxDev / len,
      };
    }
    // 호와 포물선 둘 다 맞춰 보고 더 잘 맞는 쪽 (비슷하면 호 — 교과서 그림에 더 흔하다)
    const arc = arcFrom(pts, o);
    const parabola = parabolaFrom(pts, diag, o);
    if (arc && arc.kind === "arc" && (!parabola || arc.residual * arc.r <= parabola.rms * o.arcPreference)) return arc;
    if (parabola) return parabola.shape;
    return curveFrom(raw, false, o);
  }

  if (corners.length <= 6) {
    const polyline = polylineFromCorners(pts, corners, k, o);
    if (polyline) return polyline;
  }
  // 좁은 U자 포물선은 꼭짓점이 급해서 "모서리"로 잡힌다 — 꺾은선이 아니면 포물선도 시험해 본다
  if (corners.length <= 2) {
    const parabola = parabolaFrom(pts, diag, o);
    if (parabola) return parabola.shape;
  }
  // 직선 조각으로 설명되지 않는 열린 획 → 모서리는 살리고 나머지는 매끈하게
  return curveFrom(raw, false, o);
}

/**
 * 매끈한 곡선 안의 "진짜 모서리"만 찾는다 (하트 꼭지, D자 귀퉁이 같은 곳).
 * 도형 분류용 꼭짓점 기준보다 훨씬 엄격하다 — 사인파 봉우리·S자 굽이 같은 급한 굽이를
 * 모서리로 잡으면 매끈하게 다듬은 곡선이 오히려 꺾여 보인다 (실측으로 확인한 문제).
 */
function detectCorners(pts: readonly V[], closed: boolean, o: Tier0Options): number[] {
  const spacing = pathLength(pts, closed) / (closed ? pts.length : pts.length - 1) || 1;
  const maxK = Math.max(2, Math.floor(pts.length / 6));
  const k = Math.min(maxK, Math.max(2, Math.round(o.armRatio * pts.length), Math.ceil(o.minArmPx / spacing)));
  const wide = turningAngles(pts, k, closed);
  const kShort = Math.min(k - 1, Math.max(1, Math.round(k / 2.5), Math.ceil(o.minShortArmPx / spacing)));
  const short = turningAngles(pts, kShort, closed);
  return findCorners(wide, o.curveCornerDeg, k, closed).filter(
    (i) => at(short, i) >= o.curveSharpRatio * at(wide, i),
  );
}

/**
 * 포물선 (회전 허용). 대칭에 가까우면 정확히 대칭으로 다듬는다 — 꼭짓점을 축으로
 * 양 팔 길이를 평균. 결과는 2차 베지어 하나(정확한 포물선 구간)로 저장된다.
 */
function parabolaFrom(
  pts: readonly V[],
  size: number,
  o: Tier0Options,
): { shape: StrokeShape; rms: number } | null {
  const f = fitParabola(pts);
  if (!f || f.rms > o.parabolaRms * size || f.a === 0) return null;
  let u0 = f.u0;
  let u1 = f.u1;
  const uv = -f.b / (2 * f.a);
  const lo = Math.min(u0, u1);
  const hi = Math.max(u0, u1);
  const v = (u: number) => f.a * u * u + f.b * u + f.c;
  const height = Math.max(Math.abs(v(u0) - v(uv)), Math.abs(v(u1) - v(uv)));
  if (uv > lo + 0.15 * (hi - lo) && uv < hi - 0.15 * (hi - lo) && Math.abs(v(u0) - v(u1)) < 0.12 * height) {
    const half = (Math.abs(u0 - uv) + Math.abs(u1 - uv)) / 2;
    u0 = uv + Math.sign(u0 - uv) * half;
    u1 = uv + Math.sign(u1 - uv) * half;
  }
  const bz = parabolaBezier(f, u0, u1);
  return { shape: { kind: "parabola", p0: bz.p0, c: bz.c, p1: bz.p1, residual: f.rms / size }, rms: f.rms };
}

/**
 * 매끈한 자유 곡선: 촘촘히 재표본 → 모서리에서 나눠 각 조각을 가우시안 평활 → RDP로 제어점 추림.
 * 모서리 점은 두 번 넣어 렌더러(Catmull-Rom)가 그 자리를 뾰족하게 유지하게 한다.
 */
function curveFrom(raw: readonly V[], closed: boolean, o: Tier0Options): StrokeShape | null {
  const len = pathLength(raw, closed);
  if (len === 0) return null;
  const n = Math.round(Math.min(300, Math.max(48, len / 3)));
  const pts = resample(raw, n, closed);
  const sigma = Math.max(1, n * 0.012);
  // 제어점은 호 길이로 **균등하게** — RDP처럼 들쭉날쭉하면 Catmull-Rom이 굽이를 뾰족하게,
  // 긴 구간을 직선처럼 만든다(사인파 봉우리가 천막 모양이 되던 실측 문제).
  const ctrlSpacing = Math.min(14, Math.max(6, len / 40));
  const corners = detectCorners(pts, closed, o);

  if (closed && corners.length === 0) {
    const smooth = gaussianSmooth(pts, sigma, true);
    const step = Math.max(1, Math.round(n / 36));
    const ctrl = smooth.filter((_, i) => i % step === 0);
    return { kind: "curve", pts: ctrl, closed: true, residual: 0.03 };
  }

  // 열린 획: [시작, 모서리…, 끝] / 닫힌 획: 첫 모서리에서 시작해 한 바퀴
  const order = closed
    ? Array.from({ length: n + 1 }, (_, i) => mod(at(corners, 0) + i, n))
    : Array.from({ length: n }, (_, i) => i);
  const cornerSet = new Set(corners);
  const out: V[] = [];
  let seg: V[] = [];
  const flush = () => {
    if (seg.length === 0) return;
    const smooth = gaussianSmooth(seg, sigma, false);
    const m = Math.max(2, Math.round(pathLength(smooth) / ctrlSpacing) + 1);
    out.push(...resample(smooth, m, false));
    seg = [];
  };
  order.forEach((idx, j) => {
    const p = at(pts, idx);
    seg.push(p);
    if (j > 0 && j < order.length - 1 && cornerSet.has(idx)) {
      flush();
      seg.push(p); // 모서리 점이 다음 조각의 시작 — 출력에 두 번 들어가 뾰족하게 그려진다
    }
  });
  flush();
  return { kind: "curve", pts: out, closed: false, residual: 0.03 };
}

/**
 * 닫힌 획의 "겹쳐 그린 꼬리"를 잘라낸다.
 *
 * 손으로 도형을 닫으면 대개 시작점을 지나쳐 조금 더 긋는다. 그대로 고리로 이으면
 * 마지막 점 → 첫 점 연결이 첫 변을 거꾸로 되짚어서 가짜 꼭짓점이 두 개 생긴다.
 * 획의 마지막 30% 안에서 시작점에 가장 가까운 점을 찾아 거기서 끊는다.
 */
function trimOvershoot(raw: readonly V[]): V[] {
  const first = at(raw, 0);
  const total = pathLength(raw);
  let acc = 0;
  let best = raw.length - 1;
  let bestDist = Infinity;
  for (let i = 1; i < raw.length; i++) {
    acc += dist(at(raw, i - 1), at(raw, i));
    if (acc < 0.7 * total) continue;
    const d = dist(at(raw, i), first);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return raw.slice(0, best + 1);
}

/** 꼭짓점 사이 구간을 직선으로 맞추고 이웃 직선의 교점을 꼭짓점으로 쓴다 — 모서리가 날카로워진다. */
function polygonFromCorners(
  pts: readonly V[],
  corners: readonly number[],
  k: number,
  o: Tier0Options,
): StrokeShape | null {
  const n = pts.length;
  const trim = Math.ceil(k / 2);
  const lines: LineFit[] = [];
  let worst = 0;

  for (let e = 0; e < corners.length; e++) {
    const from = at(corners, e);
    const to = at(corners, mod(e + 1, corners.length));
    const span = mod(to - from, n);
    const segment: V[] = [];
    for (let s = trim; s <= span - trim; s++) segment.push(at(pts, mod(from + s, n)));
    const line = fitLine(segment.length >= 2 ? segment : [at(pts, from), at(pts, to)]);
    if (!line) return null;
    const edgeLen = dist(at(pts, from), at(pts, to));
    if (edgeLen === 0 || line.maxDev > o.edgeDev * edgeLen) return null;
    worst = Math.max(worst, line.maxDev / edgeLen);
    lines.push(line);
  }

  const vertices = corners.map((ci, e) => {
    const hit = intersectLines(at(lines, mod(e - 1, lines.length)), at(lines, e));
    const corner = at(pts, ci);
    // 교점이 손으로 찍은 모서리에서 너무 멀면(거의 평행한 변) 원래 모서리를 쓴다.
    return hit && dist(hit, corner) < 0.25 * Math.sqrt(Math.abs(polygonArea(pts))) ? hit : corner;
  });
  return { kind: "polygon", pts: vertices, residual: worst };
}

function polylineFromCorners(
  pts: readonly V[],
  corners: readonly number[],
  k: number,
  o: Tier0Options,
): StrokeShape | null {
  const trim = Math.ceil(k / 2);
  const breaks = [0, ...corners, pts.length - 1];
  const lines: LineFit[] = [];
  let worst = 0;

  for (let e = 0; e < breaks.length - 1; e++) {
    const from = at(breaks, e);
    const to = at(breaks, e + 1);
    const lo = e === 0 ? from : from + trim;
    const hi = e === breaks.length - 2 ? to : to - trim;
    const segment = pts.slice(lo, hi + 1);
    const line = fitLine(segment.length >= 2 ? segment : [at(pts, from), at(pts, to)]);
    if (!line) return null;
    const edgeLen = dist(at(pts, from), at(pts, to));
    if (edgeLen === 0 || line.maxDev > o.edgeDev * edgeLen) return null;
    worst = Math.max(worst, line.maxDev / edgeLen);
    lines.push(line);
  }

  const out: V[] = [projectOnLine(at(pts, 0), at(lines, 0))];
  for (let e = 1; e < lines.length; e++) {
    const corner = at(pts, at(breaks, e));
    const vertex = intersectLines(at(lines, e - 1), at(lines, e)) ?? corner;
    // 모서리 깎임 검사: 진짜 꼭짓점은 펜이 두 변의 교점 가까이를 지나간다.
    // 둥근 굽이(S자·글씨)는 교점 한참 안쪽으로 질러간다 → 꺾은선이 아니다.
    const shorter = Math.min(
      dist(at(pts, at(breaks, e - 1)), corner),
      dist(corner, at(pts, at(breaks, e + 1))),
    );
    if (dist(vertex, corner) > o.roundCut * shorter) return null;
    out.push(vertex);
  }
  out.push(projectOnLine(at(pts, pts.length - 1), at(lines, lines.length - 1)));
  return { kind: "polyline", pts: out, residual: worst };
}

function arcFrom(pts: readonly V[], o: Tier0Options): StrokeShape | null {
  const circle = fitCircle(pts);
  if (!circle || circle.residual > o.arcResidual) return null;

  const ang = (p: V) => Math.atan2(p.y - circle.c.y, p.x - circle.c.x);
  const a0 = ang(at(pts, 0));
  const am = ang(at(pts, Math.floor(pts.length / 2)));
  const a1 = ang(at(pts, pts.length - 1));
  const d1 = normAngle(am - a0);
  const d2 = normAngle(a1 - am);
  if (Math.sign(d1) !== Math.sign(d2)) return null; // 방향이 바뀌는 S자 곡선
  const sweep = d1 + d2;
  const sweepDeg = (Math.abs(sweep) * 180) / Math.PI;
  if (sweepDeg < o.minArcSweepDeg || sweepDeg > 330) return null;

  // from → to 가 항상 각도 증가 방향이 되게 저장 (렌더러는 sweep-flag 하나만 쓴다)
  const from = sweep > 0 ? a0 : a1;
  return { kind: "arc", c: circle.c, r: circle.r, from, to: from + Math.abs(sweep), residual: circle.residual };
}

// ─────────────────────────────────────────────────────────── 그룹 조합

/**
 * 기하로 설명되지 않는 획. 화살촉 자리에 있을 때만 화살촉으로 쓰이고,
 * 그 외에는 그룹 전체 포기 사유가 된다 (반만 반듯한 글씨 금지 원칙 그대로).
 * 손으로 빠르게 그린 작은 화살촉은 흔들림이 커서 깔끔한 V로 분류되지 않는 경우가 많다.
 */
type Scribble = { kind: "scribble"; pts: V[]; residual: number };
type PieceShape = StrokeShape | Scribble;

interface Piece {
  shape: PieceShape;
  used: boolean;
}

/** 그룹 전체를 인식한다. 하나라도 설명이 안 되면 null. */
export function recognizeTier0(
  strokes: readonly Stroke[],
  bbox: BBox,
  options: Partial<Tier0Options> = {},
): Tier0Result | null {
  const o = { ...TIER0_DEFAULTS, ...options };
  if (strokes.length === 0) return null;

  const shapes: PieceShape[] = strokes.map(
    (s) => classifyStroke(s.points, o) ?? { kind: "scribble", pts: s.points.map(({ x, y }) => ({ x, y })), residual: 0.05 },
  );
  // 전부 낙서면 볼 것도 없다 — 화살표 몸통(선분)이 하나도 없으면 낙서가 쓰일 곳이 없다.
  if (shapes.every((sh) => sh.kind === "scribble")) return null;

  // 글씨처럼 보이는 그룹(작은 획 여러 개 + 곡선 획)은 손대지 않는다 — 글씨를 도형으로 바꾸면
  // 원본보다 나빠진다. 손글씨 인식(P3b)이 처리할 몫이다.
  const sizes = strokes
    .map((st) => Math.hypot(st.bbox.maxX - st.bbox.minX, st.bbox.maxY - st.bbox.minY))
    .sort((p, q) => p - q);
  const medianSize = at(sizes, Math.floor(sizes.length / 2));
  // 직선류(선분·꺾은선·다각형)가 아닌 획이 하나라도 있으면 글씨일 수 있다
  const curvy = shapes.some((sh) => sh.kind !== "line" && sh.kind !== "polyline" && sh.kind !== "polygon");
  if (strokes.length >= 3 && medianSize < o.textMaxSize && curvy) return null;

  const pieces: Piece[] = shapes.map((shape) => ({ shape, used: false }));
  const prims: WorldPrimitive[] = [];
  const marks: WorldMark[] = [];

  collectArrows(pieces, prims, o);
  collectLineLoops(pieces, prims, marks, o);

  // 남은 선분들은 끝점이 서로 닿으면 한 점으로 모아 준다 (각·꺾은선 그림이 이어져 보이게).
  const lines = pieces.filter((p) => !p.used && p.shape.kind === "line");
  snapLineEndpoints(lines.map((p) => p.shape as Extract<StrokeShape, { kind: "line" }>), o);

  for (const piece of pieces) {
    if (piece.used) continue;
    const s = piece.shape;
    switch (s.kind) {
      case "scribble":
        return null; // 화살촉으로 쓰이지 못한 아주 작은 획(점 등) → 그룹 전체 포기
      case "parabola":
        prims.push({ t: "parabola", p0: s.p0, c: s.c, p1: s.p1 });
        break;
      case "ellipse":
        prims.push({ t: "ellipse", c: s.c, rx: s.rx, ry: s.ry, rot: s.rot });
        break;
      case "curve":
        prims.push({ t: "curve", pts: s.pts, closed: s.closed });
        break;
      case "line":
        prims.push({ t: "line", a: s.a, b: s.b });
        break;
      case "circle":
        prims.push({ t: "circle", c: s.c, r: s.r });
        break;
      case "arc":
        prims.push({ t: "arc", c: s.c, r: s.r, from: s.from, to: s.to });
        break;
      case "polygon": {
        const refined = refinePolygon(s.pts, o);
        prims.push({ t: "polygon", pts: refined.pts, closed: true });
        marks.push(...refined.marks);
        break;
      }
      case "polyline":
        if (isSingleStrokeArrow(s.pts, o)) {
          prims.push({ t: "arrow", a: at(s.pts, 0), b: at(s.pts, 1) });
        } else {
          prims.push({ t: "polygon", pts: s.pts, closed: false });
        }
        break;
    }
  }

  const residual = shapes.reduce((sum, sh) => sum + sh.residual, 0) / shapes.length;
  return toResult(prims, marks, bbox, residual);
}

type WorldPrimitive =
  | { t: "line"; a: V; b: V }
  | { t: "arrow"; a: V; b: V }
  | { t: "circle"; c: V; r: number }
  | { t: "arc"; c: V; r: number; from: number; to: number }
  | { t: "polygon"; pts: V[]; closed: boolean }
  | { t: "parabola"; p0: V; c: V; p1: V }
  | { t: "ellipse"; c: V; rx: number; ry: number; rot: number }
  | { t: "curve"; pts: V[]; closed: boolean };

type WorldMark = { t: "rightAngle"; at: V; dirs: [V, V] };

function shapeSize(s: PieceShape): number {
  switch (s.kind) {
    case "scribble": {
      const xs = s.pts.map((p) => p.x);
      const ys = s.pts.map((p) => p.y);
      return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    }
    case "line":
      return dist(s.a, s.b);
    case "polyline":
    case "polygon":
    case "curve":
      return pathLength(s.pts);
    case "parabola":
      return dist(s.p0, s.c) + dist(s.c, s.p1);
    case "ellipse":
      return 2 * s.rx;
    default:
      return 2 * s.r;
  }
}

/**
 * 화살표 = 긴 선분 + 한쪽 끝의 화살촉.
 * 화살촉은 V자 한 획(꺾은선 3점, 꺾인 점이 끝에 붙음) 또는 짧은 선분 1~2개.
 * 날개는 몸통 쪽으로 젖혀져야 한다(몸통과 이루는 각 < arrowWingDeg).
 */
function collectArrows(pieces: Piece[], out: WorldPrimitive[], o: Tier0Options): void {
  const shafts = pieces
    .filter((p) => p.shape.kind === "line")
    .sort((p, q) => shapeSize(q.shape) - shapeSize(p.shape));

  for (const shaft of shafts) {
    if (shaft.used || shaft.shape.kind !== "line") continue;
    const { a, b } = shaft.shape;
    const len = dist(a, b);
    const tol = 0.2 * len;

    for (const [tip, tail] of [
      [b, a],
      [a, b],
    ] as const) {
      const back = unit(tip, tail); // 촉에서 꼬리 쪽 방향
      const wingOk = (from: V, to: V) => {
        const w = unit(from, to);
        const cos = w.x * back.x + w.y * back.y;
        return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI < o.arrowWingDeg;
      };

      const heads = pieces.filter((p) => {
        if (p === shaft || p.used || shapeSize(p.shape) > o.arrowHeadRatio * len) return false;
        const s = p.shape;
        if (s.kind === "polyline" && s.pts.length === 3) {
          const apex = at(s.pts, 1);
          return dist(apex, tip) < tol && wingOk(apex, at(s.pts, 0)) && wingOk(apex, at(s.pts, 2));
        }
        if (s.kind === "line") {
          if (dist(s.a, tip) < tol) return wingOk(s.a, s.b);
          if (dist(s.b, tip) < tol) return wingOk(s.b, s.a);
        }
        if (s.kind === "scribble" || (s.kind === "curve" && !s.closed)) {
          // 촉 근처에서 시작/통과하고, 몸통 쪽으로 젖혀진 덩어리면 화살촉
          const nearest = Math.min(...s.pts.map((q) => dist(q, tip)));
          const c = {
            x: s.pts.reduce((sum, q) => sum + q.x, 0) / s.pts.length,
            y: s.pts.reduce((sum, q) => sum + q.y, 0) / s.pts.length,
          };
          return nearest < tol && dist(c, tip) > 0 && wingOk(tip, c);
        }
        return false;
      });

      // V자 한 획이나 낙서 촉은 그 자체로 완성된 촉이라 하나만 허용
      const isV = heads.some(
        (h) => h.shape.kind === "polyline" || h.shape.kind === "scribble" || h.shape.kind === "curve",
      );
      if (heads.length === 0 || heads.length > 2 || (isV && heads.length > 1)) continue;

      shaft.used = true;
      for (const h of heads) h.used = true;
      out.push({ t: "arrow", a: tail, b: tip });
      break;
    }
  }
}

/** 한 획으로 그린 화살표: 긴 몸통 → 촉 → 짧게 되돌아온 날개 하나 */
function isSingleStrokeArrow(pts: readonly V[], o: Tier0Options): boolean {
  if (pts.length !== 3) return false;
  const [p0, tip, p2] = [at(pts, 0), at(pts, 1), at(pts, 2)];
  const shaft = dist(p0, tip);
  const wing = dist(tip, p2);
  if (wing > o.arrowHeadRatio * shaft) return false;
  const a = unit(tip, p0);
  const w = unit(tip, p2);
  const deg = (Math.acos(Math.max(-1, Math.min(1, a.x * w.x + a.y * w.y))) * 180) / Math.PI;
  return deg < o.arrowWingDeg;
}

/**
 * 선분 3~6개가 끝점끼리 맞물려 고리를 이루면 다각형 하나로 합친다.
 * (삼각형을 세 번에 나눠 긋는 경우가 흔하다.)
 */
function collectLineLoops(
  pieces: Piece[],
  out: WorldPrimitive[],
  marks: WorldMark[],
  o: Tier0Options,
): void {
  const lines = pieces.filter((p) => !p.used && p.shape.kind === "line");
  if (lines.length < 3 || lines.length > 6) return;

  const segs = lines.map((p) => p.shape as Extract<StrokeShape, { kind: "line" }>);
  const avg = segs.reduce((s, l) => s + dist(l.a, l.b), 0) / segs.length;
  const tol = o.joinRatio * avg;

  // 끝점 2n개를 거리 tol 이내끼리 묶는다.
  const ends = segs.flatMap((l, i) => [
    { p: l.a, seg: i },
    { p: l.b, seg: i },
  ]);
  const cluster = new Array<number>(ends.length).fill(-1);
  let count = 0;
  for (let i = 0; i < ends.length; i++) {
    if (at(cluster, i) !== -1) continue;
    cluster[i] = count;
    for (let j = i + 1; j < ends.length; j++) {
      if (at(cluster, j) === -1 && dist(at(ends, i).p, at(ends, j).p) < tol) cluster[j] = count;
    }
    count++;
  }

  // 고리 조건: 꼭짓점 수 = 선분 수, 모든 꼭짓점에 정확히 2개가 모이고, 한 선분의 두 끝이 같은 꼭짓점이 아님.
  if (count !== segs.length) return;
  const degree = new Array<number>(count).fill(0);
  for (const c of cluster) degree[c] = (degree[c] ?? 0) + 1;
  if (degree.some((d) => d !== 2)) return;
  for (let s = 0; s < segs.length; s++) {
    if (at(cluster, 2 * s) === at(cluster, 2 * s + 1)) return;
  }

  // 고리를 따라가며 선분 순서를 만든다.
  const order: number[] = [0];
  let vertex = at(cluster, 1);
  while (order.length < segs.length) {
    const last = at(order, order.length - 1);
    const next = segs.findIndex(
      (_, s) => s !== last && !order.includes(s) && (at(cluster, 2 * s) === vertex || at(cluster, 2 * s + 1) === vertex),
    );
    if (next === -1) return; // 두 개 이상의 고리로 쪼개져 있음
    order.push(next);
    vertex = at(cluster, 2 * next) === vertex ? at(cluster, 2 * next + 1) : at(cluster, 2 * next);
  }

  const fits = order.map((s) => {
    const l = at(segs, s);
    return fitLine([l.a, l.b]);
  });
  if (fits.some((f) => f === null)) return;
  const fl = fits as LineFit[];
  const pts = fl.map((f, i) => {
    const prev = at(fl, mod(i - 1, fl.length));
    return intersectLines(prev, f) ?? at(segs, at(order, i)).a;
  });

  for (const p of lines) p.used = true;
  const refined = refinePolygon(pts, o);
  out.push({ t: "polygon", pts: refined.pts, closed: true });
  marks.push(...refined.marks);
}

function snapLineEndpoints(lines: Array<Extract<StrokeShape, { kind: "line" }>>, o: Tier0Options): void {
  if (lines.length < 2) return;
  const avg = lines.reduce((s, l) => s + dist(l.a, l.b), 0) / lines.length;
  const tol = o.joinRatio * avg;
  const refs: Array<{ line: (typeof lines)[number]; end: "a" | "b" }> = lines.flatMap((line) => [
    { line, end: "a" as const },
    { line, end: "b" as const },
  ]);
  const done = new Set<number>();
  for (let i = 0; i < refs.length; i++) {
    if (done.has(i)) continue;
    const group = [i];
    for (let j = i + 1; j < refs.length; j++) {
      if (done.has(j) || at(refs, j).line === at(refs, i).line) continue;
      if (dist(at(refs, i).line[at(refs, i).end], at(refs, j).line[at(refs, j).end]) < tol) group.push(j);
    }
    if (group.length < 2) continue;
    const mean = group.reduce(
      (acc, g) => {
        const p = at(refs, g).line[at(refs, g).end];
        return { x: acc.x + p.x / group.length, y: acc.y + p.y / group.length };
      },
      { x: 0, y: 0 },
    );
    for (const g of group) {
      done.add(g);
      const r = at(refs, g);
      r.line[r.end] = mean;
    }
  }
}

// ─────────────────────────────────────────────────────────── 다각형 스냅

/**
 * 손으로 그린 다각형을 "의도한 도형"으로 다듬는다. 회전·크기·위치는 보존한다.
 *  - 세 변이 거의 같으면 정삼각형
 *  - 네 각이 거의 직각이면 직사각형 (거의 정사각형이면 정사각형)
 *  - 삼각형의 한 각이 거의 직각이면 직각 표시
 */
export function refinePolygon(pts: readonly V[], options: Partial<Tier0Options> = {}): { pts: V[]; marks: WorldMark[] } {
  const o = { ...TIER0_DEFAULTS, ...options };
  const n = pts.length;
  const sides = pts.map((p, i) => dist(p, at(pts, mod(i + 1, n))));
  const meanSide = sides.reduce((s, l) => s + l, 0) / n;
  const centroid = {
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    y: pts.reduce((s, p) => s + p.y, 0) / n,
  };
  const orient = Math.sign(polygonArea(pts)) || 1;

  if (n === 3) {
    if (sides.every((l) => Math.abs(l - meanSide) / meanSide < o.equilateralTol)) {
      const first = at(pts, 0);
      const r = pts.reduce((s, p) => s + dist(p, centroid), 0) / 3;
      const phi = Math.atan2(first.y - centroid.y, first.x - centroid.x);
      return {
        pts: [0, 1, 2].map((i) => ({
          x: centroid.x + r * Math.cos(phi + orient * i * ((2 * Math.PI) / 3)),
          y: centroid.y + r * Math.sin(phi + orient * i * ((2 * Math.PI) / 3)),
        })),
        marks: [],
      };
    }
    // 직각 표시를 붙일 거면 각도도 정말 90°여야 한다. 긴 변(방향·길이)을 기준으로 남기고,
    // 짧은 변의 길이는 유지한 채 방향만 수직으로 세운다 — 위치·크기·기울기는 그대로.
    for (let i = 0; i < 3; i++) {
      if (Math.abs(interiorAngle(pts, i) - 90) >= o.rightAngleTolDeg) continue;
      const q = at(pts, i);
      const iPrev = mod(i - 1, 3);
      const iNext = mod(i + 1, 3);
      const prevLonger = dist(q, at(pts, iPrev)) >= dist(q, at(pts, iNext));
      const iLong = prevLonger ? iPrev : iNext;
      const iShort = prevLonger ? iNext : iPrev;
      const u = unit(q, at(pts, iLong));
      const shortLen = dist(q, at(pts, iShort));
      const side = Math.sign((at(pts, iShort).x - q.x) * -u.y + (at(pts, iShort).y - q.y) * u.x) || 1;
      const w = { x: -u.y * side, y: u.x * side };
      const out = [...pts];
      out[iShort] = { x: q.x + w.x * shortLen, y: q.y + w.y * shortLen };
      return {
        pts: out,
        marks: [{ t: "rightAngle", at: q, dirs: prevLonger ? [u, w] : [w, u] }],
      };
    }
    return { pts: [...pts], marks: [] };
  }

  if (n === 4 && [0, 1, 2, 3].every((i) => Math.abs(interiorAngle(pts, i) - 90) < o.rectTolDeg)) {
    // 변 방향의 평균을 90° 주기로 구한다 (각도×4 트릭 — 가로변·세로변을 같은 방향으로 본다)
    let cx = 0;
    let sy = 0;
    for (let i = 0; i < 4; i++) {
      const u = unit(at(pts, i), at(pts, mod(i + 1, 4)));
      const a = Math.atan2(u.y, u.x);
      cx += Math.cos(4 * a);
      sy += Math.sin(4 * a);
    }
    const theta = Math.atan2(sy, cx) / 4;
    const u = { x: Math.cos(theta), y: Math.sin(theta) };
    const v = { x: -Math.sin(theta), y: Math.cos(theta) };
    let w = 0;
    let h = 0;
    for (const p of pts) {
      w += Math.abs((p.x - centroid.x) * u.x + (p.y - centroid.y) * u.y) / 4;
      h += Math.abs((p.x - centroid.x) * v.x + (p.y - centroid.y) * v.y) / 4;
    }
    if (Math.abs(w - h) / Math.max(w, h) < o.squareTol) w = h = (w + h) / 2;

    const corner = (su: number, sv: number): V => ({
      x: centroid.x + u.x * w * su + v.x * h * sv,
      y: centroid.y + u.y * w * su + v.y * h * sv,
    });
    // 첫 꼭짓점은 원래 첫 꼭짓점과 가장 가까운 것, 감김 방향도 원래대로.
    const ring = [corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)];
    const ringOrient = Math.sign(polygonArea(ring));
    const ordered = ringOrient === orient ? ring : [...ring].reverse();
    const start = ordered.reduce(
      (best, p, i) => (dist(p, at(pts, 0)) < dist(at(ordered, best), at(pts, 0)) ? i : best),
      0,
    );
    return { pts: [0, 1, 2, 3].map((i) => at(ordered, mod(start + i, 4))), marks: [] };
  }

  return { pts: [...pts], marks: [] };
}

// ─────────────────────────────────────────────────────────── 정규화

/**
 * 월드 좌표 → 객체 로컬 좌표. 원점 = 그룹 bbox 좌상단, 1 = bbox 긴 변.
 * IR에는 캔버스 픽셀을 저장하지 않는다는 원칙(§8.1)을 지키면서 이동·확대가 transform 하나로 끝난다.
 */
function toResult(
  prims: readonly WorldPrimitive[],
  marks: readonly WorldMark[],
  bbox: BBox,
  residual: number,
): Tier0Result | null {
  if (prims.length === 0) return null;
  const scale = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY, 1);
  const L = (p: V): [number, number] => [(p.x - bbox.minX) / scale, (p.y - bbox.minY) / scale];
  const D = (d: V): [number, number] => [d.x, d.y];

  const primitives: Shape2DPrimitive[] = prims.map((p) => {
    switch (p.t) {
      case "line":
      case "arrow":
        return { t: p.t, a: L(p.a), b: L(p.b) };
      case "circle":
        return { t: "circle", c: L(p.c), r: p.r / scale };
      case "arc":
        return { t: "arc", c: L(p.c), r: p.r / scale, from: p.from, to: p.to };
      case "polygon":
        return { t: "polygon", pts: p.pts.map(L), closed: p.closed };
      case "parabola":
        return { t: "parabola", p0: L(p.p0), c: L(p.c), p1: L(p.p1) };
      case "ellipse":
        return { t: "ellipse", c: L(p.c), rx: p.rx / scale, ry: p.ry / scale, rot: p.rot };
      case "curve":
        return { t: "curve", pts: p.pts.map(L), closed: p.closed };
    }
  });
  const irMarks: Shape2DMark[] = marks.map((m) => ({ t: m.t, at: L(m.at), dirs: [D(m.dirs[0]), D(m.dirs[1])] }));

  const ir: SceneIR = {
    version: IR_VERSION,
    kind: "shape2d",
    source: "local",
    confidence: Math.max(0.5, Math.min(0.97, 0.97 - residual * 3)),
    data: irMarks.length > 0 ? { primitives, marks: irMarks } : { primitives },
  };
  return { ir, transform: { x: bbox.minX, y: bbox.minY, scale } };
}
