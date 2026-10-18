import type { ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";

/** 손글씨에서 알아본 글자 — 깔끔한 활자로, 쓴 크기·색 그대로 (P3b) */
export function TextObject({ item }: { item: ObjectItem }): ReactElement | null {
  if (item.ir.kind !== "text") return null;
  const { text, fontSize, color } = item.ir.data;
  const fresh = isFresh(item.id);
  return (
    <div
      data-overlay-id={item.id}
      className={fresh ? "sl-fade-in" : undefined}
      style={{
        position: "absolute",
        left: item.transform.x,
        top: item.transform.y,
        fontSize: fontSize ?? 22,
        lineHeight: 1.35,
        color: color ?? theme.color.ink,
        fontFamily: theme.font.ui,
        whiteSpace: "pre",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}
