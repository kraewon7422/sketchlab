import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * 노트 보관함 (삼성노트의 "모든 노트 · 즐겨찾기 · 휴지통 · 폴더") — 노트 여러 권과 폴더.
 *
 *   노트 = 쪽 여러 개를 가진 한 권 (쪽 목록은 노트마다 따로 저장: pagesKey)
 *   폴더 = 이름·색·위 폴더 (폴더 안에 폴더)
 * 이 스토어는 목록(메타 정보)만 안다. 그림은 쪽마다 IndexedDB에 (persistence.ts).
 * 지우면 먼저 휴지통으로 — 휴지통에서 지워야 정말 지워진다.
 */

export interface NoteMeta {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
  /** 휴지통에 넣은 시각 (없으면 휴지통 아님) */
  trashedAt?: number;
  /** 표지 미리보기 — 마지막으로 보던 쪽을 작게 (WebP data URL) */
  cover?: string;
  pageCount?: number;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
  createdAt: number;
}

export type Sort = "updated" | "created" | "title";
export type View = "grid" | "list";

export interface LibraryData {
  notes: NoteMeta[];
  folders: Folder[];
  sort: Sort;
  sortDesc: boolean;
  view: View;
}

export interface LibraryState extends LibraryData {
  /** 지금 열린 노트 (null = 보관함 화면) */
  openNoteId: string | null;
  /** 저장소에서 읽어 왔는가 (그 전에는 화면을 그리지 않는다) */
  ready: boolean;
  setData(patch: Partial<LibraryData>): void;
  setOpen(id: string | null): void;
}

/** 예전 버전(노트가 한 권뿐이던 때)의 노트 — 저장 키가 예전 그대로다 */
export const LEGACY_NOTE_ID = "n0";

/** 폴더 색 (삼성노트 폴더 탭처럼) */
export const FOLDER_COLORS = ["#2EC4D6", "#FF7A45", "#FFC233", "#B05CE0", "#7CC84E", "#13A88A", "#8A6D5A", "#7D8590", "#F2A0A8", "#C04BCF", "#4C7CF0", "#93A8F5", "#F04848"];

export const libraryStore = createStore<LibraryState>((set) => ({
  notes: [],
  folders: [],
  sort: "updated",
  sortDesc: true,
  view: "grid",
  openNoteId: null,
  ready: false,
  setData: (patch) => set(patch),
  setOpen: (id) => set({ openNoteId: id }),
}));

export function useLibrary<T>(selector: (s: LibraryState) => T): T {
  return useStore(libraryStore, selector);
}

let counter = 0;
export const newNoteId = (): string => `n${Date.now().toString(36)}${(++counter).toString(36)}`;
export const newFolderId = (): string => `f${Date.now().toString(36)}${(++counter).toString(36)}`;

// ─────────────────────────────────────────────────────────── 순수 함수 (보관함 화면·테스트)

/** 폴더와 그 아래 모든 폴더의 id */
export function folderAndDescendants(folders: readonly Folder[], id: string): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

/** 폴더 안 노트 수 (아래 폴더까지, 휴지통 제외) */
export function folderCount(data: Pick<LibraryData, "notes" | "folders">, id: string): number {
  const ids = folderAndDescendants(data.folders, id);
  return data.notes.filter((n) => !n.trashedAt && n.folderId && ids.has(n.folderId)).length;
}

/** 보관함의 한 칸 */
export type Section = { kind: "all" } | { kind: "favorites" } | { kind: "trash" } | { kind: "folders" } | { kind: "folder"; id: string };

/** 그 칸에 보일 노트 (검색어·정렬 적용) */
export function notesIn(data: LibraryData, section: Section, query = ""): NoteMeta[] {
  const q = query.trim().toLowerCase();
  let list = data.notes.filter((n) => (section.kind === "trash" ? !!n.trashedAt : !n.trashedAt));
  if (section.kind === "favorites") list = list.filter((n) => n.favorite);
  if (section.kind === "folders") list = list.filter((n) => !n.folderId);
  if (section.kind === "folder") list = list.filter((n) => n.folderId === section.id);
  if (q) list = list.filter((n) => n.title.toLowerCase().includes(q));
  const dir = data.sortDesc ? -1 : 1;
  return [...list].sort((a, b) =>
    data.sort === "title" ? dir * a.title.localeCompare(b.title, "ko") : dir * ((data.sort === "created" ? a.createdAt - b.createdAt : a.updatedAt - b.updatedAt) || 0),
  );
}

/** 그 칸에 보일 폴더 카드 (폴더 칸 = 맨 위 폴더들, 어떤 폴더 = 그 아래 폴더들) */
export function foldersIn(data: Pick<LibraryData, "folders">, section: Section): Folder[] {
  if (section.kind === "folders") return data.folders.filter((f) => !f.parentId);
  if (section.kind === "folder") return data.folders.filter((f) => f.parentId === section.id);
  return [];
}

/**
 * 폴더 지우기: 그 안의 노트·폴더는 지우지 않고 한 칸 위로 올린다 (노트를 잃지 않게).
 */
export function removeFolder(data: Pick<LibraryData, "notes" | "folders">, id: string): Pick<LibraryData, "notes" | "folders"> {
  const f = data.folders.find((x) => x.id === id);
  if (!f) return data;
  return {
    folders: data.folders.filter((x) => x.id !== id).map((x) => (x.parentId === id ? { ...x, parentId: f.parentId } : x)),
    notes: data.notes.map((n) => (n.folderId === id ? { ...n, folderId: f.parentId } : n)),
  };
}

/** 폴더를 다른 폴더 아래로 — 자기 자신이나 자기 아래로는 못 옮긴다 */
export function canMoveFolder(folders: readonly Folder[], id: string, parentId: string | null): boolean {
  return parentId === null || !folderAndDescendants(folders, id).has(parentId);
}

/** 폴더 경로 (맨 위부터) — 화면 위 이동 경로 표시 */
export function folderPath(folders: readonly Folder[], id: string): Folder[] {
  const out: Folder[] = [];
  let cur = folders.find((f) => f.id === id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    const pid = cur.parentId;
    cur = pid ? folders.find((f) => f.id === pid) : undefined;
  }
  return out;
}
