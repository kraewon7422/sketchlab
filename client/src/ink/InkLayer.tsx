import { memo, useMemo, useState } from "react";
import { useStore } from "zustand";
import { ink, theme } from "../render/theme";
import { viewportStore } from "../store/viewport";
import { BUILTIN, customBrush, useBrushes } from "./brushLibrary";
import { isRasterBrush, strokeAttrs, strokeD } from "./brushes";
import { renderStampStroke } from "./stampBrush";
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

/** 확대 단계 — 이 단계가 바뀔 때만 도장 브러시 그림을 다시 만든다 */
const zoomBucket = (k: number) => (k <= 1.25 ? 1 : k <= 2.5 ? 2 : k <= 5 ? 4 : 8);
const hashId = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** 연필 · 수채화 · 가져온 브러시: 도장 엔진으로 그린 그림 (확대하면 더 촘촘히 다시) */
const RasterStrokeView = memo(function RasterStrokeView({ stroke }: { stroke: Stroke }) {
  const bucket = useStore(viewportStore, (s) => zoomBucket(s.k));
  useBrushes(); // 가져온 브러시가 바뀌면 다시
  const [tick, setTick] = useState(0);
  const brush = stroke.brush === "custom" ? customBrush(stroke.stamp) : BUILTIN[stroke.brush ?? ""];
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  const r = useMemo(
    () => (brush ? renderStampStroke(stroke.points, brush, stroke.color ?? theme.color.ink, stroke.width ?? ink.width, stroke.brush === "pencil" ? (stroke.opacity ?? 0.9) : 1, bucket * dpr * 1.5, hashId(stroke.id), () => setTick((n) => n + 1)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stroke, brush, bucket, dpr, tick],
  );
  if (!r) return <VectorStrokeView stroke={stroke} />;
  return <image href={r.url} x={r.x} y={r.y} width={r.w} height={r.h} preserveAspectRatio="none" style={brush?.wet ? { mixBlendMode: "multiply" } : undefined} />;
});

const StrokeView = memo(function StrokeView({ stroke }: { stroke: Stroke }) {
  if (isRasterBrush({ ...stroke })) return <RasterStrokeView stroke={stroke} />;
  return <VectorStrokeView stroke={stroke} />;
});

const VectorStrokeView = memo(function VectorStrokeView({ stroke }: { stroke: Stroke }) {
  // 외곽선 하나짜리 매끈한 획 (smoothOutline.ts) — 펜 종류·선 모양은 brushes.ts
  const look = { ...stroke, width: stroke.width ?? ink.width };
  const { mixBlendMode, ...attrs } = strokeAttrs(look);
  return (
    <path
      d={strokeD(stroke.points, look)}
      {...attrs}
      fillRule="nonzero"
      shapeRendering="geometricPrecision"
      style={mixBlendMode ? { mixBlendMode } : undefined}
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
