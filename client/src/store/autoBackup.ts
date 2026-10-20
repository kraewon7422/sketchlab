import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { debugLog } from "../debug";
import { getDB, SESSION } from "./db";
import { libraryStore } from "./library";

/**
 * 자동 백업 — 기기 안 저장소(브라우저·앱)가 노트의 유일한 사본이 되지 않게.
 *
 *   폴더 백업 (PC 크롬·엣지 등 폴더를 고를 수 있는 곳): 한 번 폴더를 고르면, 노트를 닫을 때마다
 *     바뀐 노트만 그 폴더에 .sketchlab 파일로 저절로 쓴다 (원드라이브·구글 드라이브 폴더를 고르면 클라우드까지).
 *   전체 백업 받기 (갤럭시 탭 등 폴더를 못 고르는 곳): 모든 노트를 파일 하나로 내려받는다.
 *     마지막 백업이 7일 넘으면 보관함이 알려 준다.
 */

interface BackupState {
  /** 마지막으로 백업한 시각 (어느 방법이든) */
  lastAt: number;
  /** 노트별로 백업한 그 노트의 수정 시각 — 이후에 바뀐 노트만 다시 쓴다 */
  perNote: Record<string, number>;
  /** 고른 폴더 이름 (보여 주기용) */
  folderName?: string;
}

const STATE_KEY = "backupState";
const HANDLE_KEY = "backupDir";

type DirHandle = {
  name: string;
  queryPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(o: { mode: "readwrite" }): Promise<PermissionState>;
  getFileHandle(name: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }>;
};

export const backupStore = createStore<BackupState & { status: string | null; needsPermission: boolean }>(() => ({ lastAt: 0, perNote: {}, status: null, needsPermission: false }));
export const useBackup = <T,>(sel: (s: BackupState & { status: string | null; needsPermission: boolean }) => T): T => useStore(backupStore, sel);

export const folderBackupSupported = (): boolean => typeof window !== "undefined" && "showDirectoryPicker" in window;

async function db() {
  const p = getDB();
  return p ? await p : null;
}

export async function loadBackupState(): Promise<void> {
  const d = await db();
  if (!d) return;
  const s = (await d.get(SESSION, STATE_KEY)) as BackupState | undefined;
  if (s) backupStore.setState({ lastAt: s.lastAt ?? 0, perNote: s.perNote ?? {}, ...(s.folderName ? { folderName: s.folderName } : {}) });
}

async function saveState(): Promise<void> {
  const d = await db();
  if (!d) return;
  const { lastAt, perNote, folderName } = backupStore.getState();
  await d.put(SESSION, { lastAt, perNote, ...(folderName ? { folderName } : {}) } satisfies BackupState, STATE_KEY);
}

const safeName = (title: string, id: string) => `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 50) || "노트"} (${id.slice(-5)}).sketchlab`;

/** 백업 폴더 고르기 (사용자가 누른 순간에만 열린다) */
export async function chooseBackupFolder(): Promise<boolean> {
  if (!folderBackupSupported()) return false;
  try {
    const handle = (await (window as unknown as { showDirectoryPicker(o: { mode: string; id: string }): Promise<DirHandle> }).showDirectoryPicker({ mode: "readwrite", id: "sketchlab-backup" })) as DirHandle;
    const d = await db();
    await d?.put(SESSION, handle, HANDLE_KEY);
    backupStore.setState({ folderName: handle.name, perNote: {}, needsPermission: false });
    await saveState();
    await backupNow(true);
    return true;
  } catch {
    return false; // 취소
  }
}

/**
 * 바뀐 노트를 백업 폴더에 쓴다. interactive = 사용자가 누른 것 (권한을 다시 물어도 된다).
 * 폴더가 없거나 권한이 없으면 조용히 넘어간다 (보관함에 "다시 허락" 단추가 뜬다).
 */
export async function backupNow(interactive = false): Promise<number> {
  const d = await db();
  if (!d) return 0;
  const handle = (await d.get(SESSION, HANDLE_KEY)) as DirHandle | undefined;
  if (!handle) return 0;
  let perm = await handle.queryPermission({ mode: "readwrite" });
  if (perm !== "granted" && interactive) perm = await handle.requestPermission({ mode: "readwrite" });
  if (perm !== "granted") {
    backupStore.setState({ needsPermission: true });
    return 0;
  }
  backupStore.setState({ needsPermission: false, status: "백업하는 중…" });
  const { buildNoteZip } = await import("./noteFile");
  const st = backupStore.getState();
  const perNote = { ...st.perNote };
  let n = 0;
  try {
    for (const note of libraryStore.getState().notes) {
      if (note.trashedAt || (perNote[note.id] ?? -1) >= note.updatedAt) continue;
      const { blob } = await buildNoteZip(note.id);
      const fh = await handle.getFileHandle(safeName(note.title, note.id), { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      perNote[note.id] = note.updatedAt;
      n += 1;
    }
    backupStore.setState({ perNote, lastAt: Date.now(), status: n ? `노트 ${n}권을 백업 폴더에 저장했어요` : null });
    await saveState();
  } catch (error) {
    debugLog.error("backup", "백업하지 못했습니다", error);
    backupStore.setState({ status: "백업하지 못했어요 · 폴더를 다시 골라 주세요" });
  }
  return n;
}

/** 폴더를 못 고르는 기기: 모든 노트를 파일 하나(zip 안에 노트 파일들)로 내려받는다 */
export async function downloadFullBackup(): Promise<number> {
  const [{ default: JSZip }, { buildNoteZip }] = await Promise.all([import("jszip"), import("./noteFile")]);
  const zip = new JSZip();
  const notes = libraryStore.getState().notes.filter((n) => !n.trashedAt);
  for (const note of notes) {
    const { blob } = await buildNoteZip(note.id);
    zip.file(safeName(note.title, note.id), blob, { compression: "STORE" });
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `SketchLab-전체-백업-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  backupStore.setState({ lastAt: Date.now() });
  await saveState();
  return notes.length;
}

/** 백업한 지 오래됐나 (7일) — 노트가 있을 때만 */
export function backupOverdue(lastAt: number, hasNotes: boolean): boolean {
  return hasNotes && Date.now() - lastAt > 7 * 24 * 3600 * 1000;
}
