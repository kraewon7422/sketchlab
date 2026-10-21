import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetDB, DB_NAME, getDB, onDbBlocked } from "./db";

describe("예전 버전이 저장소를 쥐고 있을 때", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    __resetDB();
  });

  it("빈 화면으로 멈추지 않고 '기다리는 중'을 알리고, 예전 창이 닫히면 저절로 열린다", async () => {
    // 예전 버전(v1)처럼: 연결을 열어 두고 "비켜 달라"(versionchange)를 무시한다
    const old = await new Promise<IDBDatabase>((res) => {
      const q = indexedDB.open(DB_NAME, 1);
      q.onupgradeneeded = () => q.result.createObjectStore("session");
      q.onsuccess = () => res(q.result);
    });
    const seen: boolean[] = [];
    const off = onDbBlocked((b) => seen.push(b));
    const opening = getDB();
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual([false, true]);
    old.close();
    const db = await opening;
    expect(db?.version).toBe(2);
    expect([...(db?.objectStoreNames ?? [])].sort()).toEqual(["item", "media", "order", "session"]);
    expect(seen).toEqual([false, true, false]);
    off();
  });
});
