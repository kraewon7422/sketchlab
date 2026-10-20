import { parseStoredIR } from "@sketchlab/shared";
import { debugLog } from "../debug";
import type { CanvasItem } from "../ink/types";
import { getDB, ITEM, itemRange, ORDER, SESSION } from "./db";
import { LEGACY_NOTE_ID, libraryStore, type LibraryData } from "./library";
import { migrateItemMedia } from "./media";
import { itemsKey, pagesStore, type PageMeta } from "./pages";
import { sessionStore } from "./session";

/**
 * 세션 영속화 — 새로고침해도 그린 내용이 남게 한다.
 *
 * 설계 규칙 (§5.3, D6)
 * - **스토어 → DB 단방향.** DB가 스토어를 갱신하는 건 불러올 때뿐이다.
 * - **쓰기는 items가 실제로 바뀔 때만, 바뀐 항목만.** 쪽 그림은 항목 하나하나가 따로 된 기록이다
 *   (db.ts의 item 저장소). immer는 바뀐 항목에만 새 참조를 주므로, 지난번 저장한 참조와 비교하면
 *   바뀐 것만 정확히 골라 쓴다 — 획 하나를 그어도 쪽 전체·사진을 다시 쓰지 않는다 (굿노트·삼성노트처럼).
 * - 쪽마다 순서 기록(order)에 판 번호(version)·고친 시각을 둔다 — 나중에 기기 간 동기화(9단계)의 바탕.
 * - 예전 형식(쪽 그림 전체를 배열 하나로, 사진은 data URL)은 처음 불러올 때 새 형식으로 옮긴다.
 *   새 형식으로 다 쓴 뒤에만 예전 기록을 지운다 — 도중에 꺼져도 잃지 않는다.
 * - localStorage를 쓰지 않는다 (함정 #13 — 용량 한계).
 *
 * 실패해도 앱은 계속 돈다. 다만 조용히 넘어가지 않고 디버그 로그에 남긴다 (규약 §2-6).
 */

const ITEMS_KEY = "items";

interface OrderRecord {
  ids: string[];
  version: number;
  updatedAt: number;
}

/** 쪽마다 지난번 저장한 모습 (항목 id → 그때의 객체) — 바뀐 것만 쓰려고 */
const saved = new Map<string, { byId: Map<string, CanvasItem>; version: number }>();

