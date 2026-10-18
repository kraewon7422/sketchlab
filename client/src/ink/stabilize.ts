import type { Point } from "./types";

/**
 * 흔들림 보정 (손떨림 안정화) — "줄로 끄는 붓" 방식 (lazy brush).
 *
 * 그려지는 점은 펜촉에 길이 radius짜리 줄로 매달려 있다. 펜촉이 줄 길이 안에서 떨리면 선은 움직이지 않고,
 * 줄이 팽팽해질 때만 펜촉 쪽으로 끌려간다. 그래서
 *   - radius보다 작은 손떨림은 완전히 사라지고 (지그재그 → 매끈한 곡선)
 *   - 샘플 간격(60~240Hz)과 무관하게 같은 손맛이다 (시간이 아니라 거리 기준).
 * 줄을 지난 점은 한 번 더 "거리 기준 평균"으로 다듬는다 — 줄보다 큰 굵은 떨림도 완만해진다
 * (움직인 거리 / 줄 길이 만큼만 새 점 쪽으로: 역시 샘플 간격과 무관).
 * 줄 길이만큼 선이 늦게 따라오므로, 펜을 뗄 때 마지막 실제 점까지 이어 준다 (finish).
 */
export function createStabilizer(radius: number): {
  /** 새 펜촉 위치 → 그릴 점. 줄이 느슨해 선이 안 움직이면 null */
  push(raw: Point): Point | null;
  finish(raw: Point | undefined): Point[];
} {
  const R = Math.max(0, radius);
  /** 줄 끝 (펜촉에 끌려가는 점) */
  let prev: Point | null = null;
  /** 실제로 그리는 점 (줄 끝을 한 번 더 다듬은 것) */
  let out: Point | null = null;

  return {
    push(raw) {
      if (!prev || !out || R === 0) {
        prev = raw;
        out = raw;
        return raw;
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
      if (!raw || !out || R === 0) return [];
      const gap = Math.hypot(raw.x - out.x, raw.y - out.y);
      if (gap < 0.5) return [];
      const n = Math.min(8, Math.ceil(gap / 2));
      const from = out;
      return Array.from({ length: n }, (_, i) => {
        const f = (i + 1) / n;
        return { x: from.x + (raw.x - from.x) * f, y: from.y + (raw.y - from.y) * f, p: raw.p, t: raw.t };
      });
    },
  };
}
