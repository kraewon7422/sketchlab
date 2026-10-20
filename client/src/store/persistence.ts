import { parseStoredIR } from "@sketchlab/shared";
import { openDB, type IDBPDatabase } from "idb";
import { debugLog } from "../debug";
import type { CanvasItem } from "../ink/types";
import { sessionStore } from "./session";
import { itemsKey, pagesStore, type PageMeta } from "./pages";
import { LEGACY_NOTE_ID, libraryStore, type LibraryData } from "./library";

/**
 * 세션 영속화 — 새로고침해도 그린 내용이 남게 한다.
 *
 * 설계 규칙 (§5.3, D6)
 * - **스토어 → DB 단방향.** DB가 스토어를 갱신하는 건 부팅 시 1회 복원뿐이다.
 *   양방향으로 만들면 어느 쪽이 진실인지 알 수 없어진다.
 * - **쓰기는 items가 실제로 바뀔 때만.** pointermove 중에는 절대 쓰지 않는다.
 *   immer가 변경이 있을 때만 새 참조를 주므로, 참조 비교만으로 정확히 걸러진다.
 * - localStorage를 쓰지 않는다 (함정 #13 — 용량 한계).
 *
 * 실패해도 앱은 계속 돈다. 다만 조용히 넘어가지 않고 디버그 로그에 남긴다 (규약 §2-6).
 */

const DB_NAME = "sketchlab";
const DB_VERSION = 1;
const STORE_NAME = "session";
const ITEMS_KEY = "items";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === "undefined") {
    debugLog.warn("persistence", "IndexedDB를 쓸 수 없는 환경입니다. 저장이 비활성화됩니다.");
    return null;
  }

  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });

  return dbPromise;
}

export async function loadItems(key: string = ITEMS_KEY): Promise<CanvasItem[] | null> {
  const db = getDB();
  if (!db) return null;

  try {
    const stored: unknown = await (await db).get(STORE_NAME, key);
    if (!Array.isArray(stored)) return null;
    return reviveItems(stored as CanvasItem[]);
  } catch (error) {
    debugLog.error("persistence", "저장된 내용을 불러오지 못했습니다", error);
    return null;
  }
}

/**
 * 인식된 객체의 IR은 외부 입력과 같은 취급을 한다 (규약 §6): 예전 버전으로 저장됐을 수 있고
 * (v3 → v4), 저장소가 깨졌을 수도 있다. 마이그레이션 + 스키마 검증을 통과한 것만 살린다.
 * 실패한 객체는 버리지 않고 원본 잉크로 되돌린다 — 사용자가 그린 것은 잃지 않는다.
 */
export function reviveItems(items: readonly CanvasItem[]): CanvasItem[] {
  return items.map((item) => {
    if (item.kind !== "object") return item;
    const ir = parseStoredIR(item.ir);
    if (ir) return { ...item, ir };
    debugLog.error("persistence", "저장된 객체의 IR이 유효하지 않아 원본 잉크로 되돌립니다", item.id);
    return { id: item.id, kind: "ink", strokes: item.sourceStrokes, bbox: item.bbox };
  });
}

/**
 * 저장 중에 또 저장 요청이 오면 마지막 것만 남긴다.
 *
 * 빠르게 획을 여러 개 그으면 쓰기가 겹칠 수 있다. 그대로 두면 늦게 시작한 쓰기가
 * 먼저 끝나 옛 상태가 최종본이 되는 순서 뒤집힘이 생긴다.
 */
let writing = false;
/** 쪽마다 마지막으로 기다리는 저장 */
const pending = new Map<string, CanvasItem[]>();

export async function saveItems(items: CanvasItem[], key: string = ITEMS_KEY): Promise<void> {
  const db = getDB();
  if (!db) return;

  if (writing) {
    pending.set(key, items);
    return;
  }

  writing = true;
  try {
    await (await db).put(STORE_NAME, items, key);
  } catch (error) {
    debugLog.error("persistence", "저장에 실패했습니다", error);
  } finally {
    writing = false;
    const next = pending.entries().next();
    if (!next.done) {
      const [k, v] = next.value;
      pending.delete(k);
      void saveItems(v, k);
    }
  }
}

/** 기다리는 저장까지 모두 끝날 때까지 (쪽을 바꾸기 전에) */
export async function flushSaves(): Promise<void> {
  for (let i = 0; i < 50 && (writing || pending.size > 0); i++) await new Promise((r) => setTimeout(r, 20));
}

export async function deleteItems(key: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  try {
    await (await db).delete(STORE_NAME, key);
  } catch (error) {
    debugLog.error("persistence", "쪽을 지우지 못했습니다", error);
  }
}

/** 노트의 쪽 목록 저장 키 — 예전 한 권짜리 노트는 예전 키 그대로 */
export function pagesKey(noteId: string): string {
  return noteId === LEGACY_NOTE_ID ? "pages" : `pages:${noteId}`;
}

export async function loadPages(noteId: string = LEGACY_NOTE_ID): Promise<{ pages: PageMeta[]; currentId: string } | null> {
  const db = getDB();
  if (!db) return null;
  try {
    const v = (await (await db).get(STORE_NAME, pagesKey(noteId))) as { pages?: PageMeta[]; currentId?: string } | undefined;
    if (!v || !Array.isArray(v.pages) || v.pages.length === 0) return null;
    return { pages: v.pages, currentId: v.currentId ?? (v.pages[0] as PageMeta).id };
  } catch (error) {
    debugLog.error("persistence", "쪽 목록을 불러오지 못했습니다", error);
    return null;
  }
}

