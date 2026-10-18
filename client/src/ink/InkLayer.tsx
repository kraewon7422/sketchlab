import { memo } from "react";
import { ink, theme } from "../render/theme";
import { strokeOutlinePath } from "./outline";
import { simplifyRDP } from "./simplify";
import type { InkItem, Stroke } from "./types";

/**
 * 확정된 잉크를 그린다.
 *
 * memo가 핵심이다. immer는 실제로 바뀐 항목에만 새 참조를 주므로,
 * 획을 하나 추가해도 기존 그룹들은 참조가 그대로여서 리렌더되지 않는다.
 * 이게 없으면 획이 쌓일수록 매 획마다 화면 전체를 다시 그리게 된다.
 */

export const InkItemView = memo(function InkItemView({ item }: { item: InkItem }) {
  return <InkStrokes strokes={item.strokes} />;
});

/** 획 묶음 그리기 — 잉크 그룹과, 인식된 객체의 원본(교체 애니메이션·미지원 kind)이 같이 쓴다. */
export function InkStrokes({ strokes }: { strokes: readonly Stroke[] }) {
  return (
    <g>
      {strokes.map((stroke) => (
        <StrokeView key={stroke.id} stroke={stroke} />
      ))}
    </g>
  );
}

const StrokeView = memo(function StrokeView({ stroke }: { stroke: Stroke }) {
  // 원본 points는 그대로 두고 그리기용으로만 단순화한다 (§12.4).
  const d = strokeOutlinePath(simplifyRDP(stroke.points, ink.simplifyEpsilon), {
    baseWidth: ink.width,
  });

  return <path d={d} fill={theme.color.ink} fillRule="nonzero" />;
});

/**
 * 활성 그룹 표시 (§5.2 — 그룹 경계는 항상 은은하게 보여야 한다).
 * 사용자가 "✨를 누르면 무엇이 정리될지"를 누르기 전에 알 수 있어야 한다.
 */
export function GroupHint({ item }: { item: InkItem }) {
  const pad = ink.groupHintPad;
  const { minX, minY, maxX, maxY } = item.bbox;

  return (
    <rect
      x={minX - pad}
      y={minY - pad}
      width={maxX - minX + pad * 2}
      height={maxY - minY + pad * 2}
      rx={theme.radius.s}
      fill={theme.color.groupHint}
      pointerEvents="none"
    />
  );
}
