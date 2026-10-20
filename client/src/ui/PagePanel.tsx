import { ChevronDown, ChevronUp, FilePlus, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactElement } from "react";
import { PageBackground } from "../render/PageBackground";
import { theme } from "../render/theme";
import { addPage, addSheet, deletePage, movePage, renamePage, setBackground, setLayout, switchPage } from "../store/pageActions";
import { LAYOUTS, type Layout } from "../store/paper";
import { usePages, type Background } from "../store/pages";
import { commitTextEdit } from "./TextEditor";
import { penStore, usePen, TOOL_KEYS, type ToolKey } from "../store/pen";
import { libraryStore } from "../store/library";
import { TOOL_META } from "./ToolRail";

/**
 * 쪽 패널 (레일의 [쪽] 단추) — 노트 앱의 페이지 목록.
 *   속지: 빈 종이 · 줄 · 모눈 · 그래프 용지 · 점
 *   쪽 모양: 캔버스 · 세로로 넘기기 · 가로로 넘기기 · 2쪽 보기 · 끊김 없이 (+ 종이 한 장 더)
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
  const dark = usePen((s) => s.dark);

  const go = async (fn: () => Promise<void>) => {
    commitTextEdit();
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const wide = { height: 40, border: `1px solid ${theme.color.sub}`, borderRadius: theme.radius.s, background: theme.color.bg, fontSize: 14, color: theme.color.ink } as const;
  const backup = async (how: "save" | "share") => {
    commitTextEdit();
    // 노트 파일(.sketchlab — 쪽·사진이 든 꾸러미)로. 보관함의 "파일로 내보내기"와 같은 파일
    const noteId = libraryStore.getState().openNoteId;
    if (!noteId) return;
    const { buildNoteZip, noteFileName } = await import("../store/noteFile");
    const { blob, title } = await buildNoteZip(noteId);
    const name = noteFileName(title);
    if (how === "share") {
      const file = new File([blob], name, { type: "application/zip" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          onMessage("백업을 공유했어요");
        } catch {
          /* 사용자가 닫음 */
        }
        return;
      }
      onMessage("이 기기는 공유를 지원하지 않아 파일로 저장해요");
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    onMessage("이 노트를 파일로 저장했어요 · 다른 기기의 보관함에서 '노트 파일 가져오기'로 열어요");
  };
  const restore = async (file: File) => {
    commitTextEdit();
    try {
      const { importNoteFile } = await import("../store/noteFile");
      await importNoteFile(file, file.name.replace(/\.(sketchlab|json)$/i, ""), null);
      onMessage("새 노트로 가져왔어요 · 노트 보관함에 있어요");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "불러오지 못했어요");
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

      {section("쪽 모양")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
        {LAYOUTS.map(([k, label]) => {
          const on = (current?.layout ?? "canvas") === k;
          return (
            <button
              key={k}
              type="button"
              aria-label={`쪽 모양 ${label}`}
              aria-pressed={on}
              onClick={() => {
                commitTextEdit();
                setLayout(k);
              }}
              style={{ display: "grid", justifyItems: "center", gap: 2, padding: "4px 0", border: "none", borderRadius: theme.radius.s, background: on ? theme.color.selection : "transparent", cursor: "pointer" }}
            >
              <LayoutIcon kind={k} on={on} />
              <span style={{ fontSize: 10.5, lineHeight: 1.2, color: on ? theme.color.accent : theme.color.ink, textAlign: "center" }}>{label}</span>
            </button>
          );
        })}
      </div>
      {current?.layout && current.layout !== "canvas" && (
        <div style={{ display: "flex", alignItems: "center", gap: theme.space[2], fontSize: 13 }}>
          <span style={{ flex: 1, color: theme.color.asymptote }}>종이 {Math.max(1, current.sheets ?? 1)}장 · 마지막 장에 쓰면 저절로 한 장 더</span>
          <button type="button" onClick={addSheet} style={{ ...wide, height: 32, padding: "0 10px", fontSize: 13, cursor: "pointer" }}>
            + 한 장
          </button>
        </div>
      )}

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

      {section("이 노트를 파일로 (다른 기기로 옮기기·보관)")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <button type="button" onClick={() => void backup("save")} style={wide}>
          파일로 백업
        </button>
        <button type="button" onClick={() => void backup("share")} style={wide}>
          백업 공유
        </button>
      </div>
      <label style={{ ...wide, display: "grid", placeItems: "center", cursor: "pointer" }}>
        노트 파일 가져오기 (새 노트로)
        <input
          type="file"
          accept=".sketchlab,.json,application/zip,application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void restore(f);
          }}
        />
      </label>
      <span style={{ fontSize: 12, color: theme.color.asymptote, marginTop: -theme.space[1] }}>
        백업 파일을 구글 드라이브·삼성 클라우드·카카오톡 등으로 옮겨 다른 기기에서 불러오세요
      </span>

      {section("도구 막대 (순서 바꾸기 · 숨기기)")}
      <ToolbarEditor />

      {section("화면")}
      <label style={{ display: "flex", alignItems: "center", gap: theme.space[2], fontSize: 14 }}>
        <input type="checkbox" checked={dark} onChange={(e) => penStore.getState().set({ dark: e.target.checked })} style={{ width: 18, height: 18, accentColor: theme.color.accent }} />
        어두운 화면
      </label>

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

/** 쪽 모양 그림 (작은 종이 배치도) */
function LayoutIcon({ kind, on }: { kind: Layout; on: boolean }): ReactElement {
  const c = on ? theme.color.accent : theme.color.asymptote;
  const sheet = (x: number, y: number, w = 10, h = 13) => <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} rx={1.5} fill="#fff" stroke={c} strokeWidth={1.2} />;
  const arrow = (d: string) => <path d={d} fill="none" stroke={c} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />;
  return (
    <svg width={34} height={34} viewBox="0 0 34 34" aria-hidden>
      {kind === "canvas" && (
        <>
          <rect x={5} y={5} width={24} height={24} rx={3} fill="#fff" stroke={c} strokeWidth={1.2} strokeDasharray="3 2" />
          {arrow("M17 9v16M9 17h16")}
        </>
      )}
      {kind === "vertical" && (
        <>
          {sheet(9, 2)}
          {sheet(9, 18)}
          {arrow("M26 10v14M23.5 21.5 26 24l2.5-2.5")}
        </>
      )}
      {kind === "horizontal" && (
        <>
          {sheet(2, 8)}
          {sheet(15, 8)}
          {arrow("M8 27h18M23.5 24.5 26 27l-2.5 2.5")}
        </>
      )}
      {kind === "two" && (
        <>
          {sheet(5, 3)}
          {sheet(16, 3)}
          {sheet(5, 18)}
          {sheet(16, 18)}
        </>
      )}
      {kind === "continuous" && (
        <>
          <rect x={9} y={2} width={14} height={30} rx={1.5} fill="#fff" stroke={c} strokeWidth={1.2} />
          {arrow("M16 10v14M13.5 21.5 16 24l2.5-2.5")}
        </>
      )}
    </svg>
  );
}

