import "fake-indexeddb/auto";
import { IR_VERSION } from "@sketchlab/shared";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { CanvasItem } from "../ink/types";
import { __resetDB } from "../store/db";
import { libraryStore, type Folder, type NoteMeta } from "../store/library";
import { createFolder, createNote, deleteNotesForever, renameNote } from "../store/noteActions";
import { itemsKey } from "../store/pages";
import { __forgetSaved, flushSaves, loadItems, loadPages, saveItems, savePages } from "../store/persistence";
import type { Remote, RemoteLibrary } from "./remote";
import { syncWith } from "./sync";

/** 가짜 클라우드 (Google Drive 대신) */
class FakeCloud {
  lib: RemoteLibrary | null = null;
  files = new Map<string, Blob>();
  remote(userId = "u1"): Remote {
    return {
      userId,
      getLibrary: async () => (this.lib ? structuredClone(this.lib) : null),
      putLibrary: async (d) => {
        this.lib = structuredClone(d);
      },
      upload: async (id, f) => {
        this.files.set(id, f);
      },
      download: async (id) => {
        const f = this.files.get(id);
        if (!f) throw new Error(`없는 파일 ${id}`);
        return f;
      },
      remove: async (ids) => {
        for (const id of ids) this.files.delete(id);
      },
    };
  }
}

/** 기기 하나 = 자기 IndexedDB + 자기 보관함 */
class Device {
  idb = new IDBFactory();
  notes: NoteMeta[] = [];
  folders: Folder[] = [];
}
let current: Device | null = null;
function switchTo(d: Device): void {
  if (current) {
    current.notes = libraryStore.getState().notes;
    current.folders = libraryStore.getState().folders;
  }
  current = d;
  globalThis.indexedDB = d.idb;
  __resetDB();
  __forgetSaved();
  libraryStore.setState({ notes: d.notes, folders: d.folders, openNoteId: null });
}

const text = (id: string, t: string): CanvasItem =>
  ({ id, kind: "object", ir: { version: IR_VERSION, confidence: 1, source: "manual", kind: "text", data: { text: t } }, transform: { x: 0, y: 0, scale: 1 }, bbox: { minX: 0, minY: 0, maxX: 10, maxY: 10 }, sourceStrokes: [] }) as CanvasItem;

let clock = 1_000_000;
/** 노트 내용 고치기 (첫 쪽을 바꾸고 수정 시각을 올린다 — 앱에서 펜으로 쓴 것처럼) */
async function edit(noteId: string, t: string): Promise<void> {
  const idx = await loadPages(noteId);
  await saveItems([text("t", t)], itemsKey(idx?.pages[0]?.id as string));
  await flushSaves();
  clock += 1000;
  const lib = libraryStore.getState();
  lib.setData({ notes: lib.notes.map((n) => (n.id === noteId ? { ...n, updatedAt: clock } : n)) });
}
async function read(noteId: string): Promise<string> {
  const idx = await loadPages(noteId);
  const items = (await loadItems(itemsKey(idx?.pages[0]?.id as string))) ?? [];
  const it = items[0];
  return it?.kind === "object" && it.ir.kind === "text" ? it.ir.data.text : "";
}
const titles = () => libraryStore.getState().notes.map((n) => n.title).sort();

