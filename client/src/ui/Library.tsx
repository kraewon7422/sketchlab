import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  FilePlus2,
  FileText,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  HardDrive,
  LayoutGrid,
  List,
  Menu,
  MoreVertical,
  NotebookText,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { theme } from "../render/theme";
import {
  FOLDER_COLORS,
  folderCount,
  folderPath,
  foldersIn,
  libraryStore,
  notesIn,
  useLibrary,
  type Folder,
  type NoteMeta,
  type Section,
  type Sort,
} from "../store/library";
import { createFolder, createNote, deleteFolder, deleteNotesForever, moveNotes, openNote, renameNote, restoreNotes, setFavorite, trashNotes, updateFolder } from "../store/noteActions";
import { useLayoutMode } from "./layoutMode";
import { backupNow, backupOverdue, chooseBackupFolder, downloadFullBackup, folderBackupSupported, useBackup } from "../store/autoBackup";
import { driveAvailable } from "../sync/drive";
import { connect, disconnect, syncNow, syncSoon, useSync } from "../sync/sync";

/**
 * 노트 보관함 — 삼성노트 PC 폴더 화면처럼.
 *   왼쪽: 모든 노트 · 즐겨찾기 · 휴지통 · 폴더 나무 (폰에서는 ☰로 여닫는 서랍)
 *   위:   노트 작성 · PDF 가져오기 · 노트 파일 가져오기 · 편집 · 보기 방식 · 검색 · 정렬
 *   본문: 색 탭 폴더 카드 → 노트 카드 (표지 미리보기 · 이름 · 수정 날짜)
 */

