import { signedArea } from "./geometry";
import type { Point } from "./types";

/**
 * 가변 굵기 획을 "채워진 도형"으로 만든다.
 *
 * 왜 stroke-width 가 아니라 fill 인가:
 * SVG의 stroke-width는 path 하나에 값 하나뿐이라 필압에 따라 굵기가 변하는 획을
 * 표현할 수 없다. 구간마다 path를 쪼개면 획 하나가 수백 엘리먼트가 되어 느리다.
 * 그래서 획의 외곽선을 직접 만들어 path 하나를 fill 한다.
 *
 * 구조: 인접한 두 점 사이의 사다리꼴 + 꺾이는 지점의 원(다각형 근사)을 겹쳐 놓고
 * fill-rule:nonzero 로 합집합처럼 보이게 한다.
 *
 * ⚠️ 핵심 불변식: 모든 서브패스의 감김 방향이 같아야 한다.
 *    방향이 섞이면 nonzero 규칙에서 겹친 영역이 서로 상쇄돼 획 한가운데가 뚫린다.
 *    획이 되돌아오는 순간(ㄱ, ㄴ, 8 같은 글자) 사다리꼴의 진행 방향이 뒤집히므로
 *    이건 이론적 우려가 아니라 실제로 발생한다. 아래에서 부호를 강제 통일하고
 *    테스트로 고정한다.
 *
 * 서브패스가 서로 독립적이라는 성질 덕에 **증분 생성**이 가능하다.
 * 그리는 중에는 새로 들어온 구간만 만들어 path 문자열 뒤에 이어 붙이면 되므로
 * (segmentOutline), 획이 길어져도 프레임당 비용이 일정하다.
 * 전체를 매 프레임 다시 만들면 긴 획에서 확실히 버벅인다.
 */

export interface OutlineOptions {
  /** 필압 0.5(=필압 미지원 입력)일 때의 획 굵기 px */
  baseWidth: number;
  /** 굴곡이 이 각도(라디안)를 넘으면 그 지점에 이음새 원을 넣는다 */
  jointAngle?: number;
}

export type Subpath = Array<{ x: number; y: number }>;

const CIRCLE_SEGMENTS = 12;
const DEFAULT_JOINT_ANGLE = 0.25;

/** 필압 → 반지름 배율. p=0.5에서 정확히 1배가 되도록 맞춰 두었다. */
function radiusAt(pressure: number, halfWidth: number): number {
  const clamped = pressure < 0 ? 0 : pressure > 1 ? 1 : pressure;
  const scale = Math.min(1.5, Math.max(0.35, 0.5 + clamped));
  return halfWidth * scale;
}

/**
 * 두 점을 잇는 사다리꼴. 두 점이 같은 자리면 만들 수 없으므로 null.
 * (펜을 멈춘 채 대고 있으면 같은 좌표가 연속으로 들어온다 — 실제로 생긴다.)
 */
function quadBetween(a: Point, b: Point, halfWidth: number): Subpath | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;

  const nx = -dy / len;
  const ny = dx / len;
  const ra = radiusAt(a.p, halfWidth);
  const rb = radiusAt(b.p, halfWidth);

  return [
    { x: a.x + nx * ra, y: a.y + ny * ra },
    { x: b.x + nx * rb, y: b.y + ny * rb },
    { x: b.x - nx * rb, y: b.y - ny * rb },
    { x: a.x - nx * ra, y: a.y - ny * ra },
  ];
}

function circle(cx: number, cy: number, r: number): Subpath {
  const pts: Subpath = [];
  for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
    const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  return pts;
}

/** 부호 있는 넓이가 양수가 되도록(방향 통일) 필요하면 뒤집는다. */
function normalizeWinding(pts: Subpath): Subpath {
  return signedArea(pts) < 0 ? [...pts].reverse() : pts;
}

/**
 * 그리는 중에 쓰는 증분 조각: 새 구간의 사다리꼴 + 끝점의 둥근 캡.
 * 이것만 이어 붙이면 획이 자라는 것처럼 보인다.
 */
export function segmentOutline(a: Point, b: Point, options: OutlineOptions): Subpath[] {
  const halfWidth = options.baseWidth / 2;
  const subpaths: Subpath[] = [];

  const quad = quadBetween(a, b, halfWidth);
  if (quad) subpaths.push(quad);

  subpaths.push(circle(b.x, b.y, radiusAt(b.p, halfWidth)));

  return subpaths.map(normalizeWinding);
}

/** 획 시작점의 점(둥근 캡). 첫 점을 찍은 순간부터 잉크가 보이게 한다. */
export function dotOutline(p: Point, options: OutlineOptions): Subpath[] {
  return [circle(p.x, p.y, radiusAt(p.p, options.baseWidth / 2))].map(normalizeWinding);
}

/**
 * 완성된 획 전체의 외곽선. 커밋된 획을 그릴 때 쓴다.
 * 전부 부호 있는 넓이가 양수(같은 방향)로 정규화되어 나온다.
 */
export function strokeOutline(points: readonly Point[], options: OutlineOptions): Subpath[] {
  const halfWidth = options.baseWidth / 2;
  const jointAngle = options.jointAngle ?? DEFAULT_JOINT_ANGLE;
  const subpaths: Subpath[] = [];

  const first = points[0];
  if (!first) return subpaths;

  // 점 하나 = 점 찍기.
  if (points.length === 1) {
    return [circle(first.x, first.y, radiusAt(first.p, halfWidth))].map(normalizeWinding);
  }

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const quad = quadBetween(a, b, halfWidth);
    if (quad) subpaths.push(quad);
  }

  // 양 끝은 둥근 캡. 획이 뭉툭하게 잘려 보이지 않게 한다.
  const last = points[points.length - 1];
  subpaths.push(circle(first.x, first.y, radiusAt(first.p, halfWidth)));
  if (last) subpaths.push(circle(last.x, last.y, radiusAt(last.p, halfWidth)));

  // 많이 꺾이는 지점에만 이음새 원. 모든 점에 넣으면 path가 불필요하게 커진다.
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (!prev || !cur || !next) continue;

    const a1 = Math.atan2(cur.y - prev.y, cur.x - prev.x);
    const a2 = Math.atan2(next.y - cur.y, next.x - cur.x);
    let diff = Math.abs(a2 - a1);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;

    if (diff > jointAngle) {
      subpaths.push(circle(cur.x, cur.y, radiusAt(cur.p, halfWidth)));
    }
  }

  return subpaths.map(normalizeWinding);
}

/** 서브패스 목록 → SVG path의 d 문자열 */
export function subpathsToPathData(subpaths: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>): string {
  const parts: string[] = [];

  for (const sub of subpaths) {
    const head = sub[0];
    if (!head || sub.length < 3) continue;

    let d = `M${round(head.x)},${round(head.y)}`;
    for (let i = 1; i < sub.length; i++) {
      const p = sub[i];
      if (p) d += `L${round(p.x)},${round(p.y)}`;
    }
    parts.push(`${d}Z`);
  }

  return parts.join("");
}

export function strokeOutlinePath(points: readonly Point[], options: OutlineOptions): string {
  return subpathsToPathData(strokeOutline(points, options));
}

/** path 문자열 크기를 줄인다. 서브픽셀 정밀도는 눈에 보이지 않는다. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