export async function loadItems(key: string = ITEMS_KEY): Promise<CanvasItem[] | null> {
  const db = getDB();
  if (!db) return null;
  try {
    const d = await db;
    const order = (await d.get(ORDER, key)) as OrderRecord | undefined;
    let raw: CanvasItem[];
    let legacy = false;
    if (order) {
      const recs = (await d.getAll(ITEM, itemRange(key))) as CanvasItem[];
      const byId = new Map(recs.map((r) => [r.id, r]));
      raw = order.ids.map((id) => byId.get(id)).filter((x): x is CanvasItem => !!x);
    } else {
      const old: unknown = await d.get(SESSION, key);
      if (!Array.isArray(old)) return null;
      raw = old as CanvasItem[];
      legacy = true;
    }
    const migrated = await migrateItemMedia(reviveItems(raw));
    const items = migrated.items;
    if (legacy || migrated.changed) {
      // 예전 형식 → 새 형식으로 통째로 한 번 쓰고, 다 쓴 뒤에 예전 기록을 지운다
      saved.delete(key);
      await writeNow(items, key);
      if (legacy) await d.delete(SESSION, key);
      debugLog.info("persistence", `쪽 ${key}: 새 저장 형식으로 옮김 (항목 ${items.length}개)`);
    } else {
      saved.set(key, { byId: new Map(items.map((i) => [i.id, i])), version: order?.version ?? 0 });
    }
    return items;
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

/** 바뀐 항목만 쓰고, 없어진 항목은 지우고, 순서·판 번호를 갱신한다 (한 트랜잭션 — 반쯤 쓰인 쪽이 남지 않게) */
async function writeNow(items: readonly CanvasItem[], key: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  const d = await db;
  const prev = saved.get(key);
  const tx = d.transaction([ITEM, ORDER], "readwrite");
  const store = tx.objectStore(ITEM);
  const orders = tx.objectStore(ORDER);
  const before = prev ? prev.version : (((await orders.get(key)) as OrderRecord | undefined)?.version ?? 0);
  const ops: Array<Promise<unknown>> = [];
  if (!prev) {
    // 이 세션에서 처음 쓰는 쪽: 남아 있을지 모르는 옛 항목을 지우고 전부 쓴다
    ops.push(store.delete(itemRange(key)));
    for (const it of items) ops.push(store.put(it, `${key}|${it.id}`));
  } else {
    for (const it of items) if (prev.byId.get(it.id) !== it) ops.push(store.put(it, `${key}|${it.id}`));
    const now = new Set(items.map((i) => i.id));
    for (const id of prev.byId.keys()) if (!now.has(id)) ops.push(store.delete(`${key}|${id}`));
  }
  const version = before + 1;
  ops.push(orders.put({ ids: items.map((i) => i.id), version, updatedAt: Date.now() } satisfies OrderRecord, key));
  await Promise.all([...ops, tx.done]);
  saved.set(key, { byId: new Map(items.map((i) => [i.id, i])), version });
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
  if (!getDB()) return;
  if (writing) {
    pending.set(key, items);
    return;
  }
  writing = true;
  try {
    await writeNow(items, key);
  } catch (error) {
    // 실패하면 다음 저장 때 전부 다시 쓰게 (어디까지 쓰였는지 모르므로)
    saved.delete(key);
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
  for (let i = 0; i < 100 && (writing || pending.size > 0); i++) await new Promise((r) => setTimeout(r, 20));
}

/** 쪽 그림 지우기 — 새 형식(항목·순서)과 예전 형식 모두 */
export async function deleteItems(key: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  try {
    const d = await db;
    const tx = d.transaction([ITEM, ORDER, SESSION], "readwrite");
    await Promise.all([tx.objectStore(ITEM).delete(itemRange(key)), tx.objectStore(ORDER).delete(key), tx.objectStore(SESSION).delete(key), tx.done]);
    saved.delete(key);
  } catch (error) {
    debugLog.error("persistence", "쪽을 지우지 못했습니다", error);
  }
}

/** 쪽의 판 번호·고친 시각 (동기화 대비) — 아직 저장한 적 없으면 null */
export async function pageVersion(key: string): Promise<{ version: number; updatedAt: number } | null> {
  const db = getDB();
  if (!db) return null;
  const o = (await (await db).get(ORDER, key)) as OrderRecord | undefined;
  return o ? { version: o.version, updatedAt: o.updatedAt } : null;
}

/** 모든 쪽이 쓰는 사진 id (안 쓰는 사진 파일 정리용) */
export async function allUsedMediaIds(): Promise<Set<string>> {
  const used = new Set<string>();
  const db = getDB();
  if (!db) return used;
  const d = await db;
  for (const it of (await d.getAll(ITEM)) as CanvasItem[]) {
    if (it.kind === "object" && it.ir.kind === "image" && it.ir.data.mediaId) used.add(it.ir.data.mediaId);
  }
  // 아직 예전 형식인 쪽 (data URL이라 media를 쓰지 않지만, 혹시 섞여 있으면)
  for (const v of (await d.getAll(SESSION)) as unknown[]) {
    if (!Array.isArray(v)) continue;
    for (const it of v as CanvasItem[]) if (it?.kind === "object" && it.ir?.kind === "image" && it.ir.data.mediaId) used.add(it.ir.data.mediaId);
  }
  // 지금 화면의 쪽 (되돌리기로 돌아올 수 있는 사진도 지키려고 — 기록 속 항목까지)
  for (const it of sessionStore.getState().items) if (it.kind === "object" && it.ir.kind === "image" && it.ir.data.mediaId) used.add(it.ir.data.mediaId);
  return used;
}

/** 노트의 쪽 목록 저장 키 — 예전 한 권짜리 노트는 예전 키 그대로 */
export function pagesKey(noteId: string): string {
  return noteId === LEGACY_NOTE_ID ? "pages" : `pages:${noteId}`;
}

export async function loadPages(noteId: string = LEGACY_NOTE_ID): Promise<{ pages: PageMeta[]; currentId: string } | null> {
  const db = getDB();
  if (!db) return null;
  try {
    const v = (await (await db).get(SESSION, pagesKey(noteId))) as { pages?: PageMeta[]; currentId?: string } | undefined;
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
    await (await db).put(SESSION, { pages, currentId }, pagesKey(noteId));
  } catch (error) {
    debugLog.error("persistence", "쪽 목록을 저장하지 못했습니다", error);
  }
}

/** session 저장소의 기록 하나 지우기 (노트 쪽 목록) */
export async function deleteKey(key: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  try {
    await (await db).delete(SESSION, key);
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
    const v = (await (await db).get(SESSION, LIBRARY_KEY)) as Partial<LibraryData> | undefined;
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
      .then((d) => d.put(SESSION, data, LIBRARY_KEY))
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

/** 테스트 전용 — 지난번 저장 기억을 비운다 (새로 고친 것처럼) */
export function __forgetSaved(): void {
  saved.clear();
}