describe("보기만 한 노트는 '수정됨'이 아니다 (거짓 충돌 사본을 막는다)", () => {
  it("열고 쪽을 넘기기만 하면 수정 시각 그대로, 쓰면 바뀐다", async () => {
    switchTo(new Device());
    const { startPersistence } = await import("../store/persistence");
    const { openNote, closeNote } = await import("../store/noteActions");
    const { addPage, switchPage } = await import("../store/pageActions");
    const { sessionStore } = await import("../store/session");
    const { pagesStore } = await import("../store/pages");
    const stop = await startPersistence();
    const id = await createNote("보기", null);
    libraryStore.getState().setData({ notes: libraryStore.getState().notes.map((n) => (n.id === id ? { ...n, updatedAt: 1 } : n)) });
    await openNote(id);
    const first = pagesStore.getState().currentId;
    await addPage(); // 쪽 더하기 = 고친 것
    expect(libraryStore.getState().notes.find((n) => n.id === id)?.updatedAt).not.toBe(1);
    await closeNote();
    libraryStore.getState().setData({ notes: libraryStore.getState().notes.map((n) => (n.id === id ? { ...n, updatedAt: 1 } : n)) });
    await openNote(id);
    await switchPage(first);
    await closeNote();
    expect(libraryStore.getState().notes.find((n) => n.id === id)?.updatedAt).toBe(1);
    await openNote(id);
    const written = text("x", "새 글");
    if (written.kind === "object") sessionStore.getState().addObject(written.ir, { x: 0, y: 0, scale: 1 }, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
    expect(libraryStore.getState().notes.find((n) => n.id === id)?.updatedAt).not.toBe(1);
    await closeNote();
    stop();
  });
});

describe("동기화 (두 기기 + 클라우드)", () => {
  let cloud: FakeCloud;
  let A: Device;
  let B: Device;
  beforeEach(() => {
    cloud = new FakeCloud();
    A = new Device();
    B = new Device();
    current = null;
  });

  it("올리고 받고, 다른 기기에서 고친 것을 받는다", async () => {
    switchTo(A);
    const id = await createNote("물리", null);
    await edit(id, "뉴턴 제1법칙");
    expect(await syncWith(cloud.remote())).toMatchObject({ uploaded: 1, downloaded: 0 });
    expect(cloud.files.has(id)).toBe(true);

    switchTo(B);
    expect(await syncWith(cloud.remote())).toMatchObject({ downloaded: 1 });
    expect(titles()).toEqual(["물리"]);
    expect(await read(id)).toBe("뉴턴 제1법칙");

    await edit(id, "뉴턴 제2법칙 F=ma");
    expect(await syncWith(cloud.remote())).toMatchObject({ uploaded: 1 });

    switchTo(A);
    expect(await syncWith(cloud.remote())).toMatchObject({ downloaded: 1, copies: 0 });
    expect(await read(id)).toBe("뉴턴 제2법칙 F=ma");
    // 바뀐 것이 없으면 아무것도 오가지 않는다
    expect(await syncWith(cloud.remote())).toEqual({ uploaded: 0, downloaded: 0, deleted: 0, copies: 0 });
  });

  it("두 기기에서 같은 노트를 고치면: 클라우드 것을 받고 이 기기 것은 충돌 사본으로 (잃지 않는다)", async () => {
    switchTo(A);
    const id = await createNote("화학", null);
    await edit(id, "처음");
    await syncWith(cloud.remote());
    switchTo(B);
    await syncWith(cloud.remote());

    switchTo(A);
    await edit(id, "A가 고침");
    await syncWith(cloud.remote());
    switchTo(B);
    await edit(id, "B가 고침");
    const r = await syncWith(cloud.remote());
    expect(r.copies).toBe(1);
    expect(titles()).toEqual(["화학", "화학 (충돌 사본)"]);
    expect(await read(id)).toBe("A가 고침");
    const copy = libraryStore.getState().notes.find((n) => n.title.includes("충돌"));
    expect(await read(copy?.id as string)).toBe("B가 고침");
    // 사본도 클라우드에 올라갔다 → A도 받는다
    switchTo(A);
    await syncWith(cloud.remote());
    expect(titles()).toEqual(["화학", "화학 (충돌 사본)"]);
  });

  it("이름 바꾸기는 목록만 오간다 (내용은 다시 받지 않는다)", async () => {
    switchTo(A);
    const id = await createNote("수학", null);
    await syncWith(cloud.remote());
    switchTo(B);
    await syncWith(cloud.remote());
    switchTo(A);
    renameNote(id, "수학 II");
    await syncWith(cloud.remote());
    switchTo(B);
    expect(await syncWith(cloud.remote())).toMatchObject({ downloaded: 0, uploaded: 0 });
    expect(titles()).toEqual(["수학 II"]);
  });

  it("영구 삭제는 다른 기기에도 — 그사이 고친 기기는 살린다", async () => {
    switchTo(A);
    const a = await createNote("지울 노트", null);
    const b = await createNote("살릴 노트", null);
    await syncWith(cloud.remote());
    switchTo(B);
    await syncWith(cloud.remote());
    switchTo(A);
    await deleteNotesForever([a, b]);
    expect(await syncWith(cloud.remote())).toMatchObject({ deleted: 2 });
    expect(cloud.files.size).toBe(0);
    switchTo(B);
    await edit(b, "B에서 고침");
    const r = await syncWith(cloud.remote());
    expect(r.deleted).toBe(1);
    expect(titles()).toEqual(["살릴 노트"]);
    expect(cloud.files.has(b)).toBe(true);
  });

  it("폴더: 만든 것은 받고, 지운 것은 지운다 (안의 노트는 위로)", async () => {
    switchTo(A);
    const f = createFolder("과학", null);
    const id = await createNote("생물", f);
    await syncWith(cloud.remote());
    switchTo(B);
    await syncWith(cloud.remote());
    expect(libraryStore.getState().folders.map((x) => x.name)).toEqual(["과학"]);
    expect(libraryStore.getState().notes[0]?.folderId).toBe(f);
    const { deleteFolder } = await import("../store/noteActions");
    deleteFolder(f);
    await syncWith(cloud.remote());
    switchTo(A);
    await syncWith(cloud.remote());
    expect(libraryStore.getState().folders).toEqual([]);
    expect(libraryStore.getState().notes.find((n) => n.id === id)?.folderId).toBeNull();
  });

  it("처음 동기화: 두 기기 모두에 있는 빈 '내 노트'는 사본 없이 하나로", async () => {
    const n0 = async (d: Device): Promise<void> => {
      switchTo(d);
      libraryStore.getState().setData({ notes: [{ id: "n0", title: "내 노트", folderId: null, createdAt: 1, updatedAt: d === A ? 5 : 7, pageCount: 1 }] });
      await savePages([{ id: "p1", title: "1쪽", background: "blank", createdAt: 1 }], "p1", "n0");
    };
    await n0(A);
    await edit("n0", "A의 필기");
    await syncWith(cloud.remote());
    await n0(B);
    const r = await syncWith(cloud.remote());
    expect(r.copies).toBe(0);
    expect(await read("n0")).toBe("A의 필기");
  });

  it("열려 있는 노트는 건드리지 않는다", async () => {
    switchTo(A);
    const id = await createNote("열린 노트", null);
    libraryStore.setState({ openNoteId: id });
    expect(await syncWith(cloud.remote())).toMatchObject({ uploaded: 0 });
    libraryStore.setState({ openNoteId: null });
    expect(await syncWith(cloud.remote())).toMatchObject({ uploaded: 1 });
  });

  it("다른 계정으로 바꾸면 지난 기억(base)을 쓰지 않는다", async () => {
    switchTo(A);
    await createNote("내 것", null);
    await syncWith(cloud.remote("u1"));
    const other = new FakeCloud();
    expect(await syncWith(other.remote("u2"))).toMatchObject({ uploaded: 1, deleted: 0 });
  });
});
