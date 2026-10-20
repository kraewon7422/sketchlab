/**
 * 글 상자 서식 (삼성노트의 텍스트 패널) — 고르는 글자 단위로 굵게·기울임·밑줄·취소선·색·형광·크기·목록·정렬.
 *
 * 편집은 contentEditable + document.execCommand (브라우저 내장 편집기). 오래된 API지만
 * 갤럭시 탭 Chrome·삼성 인터넷·PC Chrome 모두 그대로 지원하고, 실행 취소·IME(한글 조합)까지
 * 브라우저가 맡아 준다. 저장은 정제한 HTML (sanitizeHtml) — 허용한 태그·스타일만 남긴다.
 */

const ALLOWED_TAGS = new Set(["DIV", "P", "BR", "SPAN", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "UL", "OL", "LI", "FONT"]);
const ALLOWED_STYLES = new Set(["color", "background-color", "font-size", "font-family", "font-weight", "font-style", "text-decoration", "text-decoration-line", "text-align", "margin-left", "padding-left"]);
/** 글씨체 이름으로 허용하는 글자 (이름·따옴표·쉼표·공백뿐) */
const FONT_FAMILY = /^[\w\s"',-]+$/;
/** 스타일 값에 들어가면 안 되는 것 (url(), expression() 등) */
const BAD_VALUE = /url\s*\(|expression|javascript:|@import|[<>]/i;

/**
 * 허용 목록 밖은 전부 버린다: 스크립트·이벤트 속성·링크·이미지 등.
 * FONT(execCommand가 만드는 옛 태그)는 SPAN + 스타일로 바꾼다.
 */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const clean = (el: Element): Node[] => {
    const out: Node[] = [];
    for (const child of [...el.childNodes]) {
      if (child.nodeType === 3) {
        out.push(doc.createTextNode(child.textContent ?? ""));
        continue;
      }
      if (child.nodeType !== 1) continue;
      const c = child as HTMLElement;
      const kids = clean(c);
      if (!ALLOWED_TAGS.has(c.tagName)) {
        // 허용하지 않는 태그: 내용(글자)만 살린다. SCRIPT·STYLE은 내용도 버린다.
        if (c.tagName !== "SCRIPT" && c.tagName !== "STYLE") out.push(...kids);
        continue;
      }
      const tag = c.tagName === "FONT" ? "SPAN" : c.tagName;
      const n = doc.createElement(tag.toLowerCase());
      const style: string[] = [];
      for (const prop of ALLOWED_STYLES) {
        const v = c.style.getPropertyValue(prop);
        if (v && !BAD_VALUE.test(v) && (prop !== "font-family" || FONT_FAMILY.test(v))) style.push(`${prop}:${v}`);
      }
      if (c.tagName === "FONT") {
        const color = c.getAttribute("color");
        if (color && /^#?[0-9a-z(),.\s%]+$/i.test(color)) style.push(`color:${color}`);
        const face = c.getAttribute("face");
        if (face && FONT_FAMILY.test(face)) style.push(`font-family:${face}`);
      }
      if (style.length) n.setAttribute("style", style.join(";"));
      if (tag === "UL" && c.getAttribute("data-check") === "1") n.setAttribute("data-check", "1");
      if (tag === "LI" && c.getAttribute("data-checked") === "1") n.setAttribute("data-checked", "1");
      for (const k of kids) n.appendChild(k);
      out.push(n);
    }
    return out;
  };

  const box = doc.createElement("div");
  for (const n of clean(root)) box.appendChild(n);
  return box.innerHTML;
}

/** HTML → 글자만 (AI·검색·빈 상자 판정용). 블록 사이는 줄바꿈 */
export function plainText(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p|li)>/gi, "\n$&")}</div>`, "text/html");
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/** 글자만 있는 기존 글 상자 → 편집기에 넣을 HTML */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split("\n")
    .map((line) => `<div>${line ? esc(line) : "<br>"}</div>`)
    .join("");
}

// ─────────────────────────────────────────────────────────── 편집 명령

let editor: HTMLElement | null = null;
let savedRange: Range | null = null;

/** 지금 편집 중인 글 상자를 등록한다 (TextEditor가 연다·닫는다) */
export function registerEditor(el: HTMLElement | null): void {
  editor = el;
  savedRange = null;
}

/** 편집기 안의 선택 영역을 기억한다 — 패널 단추를 누르면 포커스가 빠지기 때문 */
export function rememberSelection(): void {
  const sel = window.getSelection();
  if (!editor || !sel || sel.rangeCount === 0) return;
  const r = sel.getRangeAt(0);
  if (editor.contains(r.commonAncestorContainer)) savedRange = r.cloneRange();
}

function restore(): boolean {
  if (!editor) return false;
  editor.focus();
  const sel = window.getSelection();
  if (savedRange && sel) {
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
  return true;
}

export type Cmd =
  | "bold"
  | "italic"
  | "underline"
  | "strikeThrough"
  | "insertUnorderedList"
  | "insertOrderedList"
  | "justifyLeft"
  | "justifyCenter"
  | "justifyRight"
  | "indent"
  | "outdent";

export function run(cmd: Cmd): void {
  if (!restore()) return;
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand(cmd);
  rememberSelection();
  notify();
}

export function setColor(color: string): void {
  if (!restore()) return;
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand("foreColor", false, color);
  rememberSelection();
  notify();
}

/** 형광(글자 배경). "transparent"면 지운다 */
export function setHighlight(color: string): void {
  if (!restore()) return;
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand("hiliteColor", false, color);
  rememberSelection();
  notify();
}

/** 글씨체 — 고른 글자에 (고른 게 없으면 이제부터 칠 글자에) */
export function setFontFamily(css: string): void {
  if (!restore()) return;
  document.execCommand("styleWithCSS", false, "true");
  document.execCommand("fontName", false, css);
  rememberSelection();
  notify();
}

/**
 * 글자 크기(px). execCommand의 fontSize는 1~7단계뿐이라,
 * 7로 표시한 뒤 그 표시를 정확한 px 스타일로 바꿔 끼운다 (잘 알려진 방법).
 */
export function setFontSize(px: number): void {
  if (!restore() || !editor) return;
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand("fontSize", false, "7");
  for (const f of [...editor.querySelectorAll('font[size="7"]')]) {
    const span = document.createElement("span");
    span.style.fontSize = `${px}px`;
    while (f.firstChild) span.appendChild(f.firstChild);
    f.replaceWith(span);
  }
  // styleWithCSS 환경에서는 xxx-large 스타일로 들어온다
  for (const s of [...editor.querySelectorAll<HTMLElement>("span")]) {
    if (s.style.fontSize === "xxx-large" || s.style.fontSize === "-webkit-xxx-large") s.style.fontSize = `${px}px`;
  }
  rememberSelection();
  notify();
}

/** 체크 목록: 글머리 목록을 만든 뒤 그 목록에 체크 표시를 단다 (다시 누르면 해제) */
export function toggleChecklist(): void {
  if (!restore() || !editor) return;
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  const ul = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest("ul") : null;
  if (ul && editor.contains(ul) && ul.getAttribute("data-check") === "1") {
    document.execCommand("insertUnorderedList"); // 목록 해제
  } else {
    if (!ul || !editor.contains(ul)) document.execCommand("insertUnorderedList");
    const a = window.getSelection()?.anchorNode;
    const list = a ? (a.nodeType === 1 ? (a as Element) : a.parentElement)?.closest("ul") : null;
    list?.setAttribute("data-check", "1");
  }
  rememberSelection();
  notify();
}

/** 체크 목록의 네모를 누르면 체크/해제 (편집기 클릭 처리에서 부른다) */
export function toggleCheckAt(li: HTMLElement): void {
  if (li.getAttribute("data-checked") === "1") li.removeAttribute("data-checked");
  else li.setAttribute("data-checked", "1");
  notify();
}

/** 지금 커서 자리의 서식 (패널 단추 켜짐 표시용) */
export function activeFormats(): Record<"bold" | "italic" | "underline" | "strikeThrough", boolean> {
  const q = (c: string) => {
    try {
      return document.queryCommandState(c);
    } catch {
      return false;
    }
  };
  return { bold: q("bold"), italic: q("italic"), underline: q("underline"), strikeThrough: q("strikeThrough") };
}

// 패널이 서식 표시를 갱신하도록 알린다
const listeners = new Set<() => void>();
export function onFormatChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notify(): void {
  for (const fn of listeners) fn();
}

export function editorOpen(): boolean {
  return editor !== null;
}
