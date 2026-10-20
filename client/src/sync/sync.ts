import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { debugLog } from "../debug";
import { getDB, SESSION } from "../store/db";
import { libraryStore, removeFolder, type Folder, type NoteMeta } from "../store/library";
import type { Remote, RemoteLibrary, RemoteNote, SyncMeta } from "./remote";

/**
 * 동기화 (9단계) — 기기의 노트 보관함 ↔ 사용자 자신의 Google Drive (drive.ts). 노트 단위, 바뀐 노트만 오간다.
 *
 * 세 갈래 비교: 지난 동기화 때의 모습(base)을 기기에 기억해 두고, 노트마다
 *   기기만 바뀜   → 올린다            클라우드만 바뀜 → 받는다
 *   둘 다 바뀜    → 클라우드 것을 받고, 이 기기 것은 "(충돌 사본)" 새 노트로 남긴다 (어느 쪽도 잃지 않는다)
 *   한쪽에서 영구 삭제 → 다른 쪽도 지운다 (그사이 다른 쪽에서 고쳤으면 지우지 않고 살린다)
 * 노트 이름·폴더·즐겨찾기·휴지통 같은 목록 정보도 같은 방식 (둘 다 바뀌면 이 기기 것).
 * 열려 있는 노트는 건드리지 않는다 (다음 동기화 때).
 */

interface Base {
  userId: string;
  notes: Record<string, { metaKey: string; contentAt: number }>;
  folders: Record<string, string>;
}

const BASE_KEY = "syncBase";
const COVER_MAX = 60_000;

/** off = 연결 안 함 · reconnect = 연결했지만 출입증이 만료되어 한 번 눌러야 함 */
export const syncStore = createStore<{ status: "off" | "idle" | "syncing" | "error" | "reconnect"; message: string; lastAt: number; name: string }>(() => ({ status: "off", message: "", lastAt: 0, name: "" }));
export const useSync = <T,>(sel: (s: ReturnType<typeof syncStore.getState>) => T): T => useStore(syncStore, sel);

export function metaOf(n: NoteMeta): SyncMeta {
  return {
    title: n.title,
    folderId: n.folderId,
    createdAt: n.createdAt,
    ...(n.favorite ? { favorite: true } : {}),
    ...(n.trashedAt ? { trashedAt: n.trashedAt } : {}),
    ...(n.pageCount ? { pageCount: n.pageCount } : {}),
    ...(n.cover && n.cover.length <= COVER_MAX ? { cover: n.cover } : {}),
  };
}

/** 목록 정보의 비교 열쇠 (표지 그림은 빼고 — 닫을 때마다 다시 찍혀서) */
export function metaKey(m: SyncMeta): string {
  return JSON.stringify([m.title, m.folderId, m.createdAt, !!m.favorite, m.trashedAt ?? 0]);
}
const folderKey = (f: Folder) => JSON.stringify([f.name, f.color, f.parentId]);

async function db() {
  const p = getDB();
  return p ? await p : null;
}
async function loadBase(userId: string): Promise<Base> {
  const d = await db();
  const b = (await d?.get(SESSION, BASE_KEY)) as Base | undefined;
  return b && b.userId === userId ? b : { userId, notes: {}, folders: {} };
}
async function saveBase(b: Base): Promise<void> {
  await (await db())?.put(SESSION, b, BASE_KEY);
}

/** 한 번도 고치지 않은 빈 노트인가 (두 기기 모두에 있는 처음 노트 "내 노트" — 충돌 사본을 만들 필요가 없다) */
async function isEmptyNote(id: string): Promise<boolean> {
  const [{ loadPages, loadItems }, { itemsKey }] = await Promise.all([import("../store/persistence"), import("../store/pages")]);
  const idx = await loadPages(id);
  for (const p of idx?.pages ?? []) if (((await loadItems(itemsKey(p.id))) ?? []).length > 0) return false;
  return (idx?.pages.length ?? 0) <= 1;
}

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  deleted: number;
  copies: number;
}

