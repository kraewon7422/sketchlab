import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { __resetDB } from "../store/db";
import { libraryStore } from "../store/library";
import { createNote } from "../store/noteActions";
import { __forgetSaved } from "../store/persistence";
import { driveRemote, NeedsAuth } from "./drive";
import { syncWith } from "./sync";

/** 가짜 Google Drive (앱 폴더만) — 실제 API의 요청 모양을 그대로 받는다 */
class FakeDrive {
  files = new Map<string, { name: string; body: Blob; parents: string[] }>();
  calls: string[] = [];
  next = 1;
  token = "good";
  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    this.calls.push(`${method} ${url.pathname}${url.search.includes("uploadType") ? `?${url.searchParams.get("uploadType")}` : ""}`);
    if ((init.headers as Record<string, string>)["Authorization"] !== `Bearer ${this.token}`) return new Response("", { status: 401 });
    const id = url.pathname.split("/files/")[1];
    if (method === "GET" && url.pathname === "/drive/v3/files") {
      expect(url.searchParams.get("spaces")).toBe("appDataFolder");
      return Response.json({ files: [...this.files].map(([fid, f]) => ({ id: fid, name: f.name })) });
    }
    if (method === "GET" && id && url.searchParams.get("alt") === "media") {
      const f = this.files.get(id);
      return f ? new Response(f.body) : new Response("", { status: 404 });
    }
    if (method === "POST" && url.pathname === "/upload/drive/v3/files") {
      // multipart: 메타데이터(JSON) + 내용
      const text = await (init.body as Blob).text();
      const ct = (init.headers as Record<string, string>)["Content-Type"] ?? "";
      const boundary = /boundary=(\S+)/.exec(ct)?.[1] as string;
      const parts = text.split(`--${boundary}`);
      const meta = JSON.parse((parts[1] as string).split("\r\n\r\n")[1] as string) as { name: string; parents: string[] };
      const content = (parts[2] as string).split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n$/, "");
      const fid = `f${this.next++}`;
      this.files.set(fid, { name: meta.name, parents: meta.parents, body: new Blob([content]) });
      return Response.json({ id: fid });
    }
    if (method === "PATCH" && id) {
      const f = this.files.get(id);
      if (!f) return new Response("", { status: 404 });
      f.body = init.body as Blob;
      return Response.json({ id });
    }
    if (method === "DELETE" && id) {
      this.files.delete(id);
      return new Response(null, { status: 204 });
    }
    return new Response("", { status: 400 });
  };
}

describe("Google Drive 앱 폴더", () => {
  let drive: FakeDrive;
  beforeEach(() => {
    drive = new FakeDrive();
  });

  it("목록 쓰기 → 새 파일(multipart, 앱 폴더 안), 다시 쓰기 → 같은 파일 고치기(PATCH)", async () => {
    const r = driveRemote("good", "u1", drive.fetch);
    expect(await r.getLibrary()).toBeNull();
    await r.putLibrary({ v: 1, notes: {}, folders: {} });
    expect([...drive.files.values()].map((f) => [f.name, f.parents])).toEqual([["library.json", ["appDataFolder"]]]);
    await r.putLibrary({ v: 1, notes: { n1: { meta: { title: "가", folderId: null, createdAt: 1 }, contentAt: 5 } }, folders: {} });
    expect(drive.files.size).toBe(1);
    expect(drive.calls.filter((c) => c.startsWith("PATCH"))).toHaveLength(1);
    const fresh = driveRemote("good", "u1", drive.fetch);
    expect((await fresh.getLibrary())?.notes["n1"]?.contentAt).toBe(5);
  });

  it("노트 파일 올리기·받기·지우기", async () => {
    const r = driveRemote("good", "u1", drive.fetch);
    await r.upload("n1", new Blob(["PK-zip-bytes"]));
    expect(await (await r.download("n1")).text()).toBe("PK-zip-bytes");
    await r.remove(["n1", "없는것"]);
    expect(drive.files.size).toBe(0);
    await expect(r.download("n1")).rejects.toThrow("Drive에 노트 파일이 없어요");
  });

  it("출입증이 만료되면 NeedsAuth (화면이 '다시 연결'을 보여 준다)", async () => {
    const r = driveRemote("expired", "u1", drive.fetch);
    await expect(r.getLibrary()).rejects.toBeInstanceOf(NeedsAuth);
  });

  it("동기화 전체가 Drive 위에서 돈다 (노트 하나 올림 → 목록 + 노트 파일)", async () => {
    globalThis.indexedDB = new IDBFactory();
    __resetDB();
    __forgetSaved();
    libraryStore.setState({ notes: [], folders: [], openNoteId: null });
    await createNote("드라이브 시험", null);
    const report = await syncWith(driveRemote("good", "u1", drive.fetch));
    expect(report.uploaded).toBe(1);
    expect([...drive.files.values()].map((f) => f.name).sort()).toEqual([`${libraryStore.getState().notes[0]?.id}.sketchlab`, "library.json"].sort());
  });
});
