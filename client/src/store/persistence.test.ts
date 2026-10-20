import "fake-indexeddb/auto";
import { IR_VERSION } from "@sketchlab/shared";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { CanvasItem, InkItem, ObjectItem } from "../ink/types";
import { __resetDB, getDB, ITEM, MEDIA, ORDER, SESSION } from "./db";
import { getMedia, sweepMedia } from "./media";
import { __forgetSaved, allUsedMediaIds, deleteItems, flushSaves, loadItems, pageVersion, saveItems } from "./persistence";

const ink = (id: string, x: number): InkItem => {
  const bbox = { minX: x, minY: 0, maxX: x + 10, maxY: 10 };
  return { id, kind: "ink", bbox, strokes: [{ id: `${id}s`, points: [{ x, y: 0, p: 0.5, t: 0 }, { x: x + 10, y: 10, p: 0.5, t: 8 }], bbox, endedAt: 0, tool: "pen" }] };
};
// 1×1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const photo = (id: string, src: string = PNG): ObjectItem => ({
  id,
  kind: "object",
  ir: { version: IR_VERSION, confidence: 1, source: "manual", kind: "image", data: { src, w: 1, h: 1 } },
  transform: { x: 0, y: 0, scale: 100 },
  bbox: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
  sourceStrokes: [],
});

/** item 저장소에 put이 몇 번 불렸는지 (바뀐 것만 쓰는지 보려고) */
async function countPuts(fn: () => Promise<void>): Promise<number> {
  const d = await (getDB() as NonNullable<ReturnType<typeof getDB>>);
  const proto = Object.getPrototypeOf(d.transaction(ITEM).objectStore(ITEM)) as { put: (...a: unknown[]) => unknown };
  const orig = proto.put;
  let n = 0;
  proto.put = function (this: { name: string }, ...a: unknown[]) {
    if (this.name === ITEM) n += 1;
    return orig.apply(this, a);
  };
  try {
    await fn();
  } finally {
    proto.put = orig;
  }
  return n;
}

describe("저장 구조 (항목별 저장 · 사진 파일 따로)", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    __resetDB();
    __forgetSaved();
  });

  it("저장 → 불러오기, 판 번호가 오른다", async () => {
    const items: CanvasItem[] = [ink("a", 0), ink("b", 50)];
    await saveItems(items, "items:p");
    await flushSaves();
    __forgetSaved(); // 새로 고친 것처럼
    expect((await loadItems("items:p"))?.map((i) => i.id)).toEqual(["a", "b"]);
    expect((await pageVersion("items:p"))?.version).toBe(1);
    await saveItems([...items, ink("c", 90)], "items:p");
    expect((await pageVersion("items:p"))?.version).toBe(2);
  });

  it("획 하나를 더하면 그 하나만 쓴다 (쪽 전체를 다시 쓰지 않는다)", async () => {
    const many: CanvasItem[] = Array.from({ length: 50 }, (_, i) => ink(`i${i}`, i * 20));
    await saveItems(many, "items:q");
    const added = [...many, ink("new", 2000)];
    expect(await countPuts(() => saveItems(added, "items:q"))).toBe(1);
    // 하나 지우기 = put 없음, 순서만
    expect(await countPuts(() => saveItems(added.slice(1), "items:q"))).toBe(0);
    __forgetSaved();
    const back = await loadItems("items:q");
    expect(back).toHaveLength(50);
    expect(back?.[0]?.id).toBe("i1");
    expect(back?.[49]?.id).toBe("new");
  });

  it("예전 형식(쪽 전체 배열 + data URL 사진)을 새 형식으로 옮긴다 — 잃는 것 없이", async () => {
    const d = await (getDB() as NonNullable<ReturnType<typeof getDB>>);
    await d.put(SESSION, [ink("old", 0), photo("pic")], "items:legacy");
    const items = await loadItems("items:legacy");
    expect(items?.map((i) => i.id)).toEqual(["old", "pic"]);
    const pic = items?.[1];
    if (pic?.kind !== "object" || pic.ir.kind !== "image") throw new Error("사진 아님");
    expect(pic.ir.data.src).toBeUndefined();
    expect(pic.ir.data.mediaId).toBeTruthy();
    const media = await getMedia(pic.ir.data.mediaId as string);
    expect(media?.blob.type).toBe("image/png");
    expect(media?.blob.size).toBeGreaterThan(50);
    // 예전 기록은 지워지고 새 기록이 생겼다
    expect(await d.get(SESSION, "items:legacy")).toBeUndefined();
    expect(await d.get(ORDER, "items:legacy")).toBeTruthy();
    __forgetSaved();
    expect((await loadItems("items:legacy"))?.map((i) => i.id)).toEqual(["old", "pic"]);
  });

  it("쪽을 지우면 항목·순서가 다 지워지고, 안 쓰는 사진 파일은 정리된다", async () => {
    const d = await (getDB() as NonNullable<ReturnType<typeof getDB>>);
    await d.put(SESSION, [photo("p1")], "items:a");
    await d.put(SESSION, [photo("p2")], "items:b");
    await loadItems("items:a");
    await loadItems("items:b");
    expect(await d.count(MEDIA)).toBe(2);
    await deleteItems("items:a");
    expect(await d.count(ITEM)).toBe(1);
    expect(await d.get(ORDER, "items:a")).toBeUndefined();
    expect(await sweepMedia(await allUsedMediaIds())).toBe(1);
    expect(await d.count(MEDIA)).toBe(1);
  });
});