/** 한 번 동기화 (테스트는 가짜 remote를 넘긴다) */
export async function syncWith(remote: Remote): Promise<SyncReport> {
  const report: SyncReport = { uploaded: 0, downloaded: 0, deleted: 0, copies: 0 };
  const [{ buildNoteZip, importNoteFile, restoreNoteZip }, { deleteNotesForever, renameNote }] = await Promise.all([import("../store/noteFile"), import("../store/noteActions")]);
  const lib = () => libraryStore.getState();
  const base = await loadBase(remote.userId);
  const remoteLib: RemoteLibrary = (await remote.getLibrary()) ?? { v: 1, notes: {}, folders: {} };
  const next: RemoteLibrary = { v: 1, notes: { ...remoteLib.notes }, folders: { ...remoteLib.folders } };
  const openId = lib().openNoteId;
  const localNow = () => new Map(lib().notes.map((n) => [n.id, n]));
  const setLocal = (id: string, patch: Partial<NoteMeta> | null, create?: NoteMeta) => {
    const notes = lib().notes;
    if (create) lib().setData({ notes: [...notes, create] });
    else if (patch) lib().setData({ notes: notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  };

  const upload = async (n: NoteMeta) => {
    const { blob } = await buildNoteZip(n.id);
    await remote.upload(n.id, blob);
    const meta = metaOf(n);
    next.notes[n.id] = { meta, contentAt: n.updatedAt };
    base.notes[n.id] = { metaKey: metaKey(meta), contentAt: n.updatedAt };
    report.uploaded++;
  };
  const download = async (id: string, r: RemoteNote, exists: boolean) => {
    const pageCount = await restoreNoteZip(id, await remote.download(id));
    const meta: NoteMeta = { id, ...r.meta, updatedAt: r.contentAt, pageCount };
    if (exists) setLocal(id, meta);
    else setLocal(id, null, meta);
    base.notes[id] = { metaKey: metaKey(r.meta), contentAt: r.contentAt };
    report.downloaded++;
  };

  const ids = new Set([...lib().notes.map((n) => n.id), ...Object.keys(remoteLib.notes), ...Object.keys(base.notes)]);
  for (const id of ids) {
    if (id === openId) continue;
    const L = localNow().get(id);
    const R = remoteLib.notes[id];
    const B = base.notes[id];
    try {
      if (!L && !R) {
        delete base.notes[id];
      } else if (L && !R) {
        if (B && L.updatedAt === B.contentAt && metaKey(metaOf(L)) === B.metaKey) {
          // 다른 기기에서 영구 삭제했고, 이 기기에서는 그 뒤로 안 고쳤다 → 여기서도 지운다
          await deleteNotesForever([id]);
          delete base.notes[id];
          report.deleted++;
        } else await upload(L); // 새 노트 (또는 지워졌지만 여기서 고친 노트 — 살린다)
      } else if (!L && R) {
        if (B && R.contentAt === B.contentAt) {
          // 이 기기에서 영구 삭제 → 클라우드에서도
          await remote.remove([id]);
          delete next.notes[id];
          delete base.notes[id];
          report.deleted++;
        } else await download(id, R, false);
      } else if (L && R) {
        const localChanged = !B || L.updatedAt !== B.contentAt;
        const remoteChanged = !B || R.contentAt !== B.contentAt;
        if (L.updatedAt === R.contentAt) {
          // 내용이 같다 — 목록 정보만 맞춘다
        } else if (localChanged && !remoteChanged) {
          await upload(L);
          continue;
        } else if (remoteChanged && !localChanged) {
          await download(id, R, true);
          continue;
        } else if (!B && (await isEmptyNote(id))) {
          await download(id, R, true);
          continue;
        } else {
          // 둘 다 고쳤다: 이 기기 것을 사본으로 남기고 클라우드 것을 받는다
          const { blob } = await buildNoteZip(id);
          const copyId = await importNoteFile(blob, L.title, L.folderId);
          renameNote(copyId, `${L.title} (충돌 사본)`.slice(0, 80));
          report.copies++;
          await download(id, R, true);
          continue;
        }
        // 목록 정보 (이름·폴더·즐겨찾기·휴지통)
        const lk = metaKey(metaOf(L));
        const rk = metaKey(R.meta);
        if (lk === rk) {
          next.notes[id] = { meta: metaOf(L), contentAt: R.contentAt };
        } else if (B && lk === B.metaKey) {
          setLocal(id, { ...R.meta });
        } else {
          next.notes[id] = { meta: metaOf(L), contentAt: R.contentAt };
        }
        base.notes[id] = { metaKey: metaKey(metaOf(localNow().get(id) ?? L)), contentAt: R.contentAt };
        if (L.updatedAt !== R.contentAt) setLocal(id, { updatedAt: R.contentAt });
      }
    } catch (e) {
      debugLog.error("sync", `노트 ${id}를 동기화하지 못했습니다`, e);
      throw e;
    }
  }

  // 폴더: 같은 세 갈래 비교
  const localFolders = new Map(lib().folders.map((f) => [f.id, f]));
  const fids = new Set([...localFolders.keys(), ...Object.keys(remoteLib.folders), ...Object.keys(base.folders)]);
  let folders = [...lib().folders];
  for (const fid of fids) {
    const Lf = localFolders.get(fid);
    const Rf = remoteLib.folders[fid];
    const Bf = base.folders[fid];
    if (!Lf && !Rf) delete base.folders[fid];
    else if (Lf && !Rf) {
      if (Bf && folderKey(Lf) === Bf) {
        // 다른 기기에서 지운 폴더 — 안의 노트·폴더는 한 칸 위로
        const r = removeFolder({ ...lib(), folders }, fid);
        folders = r.folders;
        lib().setData({ notes: r.notes });
        delete base.folders[fid];
      } else {
        next.folders[fid] = Lf;
        base.folders[fid] = folderKey(Lf);
      }
    } else if (!Lf && Rf) {
      if (Bf && folderKey(Rf) === Bf) {
        delete next.folders[fid];
        delete base.folders[fid];
      } else {
        folders.push(Rf);
        base.folders[fid] = folderKey(Rf);
      }
    } else if (Lf && Rf) {
      const lk = folderKey(Lf);
      const rk = folderKey(Rf);
      if (lk !== rk && Bf && lk === Bf) {
        folders = folders.map((f) => (f.id === fid ? Rf : f));
        base.folders[fid] = rk;
      } else {
        next.folders[fid] = Lf;
        base.folders[fid] = lk;
      }
    }
  }
  lib().setData({ folders });

  await remote.putLibrary(next);
  await saveBase(base);
  // 충돌 사본은 새 노트 — 바로 한 번 더 올려 둔다
  if (report.copies > 0) {
    const again = await syncWith(remote);
    report.uploaded += again.uploaded;
  }
  return report;
}

// ─────────────────────────────────────────────────────────── 화면에서 부르는 곳

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<void> | null = null;

/** 곧 동기화 (보관함을 열 때·노트를 닫을 때) — Drive에 연결하지 않았으면 아무것도 안 한다 */
export function syncSoon(delay = 600): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delay);
}