const BG = "#F4F5F7";
const fmtDate = (t: number) => {
  const d = new Date(t);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}월 ${d.getDate()}일` : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};
const clamp2: CSSProperties = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "keep-all", overflowWrap: "anywhere" };

export function Library(): ReactElement {
  const data = useLibrary((s) => s);
  const mode = useLayoutMode();
  const wide = mode !== "compact";
  const [section, setSection] = useState<Section>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: "folder"; folder?: Folder; parentId: string | null }
    | { kind: "rename"; note: NoteMeta }
    | { kind: "move"; ids: string[] }
    | { kind: "confirm"; text: string; action: () => void }
    | null
  >(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  // 보관함을 열 때 (로그인해 두었으면) 클라우드와 맞춘다
  const ready = data.ready;
  useEffect(() => {
    if (ready) syncSoon(400);
  }, [ready]);
  // 칸을 바꾸면 고르기 풀기
  useEffect(() => {
    setPicked(new Set());
    setEditing(false);
  }, [section]);

  const notes = useMemo(() => notesIn(data, section, query), [data, section, query]);
  const folders = useMemo(() => (query ? [] : foldersIn(data, section)), [data, section, query]);
  const folderNow = section.kind === "folder" ? data.folders.find((f) => f.id === section.id) : undefined;
  const currentFolderId = section.kind === "folder" ? section.id : null;
  const live = data.notes.filter((n) => !n.trashedAt);

  const title =
    section.kind === "all" ? "모든 노트" : section.kind === "favorites" ? "즐겨찾기" : section.kind === "trash" ? "휴지통" : section.kind === "folders" ? "폴더" : (folderNow?.name ?? "폴더");

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setToast(e instanceof Error ? e.message : "하지 못했어요");
    } finally {
      setBusy(null);
    }
  };

  const newNote = () =>
    void run("노트를 만드는 중…", async () => {
      const id = await createNote(`새 노트 ${fmtDate(Date.now())}`, currentFolderId);
      await openNote(id);
    });

  const importPdf = (file: File) =>
    void run("PDF를 여는 중…", async () => {
      const { importPdfAsNote } = await import("./importPdf");
      const id = await importPdfAsNote(file, currentFolderId, (d, t) => setBusy(`PDF 쪽 넣는 중… ${d}/${t}`));
      await openNote(id);
    });

  const importFile = (file: File) =>
    void run("노트를 가져오는 중…", async () => {
      const { importNoteFile } = await import("../store/noteFile");
      await importNoteFile(file, file.name.replace(/\.(sketchlab|json|zip)$/i, ""), currentFolderId);
      setToast(`"${file.name}"을(를) 새 노트로 가져왔어요`);
    });

  const exportNotes = (ids: readonly string[]) =>
    void run("내보내는 중…", async () => {
      const { buildNoteZip, noteFileName } = await import("../store/noteFile");
      for (const id of ids) {
        const f = await buildNoteZip(id);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(f.blob);
        a.download = noteFileName(f.title);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      }
      setToast(ids.length > 1 ? `노트 ${ids.length}권을 파일로 저장했어요` : "노트를 파일로 저장했어요 · 다른 기기에서 '가져오기'로 열어요");
    });

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickedIds = [...picked];

  const go = (s: Section) => {
    setSection(s);
    setDrawer(false);
  };

  const sidebar = (
    <Sidebar
      section={section}
      onGo={go}
      onNewFolder={(parentId) => setDialog({ kind: "folder", parentId })}
      counts={{ all: live.length, fav: live.filter((n) => n.favorite).length, trash: data.notes.length - live.length }}
    />
  );

  return (
    <div style={{ height: "100dvh", display: "flex", background: BG, color: theme.color.ink, fontFamily: theme.font.ui, overflow: "hidden", touchAction: "auto" }}>
      {wide && <aside style={{ width: 252, flex: "0 0 auto", borderRight: `1px solid ${theme.color.sub}`, background: "#FAFAFB", overflowY: "auto" }}>{sidebar}</aside>}
      {!wide && drawer && (
        <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setDrawer(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(26,26,26,0.28)" }} />
          <aside className="sl-pop" onClick={(e) => e.stopPropagation()} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "min(300px, 84vw)", background: "#FAFAFB", overflowY: "auto", boxShadow: "8px 0 28px rgba(26,26,26,0.18)" }}>
            {sidebar}
          </aside>
        </div>
      )}

      <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* 위 막대 */}
        <header style={{ display: "flex", alignItems: "center", gap: theme.space[2], padding: `calc(${theme.space[3]}px + env(safe-area-inset-top)) ${theme.space[4]}px ${theme.space[2]}px`, flexWrap: "wrap" }}>
          {!wide && (
            <IconBtn label="메뉴" onClick={() => setDrawer(true)}>
              <Menu size={20} />
            </IconBtn>
          )}
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, flex: "1 1 120px", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h1>
          <label style={{ display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 12px", borderRadius: 999, background: "#E9EBEF", flex: "1 1 160px", maxWidth: 280, minWidth: 0 }}>
            <Search size={16} color={theme.color.asymptote} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색"
              aria-label="노트 검색"
              style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", outline: "none", fontSize: 14, color: theme.color.ink }}
            />
            {query && (
              <button type="button" aria-label="검색어 지우기" onClick={() => setQuery("")} style={{ border: "none", background: "transparent", padding: 0, display: "grid", cursor: "pointer" }}>
                <X size={15} />
              </button>
            )}
          </label>
        </header>
        {/* 단추가 많으면 줄을 바꿔 다 보이게 (폰에서도 옆으로 숨지 않게) */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, padding: `0 ${theme.space[3]}px ${theme.space[3]}px`, flex: "0 0 auto" }}>
          {section.kind !== "trash" && (
            <>
              <ActionBtn icon={<FilePlus2 size={17} />} label="노트 작성" onClick={newNote} primary />
              <ActionBtn icon={<FileText size={17} />} label="PDF 가져오기" onClick={() => pdfRef.current?.click()} />
              <ActionBtn icon={<Upload size={17} />} label="노트 파일 가져오기" onClick={() => fileRef.current?.click()} />
              {(section.kind === "folders" || section.kind === "folder") && <ActionBtn icon={<FolderPlus size={17} />} label="새 폴더" onClick={() => setDialog({ kind: "folder", parentId: currentFolderId })} />}
            </>
          )}
          <ActionBtn icon={<CheckSquare size={17} />} label={editing ? "편집 끝" : "편집"} onClick={() => (setEditing((e) => !e), setPicked(new Set()))} active={editing} />
          <ActionBtn
            icon={data.view === "grid" ? <List size={17} /> : <LayoutGrid size={17} />}
            label={data.view === "grid" ? "목록으로" : "바둑판으로"}
            onClick={() => libraryStore.getState().setData({ view: data.view === "grid" ? "list" : "grid" })}
          />
          <input ref={pdfRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => (e.target.files?.[0] && importPdf(e.target.files[0]), (e.target.value = ""))} />
          <input ref={fileRef} type="file" accept=".sketchlab,.zip,.json,application/json,application/zip" hidden onChange={(e) => (e.target.files?.[0] && importFile(e.target.files[0]), (e.target.value = ""))} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: `${theme.space[2]}px ${theme.space[4]}px calc(${theme.space[6] * 2}px + env(safe-area-inset-bottom))`, borderTop: `1px solid ${theme.color.sub}` }}>
          <BackupReminder hasNotes={live.length > 0} />
          {/* 폴더 경로 */}
          {folderNow && (
            <nav aria-label="폴더 경로" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, fontSize: 13, color: theme.color.asymptote, margin: `${theme.space[1]}px 0 ${theme.space[3]}px` }}>
              <button type="button" onClick={() => setSection({ kind: "folders" })} style={crumb}>
                폴더
              </button>
              {folderPath(data.folders, folderNow.id).map((f) => (
                <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 2, minWidth: 0 }}>
                  <ChevronRight size={14} />
                  <button type="button" onClick={() => setSection({ kind: "folder", id: f.id })} style={{ ...crumb, color: f.id === folderNow.id ? theme.color.ink : theme.color.asymptote }}>
                    {f.name}
                  </button>
                </span>
              ))}
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setDialog({ kind: "folder", folder: folderNow, parentId: folderNow.parentId })} style={{ ...crumb, color: theme.color.accent }}>
                폴더 이름·색 바꾸기
              </button>
            </nav>
          )}

          {/* 폴더 카드 */}
          {folders.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: theme.space[3], marginBottom: theme.space[5] }}>
              {folders.map((f) => (
                <FolderCard key={f.id} folder={f} count={folderCount(data, f.id)} onOpen={() => setSection({ kind: "folder", id: f.id })} />
              ))}
            </div>
          )}

          {/* 정렬 */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, margin: `0 0 ${theme.space[2]}px`, fontSize: 13, color: theme.color.asymptote }}>
            <select
              aria-label="정렬"
              value={data.sort}
              onChange={(e) => libraryStore.getState().setData({ sort: e.target.value as Sort })}
              style={{ border: "none", background: "transparent", fontSize: 13, color: theme.color.asymptote, cursor: "pointer" }}
            >
              <option value="updated">수정 날짜 순</option>
              <option value="created">만든 날짜 순</option>
              <option value="title">이름 순</option>
            </select>
            <IconBtn label={data.sortDesc ? "내림차순" : "오름차순"} onClick={() => libraryStore.getState().setData({ sortDesc: !data.sortDesc })} small>
              {data.sortDesc ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
            </IconBtn>
          </div>

          {notes.length === 0 ? (
            <Empty section={section} query={query} />
          ) : data.view === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: `${theme.space[5]}px ${theme.space[4]}px` }}>
              {notes.map((n) => (
                <NoteCard
                  key={n.id}
                  note={n}
                  editing={editing}
                  picked={picked.has(n.id)}
                  onOpen={() => (editing ? toggle(n.id) : n.trashedAt ? setToast("휴지통의 노트는 되살린 뒤에 열 수 있어요") : void run("노트를 여는 중…", () => openNote(n.id)))}
                  menu={noteMenu(n)}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 2 }}>
              {notes.map((n) => (
                <NoteRow
                  key={n.id}
                  note={n}
                  folder={data.folders.find((f) => f.id === n.folderId)}
                  editing={editing}
                  picked={picked.has(n.id)}
                  onOpen={() => (editing ? toggle(n.id) : n.trashedAt ? setToast("휴지통의 노트는 되살린 뒤에 열 수 있어요") : void run("노트를 여는 중…", () => openNote(n.id)))}
                  menu={noteMenu(n)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 편집: 고른 노트에 한꺼번에 */}
        {editing && (
          <div className="sl-sheet-up" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, padding: `${theme.space[2]}px ${theme.space[3]}px calc(${theme.space[2]}px + env(safe-area-inset-bottom))`, borderTop: `1px solid ${theme.color.sub}`, background: theme.color.bg }}>
            <span style={{ fontSize: 14, whiteSpace: "nowrap", padding: "0 8px" }}>{picked.size}개 고름</span>
            <ActionBtn icon={<CheckSquare size={17} />} label={picked.size === notes.length ? "모두 풀기" : "모두 고르기"} onClick={() => setPicked(picked.size === notes.length ? new Set() : new Set(notes.map((n) => n.id)))} />
            {section.kind === "trash" ? (
              <>
                <ActionBtn icon={<RotateCcw size={17} />} label="되살리기" disabled={!picked.size} onClick={() => (restoreNotes(pickedIds), setPicked(new Set()))} />
                <ActionBtn
                  icon={<Trash2 size={17} />}
                  label="영구 삭제"
                  danger
                  disabled={!picked.size}
                  onClick={() => setDialog({ kind: "confirm", text: `노트 ${picked.size}권을 영구 삭제할까요? 되돌릴 수 없어요.`, action: () => void run("지우는 중…", async () => (await deleteNotesForever(pickedIds), setPicked(new Set()))) })}
                />
              </>
            ) : (
              <>
                <ActionBtn icon={<Star size={17} />} label="즐겨찾기" disabled={!picked.size} onClick={() => setFavorite(pickedIds, !pickedIds.every((id) => data.notes.find((n) => n.id === id)?.favorite))} />
                <ActionBtn icon={<FolderInput size={17} />} label="이동" disabled={!picked.size} onClick={() => setDialog({ kind: "move", ids: pickedIds })} />
                <ActionBtn icon={<Download size={17} />} label="내보내기" disabled={!picked.size} onClick={() => exportNotes(pickedIds)} />
                <ActionBtn icon={<Trash2 size={17} />} label="휴지통" danger disabled={!picked.size} onClick={() => (trashNotes(pickedIds), setPicked(new Set()), setToast("휴지통으로 옮겼어요 · 휴지통에서 되살릴 수 있어요"))} />
              </>
            )}
          </div>
        )}
      </section>

      {dialog?.kind === "folder" && (
        <FolderDialog
          folder={dialog.folder}
          folders={data.folders}
          parentId={dialog.parentId}
          onClose={() => setDialog(null)}
          onSave={(name, color, parentId) => {
            if (dialog.folder) updateFolder(dialog.folder.id, { name, color, parentId });
            else createFolder(name, parentId, color);
            setDialog(null);
          }}
          onDelete={
            dialog.folder
              ? () => {
                  const f = dialog.folder as Folder;
                  setDialog({
                    kind: "confirm",
                    text: `"${f.name}" 폴더를 지울까요? 안의 노트는 지우지 않고 한 칸 위로 옮겨요.`,
                    action: () => {
                      deleteFolder(f.id);
                      setSection(f.parentId ? { kind: "folder", id: f.parentId } : { kind: "folders" });
                    },
                  });
                }
              : undefined
          }
        />
      )}
      {dialog?.kind === "rename" && (
        <Modal title="노트 이름" onClose={() => setDialog(null)}>
          <NameForm initial={dialog.note.title} onSave={(t) => (renameNote(dialog.note.id, t), setDialog(null))} />
        </Modal>
      )}
      {dialog?.kind === "move" && (
        <Modal title="어느 폴더로 옮길까요?" onClose={() => setDialog(null)}>
          <FolderPicker
            folders={data.folders}
            onPick={(fid) => {
              moveNotes(dialog.ids, fid);
              setDialog(null);
              setPicked(new Set());
              setToast(fid ? `"${data.folders.find((f) => f.id === fid)?.name}" 폴더로 옮겼어요` : "폴더 밖으로 옮겼어요");
            }}
          />
        </Modal>
      )}
      {dialog?.kind === "confirm" && (
        <Modal title="확인" onClose={() => setDialog(null)}>
          <p style={{ margin: `0 0 ${theme.space[4]}px`, fontSize: 14, lineHeight: 1.6 }}>{dialog.text}</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={() => setDialog(null)} style={pill(false)}>
              취소
            </button>
            <button type="button" onClick={() => (dialog.action(), setDialog(null))} style={{ ...pill(true), background: theme.color.danger }}>
              지우기
            </button>
          </div>
        </Modal>
      )}

      {(busy || toast) && (
        <div role="status" className="sl-pop" style={{ position: "fixed", left: "50%", bottom: `calc(${theme.space[6] * 2}px + env(safe-area-inset-bottom))`, transform: "translateX(-50%)", maxWidth: "min(92vw, 520px)", padding: "10px 16px", borderRadius: 12, background: "rgba(26,26,26,0.88)", color: "#fff", fontSize: 14, textAlign: "center", zIndex: 60, wordBreak: "keep-all" }}>
          {busy ?? toast}
        </div>
      )}
    </div>
  );

  function noteMenu(n: NoteMeta): Array<[string, () => void, boolean?]> {
    if (n.trashedAt)
      return [
        ["되살리기", () => restoreNotes([n.id])],
        ["영구 삭제", () => setDialog({ kind: "confirm", text: `"${n.title}"을(를) 영구 삭제할까요? 되돌릴 수 없어요.`, action: () => void run("지우는 중…", () => deleteNotesForever([n.id])) }), true],
      ];
    return [
      ["이름 바꾸기", () => setDialog({ kind: "rename", note: n })],
      [n.favorite ? "즐겨찾기 빼기" : "즐겨찾기", () => setFavorite([n.id], !n.favorite)],
      ["폴더로 옮기기", () => setDialog({ kind: "move", ids: [n.id] })],
      ["파일로 내보내기", () => exportNotes([n.id])],
      ["휴지통으로", () => (trashNotes([n.id]), setToast("휴지통으로 옮겼어요 · 휴지통에서 되살릴 수 있어요")), true],
    ];
  }
}

// ─────────────────────────────────────────────────────────── 왼쪽 목록

function Sidebar({ section, onGo, onNewFolder, counts }: { section: Section; onGo: (s: Section) => void; onNewFolder: (parentId: string | null) => void; counts: { all: number; fav: number; trash: number } }): ReactElement {
  const folders = useLibrary((s) => s.folders);
  const notes = useLibrary((s) => s.notes);
  const [open, setOpen] = useState<Set<string>>(() => new Set(folders.filter((f) => !f.parentId).map((f) => f.id)));
  const [storage, setStorage] = useState<{ used: number; quota: number; persisted: boolean } | null>(null);
  useEffect(() => {
    void (async () => {
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      const persisted = (await navigator.storage?.persisted?.().catch(() => false)) ?? false;
      if (est) setStorage({ used: est.usage ?? 0, quota: est.quota ?? 0, persisted });
    })();
  }, [notes.length]);

  const row = (s: Section, label: string, icon: ReactNode, count: number, depth = 0, extra?: ReactNode) => {
    const on = JSON.stringify(s) === JSON.stringify(section);
    return (
      <div key={JSON.stringify(s)} style={{ display: "flex", alignItems: "center", paddingLeft: 8 + depth * 14, borderRadius: 10, background: on ? "#E6ECFB" : "transparent" }}>
        {extra ?? <span style={{ width: 20 }} />}
        <button
          type="button"
          onClick={() => onGo(s)}
          style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, height: 42, padding: "0 10px 0 4px", border: "none", background: "transparent", color: on ? theme.color.accent : theme.color.ink, fontSize: 14.5, fontWeight: on ? 600 : 400, cursor: "pointer", textAlign: "left" }}
        >
          {icon}
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          <span style={{ fontSize: 12.5, color: theme.color.asymptote, fontVariantNumeric: "tabular-nums" }}>{count}</span>
        </button>
      </div>
    );
  };

  const tree = (parentId: string | null, depth: number): ReactNode[] =>
    folders
      .filter((f) => f.parentId === parentId)
      .flatMap((f) => {
        const kids = folders.some((c) => c.parentId === f.id);
        const isOpen = open.has(f.id);
        const chevron = kids ? (
          <button
            type="button"
            aria-label={isOpen ? "접기" : "펼치기"}
            onClick={() =>
              setOpen((o) => {
                const n = new Set(o);
                if (n.has(f.id)) n.delete(f.id);
                else n.add(f.id);
                return n;
              })
            }
            style={{ width: 20, height: 28, padding: 0, display: "grid", placeItems: "center", border: "none", background: "transparent", color: theme.color.asymptote, cursor: "pointer" }}
          >
            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : undefined;
        return [row({ kind: "folder", id: f.id }, f.name, <FolderIcon size={18} color={f.color} fill={`${f.color}22`} />, folderCount({ notes, folders }, f.id), depth, chevron), ...(isOpen ? tree(f.id, depth + 1) : [])];
      });

  const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}GB` : `${Math.max(0.1, n / 1e6).toFixed(1)}MB`);
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", padding: `calc(${theme.space[3]}px + env(safe-area-inset-top)) ${theme.space[2]}px ${theme.space[3]}px` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 14px", fontSize: 17, fontWeight: 700 }}>
        <NotebookText size={20} color={theme.color.accent} /> SketchLab
      </div>
      {row({ kind: "all" }, "모든 노트", <NotebookText size={18} />, counts.all)}
      {row({ kind: "favorites" }, "즐겨찾기", <Star size={18} />, counts.fav)}
      {row({ kind: "trash" }, "휴지통", <Trash2 size={18} />, counts.trash)}
      <div style={{ height: 1, background: theme.color.sub, margin: "10px 8px" }} />
      {row({ kind: "folders" }, "폴더", <FolderIcon size={18} />, folders.length)}
      {tree(null, 1)}
      <button type="button" onClick={() => onNewFolder(section.kind === "folder" ? section.id : null)} style={{ display: "flex", alignItems: "center", gap: 8, height: 38, margin: "4px 8px", padding: "0 10px", border: `1px dashed ${theme.color.sub}`, borderRadius: 10, background: "transparent", color: theme.color.accent, fontSize: 13.5, cursor: "pointer" }}>
        <FolderPlus size={16} /> 새 폴더
      </button>
      <span style={{ flex: 1 }} />
      <SyncBox />
      <BackupBox />
      {storage && (
        <div style={{ margin: "12px 8px 0", padding: 12, borderRadius: 12, background: "#EEF0F4", fontSize: 12.5, lineHeight: 1.5, color: theme.color.asymptote, wordBreak: "keep-all" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: theme.color.ink, fontWeight: 600 }}>
            <HardDrive size={15} /> 이 기기의 노트 저장소
          </div>
          <div>
            {mb(storage.used)} 사용 · 남은 공간 약 {mb(Math.max(0, storage.quota - storage.used))}
          </div>
          {storage.persisted ? (
            <div style={{ color: theme.color.accent }}>영구 보관 켜짐 — 저장 공간이 부족해도 지워지지 않아요</div>
          ) : (
            <>
            <div>영구 보관을 켜면 기기 공간이 부족해도 노트가 저절로 지워지지 않아요</div>
            <button
              type="button"
              onClick={() => void navigator.storage?.persist?.().then((ok) => setStorage((s) => (s ? { ...s, persisted: ok } : s)))}
              style={{ marginTop: 6, padding: "6px 10px", border: `1px solid ${theme.color.accent}`, borderRadius: 8, background: theme.color.bg, color: theme.color.accent, fontSize: 12.5, cursor: "pointer" }}
            >
              영구 보관 켜기
            </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── 카드

function FolderCard({ folder, count, onOpen }: { folder: Folder; count: number; onOpen: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`폴더 ${folder.name}`}
      style={{ position: "relative", height: 84, padding: "10px 12px", border: "none", borderRadius: 14, background: theme.color.bg, boxShadow: "0 1px 3px rgba(26,26,26,0.10)", textAlign: "left", cursor: "pointer", overflow: "hidden" }}
    >
      <span style={{ position: "absolute", top: 0, right: 12, width: 42, height: 6, borderRadius: "0 0 6px 6px", background: folder.color }} />
      <span style={{ display: "block", fontSize: 12, color: theme.color.asymptote }}>{count}</span>
      <span style={{ display: "block", marginTop: 8, fontSize: 14, fontWeight: 600, color: theme.color.ink, ...clamp2 }}>{folder.name}</span>
    </button>
  );
}

function CardMenu({ items }: { items: Array<[string, () => void, boolean?]> }): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <IconBtn label="더 보기" onClick={() => setOpen((o) => !o)} small>
        <MoreVertical size={16} />
      </IconBtn>
      {open && (
        <div className="sl-pop" role="menu" style={{ position: "absolute", right: 0, top: "100%", zIndex: 20, minWidth: 150, padding: 4, borderRadius: 12, background: theme.color.bg, boxShadow: "0 8px 28px rgba(26,26,26,0.18)", border: `1px solid ${theme.color.sub}` }}>
          {items.map(([label, fn, danger]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                fn();
              }}
              style={{ display: "block", width: "100%", padding: "9px 12px", border: "none", borderRadius: 8, background: "transparent", textAlign: "left", fontSize: 14, color: danger ? theme.color.danger : theme.color.ink, whiteSpace: "nowrap", cursor: "pointer" }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Check({ on }: { on: boolean }): ReactElement {
  return (
    <span aria-hidden style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", background: on ? theme.color.accent : "rgba(255,255,255,0.92)", border: `2px solid ${on ? theme.color.accent : theme.color.sub}`, color: "#fff", fontSize: 13, fontWeight: 700 }}>
      {on ? "✓" : ""}
    </span>
  );
}

function Cover({ note, height }: { note: NoteMeta; height?: number }): ReactElement {
  return (
    <span style={{ display: "block", width: "100%", aspectRatio: height ? undefined : "3 / 4", height, borderRadius: 10, overflow: "hidden", background: "#FFFFFF", boxShadow: "0 1px 4px rgba(26,26,26,0.12)", border: `1px solid ${theme.color.sub}` }}>
      {note.cover ? <img src={note.cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} /> : null}
    </span>
  );
}

function NoteCard({ note, editing, picked, onOpen, menu }: { note: NoteMeta; editing: boolean; picked: boolean; onOpen: () => void; menu: Array<[string, () => void, boolean?]> }): ReactElement {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0, alignContent: "start" }}>
      <button type="button" aria-label={`노트 ${note.title} 열기`} onClick={onOpen} style={{ position: "relative", padding: 0, border: "none", background: "transparent", cursor: "pointer", outline: picked ? `3px solid ${theme.color.accent}` : "none", borderRadius: 12 }}>
        <Cover note={note} />
        {editing && (
          <span style={{ position: "absolute", top: 8, left: 8 }}>
            <Check on={picked} />
          </span>
        )}
        {note.favorite && !editing && <Star size={16} fill="#FFC233" color="#FFC233" style={{ position: "absolute", top: 8, right: 8 }} />}
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 2, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0, paddingLeft: 2 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35, ...clamp2 }}>{note.title}</div>
          <div style={{ marginTop: 2, fontSize: 12, color: theme.color.asymptote }}>{fmtDate(note.updatedAt)}</div>
        </div>
        {!editing && <CardMenu items={menu} />}
      </div>
    </div>
  );
}

function NoteRow({ note, folder, editing, picked, onOpen, menu }: { note: NoteMeta; folder: Folder | undefined; editing: boolean; picked: boolean; onOpen: () => void; menu: Array<[string, () => void, boolean?]> }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 12, background: picked ? "#E6ECFB" : theme.color.bg }}>
      <button type="button" aria-label={`노트 ${note.title} 열기`} onClick={onOpen} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, padding: 0, border: "none", background: "transparent", textAlign: "left", cursor: "pointer" }}>
        {editing && <Check on={picked} />}
        <span style={{ width: 40, flex: "0 0 auto" }}>
          <Cover note={note} height={52} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {note.favorite && <Star size={13} fill="#FFC233" color="#FFC233" style={{ marginRight: 4, verticalAlign: -1 }} />}
            {note.title}
          </span>
          <span style={{ display: "block", fontSize: 12, color: theme.color.asymptote, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {fmtDate(note.updatedAt)} · {note.pageCount ?? 1}쪽{folder ? ` · ${folder.name}` : ""}
          </span>
        </span>
      </button>
      {!editing && <CardMenu items={menu} />}
    </div>
  );
}

