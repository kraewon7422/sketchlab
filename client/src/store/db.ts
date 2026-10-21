import { openDB, type IDBPDatabase } from "idb";
import { debugLog } from "../debug";

/**
 * 기기 안 저장소 (IndexedDB) — 굿노트·삼성노트처럼 나눠 담는다.
 *
 *   session  (v1) 쪽 목록·노트 목록·예전 형식의 쪽 그림 (예전 쪽은 처음 열 때 새 형식으로 옮긴다)
 *   item     (v2) 그림 하나하나 — 키 "<쪽 키>|<항목 id>". 바뀐 항목만 다시 쓴다
 *   order    (v2) 쪽마다 항목 순서 + 판(version)·고친 시각 — 키 "<쪽 키>"
 *   media    (v2) 사진·PDF 쪽 그림 파일(Blob) — 키 mediaId. 한 번만 쓰고, 쪽은 id로만 가리킨다
 */
export const DB_NAME = "sketchlab";
export const DB_VERSION = 2;
export const SESSION = "session";
export const ITEM = "item";
export const ORDER = "order";
export const MEDIA = "media";

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * 저장소를 새 형식으로 올리려는데 예전 버전의 SketchLab(다른 탭·설치한 앱 창)이 연결을 쥐고 있어 기다리는 중인지.
 * 예전 버전은 "비켜 달라"는 신호를 모르기 때문에, 그 창을 닫을 때까지 여기서 멈춘다 → 빈 화면 대신 안내를 띄우게.
 */
let blockedNow = false;
const blockedListeners = new Set<(blocked: boolean) => void>();
function setBlocked(v: boolean): void {
  if (blockedNow === v) return;
  blockedNow = v;
  for (const fn of blockedListeners) fn(v);
}
/** 기다림 상태 구독 (바로 지금 값도 한 번 알려 준다) — 구독 해제 함수를 돌려준다 */
export function onDbBlocked(fn: (blocked: boolean) => void): () => void {
  blockedListeners.add(fn);
  fn(blockedNow);
  return () => {
    blockedListeners.delete(fn);
  };
}

export function getDB(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === "undefined") {
    debugLog.warn("persistence", "IndexedDB를 쓸 수 없는 환경입니다. 저장이 비활성화됩니다.");
    return null;
  }
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      for (const name of [SESSION, ITEM, ORDER, MEDIA]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    },
    blocked() {
      // 예전 버전이 연결을 놓지 않는다 — 그 창이 닫히면 이 요청이 저절로 이어진다
      debugLog.warn("persistence", "예전 버전의 SketchLab이 저장소를 쥐고 있어 기다리는 중입니다");
      setBlocked(true);
    },
    blocking() {
      // 다른 탭이 새 버전으로 열려 한다 — 이 탭의 연결을 닫아 막지 않게 (새로 고치면 새 버전으로)
      void dbPromise?.then((d) => d.close());
      dbPromise = null;
    },
  }).then((db) => {
    setBlocked(false);
    return db;
  });
  return dbPromise;
}

/** 테스트 전용 — 새 가짜 DB로 다시 열게 */
export function __resetDB(): void {
  dbPromise = null;
  setBlocked(false);
}

/** 쪽 키의 항목들 범위 ("<쪽 키>|" 로 시작하는 모든 키) */
export function itemRange(pageKey: string): IDBKeyRange {
  return IDBKeyRange.bound(`${pageKey}|`, `${pageKey}|￿`);
}
