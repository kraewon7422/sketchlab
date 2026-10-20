import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Point } from "../ink/types";

// 저장소를 메모리 지도로 (테스트에 IndexedDB가 없다) — 키 이름 규칙은 진짜와 같게
const db = new Map<string, unknown>();
vi.mock("./media", () => ({ sweepMedia: async () => 0 }));
vi.mock("./persistence", () => ({
  saveItems: async (items: unknown, key: string) => void db.set(key, structuredClone(items)),
  loadItems: async (key: string) => (db.has(key) ? structuredClone(db.get(key)) : null),
  deleteItems: async (key: string) => void db.delete(key),
  deleteKey: async (key: string) => void db.delete(key),
  allUsedMediaIds: async () => new Set<string>(),
  flushSaves: async () => {},
  pagesKey: (id: string) => (id === "n0" ? "pages" : `pages:${id}`),
  loadPages: async (id: string) => (db.get(id === "n0" ? "pages" : `pages:${id}`) as never) ?? null,
  savePages: async (pages: unknown, currentId: string, id: string) => void db.set(id === "n0" ? "pages" : `pages:${id}`, structuredClone({ pages, currentId })),
}));

const { closeNote, createNote, deleteNotesForever, openNote, trashNotes, restoreNotes } = await import("./noteActions");
const { libraryStore } = await import("./library");
const { pagesStore } = await import("./pages");
const { __resetSession, createStroke, sessionStore } = await import("./session");
const { saveItems } = await import("./persistence");
const { itemsKey } = await import("./pages");

const stroke = (x: number) => {
  const points: Point[] = [
    { x, y: 0, p: 0.5, t: 0 },
    { x: x + 20, y: 20, p: 0.5, t: 8 },
  ];
  return createStroke(points, 1000 + x);
};
/** 앱의 저장 구독 대신 — 열린 노트의 지금 쪽에 바로 저장 */
const draw = async (x: number) => {
  sessionStore.getState().addStroke(stroke(x), { newGroup: true });
  await saveItems(sessionStore.getState().items, itemsKey(pagesStore.getState().currentId));
};

describe("노트 열고 닫기", () => {
  beforeEach(() => {
    db.clear();
    __resetSession();
    libraryStore.setState({ notes: [], folders: [], openNoteId: null });
  });

  it("새 노트 → 쓰고 닫기 → 다시 열면 그대로 (닫으면서 비운 화면이 저장되지 않는다)", async () => {
    const a = await createNote("수학", null);
    await openNote(a);
    expect(libraryStore.getState().openNoteId).toBe(a);
    await draw(0);
    await draw(100);
    await closeNote();
    expect(libraryStore.getState().openNoteId).toBeNull();
    expect(sessionStore.getState().items).toHaveLength(0);
    await openNote(a);
    expect(sessionStore.getState().items).toHaveLength(2);
    expect(libraryStore.getState().notes.find((n) => n.id === a)?.pageCount).toBe(1);
  });

  it("노트마다 쪽이 따로 — 다른 노트를 열면 그 노트의 그림", async () => {
    const a = await createNote("A", null);
    const b = await createNote("B", null);
    await openNote(a);
    await draw(0);
    await openNote(b); // 열린 A를 닫고 B
    expect(sessionStore.getState().items).toHaveLength(0);
    await draw(0);
    await draw(50);
    await openNote(a);
    expect(sessionStore.getState().items).toHaveLength(1);
    expect(pagesStore.getState().pages).toHaveLength(1);
  });

  it("휴지통 → 되살리기, 영구 삭제하면 쪽 그림과 쪽 목록이 지워진다", async () => {
    const a = await createNote("A", null);
    await openNote(a);
    await draw(0);
    const pageId = pagesStore.getState().currentId;
    await closeNote();
    trashNotes([a]);
    expect(libraryStore.getState().notes[0]?.trashedAt).toBeTypeOf("number");
    restoreNotes([a]);
    expect(libraryStore.getState().notes[0]?.trashedAt).toBeUndefined();
    await deleteNotesForever([a]);
    expect(libraryStore.getState().notes).toHaveLength(0);
    expect(db.has(itemsKey(pageId))).toBe(false);
    expect(db.has(`pages:${a}`)).toBe(false);
  });

  it("표지: 닫을 때 찍은 그림이 노트에 붙는다", async () => {
    const a = await createNote("A", null);
    await openNote(a);
    await draw(0);
    await closeNote(async () => "data:image/webp;base64,AAAA");
    expect(libraryStore.getState().notes[0]?.cover).toBe("data:image/webp;base64,AAAA");
  });
});
