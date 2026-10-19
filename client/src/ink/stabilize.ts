import type { Point } from "./types";

/**
 * 흔들림 보정 (손떨림 안정화) — "줄로 끄는 붓" 방식 (lazy brush) + 속도 적응.
 *
 * 그려지는 점은 펜촉에 길이 radius짜리 줄로 매달려 있다. 펜촉이 줄 길이 안에서 떨리면 선은 움직이지 않고,
 * 줄이 팽팽해질 때만 펜촉 쪽으로 끌려간다. 그래서
 *   - radius보다 작은 손떨림은 완전히 사라지고 (지그재그 → 매끈한 곡선)
 *   - 샘플 간격(60~240Hz)과 무관하게 같은 손맛이다 (시간이 아니라 거리 기준).
 * 줄을 지난 점은 한 번 더 "거리 기준 평균"으로 다듬는다 — 줄보다 큰 굵은 떨림도 완만해진다.
 *
 * 속도 적응 (태블릿 실기 피드백: "빨리 쓰면 느리고 흔들린다"):
 *   빨리 쓸 때는 손떨림이 의미가 없다 — 줄 길이를 0 쪽으로 줄여 선이 펜촉에 바로 붙게 한다.
 *   천천히 그을 때만 원래 길이로 다듬는다. 속도는 최근 40ms 동안 실제로 간 거리로 잰다
 *   (떨림은 제자리 왕복이라 이 창에서 상쇄된다 — 떨림이 빠르다고 보정이 꺼지지 않는다).
 * 줄 길이만큼 선이 늦게 따라오므로, 펜을 뗄 때 마지막 실제 점까지 이어 준다 (finish).
 */

/** 이 화면 속도(px/ms) 이상이면 보정을 끈다 — 빠른 필기 ≈ 1~3 px/ms */
const FULL_SPEED = 2;
/** 속도를 재는 시간 창 (ms) */
const WINDOW_MS = 40;

export function createStabilizer(
  radius: number,
  /** 월드 → 화면 배율 (확대 중에도 손에 느껴지는 속도로 판단) */
  zoom = 1,
): {
  push(raw: Point): Point | null;
  finish(raw: Point | undefined): Point[];
  /** 지금 줄 길이 (빠르게 쓰는 중이면 0에 가깝다) — 예측 점을 붙여도 되는지 판단 */
  currentRadius(): number;
} {
  const R0 = Math.max(0, radius);
  /** 줄 끝 (펜촉에 끌려가는 점) */
  let prev: Point | null = null;
  /** 실제로 그리는 점 (줄 끝을 한 번 더 다듬은 것) */
  let out: Point | null = null;
  /** 최근 실제 펜촉 (속도 계산용) */
  const recent: Point[] = [];
  let R = R0;

  const speed = (raw: Point): number => {
    recent.push(raw);
    while (recent.length > 2 && raw.t - (recent[0] as Point).t > WINDOW_MS) recent.shift();
    const first = recent[0] as Point;
    const dt = raw.t - first.t;
    if (dt <= 0) return 0;
    return (Math.hypot(raw.x - first.x, raw.y - first.y) * zoom) / dt;
  };

  return {
    push(raw) {
      if (!prev || !out || R0 === 0) {
        prev = raw;
        out = raw;
        recent.push(raw);
        return raw;
      }
      const v = speed(raw);
      R = R0 * Math.max(0, 1 - v / FULL_SPEED);
      if (R < 0.05) {
        // 빠른 필기: 보정 없이 펜촉 쪽으로 (늦게 따라오던 만큼은 다음 몇 점에서 자연스럽게 따라잡는다)
        const next: Point = { x: out.x + (raw.x - out.x) * 0.85, y: out.y + (raw.y - out.y) * 0.85, p: raw.p, t: raw.t };
        prev = raw;
        out = next;
        return next;
      }
      const dx = raw.x - prev.x;
      const dy = raw.y - prev.y;
      const d = Math.hypot(dx, dy);
      if (d <= R) return null;
      const f = (d - R) / d;
      const rope: Point = { x: prev.x + dx * f, y: prev.y + dy * f, p: raw.p, t: raw.t };
      const a = 1 - Math.exp(-(d - R) / R);
      const next: Point = { x: out.x + (rope.x - out.x) * a, y: out.y + (rope.y - out.y) * a, p: raw.p, t: raw.t };
      prev = rope;
      out = next;
      return next;
    },
    /** 줄 길이만큼 뒤처진 끝을 실제 펜촉까지 몇 점으로 부드럽게 잇는다 */
    finish(raw) {
      if (!raw || !out || R0 === 0) return [];
      const gap = Math.hypot(raw.x - out.x, raw.y - out.y);
      if (gap < 0.5) return [];
      const n = Math.min(8, Math.ceil(gap / 2));
      const from = out;
      return Array.from({ length: n }, (_, i) => {
        const f = (i + 1) / n;
        return { x: from.x + (raw.x - from.x) * f, y: from.y + (raw.y - from.y) * f, p: raw.p, t: raw.t };
      });
    },
    currentRadius() {
      return R;
    },
  };
}
