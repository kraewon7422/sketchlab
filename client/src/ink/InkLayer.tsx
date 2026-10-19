import { memo } from "react";
import { ink, penOpts, theme } from "../render/theme";
import { smoothStrokePath } from "./smoothOutline";
import type { InkItem, Stroke } from "./types";

/**
 * 확정된 잉크를 그린다.
 *
 * memo가 핵심이다. immer는 실제로 바뀐 항목에만 새 참조를 주므로,
 * 획을 하나 추가해도 기존 그룹들은 참조가 그대로여서 리렌더되지 않는다.
 * 이게 없으면 획이 쌓일수록 매 획마다 화면 전체를 다시 그리게 된다.
 */

export const InkItemView = memo(function InkItemView({ item }: { item: InkItem }) {
  // data-ink-id: 선택한 손글씨를 이미지로 복사할 때 화면에서 찾는 표식
  return (
    <g data-ink-id={item.id}>
      <InkStrokes strokes={item.strokes} />
    </g>
  );
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
  // 외곽선 하나짜리 매끈한 획 (smoothOutline.ts — v1의 조각 겹치기는 고해상도에서 흐려 보였다)
  const d = smoothStrokePath(stroke.points, { baseWidth: stroke.width ?? ink.width });
  const highlighter = stroke.tool === "highlighter";

  return (
    <path
      d={d}
      fill={stroke.color ?? theme.color.ink}
      fillRule="nonzero"
      shapeRendering="geometricPrecision"
      opacity={highlighter ? penOpts.highlightOpacity : undefined}
      style={highlighter ? { mixBlendMode: "multiply" } : undefined}
    />
  );
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
      data-export-skip
    />
  );
}
