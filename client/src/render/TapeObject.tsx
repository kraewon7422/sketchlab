import type { ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { penOpts } from "./theme";

/**
 * 마스킹 테이프 — 객체 층(HTML) 맨 위에 그려서 손글씨·도형·그래프·구조식을 모두 가린다.
 * 톡 치면 벗겨져(거의 투명 + 점선 테두리) 아래가 보이고, 다시 톡 치면 붙는다 (PointerCanvas.handleTap).
 */
export function TapeObject({ item }: { item: ObjectItem }): ReactElement | null {
  if (item.ir.kind !== "tape") return null;
  const d = item.ir.data;
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
        // 종이테이프 결 — 아주 옅은 사선 무늬
        background: d.revealed
          ? "transparent"
          : `repeating-linear-gradient(115deg, rgba(255,255,255,0.16) 0 6px, rgba(255,255,255,0) 6px 14px), ${d.color}`,
        border: d.revealed ? `1.5px dashed ${d.color}` : "none",
        boxShadow: d.revealed ? "none" : "0 1px 2px rgba(26,26,26,0.18)",
        opacity: d.revealed ? 1 : 0.97,
        pointerEvents: "none",
      }}
    >
      {d.revealed && <div style={{ position: "absolute", inset: 0, background: d.color, opacity: penOpts.tapeRevealedOpacity }} />}
    </div>
  );
}
