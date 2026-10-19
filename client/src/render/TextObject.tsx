import { useMemo, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { useTextEdit } from "../store/textEdit";
import { sanitizeHtml } from "../ui/richText";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";

/**
 * 글 상자 — 직접 친 서식 있는 글(html) 또는 손글씨에서 알아본 글자 (쓴 크기·색 그대로).
 * 편집 중인 상자는 편집기가 대신 보여 준다.
 */
export function TextObject({ item }: { item: ObjectItem }): ReactElement | null {
  const editingId = useTextEdit((s) => s.session?.id ?? null);
  const data = item.ir.kind === "text" ? item.ir.data : null;
  // 화면에 넣기 직전에 한 번 더 정제한다 (저장소에서 온 값도 믿지 않는다)
  const html = useMemo(() => (data?.html ? sanitizeHtml(data.html) : null), [data?.html]);
  if (!data || editingId === item.id) return null;
  const fresh = isFresh(item.id);
  return (
    <div
      data-overlay-id={item.id}
      className={`sl-rich${fresh ? " sl-fade-in" : ""}`}
      style={{
        position: "absolute",
        left: item.transform.x,
        top: item.transform.y,
        fontSize: data.fontSize ?? 20,
        lineHeight: html ? 1.45 : 1.35,
        color: data.color ?? theme.color.ink,
        fontFamily: theme.font.ui,
        whiteSpace: html ? "pre-wrap" : "pre",
        overflowWrap: html ? "anywhere" : undefined,
        width: html && data.width ? data.width : undefined,
        padding: html ? "4px 6px" : undefined,
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
      {...(html ? { dangerouslySetInnerHTML: { __html: html } } : { children: data.text })}
    />
  );
}