function Empty({ section, query }: { section: Section; query: string }): ReactElement {
  const text = query
    ? `"${query}"(이)라는 노트가 없어요`
    : section.kind === "trash"
      ? "휴지통이 비었어요"
      : section.kind === "favorites"
        ? "즐겨찾기한 노트가 없어요 · 노트의 ⋮에서 즐겨찾기"
        : "노트가 없어요 · 위의 '노트 작성'으로 시작하세요";
  return <p style={{ margin: "48px 0", textAlign: "center", color: theme.color.asymptote, fontSize: 14, wordBreak: "keep-all" }}>{text}</p>;
}

// ─────────────────────────────────────────────────────────── 창

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }): ReactElement {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "center", padding: 16 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(26,26,26,0.3)" }} />
      <div role="dialog" aria-label={title} className="sl-pop" onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "min(420px, 100%)", maxHeight: "80dvh", overflowY: "auto", padding: 20, borderRadius: 18, background: theme.color.bg, boxShadow: "0 16px 48px rgba(26,26,26,0.24)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <strong style={{ flex: 1, fontSize: 16 }}>{title}</strong>
          <IconBtn label="닫기" onClick={onClose} small>
            <X size={17} />
          </IconBtn>
        </div>
        {children}
      </div>
    </div>
  );
}

