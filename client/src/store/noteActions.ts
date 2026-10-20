import { debugLog } from "../debug";
import { forgetHistories, fitPaper, newPageId, switchPage } from "./pageActions";
import { itemsKey, pagesStore, paperOf, type PageMeta } from "./pages";
import { allUsedMediaIds, deleteItems, deleteKey, flushSaves, loadItems, loadPages, pagesKey, resetTouch, saveItems, savePages, setLoadingPages } from "./persistence";
import { sweepMedia } from "./media";
import { FOLDER_COLORS, LEGACY_NOTE_ID, libraryStore, newFolderId, newNoteId, removeFolder, canMoveFolder, type NoteMeta } from "./library";
import { sessionStore } from "./session";
import { viewportStore } from "./viewport";
import type { CanvasItem } from "../ink/types";

/**
 * 노트 열고 닫기·만들기·지우기, 폴더 다루기 (보관함 화면과 편집 화면이 같이 쓴다).
 *
 * 순서가 중요한 곳:
 *  - 열 때: 열린 노트 id를 먼저 바꾼 뒤 쪽 목록을 불러온다 → 쪽 목록 저장이 새 노트 키로 간다.
 *  - 닫을 때: 열린 노트 id를 먼저 비운 뒤 화면을 비운다 → 빈 화면이 저장되어 쪽이 지워지는 일이 없다.
 */

const lib = () => libraryStore.getState();
const patchNote = (id: string, patch: Partial<NoteMeta>) => lib().setData({ notes: lib().notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });

export async function openNote(id: string): Promise<void> {
  if (lib().openNoteId === id) return;
  if (lib().openNoteId) await closeNote();
  const index = await loadPages(id);
  // 예전 한 권짜리 노트는 쪽 목록이 없을 수도 있다 (한 쪽만 쓰던 때) — 그때는 1쪽 그대로
  const pages: PageMeta[] = index?.pages.length ? index.pages : id === LEGACY_NOTE_ID ? [{ id: "p1", title: "1쪽", background: "blank", createdAt: 0 }] : [{ id: newPageId(), title: "1쪽", background: "blank", createdAt: Date.now() }];
  const currentId = index && pages.some((p) => p.id === index.currentId) ? index.currentId : (pages[0] as PageMeta).id;
  lib().setOpen(id);
  // 쪽 목록을 불러오는 것은 고친 것이 아니다 (동기화가 "수정됨"으로 보지 않게)
  setLoadingPages(true);
  pagesStore.getState().load(pages, currentId);
  setLoadingPages(false);
  forgetHistories();
  const items = (await loadItems(itemsKey(currentId))) ?? [];
  sessionStore.getState().hydrate(items);
  const paper = paperOf(pages.find((p) => p.id === currentId));
  if (paper) fitPaper(paper);
  else viewportStore.getState().reset();
}

/**
 * 노트 닫기 (보관함으로). capture가 있으면 첫 쪽으로 넘겨 표지를 찍는다 (화면이 그려져 있어야 해서 UI가 넘겨 준다).
 */
export async function closeNote(capture?: () => Promise<string | undefined>): Promise<void> {
  const id = lib().openNoteId;
  if (!id) return;
  const { pages, currentId } = pagesStore.getState();
  await saveItems(sessionStore.getState().items, itemsKey(currentId));
  let cover: string | undefined;
  if (capture) {
    try {
      const first = pages[0];
      if (first && first.id !== currentId) {
        await switchPage(first.id);
        await new Promise((r) => setTimeout(r, 350)); // 그래프·구조식이 그려질 시간
      }
      cover = await capture();
    } catch (e) {
      debugLog.warn("library", "표지를 만들지 못했습니다", e);
    }
  }
  await flushSaves();
  lib().setOpen(null);
  // 다시 열면 보던 쪽에서 (표지를 찍느라 첫 쪽으로 넘겼어도)
  await savePages(pages, currentId, id);
  sessionStore.getState().hydrate([]);
  patchNote(id, { pageCount: pages.length, ...(capture ? { cover } : {}) });
  resetTouch();
  // 백업 폴더를 골라 두었으면 바뀐 노트를 저절로 백업 (권한이 없으면 조용히 넘어간다)
  if (typeof window !== "undefined") void import("./autoBackup").then((m) => m.backupNow()).catch(() => undefined);
  // 로그인해 두었으면 클라우드와 동기화
  if (typeof window !== "undefined") void import("../sync/sync").then((m) => m.syncSoon()).catch(() => undefined);
}

