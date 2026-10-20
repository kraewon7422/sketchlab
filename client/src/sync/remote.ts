/**
 * 동기화 저장소의 입구 (9단계) — 동기화 계산(sync.ts)은 이 작은 입구만 안다.
 * 실제 저장소는 사용자 자신의 Google Drive 앱 폴더 (drive.ts). 시험에서는 가짜로 바꿔 끼운다.
 */

import type { Folder, NoteMeta } from "../store/library";

/** 노트 하나의 클라우드 기록 — 내용 시각(contentAt) + 목록 정보 */
export interface RemoteNote {
  meta: SyncMeta;
  contentAt: number;
}

/** 동기화하는 노트 정보 (기기마다 다를 수 있는 것은 빼고) */
export type SyncMeta = Pick<NoteMeta, "title" | "folderId" | "createdAt"> & { favorite?: boolean; trashedAt?: number; cover?: string; pageCount?: number };

export interface RemoteLibrary {
  v: 1;
  notes: Record<string, RemoteNote>;
  folders: Record<string, Folder>;
}

export interface Remote {
  /** 계정마다 다른 값 — 계정을 바꾸면 지난 동기화 기억을 쓰지 않게 */
  userId: string;
  getLibrary(): Promise<RemoteLibrary | null>;
  putLibrary(data: RemoteLibrary): Promise<void>;
  upload(noteId: string, file: Blob): Promise<void>;
  download(noteId: string): Promise<Blob>;
  remove(noteIds: readonly string[]): Promise<void>;
}