/** 도구 막대 편집 — ▲▼로 순서, 눈으로 보이기/숨기기 (펜은 늘 보인다) · 처음대로 */
function ToolbarEditor(): ReactElement {
  const order = usePen((s) => s.toolOrder);
  const hidden = usePen((s) => s.hiddenTools);
  const move = (t: ToolKey, d: -1 | 1) => {
    const i = order.indexOf(t);
    const j = i + d;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j] as ToolKey, next[i] as ToolKey];
    penStore.getState().set({ toolOrder: next });
  };
  const btn = { width: 30, height: 30, display: "grid", placeItems: "center", border: "none", borderRadius: theme.radius.s, background: "transparent", color: theme.color.ink, cursor: "pointer" } as const;
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {order.map((t, i) => {
        const [label, Icon] = TOOL_META[t];
        const shown = !hidden.includes(t);
        return (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 4, opacity: shown ? 1 : 0.45 }}>
            <Icon size={17} strokeWidth={1.6} />
            <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: theme.color.asymptote }}>
              <input
                type="checkbox"
                aria-label={`${label} 보이기`}
                checked={shown}
                disabled={t === "pen"}
                onChange={(e) => penStore.getState().set({ hiddenTools: e.target.checked ? hidden.filter((h) => h !== t) : [...hidden, t] })}
                style={{ width: 16, height: 16, accentColor: theme.color.accent }}
              />
              보이기
            </label>
            <button type="button" aria-label={`${label} 위로`} disabled={i === 0} onClick={() => move(t, -1)} style={{ ...btn, opacity: i === 0 ? 0.3 : 1 }}>
              <ChevronUp size={16} />
            </button>
            <button type="button" aria-label={`${label} 아래로`} disabled={i === order.length - 1} onClick={() => move(t, 1)} style={{ ...btn, opacity: i === order.length - 1 ? 0.3 : 1 }}>
              <ChevronDown size={16} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => penStore.getState().set({ toolOrder: [...TOOL_KEYS], hiddenTools: [] })}
        style={{ justifySelf: "start", marginTop: 2, padding: "4px 8px", border: `1px solid ${theme.color.sub}`, borderRadius: theme.radius.s, background: theme.color.bg, fontSize: 12, color: theme.color.ink, cursor: "pointer" }}
      >
        처음대로
      </button>
    </div>
  );
}