function NameForm({ initial, onSave }: { initial: string; onSave: (name: string) => void }): ReactElement {
  const [v, setV] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
      style={{ display: "grid", gap: 12 }}
    >
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label="이름" maxLength={80} style={field} onFocus={(e) => e.currentTarget.select()} />
      <button type="submit" style={{ ...pill(true), justifySelf: "end" }}>
        저장
      </button>
    </form>
  );
}

function FolderDialog({
  folder,
  folders,
  parentId,
  onClose,
  onSave,
  onDelete,
}: {
  folder?: Folder | undefined;
  folders: readonly Folder[];
  parentId: string | null;
  onClose: () => void;
  onSave: (name: string, color: string, parentId: string | null) => void;
  onDelete?: (() => void) | undefined;
}): ReactElement {
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState(folder?.color ?? FOLDER_COLORS[folders.length % FOLDER_COLORS.length] ?? "#4C7CF0");
  const parent = parentId ? folders.find((f) => f.id === parentId) : undefined;
  return (
    <Modal title={folder ? "폴더 바꾸기" : parent ? `"${parent.name}" 안에 새 폴더` : "새 폴더"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name, color, parentId);
        }}
        style={{ display: "grid", gap: 14 }}
      >
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="폴더 이름 (예: 수학 1학기 중간고사)" aria-label="폴더 이름" maxLength={40} style={field} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} aria-label="폴더 색">
          {FOLDER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`색 ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: c, boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${theme.color.accent}` : "none", cursor: "pointer" }}
            />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onDelete && (
            <button type="button" onClick={onDelete} style={{ ...pill(false), color: theme.color.danger }}>
              폴더 지우기
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="submit" style={pill(true)}>
            {folder ? "저장" : "만들기"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FolderPicker({ folders, onPick }: { folders: readonly Folder[]; onPick: (id: string | null) => void }): ReactElement {
  const rows = (parentId: string | null, depth: number): ReactNode[] =>
    folders
      .filter((f) => f.parentId === parentId)
      .flatMap((f) => [
        <button key={f.id} type="button" onClick={() => onPick(f.id)} style={{ ...pickRow, paddingLeft: 12 + depth * 18 }}>
          <FolderIcon size={18} color={f.color} fill={`${f.color}22`} />
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</span>
        </button>,
        ...rows(f.id, depth + 1),
      ]);
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <button type="button" onClick={() => onPick(null)} style={pickRow}>
        <NotebookText size={18} />
        <span>폴더 없음 (맨 위)</span>
      </button>
      {rows(null, 0)}
      {folders.length === 0 && <p style={{ margin: "8px 4px", fontSize: 13, color: theme.color.asymptote }}>아직 폴더가 없어요 · 왼쪽 목록의 '새 폴더'로 만드세요</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── 작은 단추들

function IconBtn({ label, onClick, children, small = false }: { label: string; onClick: () => void; children: ReactNode; small?: boolean }): ReactElement {
  const s = small ? 32 : 40;
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} style={{ width: s, height: s, flex: "0 0 auto", display: "grid", placeItems: "center", border: "none", borderRadius: 10, background: "transparent", color: theme.color.ink, cursor: "pointer" }}>
      {children}
    </button>
  );
}

function ActionBtn({ icon, label, onClick, primary = false, active = false, danger = false, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; primary?: boolean; active?: boolean; danger?: boolean; disabled?: boolean }): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: "0 0 auto",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 36,
        padding: "0 12px",
        border: primary ? "none" : `1px solid ${active ? theme.color.accent : "transparent"}`,
        borderRadius: 999,
        background: primary ? theme.color.accent : active ? "#E6ECFB" : "transparent",
        color: primary ? "#fff" : danger ? theme.color.danger : active ? theme.color.accent : theme.color.ink,
        fontSize: 13.5,
        fontWeight: primary ? 600 : 500,
        whiteSpace: "nowrap",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

const crumb: CSSProperties = { border: "none", background: "transparent", padding: "2px 4px", fontSize: 13, color: theme.color.asymptote, cursor: "pointer", maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const field: CSSProperties = { width: "100%", height: 42, boxSizing: "border-box", padding: "0 12px", border: `1px solid ${theme.color.sub}`, borderRadius: 10, fontSize: 15, outline: "none" };
const pickRow: CSSProperties = { display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 12px", border: "none", borderRadius: 10, background: "transparent", fontSize: 14, color: theme.color.ink, textAlign: "left", cursor: "pointer" };
const pill = (primary: boolean): CSSProperties => ({ height: 38, padding: "0 16px", border: primary ? "none" : `1px solid ${theme.color.sub}`, borderRadius: 999, background: primary ? theme.color.accent : theme.color.bg, color: primary ? "#fff" : theme.color.ink, fontSize: 14, fontWeight: 600, cursor: "pointer" });

// ─────────────────────────────────────────────────────────── 자동 백업

const agoText = (t: number) => {
  if (!t) return "아직 없음";
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "방금" : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.round(m / 60)}시간 전` : `${Math.round(m / 1440)}일 전`;
};

/** 왼쪽 목록 아래: 백업 폴더(된다면) 또는 전체 백업 받기 */
function BackupBox(): ReactElement {
  const lastAt = useBackup((s) => s.lastAt);
  const folder = useBackup((s) => s.folderName);
  const needsPermission = useBackup((s) => s.needsPermission);
  const status = useBackup((s) => s.status);
  const [busy, setBusy] = useState(false);
  const go = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const small = { marginTop: 6, marginRight: 6, padding: "6px 10px", border: `1px solid ${theme.color.accent}`, borderRadius: 8, background: theme.color.bg, color: theme.color.accent, fontSize: 12.5, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 } as const;
  return (
    <div style={{ margin: "12px 8px 0", padding: 12, borderRadius: 12, background: "#EEF0F4", fontSize: 12.5, lineHeight: 1.5, color: theme.color.asymptote, wordBreak: "keep-all" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: theme.color.ink, fontWeight: 600 }}>
        <Download size={15} /> 자동 백업
      </div>
      {folderBackupSupported() ? (
        folder ? (
          <>
            <div style={{ overflowWrap: "anywhere" }}>
              폴더 "{folder}" · 마지막 {agoText(lastAt)}
            </div>
            <div>노트를 닫을 때마다 바뀐 노트를 저절로 저장해요</div>
            {needsPermission ? (
              <button type="button" disabled={busy} onClick={() => void go(() => backupNow(true))} style={small}>
                백업 폴더 다시 허락
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => void go(() => backupNow(true))} style={small}>
                지금 백업
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void go(chooseBackupFolder)} style={small}>
              폴더 바꾸기
            </button>
          </>
        ) : (
          <>
            <div>폴더를 골라 두면 노트를 닫을 때마다 저절로 백업해요 (드라이브 폴더를 고르면 클라우드까지)</div>
            <button type="button" disabled={busy} onClick={() => void go(chooseBackupFolder)} style={small}>
              백업 폴더 고르기
            </button>
          </>
        )
      ) : (
        <>
          <div>마지막 백업 {agoText(lastAt)} · 받은 파일을 드라이브·클라우드에 두세요</div>
          <button type="button" disabled={busy} onClick={() => void go(downloadFullBackup)} style={small}>
            모든 노트 백업 받기
          </button>
        </>
      )}
      {status && <div style={{ marginTop: 4, color: theme.color.accent }}>{status}</div>}
    </div>
  );
}

/** 마지막 백업이 7일 넘었으면 보관함 위에 한 줄 (이번에 닫으면 다시 열 때까지 안 보임) */
function BackupReminder({ hasNotes }: { hasNotes: boolean }): ReactElement | null {
  const lastAt = useBackup((s) => s.lastAt);
  const folder = useBackup((s) => s.folderName);
  const needsPermission = useBackup((s) => s.needsPermission);
  const [hidden, setHidden] = useState(false);
  if (hidden || !backupOverdue(lastAt, hasNotes) || (folder && !needsPermission)) return null;
  return (
    <div role="status" className="sl-pop" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, margin: `0 0 ${theme.space[3]}px`, padding: "10px 12px", borderRadius: 12, background: "#FFF6E0", color: "#7A5200", fontSize: 13.5, wordBreak: "keep-all" }}>
      <span style={{ flex: "1 1 200px" }}>{lastAt ? `마지막 백업이 ${agoText(lastAt)}이에요.` : "아직 백업한 적이 없어요."} 기기 저장소만 믿지 말고 백업해 두세요.</span>
      <button
        type="button"
        onClick={() => void (folder ? backupNow(true) : folderBackupSupported() ? chooseBackupFolder() : downloadFullBackup())}
        style={{ padding: "6px 12px", border: "none", borderRadius: 999, background: "#7A5200", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
      >
        지금 백업
      </button>
      <button type="button" aria-label="닫기" onClick={() => setHidden(true)} style={{ border: "none", background: "transparent", color: "#7A5200", cursor: "pointer", display: "grid" }}>
        <X size={16} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── 동기화 (사용자 자신의 Google Drive)

/** 왼쪽 목록 아래: 여러 기기에서 같은 노트 — Google Drive에 연결 → 상태·지금 동기화·연결 끊기 */
function SyncBox(): ReactElement | null {
  const name = useSync((s) => s.name);
  const status = useSync((s) => s.status);
  const message = useSync((s) => s.message);
  const lastAt = useSync((s) => s.lastAt);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // 이 빌드에 Google 앱 ID가 없으면 (개발 중 등) 칸을 보이지 않는다
  if (!driveAvailable()) return null;
  const small = { marginTop: 6, marginRight: 6, padding: "6px 10px", border: `1px solid ${theme.color.accent}`, borderRadius: 8, background: theme.color.bg, color: theme.color.accent, fontSize: 12.5, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1, whiteSpace: "nowrap" } as const;
  const go = async (fn: () => Promise<string | null | void>) => {
    setBusy(true);
    setNote(null);
    try {
      const r = await fn();
      if (r) setNote(r);
    } finally {
      setBusy(false);
    }
  };

  let body: ReactNode;
  if (status === "off") {
    body = (
      <>
        <div>내 Google Drive에 노트를 보관하면 태블릿·PC 어디서나 같은 노트를 써요. 노트는 Drive의 앱 전용 폴더에만 저장되고, 다른 사람(앱 만든 사람 포함)은 볼 수 없어요</div>
        <button type="button" disabled={busy} onClick={() => void go(connect)} style={{ ...small, background: theme.color.accent, color: "#fff" }}>
          Google Drive에 연결
        </button>
      </>
    );
  } else if (status === "reconnect") {
    body = (
      <>
        {name && <div style={{ overflowWrap: "anywhere" }}>{name}</div>}
        <div>동기화하려면 한 번 눌러 주세요 (Google 연결은 한 시간마다 새로 받아요)</div>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          <button type="button" disabled={busy} onClick={() => void go(connect)} style={{ ...small, background: theme.color.accent, color: "#fff" }}>
            다시 연결
          </button>
          <button type="button" disabled={busy} onClick={() => void go(disconnect)} style={{ ...small, borderColor: theme.color.sub, color: theme.color.asymptote }}>
            연결 끊기
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {name && <div style={{ overflowWrap: "anywhere" }}>{name}의 Google Drive</div>}
        <div>
          {status === "syncing" ? "동기화하는 중…" : status === "error" ? "" : `마지막 동기화 ${agoText(lastAt)}`}
          {message && status !== "syncing" && status !== "error" ? ` · ${message}` : ""}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          <button type="button" disabled={busy || status === "syncing"} onClick={() => void go(syncNow)} style={small}>
            지금 동기화
          </button>
          <button type="button" disabled={busy} onClick={() => void go(disconnect)} style={{ ...small, borderColor: theme.color.sub, color: theme.color.asymptote }}>
            연결 끊기
          </button>
        </div>
      </>
    );
  }

  return (
    <div style={{ margin: "12px 8px 0", padding: 12, borderRadius: 12, background: "#EEF0F4", fontSize: 12.5, lineHeight: 1.5, color: theme.color.asymptote, wordBreak: "keep-all" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: theme.color.ink, fontWeight: 600 }}>
        <Cloud size={15} /> 동기화
      </div>
      {body}
      {(note || status === "error") && <div style={{ marginTop: 4, color: status === "error" && !note ? theme.color.danger : theme.color.accent, overflowWrap: "anywhere" }}>{note ?? message}</div>}
    </div>
  );
}