export async function savePages(pages: PageMeta[], currentId: string, noteId: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  try {
    await (await db).put(STORE_NAME, { pages, currentId }, pagesKey(noteId));
  } catch (error) {
    debugLog.error("persistence", "쪽 목록을 저장하지 못했습니다", error);
  }
}

export async function clearPersisted(): Promise<void> {
  const db = getDB();
  if (!db) return;
  try {
    await (await db).delete(STORE_NAME, ITEMS_KEY);
  } catch (error) {
    debugLog.error("persistence", "저장 내용을 지우지 못했습니다", error);
  }
}

/** 쪽 하나와 노트 쪽 목록을 통째로 지운다 (휴지통에서 영구 삭제) */
export async function deleteKey(key: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  try {
    await (await db).delete(STORE_NAME, key);
  } catch (error) {
    debugLog.error("persistence", "지우지 못했습니다", error);
  }
}

// ─────────────────────────────────────────────────────────── 노트 보관함

const LIBRARY_KEY = "library";

export async function loadLibrary(): Promise<LibraryData | null> {
  const db = getDB();
  if (!db) return null;
  try {
    const v = (await (await db).get(STORE_NAME, LIBRARY_KEY)) as Partial<LibraryData> | undefined;
    if (!v || !Array.isArray(v.notes)) return null;
    return {
      notes: v.notes,
      folders: Array.isArray(v.folders) ? v.folders : [],
      sort: v.sort === "created" || v.sort === "title" ? v.sort : "updated",
      sortDesc: v.sortDesc !== false,
      view: v.view === "list" ? "list" : "grid",
    };
  } catch (error) {
    debugLog.error("persistence", "노트 목록을 불러오지 못했습니다", error);
    return null;
  }
}

let libraryTimer: ReturnType<typeof setTimeout> | null = null;
function saveLibrarySoon(data: LibraryData): void {
  if (libraryTimer) clearTimeout(libraryTimer);
  libraryTimer = setTimeout(() => {
    libraryTimer = null;
    const db = getDB();
    if (!db) return;
    void db
      .then((d) => d.put(STORE_NAME, data, LIBRARY_KEY))
      .catch((error: unknown) => debugLog.error("persistence", "노트 목록을 저장하지 못했습니다", error));
  }, 250);
}

/**
 * 부팅: 노트 보관함을 읽는다 (처음이면 예전 한 권짜리 노트를 "내 노트"로 옮겨 담는다 — 저장 키는 그대로라 복사가 없다).
 * 그 뒤 저장 구독을 건다:
 *   그림(items) → 열린 노트의 지금 쪽 키 · 쪽 목록 → 열린 노트의 쪽 목록 키 · 보관함 목록 → library 키
 * 열린 노트가 없을 때(보관함 화면)는 그림·쪽 목록을 쓰지 않는다 — 노트를 닫으며 화면을 비워도 저장된 쪽이 지워지지 않게.
 * 반환값은 구독 해제 함수.
 */
export async function startPersistence(): Promise<() => void> {
  let data = await loadLibrary();
  if (!data) {
    const legacy = await loadPages(LEGACY_NOTE_ID);
    const now = Date.now();
    data = {
      notes: [{ id: LEGACY_NOTE_ID, title: "내 노트", folderId: null, createdAt: now, updatedAt: now, pageCount: legacy?.pages.length ?? 1 }],
      folders: [],
      sort: "updated",
      sortDesc: true,
      view: "grid",
    };
    debugLog.info("persistence", `노트 보관함을 처음 만듦 — 예전 노트를 "내 노트"로 (쪽 ${legacy?.pages.length ?? 1}개)`);
  }
  libraryStore.getState().setData(data);
  libraryStore.setState({ ready: true });
  saveLibrarySoon(data);

  let lastItems = sessionStore.getState().items;
  const stopItems = sessionStore.subscribe((state) => {
    // 참조가 그대로면 items는 바뀌지 않은 것이다 (선택·활성 그룹만 변한 경우).
    if (state.items === lastItems) return;
    lastItems = state.items;
    const noteId = libraryStore.getState().openNoteId;
    if (!noteId) return;
    void saveItems(state.items, itemsKey(pagesStore.getState().currentId));
    touchNote(noteId);
  });
  const stopPages = pagesStore.subscribe((s) => {
    const noteId = libraryStore.getState().openNoteId;
    if (noteId) void savePages(s.pages, s.currentId, noteId);
  });
  const stopLibrary = libraryStore.subscribe((s, prev) => {
    if (s.notes === prev.notes && s.folders === prev.folders && s.sort === prev.sort && s.sortDesc === prev.sortDesc && s.view === prev.view) return;
    saveLibrarySoon({ notes: s.notes, folders: s.folders, sort: s.sort, sortDesc: s.sortDesc, view: s.view });
  });
  return () => {
    stopItems();
    stopPages();
    stopLibrary();
  };
}

/** 열린 노트의 "수정한 날짜"를 지금으로 (너무 자주 바꾸지 않게 2초에 한 번) */
let lastTouch = 0;
function touchNote(noteId: string): void {
  const now = Date.now();
  if (now - lastTouch < 2000) return;
  lastTouch = now;
  const lib = libraryStore.getState();
  lib.setData({ notes: lib.notes.map((n) => (n.id === noteId ? { ...n, updatedAt: now } : n)) });
}
