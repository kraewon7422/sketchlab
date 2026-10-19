import { parseStoredIR } from "@sketchlab/shared";
import { openDB, type IDBPDatabase } from "idb";
import { debugLog } from "../debug";
import type { CanvasItem } from "../ink/types";
import { sessionStore } from "./session";
import { itemsKey, pagesStore, type PageMeta } from "./pages";

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

const PAGES_KEY = "pages";

export async function loadPages(): Promise<{ pages: PageMeta[]; currentId: string } | null> {
  const db = getDB();
  if (!db) return null;
  try {
    const v = (await (await db).get(STORE_NAME, PAGES_KEY)) as { pages?: PageMeta[]; currentId?: string } | undefined;
    if (!v || !Array.isArray(v.pages) || v.pages.length === 0) return null;
    return { pages: v.pages, currentId: v.currentId ?? (v.pages[0] as PageMeta).id };
  } catch (error) {
    debugLog.error("persistence", "쪽 목록을 불러오지 못했습니다", error);
    return null;
  }
}

async function savePages(pages: PageMeta[], currentId: string): Promise<void> {
  const db = getDB();
  if (!db) return;
  try {
    await (await db).put(STORE_NAME, { pages, currentId }, PAGES_KEY);
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

/**
 * 부팅 시 1회 복원한 뒤, items 변경을 구독해 저장을 시작한다.
 * 반환값은 구독 해제 함수.
 */
export async function startPersistence(): Promise<() => void> {
  const index = await loadPages();
  if (index) pagesStore.getState().load(index.pages, index.currentId);
  const restored = await loadItems(itemsKey(pagesStore.getState().currentId));
  if (restored && restored.length > 0) {
    sessionStore.getState().hydrate(restored);
    debugLog.info("persistence", `이전 세션 복원 — 항목 ${restored.length}개`);
  }

  let lastItems = sessionStore.getState().items;
  const stopItems = sessionStore.subscribe((state) => {
    // 참조가 그대로면 items는 바뀌지 않은 것이다 (선택·활성 그룹만 변한 경우).
    if (state.items === lastItems) return;
    lastItems = state.items;
    void saveItems(state.items, itemsKey(pagesStore.getState().currentId));
  });
  const stopPages = pagesStore.subscribe((s) => void savePages(s.pages, s.currentId));
  return () => {
    stopItems();
    stopPages();
  };
}
