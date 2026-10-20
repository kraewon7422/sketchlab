import { useId, type ReactElement } from "react";
import { centerlinePath } from "../ink/smoothOutline";
import { asPoints, tapePath, type TapeData, type TapePattern } from "../ink/tape";
import type { ObjectItem } from "../ink/types";
import { penOpts } from "./theme";

/**
 * 마스킹 테이프 — 객체 층(HTML) 맨 위에 그려서 손글씨·도형·그래프·구조식을 모두 가린다.
 * 톡 치면 벗겨져(거의 투명 + 점선 테두리) 아래가 보이고, 다시 톡 치면 붙는다 (PointerCanvas.handleTap).
 */
export function TapeObject({ item }: { item: ObjectItem }): ReactElement | null {
  if (item.ir.kind !== "tape") return null;
  const d = item.ir.data;
  if (d.pts) return <FreeTape item={item} data={d} />;
  const { x, y, scale } = item.transform;
  const len = d.len * scale;
  const h = d.width * scale;
  return (
    <div
      data-overlay-id={item.id}
      aria-label={d.revealed ? "벗긴 테이프" : "테이프"}
      style={{
        position: "absolute",
        left: x,
        top: y - h / 2,
        width: len,
        height: h,
        transformOrigin: `0 ${h / 2}px`,
        transform: `rotate(${d.angle}rad)`,
        boxSizing: "border-box",
        borderRadius: 2,
        background: d.revealed ? "transparent" : tapeBackground(d.color, d.pattern ?? "stripes"),
        border: d.revealed ? `1.5px dashed ${d.color}` : "none",
        boxShadow: d.revealed ? "none" : "0 1px 2px rgba(26,26,26,0.18)",
        opacity: 1,
        pointerEvents: "none",
      }}
    >
      {d.revealed && <div style={{ position: "absolute", inset: 0, background: d.color, opacity: penOpts.tapeRevealedOpacity }} />}
    </div>
  );
}

/** 테이프 무늬 — CSS 배경만으로 (내보내기 그림에도 그대로 나간다). 패널 미리보기도 같은 함수 */
export function tapeBackground(color: string, pattern: TapePattern): string {
  const w = "rgba(255,255,255,0.32)";
  switch (pattern) {
    case "plain":
      return color;
    case "stripes":
      return `repeating-linear-gradient(115deg, ${w} 0 6px, rgba(255,255,255,0) 6px 14px), ${color}`;
    case "dots":
      return `radial-gradient(circle, ${w} 0 2.5px, rgba(255,255,255,0) 3px) 0 0 / 12px 12px, ${color}`;
    case "grid":
      return `linear-gradient(${w} 1px, rgba(255,255,255,0) 1px) 0 0 / 10px 10px, linear-gradient(90deg, ${w} 1px, rgba(255,255,255,0) 1px) 0 0 / 10px 10px, ${color}`;
  }
}

/** 자유 테이프 — 그은 길을 따라 폭 width인 띠 (무늬는 SVG pattern으로, 내보내기에도 그대로) */
function FreeTape({ item, data: d }: { item: ObjectItem; data: TapeData }): ReactElement {
  const id = `tape-${useId().replace(/:/g, "")}`;
  const b = item.bbox;
  const w = d.width * item.transform.scale;
  const path = (tapePath(d, item.transform) ?? []).map((p) => ({ x: p.x - b.minX, y: p.y - b.minY }));
  const pattern = d.pattern ?? "stripes";
  return (
    <svg
      data-overlay-id={item.id}
      aria-label={d.revealed ? "벗긴 테이프" : "테이프"}
      width={b.maxX - b.minX}
      height={b.maxY - b.minY}
      style={{ position: "absolute", left: b.minX, top: b.minY, overflow: "visible", pointerEvents: "none" }}
    >
      {!d.revealed && pattern !== "plain" && (
        <defs>
          <TapePatternDef id={id} color={d.color} pattern={pattern} />
        </defs>
      )}
      <path
        d={centerlinePath(asPoints(path))}
        fill="none"
        stroke={d.revealed || pattern === "plain" ? d.color : `url(#${id})`}
        strokeWidth={w}
        strokeLinejoin="round"
        strokeLinecap="butt"
        opacity={d.revealed ? penOpts.tapeRevealedOpacity : 1}
      />
    </svg>
  );
}

/** 테이프 무늬 (CSS tapeBackground와 같은 모양을 SVG로) */
export function TapePatternDef({ id, color, pattern }: { id: string; color: string; pattern: Exclude<TapePattern, "plain"> }): ReactElement {
  const w = "rgba(255,255,255,0.32)";
  if (pattern === "stripes") {
    return (
      <pattern id={id} width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(25)">
        <rect width={14} height={14} fill={color} />
        <rect width={6} height={14} fill={w} />
      </pattern>
    );
  }
  if (pattern === "dots") {
    return (
      <pattern id={id} width={12} height={12} patternUnits="userSpaceOnUse">
        <rect width={12} height={12} fill={color} />
        <circle cx={6} cy={6} r={2.5} fill={w} />
      </pattern>
    );
  }
  return (
    <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse">
      <rect width={10} height={10} fill={color} />
      <path d="M0 0.5H10M0.5 0V10" stroke={w} strokeWidth={1} />
    </pattern>
  );
}
