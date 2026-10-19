import { ChevronDown, ChevronUp, FilePlus, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactElement } from "react";
import { PageBackground } from "../render/PageBackground";
import { theme } from "../render/theme";
import { addPage, deletePage, movePage, renamePage, setBackground, switchPage } from "../store/pageActions";
import { usePages, type Background } from "../store/pages";
import { commitTextEdit } from "./TextEditor";

/**
 * 쪽 패널 (레일의 [쪽] 단추) — 노트 앱의 페이지 목록.
 *   속지: 빈 종이 · 줄 · 모눈 · 그래프 용지 · 점
 *   쪽:   목록(누르면 넘기기) · 새 쪽 · 이름 바꾸기 · 순서 · 지우기
 *   내보내기: 쪽 전체 이미지 · PDF(인쇄) · 공유
 */

const BACKGROUNDS: Array<[Background, string]> = [
  ["blank", "빈 종이"],
  ["ruled", "줄"],
  ["grid", "모눈"],
  ["graph", "그래프"],
  ["dots", "점"],
];

export function PagePanel({ onMessage }: { onMessage: (m: string) => void }): ReactElement {
  const pages = usePages((s) => s.pages);
  const currentId = usePages((s) => s.currentId);
  const current = pages.find((p) => p.id === currentId);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async (fn: () => Promise<void>) => {
    commitTextEdit();
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const exportAs = async (kind: "png" | "pdf" | "share") => {
    commitTextEdit();
    const m = await import("../export/pageExport");
    const r = kind === "png" ? await m.downloadPagePng() : kind === "pdf" ? await m.printPagePdf() : await m.sharePage();
    if (r.message) onMessage(r.message);
  };

  const small = { width: 34, height: 34, display: "grid", placeItems: "center", border: "none", borderRadius: theme.radius.s, background: "transparent", color: theme.color.ink, cursor: "pointer" } as const;
  const section = (t: string) => <div style={{ fontSize: 12, color: theme.color.asymptote, marginTop: theme.space[1] }}>{t}</div>;

  return (
    <div style={{ display: "grid", gap: theme.space[2] }}>
      <strong style={{ fontSize: 14 }}>쪽</strong>

      {section("속지")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
        {BACKGROUNDS.map(([bg, label]) => (
          <button
            key={bg}
            type="button"
            aria-label={`속지 ${label}`}
            aria-pressed={current?.background === bg}
            onClick={() => setBackground(bg)}
            style={{ display: "grid", gap: 2, justifyItems: "center", padding: 2, border: "none", background: "transparent", cursor: "pointer" }}
          >
            <svg
              width={44}
              height={56}
              viewBox="0 0 88 112"
              style={{ borderRadius: 4, background: "#fff", boxShadow: current?.background === bg ? `0 0 0 2px ${theme.color.accent}` : `0 0 0 1px ${theme.color.sub}` }}
            >
              <g transform="translate(-4 -4)">
                <PageBackground kind={bg} />
              </g>
            </svg>
            <span style={{ fontSize: 11, color: current?.background === bg ? theme.color.accent : theme.color.ink }}>{label}</span>
          </button>
        ))}
      </div>

      {section(`쪽 (${pages.length})`)}
      <div style={{ display: "grid", gap: 2, maxHeight: 260, overflowY: "auto" }}>
        {pages.map((p, i) => {
          const active = p.id === currentId;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 2, borderRadius: theme.radius.s, background: active ? theme.color.selection : "transparent" }}>
              {renaming === p.id ? (
                <input
                  autoFocus
                  defaultValue={p.title}
                  aria-label="쪽 이름"
                  onBlur={(e) => {
                    renamePage(p.id, e.target.value);
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    e.stopPropagation();
                  }}
                  style={{ flex: 1, minWidth: 0, height: 32, padding: "0 8px", border: `1px solid ${theme.color.accent}`, borderRadius: 6, fontSize: 14, userSelect: "text" }}
                />
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void go(() => switchPage(p.id))}
                  style={{ flex: 1, minWidth: 0, height: 36, textAlign: "left", padding: "0 8px", border: "none", background: "transparent", fontSize: 14, fontWeight: active ? 600 : 400, color: active ? theme.color.accent : theme.color.ink, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {p.title}
                </button>
              )}
              <button type="button" aria-label="이름 바꾸기" title="이름 바꾸기" onClick={() => setRenaming(p.id)} style={small}>
                <Pencil size={15} />
              </button>
              <button type="button" aria-label="위로" title="위로" disabled={i === 0} onClick={() => movePage(p.id, -1)} style={{ ...small, opacity: i === 0 ? 0.3 : 1 }}>
                <ChevronUp size={16} />
              </button>
              <button type="button" aria-label="아래로" title="아래로" disabled={i === pages.length - 1} onClick={() => movePage(p.id, 1)} style={{ ...small, opacity: i === pages.length - 1 ? 0.3 : 1 }}>
                <ChevronDown size={16} />
              </button>
              {confirmDelete === p.id ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(null);
                    void go(() => deletePage(p.id));
                  }}
                  style={{ ...small, width: "auto", padding: "0 8px", color: theme.color.bg, background: theme.color.danger, fontSize: 12 }}
                >
                  {pages.length > 1 ? "지우기" : "비우기"}
                </button>
              ) : (
                <button type="button" aria-label="쪽 지우기" title="쪽 지우기" onClick={() => setConfirmDelete(p.id)} style={{ ...small, color: theme.color.danger }}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void go(addPage)}
        style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: `1px dashed ${theme.color.accent}`, borderRadius: theme.radius.s, background: theme.color.bg, color: theme.color.accent, fontSize: 14, cursor: "pointer" }}
      >
        <FilePlus size={16} /> 새 쪽
      </button>

      {section("이 쪽 내보내기")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        {(
          [
            ["png", "이미지"],
            ["pdf", "PDF"],
            ["share", "공유"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => void exportAs(k)}
            style={{ height: 40, border: `1px solid ${theme.color.sub}`, borderRadius: theme.radius.s, background: theme.color.bg, fontSize: 14, cursor: "pointer" }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
