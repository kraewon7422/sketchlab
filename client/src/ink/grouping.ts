import { bboxIntersects } from "./geometry";
import type { BBox, Stroke } from "./types";

/**
 * 스트로크 자동 그룹핑 (§5.2).
 *
 *   1. 올가미/탭 명시 선택이 항상 우선  ← 스토어가 처리
 *   2. 자동: 직전 스트로크와 시간 <2s AND bbox 20% 팽창 교차 → 같은 그룹
 *
 * "직전 스트로크"와 비교하는 이유(그룹 전체 bbox가 아니라):
 * y = x^2 - 3 처럼 가로로 이어지는 필기는 글자마다 직전 글자와만 붙어도 사슬처럼
 * 이어져 하나의 그룹이 된다. 반면 그룹 전체 bbox를 쓰면 상자가 계속 커져서
 * 화면 반대편에 새로 그린 낙서까지 빨아들인다.
 *
 * thinReach가 필요한 이유 (실측: 손글씨 "H₂O"가 두 묶음으로 갈라져 AI가 "-|₂O"를 받았다):
 * 가늘고 긴 획(H의 세로획, "1", "-")은 비율 팽창이 거의 0이고 minPad(12px)만 남는다.
 * 높이 40px 글자의 두 세로획이 28px 떨어져 있으면 12+12 < 28 이라 서로 못 닿는다.
 * 그래서 가는 획은 옆으로 "긴 변 × thinReach"만큼 손을 뻗는다 — 글자 크기에 비례.
 * 둥근 획(원·글자 덩어리)은 그대로라, 따로 그린 도형끼리 괜히 묶이지 않는다.
 *
 * minPad가 필요한 이유:
 * "1", "l", "ㅣ" 같은 획은 bbox 폭이 사실상 0이다. 비율(20%)만 적용하면 0을 아무리
 * 부풀려도 0이라 옆 글자와 절대 교차하지 않는다. 그래서 최소 절대 여백을 함께 준다.
 */

export interface GroupingOptions {
  /** 이보다 오래 쉬었으면 새 그룹 (ms) */
  maxGapMs?: number;
  /** bbox 팽창 비율 */
  inflateRatio?: number;
  /** bbox 최소 팽창량 (px) — 가늘고 긴 획 대응 */
  minPad?: number;
  /** 가는 획(긴 변이 짧은 변의 3배 이상)이 옆으로 뻗는 거리 = 긴 변 × 이 값 */
  thinReach?: number;
}

export const DEFAULT_GROUPING: Required<GroupingOptions> = {
  maxGapMs: 2000,
  inflateRatio: 0.2,
  minPad: 12,
  thinReach: 0.4,
};

/** 획 bbox를 그룹핑용으로 부풀린다 */
export function reachBox(box: BBox, ratio: number, minPad: number, thinReach: number): BBox {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  let padX = Math.max(w * ratio, minPad);
  let padY = Math.max(h * ratio, minPad);
  if (h >= 3 * w) padX = Math.max(padX, h * thinReach); // 세로로 긴 획 → 옆으로
  if (w >= 3 * h) padY = Math.max(padY, w * thinReach); // 가로로 긴 획 → 위아래로
  return { minX: box.minX - padX, minY: box.minY - padY, maxX: box.maxX + padX, maxY: box.maxY + padY };
}

export function shouldJoinGroup(
  previous: Stroke,
  next: Stroke,
  options: GroupingOptions = {},
): boolean {
  const { maxGapMs, inflateRatio, minPad, thinReach } = { ...DEFAULT_GROUPING, ...options };

  const gap = next.endedAt - previous.endedAt;
  // 시각이 거꾸로 들어오는 경우(시계 보정 등)는 같은 그룹으로 보지 않는다.
  if (gap < 0 || gap >= maxGapMs) return false;

  return bboxIntersects(
    reachBox(previous.bbox, inflateRatio, minPad, thinReach),
    reachBox(next.bbox, inflateRatio, minPad, thinReach),
  );
}