/** 새 노트 (첫 쪽이 하나 있는). 쪽·그림을 주면 그것으로 (PDF·노트 파일 가져오기) */
export async function createNote(title: string, folderId: string | null, content?: Array<{ meta: Omit<PageMeta, "id" | "createdAt">; items: CanvasItem[] }>): Promise<string> {
  const id = newNoteId();
  const now = Date.now();
  const pages: PageMeta[] = [];
  for (const c of content?.length ? content : [{ meta: { title: "1쪽", background: "blank" as const }, items: [] }]) {
    const page: PageMeta = { ...c.meta, id: newPageId(), createdAt: now };
    if (c.items.length) await saveItems(c.items, itemsKey(page.id));
    pages.push(page);
  }
  await flushSaves();
  await savePages(pages, (pages[0] as PageMeta).id, id);
  const t = title.trim() || "제목 없는 노트";
  lib().setData({ notes: [...lib().notes, { id, title: t.slice(0, 80), folderId, createdAt: now, updatedAt: now, pageCount: pages.length }] });
  return id;
}

export function renameNote(id: string, title: string): void {
  patchNote(id, { title: title.trim().slice(0, 80) || "제목 없는 노트" });
}

export function moveNotes(ids: readonly string[], folderId: string | null): void {
  lib().setData({ notes: lib().notes.map((n) => (ids.includes(n.id) ? { ...n, folderId } : n)) });
}

export function setFavorite(ids: readonly string[], favorite: boolean): void {
  lib().setData({ notes: lib().notes.map((n) => (ids.includes(n.id) ? { ...n, favorite } : n)) });
}

export function trashNotes(ids: readonly string[]): void {
  const now = Date.now();
  lib().setData({ notes: lib().notes.map((n) => (ids.includes(n.id) ? { ...n, trashedAt: now } : n)) });
}

export function restoreNotes(ids: readonly string[]): void {
  lib().setData({
    notes: lib().notes.map((n) => {
      if (!ids.includes(n.id)) return n;
      const { trashedAt: _gone, ...rest } = n;
      return rest;
    }),
  });
}

/** 휴지통에서 영구 삭제 — 노트의 모든 쪽 그림과 쪽 목록까지 */
export async function deleteNotesForever(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    if (lib().openNoteId === id) await closeNote();
    const index = await loadPages(id);
    for (const p of index?.pages ?? []) await deleteItems(itemsKey(p.id));
    await deleteKey(pagesKey(id));
  }
  lib().setData({ notes: lib().notes.filter((n) => !ids.includes(n.id)) });
  // 이제 아무 쪽도 안 쓰는 사진·PDF 파일 정리
  try {
    const n = await sweepMedia(await allUsedMediaIds());
    if (n) debugLog.info("library", `안 쓰는 사진 파일 ${n}개를 지웠습니다`);
  } catch (e) {
    debugLog.warn("library", "사진 파일을 정리하지 못했습니다", e);
  }
}

// ─────────────────────────────────────────────────────────── 폴더

export function createFolder(name: string, parentId: string | null, color?: string): string {
  const id = newFolderId();
  const folders = lib().folders;
  const c = color ?? FOLDER_COLORS[folders.length % FOLDER_COLORS.length] ?? "#4C7CF0";
  lib().setData({ folders: [...folders, { id, name: name.trim().slice(0, 40) || "새 폴더", color: c, parentId, createdAt: Date.now() }] });
  return id;
}

export function updateFolder(id: string, patch: { name?: string; color?: string; parentId?: string | null }): void {
  const folders = lib().folders;
  if (patch.parentId !== undefined && !canMoveFolder(folders, id, patch.parentId)) return;
  lib().setData({
    folders: folders.map((f) => (f.id === id ? { ...f, ...patch, ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 40) || f.name } : {}) } : f)),
  });
}

/** 폴더 지우기 — 안의 노트·폴더는 한 칸 위로 (노트는 지우지 않는다) */
export function deleteFolder(id: string): void {
  lib().setData(removeFolder(lib(), id));
}
