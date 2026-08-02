import { bboxIntersects, inflateBBox } from "./geometry";
import type { Stroke } from "./types";

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
}

export const DEFAULT_GROUPING: Required<GroupingOptions> = {
  maxGapMs: 2000,
  inflateRatio: 0.2,
  minPad: 12,
};

export function shouldJoinGroup(
  previous: Stroke,
  next: Stroke,
  options: GroupingOptions = {},
): boolean {
  const { maxGapMs, inflateRatio, minPad } = { ...DEFAULT_GROUPING, ...options };

  const gap = next.endedAt - previous.endedAt;
  // 시각이 거꾸로 들어오는 경우(시계 보정 등)는 같은 그룹으로 보지 않는다.
  if (gap < 0 || gap >= maxGapMs) return false;

  return bboxIntersects(
    inflateBBox(previous.bbox, inflateRatio, minPad),
    inflateBBox(next.bbox, inflateRatio, minPad),
  );
}
