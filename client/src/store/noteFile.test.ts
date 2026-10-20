import "fake-indexeddb/auto";
import { IR_VERSION } from "@sketchlab/shared";
import { IDBFactory } from "fake-indexeddb";
import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";
import type { CanvasItem, ObjectItem } from "../ink/types";
import { __resetDB, getDB, MEDIA } from "./db";
import { libraryStore } from "./library";
import { getMedia, putMedia } from "./media";
import { createNote } from "./noteActions";
import { buildNoteZip, importNoteFile } from "./noteFile";
import { itemsKey } from "./pages";
import { __forgetSaved, loadItems, loadPages } from "./persistence";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const pngBlob = () => new Blob([Uint8Array.from(atob(PNG.split(",")[1] as string), (c) => c.charCodeAt(0))], { type: "image/png" });
const photo = (id: string, data: Record<string, unknown>): ObjectItem => ({
  id,
  kind: "object",
  ir: { version: IR_VERSION, confidence: 1, source: "manual", kind: "image", data: { w: 1, h: 1, ...data } } as ObjectItem["ir"],
  transform: { x: 0, y: 0, scale: 100 },
  bbox: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
  sourceStrokes: [],
});

describe(".sketchlab 노트 파일 (zip 꾸러미)", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    __resetDB();
    __forgetSaved();
    libraryStore.setState({ notes: [], folders: [], openNoteId: null });
  });

  it("내보내기 → zip 안에 manifest · pages · media(진짜 그림 파일)", async () => {
    const mediaId = await putMedia(pngBlob(), 1, 1);
    const id = await createNote("물리 노트", null, [
      { meta: { title: "1쪽", background: "ruled" }, items: [photo("p", { mediaId })] },
      { meta: { title: "2쪽", background: "blank", layout: "vertical", sheets: 3 }, items: [] },
    ]);
    const { blob, title } = await buildNoteZip(id);
    expect(title).toBe("물리 노트");
    const zip = await JSZip.loadAsync(blob);
    const manifest = JSON.parse(await (zip.file("manifest.json") as JSZip.JSZipObject).async("string"));
    expect(manifest.version).toBe(2);
    expect(manifest.pages.map((p: { file: string }) => p.file)).toEqual(["pages/001.json", "pages/002.json"]);
    expect(manifest.pages[1].layout).toBe("vertical");
    expect(manifest.media).toHaveLength(1);
    expect(zip.file(`media/${mediaId}.png`)).toBeTruthy();
  });

  it("가져오기: 쪽·쪽 설정·사진이 그대로 새 노트로", async () => {
    const mediaId = await putMedia(pngBlob(), 1, 1);
    const id = await createNote("원본", null, [{ meta: { title: "1쪽", background: "grid" }, items: [photo("p", { mediaId })] }]);
    const { blob } = await buildNoteZip(id);
    // 다른 기기처럼: 저장소를 비우고 가져온다
    globalThis.indexedDB = new IDBFactory();
    __resetDB();
    __forgetSaved();
    libraryStore.setState({ notes: [], folders: [], openNoteId: null });
    const newId = await importNoteFile(blob, "대체 이름", null);
    expect(libraryStore.getState().notes.find((n) => n.id === newId)?.title).toBe("원본");
    const idx = await loadPages(newId);
    expect(idx?.pages[0]?.background).toBe("grid");
    const items = (await loadItems(itemsKey(idx?.pages[0]?.id as string))) as CanvasItem[];
    const pic = items[0];
    if (pic?.kind !== "object" || pic.ir.kind !== "image") throw new Error("사진 아님");
    expect(pic.ir.data.mediaId).toBe(mediaId);
    expect((await getMedia(mediaId))?.blob.size).toBeGreaterThan(50);
  });

  it("전체 백업 zip: 빈 노트가 섞여도 노트마다 되살린다", async () => {
    const a = await createNote("빈 노트", null);
    libraryStore.getState().setData({ notes: [...libraryStore.getState().notes, { id: "nX", title: "열어 본 적 없는 노트", folderId: null, createdAt: 1, updatedAt: 1, pageCount: 1 }] });
    const full = new JSZip();
    for (const id of [a, "nX"]) full.file(`${id}.sketchlab`, (await buildNoteZip(id)).blob);
    const blob = await full.generateAsync({ type: "blob" });
    libraryStore.setState({ notes: [], folders: [], openNoteId: null });
    await importNoteFile(blob, "백업", null);
    expect(libraryStore.getState().notes.map((n) => n.title).sort()).toEqual(["빈 노트", "열어 본 적 없는 노트"]);
  });

  it("예전 JSON 노트 파일(사진이 data URL)도 가져오고, 사진은 파일로 옮긴다", async () => {
    const old = JSON.stringify({ format: "sketchlab-note", version: 1, title: "예전 노트", pages: [{ title: "1쪽", background: "blank", items: [photo("p", { src: PNG })] }] });
    const newId = await importNoteFile(new Blob([old], { type: "application/json" }), "x", null);
    const idx = await loadPages(newId);
    const items = (await loadItems(itemsKey(idx?.pages[0]?.id as string))) as CanvasItem[];
    const pic = items[0];
    if (pic?.kind !== "object" || pic.ir.kind !== "image") throw new Error("사진 아님");
    expect(pic.ir.data.src).toBeUndefined();
    expect(pic.ir.data.mediaId).toBeTruthy();
    const d = await (getDB() as NonNullable<ReturnType<typeof getDB>>);
    expect(await d.count(MEDIA)).toBe(1);
  });
});
