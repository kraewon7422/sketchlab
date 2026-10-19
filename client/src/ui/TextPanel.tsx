import {
  Bold,
  Italic,
  List,
  ListChecks,
  ListIndentDecrease,
  ListIndentIncrease,
  ListOrdered,
  Minus,
  Plus,
  Strikethrough,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Underline,
} from "lucide-react";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { theme } from "../render/theme";
import { useTextEdit } from "../store/textEdit";
import { activeFormats, onFormatChange, run, setColor, setFontSize, setHighlight, toggleChecklist, type Cmd } from "./richText";

/**
 * 글 상자 서식 패널 — 삼성노트의 텍스트 패널처럼.
 *   크기 · B I U S · 글자 색 · 형광 · 체크/글머리/번호 목록 · 정렬 · 들여쓰기
 * 단추는 누르는 순간 편집기의 포커스를 뺏지 않는다 (onPointerDown preventDefault) — 고른 글자가 그대로 남도록.
 */

/** 글자 색 — 삼성노트처럼 4줄 × 8 */
const TEXT_COLORS = [
  "#EF4444", "#FBBF24", "#FACC15", "#2DD4BF", "#3B82F6", "#1D4ED8", "#9333EA", "#1A1A1A",
  "#F08A7A", "#DC4B3E", "#16324F", "#3E7F7A", "#5F87B5", "#4C3D8F", "#A0612B", "#D2B79A",
  "#FBE16A", "#E85A71", "#6DD58C", "#7C8CF8", "#D9D9D9", "#6B6B6B", "#F4B400", "#34C759",
  "#6FA8E8", "#8FA7D8", "#A7CF9A", "#B8920A", "#E8735F", "#7A3EA0", "#C86BA8", "#C27A62",
];
/** 형광(글자 뒤 배경) — 맨 앞은 없애기 */
const HIGHLIGHTS = ["transparent", "#FCA5A5", "#FDBA74", "#FDE047", "#86EFAC", "#7DD3FC", "#D8B4FE", "#E5E7EB"];
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60];

export function TextPanel(): ReactElement {
  const editing = useTextEdit((s) => s.session !== null);
  const [fmt, setFmt] = useState(activeFormats);
  const [size, setSize] = useState(20);
  useEffect(() => onFormatChange(() => setFmt(activeFormats())), []);

  const keep = (e: { preventDefault: () => void }) => e.preventDefault();
  const icon = (label: string, node: ReactNode, onClick: () => void, on = false) => (
    <button
      key={label}
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onPointerDown={keep}
      onMouseDown={keep}
      onClick={onClick}
      disabled={!editing}
      style={{
        width: 40,
        height: 40,
        display: "grid",
        placeItems: "center",
        border: "none",
        borderRadius: theme.radius.s,
        background: on ? theme.color.selection : "transparent",
        color: on ? theme.color.accent : theme.color.ink,
        opacity: editing ? 1 : 0.35,
        cursor: editing ? "pointer" : "default",
      }}
    >
      {node}
    </button>
  );
  const cmd = (c: Cmd) => () => run(c);
  const dot = (c: string, label: string, onClick: () => void, highlight = false) => (
    <button
      key={label + c}
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={keep}
      onMouseDown={keep}
      onClick={onClick}
      disabled={!editing}
      style={{
        width: 26,
        height: 26,
        padding: 0,
        border: "none",
        borderRadius: "50%",
        background: c === "transparent" ? theme.color.bg : c,
        boxShadow: `inset 0 0 0 1px ${theme.color.sub}`,
        opacity: editing ? (highlight ? 0.85 : 1) : 0.35,
        cursor: editing ? "pointer" : "default",
        position: "relative",
      }}
    >
      {c === "transparent" && <span aria-hidden style={{ position: "absolute", inset: 5, borderTop: `2px solid ${theme.color.danger}`, transform: "rotate(-45deg)" }} />}
    </button>
  );
  const changeSize = (dir: -1 | 1) => {
    const i = SIZES.findIndex((s) => s >= size);
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, (i < 0 ? SIZES.length - 1 : i) + dir))] ?? size;
    setSize(next);
    setFontSize(next);
  };
  const section = (title: string) => <div style={{ fontSize: 12, color: theme.color.asymptote, marginTop: theme.space[1] }}>{title}</div>;

  return (
    <div style={{ display: "grid", gap: theme.space[2] }}>
      <strong style={{ fontSize: 14 }}>글 상자</strong>
      {!editing && <p style={{ margin: 0, fontSize: 13, color: theme.color.asymptote, lineHeight: 1.6 }}>페이지를 누르면 글 상자가 생겨요. 이미 있는 글 상자를 누르면 고칠 수 있어요.</p>}

      {section("글자 크기")}
      <div style={{ display: "flex", alignItems: "center", gap: theme.space[2] }}>
        {icon("작게", <Minus size={18} />, () => changeSize(-1))}
        <span style={{ minWidth: 44, textAlign: "center", fontSize: 15 }}>{size}px</span>
        {icon("크게", <Plus size={18} />, () => changeSize(1))}
      </div>

      <div style={{ display: "flex", gap: 2 }}>
        {icon("굵게", <Bold size={18} />, cmd("bold"), fmt.bold)}
        {icon("기울임", <Italic size={18} />, cmd("italic"), fmt.italic)}
        {icon("밑줄", <Underline size={18} />, cmd("underline"), fmt.underline)}
        {icon("취소선", <Strikethrough size={18} />, cmd("strikeThrough"), fmt.strikeThrough)}
      </div>

      {section("글자 색")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 26px)", gap: 8 }}>
        {TEXT_COLORS.map((c) => dot(c, `글자 색 ${c}`, () => setColor(c)))}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: theme.space[2], fontSize: 13 }}>
        직접 고르기
        <input
          type="color"
          aria-label="글자 색 직접 고르기"
          disabled={!editing}
          onChange={(e) => setColor(e.target.value)}
          style={{ width: 40, height: 28, padding: 0, border: "none", background: "transparent" }}
        />
      </label>

      {section("형광 (글자 배경)")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {HIGHLIGHTS.map((c) => dot(c, c === "transparent" ? "형광 없애기" : `형광 ${c}`, () => setHighlight(c), true))}
      </div>

      {section("목록")}
      <div style={{ display: "flex", gap: 2 }}>
        {icon("체크 목록", <ListChecks size={18} />, toggleChecklist)}
        {icon("글머리 목록", <List size={18} />, cmd("insertUnorderedList"))}
        {icon("번호 목록", <ListOrdered size={18} />, cmd("insertOrderedList"))}
      </div>

      {section("정렬")}
      <div style={{ display: "flex", gap: 2 }}>
        {icon("왼쪽 정렬", <TextAlignStart size={18} />, cmd("justifyLeft"))}
        {icon("가운데 정렬", <TextAlignCenter size={18} />, cmd("justifyCenter"))}
        {icon("오른쪽 정렬", <TextAlignEnd size={18} />, cmd("justifyRight"))}
        {icon("들여쓰기", <ListIndentIncrease size={18} />, cmd("indent"))}
        {icon("내어쓰기", <ListIndentDecrease size={18} />, cmd("outdent"))}
      </div>
    </div>
  );
}
