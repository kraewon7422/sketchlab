import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { wipeDriveAppFolder } from "../sync/drive";
import { __resetDB, DB_NAME, getDB, MEDIA, SESSION } from "./db";
import { deleteAllData } from "./wipeData";

/** 메모리 localStorage */
class MemStore implements Storage {
  m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

const dbNames = async () => (await indexedDB.databases()).map((d) => d.name);

describe("내 데이터 모두 지우기", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    __resetDB();
  });

  it("기기의 노트 저장소와 sketchlab.* 설정만 지우고, 같은 주소의 다른 프로젝트 것은 남긴다", async () => {
    const db = await getDB()!;
    await db.put(SESSION, { notes: 1 }, "library");
    await db.put(MEDIA, new Blob(["photo"]), "m1");
    expect(await dbNames()).toContain(DB_NAME);
    const ls = new MemStore();
    ls.setItem("sketchlab.pen", "{}");
    ls.setItem("sketchlab.ai", '{"key":"secret"}');
    ls.setItem("turing-lab.settings", "keep");

    const r = await deleteAllData({ drive: false }, ls);
    expect(r.blocked).toBe(false);
    expect(await dbNames()).not.toContain(DB_NAME);
    expect([...ls.m.keys()]).toEqual(["turing-lab.settings"]);
    // 지운 뒤에는 새로 고칠 때까지 저장소를 다시 만들지 않는다
    expect(getDB()).toBeNull();
    expect(await dbNames()).not.toContain(DB_NAME);
  });

  it("Drive를 고르면 연결이 살아 있어야 한다 (만료면 아무것도 지우지 않고 알린다)", async () => {
    await getDB();
    await expect(deleteAllData({ drive: true }, new MemStore())).rejects.toThrow(/다시 연결/);
    expect(await dbNames()).toContain(DB_NAME);
  });

  it("Drive 앱 폴더 비우기 — 1000개가 넘어도 빌 때까지", async () => {
    const files = new Set(Array.from({ length: 1205 }, (_, i) => `f${i}`));
    const fake = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      if ((init.method ?? "GET") === "GET") {
        expect(url.searchParams.get("spaces")).toBe("appDataFolder");
        return Response.json({ files: [...files].slice(0, 1000).map((id) => ({ id })) });
      }
      files.delete(url.pathname.split("/files/")[1] as string);
      return new Response(null, { status: 204 });
    };
    expect(await wipeDriveAppFolder("tok", fake as typeof fetch)).toBe(1205);
    expect(files.size).toBe(0);
  });
});
