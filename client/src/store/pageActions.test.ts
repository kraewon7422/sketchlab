import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Point } from "../ink/types";

// 저장소는 메모리 지도로 바꿔 둔다 (테스트에 IndexedDB가 없다)
const db = new Map<string, unknown>();
vi.mock("./persistence", () => ({
  saveItems: async (items: unknown, key: string) => void db.set(key, structuredClone(items)),
  loadItems: async (key: string) => (db.has(key) ? structuredClone(db.get(key)) : null),
  deleteItems: async (key: string) => void db.delete(key),
  flushSaves: async () => {},
}));

const { addPage, switchPage } = await import("./pageActions");
const { FIRST_PAGE, pagesStore } = await import("./pages");
const { __resetSession, createStroke, sessionStore } = await import("./session");

const s = () => sessionStore.getState();
const stroke = (x: number) => {
  const points: Point[] = [
    { x, y: 0, p: 0.5, t: 0 },
    { x: x + 10, y: 10, p: 0.5, t: 8 },
    { x: x + 20, y: 20, p: 0.5, t: 16 },
  ];
  return createStroke(points, 1000 + x);
};

describe("쪽 넘기기와 되돌리기", () => {
  beforeEach(() => {
    db.clear();
    __resetSession();
    pagesStore.getState().set([FIRST_PAGE], FIRST_PAGE.id);
  });

  it("다른 쪽에 갔다 와도 되돌리기 기록이 남아 있다", async () => {
    s().addStroke(stroke(0));
    s().addStroke(stroke(500), { newGroup: true });
    expect(s().items).toHaveLength(2);

    await addPage();
    expect(s().items).toHaveLength(0);
    expect(s().history.undo).toHaveLength(0); // 새 쪽은 기록이 비어 있다
    s().addStroke(stroke(100));

    await switchPage(FIRST_PAGE.id);
    expect(s().items).toHaveLength(2);
    s().undo();
    expect(s().items).toHaveLength(1);
    s().undo();
    expect(s().items).toHaveLength(0);

    // 둘째 쪽 기록도 그대로
    const second = pagesStore.getState().pages[1];
    await switchPage(second!.id);
    expect(s().items).toHaveLength(1);
    s().undo();
    expect(s().items).toHaveLength(0);
  });
});
