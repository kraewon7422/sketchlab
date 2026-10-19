import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { useEffect, useLayoutEffect, useRef, type ReactElement } from "react";
import { theme } from "../render/theme";
import { sessionStore } from "../store/session";
import { textEditStore, useTextEdit, type TextEditSession } from "../store/textEdit";
import { notify, plainText, registerEditor, rememberSelection, sanitizeHtml, toggleCheckAt } from "./richText";

/**
 * 글 상자 편집기 — 페이지 위에 바로 글을 쓴다 (객체 층 안이라 이동·확대를 그대로 따른다).
 * 다른 곳을 누르거나 다른 도구로 바꾸면 저장되고, 비어 있으면 상자가 사라진다.
 */

/** 편집 중인 글 상자를 저장하고 닫는다 (어디서든 부를 수 있게 모듈 함수로) */
export function commitTextEdit(): void {
  const s = textEditStore.getState().session;
  const el = document.querySelector<HTMLElement>("[data-text-editor]");
  textEditStore.getState().close();
  registerEditor(null);
  if (!s || !el) return;
  const html = sanitizeHtml(el.innerHTML);
  const text = plainText(html);
  const state = sessionStore.getState();
  if (!text) {
    if (s.id) state.removeItems([s.id]);
    return;
  }
  // offsetWidth는 정수로 내림된다 — 2px 여유가 없으면 저장된 상자에서 마지막 글자가 다음 줄로 넘어간다
  const w = el.offsetWidth + 2;
  const h = el.offsetHeight;
  const bbox = { minX: s.x, minY: s.y, maxX: s.x + w, maxY: s.y + h };
  const ir: SceneIR = { version: IR_VERSION, confidence: 1, source: "manual", kind: "text", data: { text, html, width: w } };
  if (s.id) {
    const before = state.items.find((i) => i.id === s.id);
    if (before?.kind === "object" && before.ir.kind === "text" && before.ir.data.html === html) return; // 바뀐 것 없음
    state.replaceObject(s.id, ir, bbox, "글 상자 편집");
  } else {
    const id = state.addObject(ir, { x: s.x, y: s.y, scale: 1 }, bbox);
    state.setSelection([]);
    void id;
  }
}

export function TextEditorHost(): ReactElement | null {
  const session = useTextEdit((s) => s.session);
  if (!session) return null;
  // 상자마다 새로 그린다 (key) — 이전 상자의 글이 섞이지 않게
  return <TextEditor key={`${session.id ?? "new"}-${session.x}-${session.y}`} session={session} />;
}

function TextEditor({ session }: { session: TextEditSession }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = session.html || "<div><br></div>";
    registerEditor(el);
    el.focus();
    // 커서를 맨 끝에
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    rememberSelection();
    notify();
    return () => registerEditor(null);
  }, [session]);

  useEffect(() => {
    const onSel = () => {
      rememberSelection();
      notify();
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  return (
    <div
      ref={ref}
      data-text-editor
      className="sl-rich"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      aria-label="글 상자"
      spellCheck={false}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          commitTextEdit();
        }
        e.stopPropagation(); // 캔버스 단축키(Enter=정리하기, Delete=삭제)와 섞이지 않게
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        // 체크 목록의 네모를 누르면 체크/해제
        const li = (e.target as Element).closest?.("ul[data-check] > li") as HTMLElement | null;
        if (li && e.clientX - li.getBoundingClientRect().left < 4) {
          e.preventDefault();
          toggleCheckAt(li);
        }
      }}
      style={{
        position: "absolute",
        left: session.x,
        top: session.y,
        // 글에 맞춰 넓어지다가 640px에서 줄을 바꾼다 (부모 층은 폭이 0이라 max-content로 직접 정한다)
        width: "max-content",
        minWidth: 160,
        maxWidth: 640,
        minHeight: 32,
        padding: "4px 6px",
        fontFamily: theme.font.ui,
        fontSize: 20,
        lineHeight: 1.45,
        color: theme.color.ink,
        background: "rgba(255,255,255,0.92)",
        outline: `1.5px dashed ${theme.color.accent}`,
        outlineOffset: 2,
        borderRadius: 4,
        pointerEvents: "auto",
        touchAction: "auto",
        userSelect: "text",
        WebkitUserSelect: "text",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        zIndex: 5,
      }}
    />
  );
}