export async function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const drive = await import("./drive");
    if (!drive.driveState()) {
      syncStore.setState({ status: "off" });
      return;
    }
    const remote: Remote | null = drive.currentDriveRemote();
    if (!remote) {
      // 출입증이 만료됨 — 사용자가 눌러야 Google 창을 다시 열 수 있다
      syncStore.setState({ status: "reconnect", message: "" });
      return;
    }
    if (!navigator.onLine) {
      syncStore.setState({ status: "idle", message: "인터넷이 없어서 다음에 동기화해요" });
      return;
    }
    syncStore.setState({ status: "syncing", message: "동기화하는 중…" });
    try {
      const r = await syncWith(remote);
      const parts = [r.uploaded && `올림 ${r.uploaded}`, r.downloaded && `받음 ${r.downloaded}`, r.deleted && `지움 ${r.deleted}`, r.copies && `충돌 사본 ${r.copies}`].filter(Boolean);
      syncStore.setState({ status: "idle", lastAt: Date.now(), message: parts.length ? parts.join(" · ") : "모두 최신이에요" });
    } catch (e) {
      if (e instanceof drive.NeedsAuth) syncStore.setState({ status: "reconnect", message: "" });
      else syncStore.setState({ status: "error", message: e instanceof Error ? e.message : "동기화하지 못했어요" });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

// ─────────────────────────────────────────────────────────── Google Drive 연결

/** 연결 상태를 화면에 (앱을 열 때) — 이름은 사용자 자신에게만 보인다 (이 기기 밖으로 나가지 않는다) */
export async function loadSyncState(): Promise<void> {
  const drive = await import("./drive");
  const s = drive.driveState();
  syncStore.setState({ name: s?.name ?? "", status: !s ? "off" : drive.validToken() ? "idle" : "reconnect" });
}

/** "Google Drive에 연결" · "다시 연결" — 사용자가 누른 순간에 부른다. 실패하면 이유를 돌려준다 */
export async function connect(): Promise<string | null> {
  const drive = await import("./drive");
  try {
    await drive.connectDrive(!drive.driveState());
  } catch (e) {
    return e instanceof Error ? e.message : "연결하지 못했어요";
  }
  syncStore.setState({ name: drive.driveState()?.name ?? "", status: "idle", message: "" });
  void syncNow();
  return null;
}

/** 연결 끊기 (Drive의 노트와 이 기기의 노트는 둘 다 그대로) */
export async function disconnect(): Promise<void> {
  const drive = await import("./drive");
  await drive.disconnectDrive();
  syncStore.setState({ name: "", status: "off", message: "" });
}
