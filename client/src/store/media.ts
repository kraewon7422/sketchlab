import { debugLog } from "../debug";
import type { CanvasItem } from "../ink/types";
import { getDB, MEDIA } from "./db";

/**
 * 사진·PDF 쪽 그림 파일 — 쪽 안에 글자(data URL)로 박아 두지 않고 따로 된 파일(Blob)로 한 번만 저장한다.
 * 쪽의 그림 객체는 mediaId로만 가리킨다 → 획을 하나 그을 때마다 사진까지 다시 저장되지 않는다.
 *
 * 화면에는 Blob URL(blob:…)로 보여 주고(한 번 만들면 계속 씀), 그림으로 내보낼 때만 data URL로 바꿔 넣는다
 * (SVG를 그림으로 그릴 때 blob: 주소는 불러오지 못한다).
 */

export interface MediaRecord {
  blob: Blob;
  w: number;
  h: number;
  createdAt: number;
}

let counter = 0;
export const newMediaId = (): string => `m${Date.now().toString(36)}${(++counter).toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;

export async function putMedia(blob: Blob, w: number, h: number, id: string = newMediaId()): Promise<string> {
  const db = getDB();
  if (!db) throw new Error("이 기기에서는 사진을 저장할 수 없어요");
  await (await db).put(MEDIA, { blob, w, h, createdAt: Date.now() } satisfies MediaRecord, id);
  return id;
}

export async function getMedia(id: string): Promise<MediaRecord | undefined> {
  const db = getDB();
  if (!db) return undefined;
  try {
    return (await (await db).get(MEDIA, id)) as MediaRecord | undefined;
  } catch (error) {
    debugLog.error("media", "사진을 불러오지 못했습니다", error);
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────── 화면용 주소

const urls = new Map<string, string>();
const loading = new Map<string, Promise<string | null>>();

export const cachedMediaUrl = (id: string): string | undefined => urls.get(id);

export function mediaUrl(id: string): Promise<string | null> {
  const hit = urls.get(id);
  if (hit) return Promise.resolve(hit);
  let p = loading.get(id);
  if (!p) {
    p = getMedia(id).then((m) => {
      loading.delete(id);
      if (!m) return null;
      const u = URL.createObjectURL(m.blob);
      urls.set(id, u);
      return u;
    });
    loading.set(id, p);
  }
  return p;
}

// ─────────────────────────────────────────────────────────── 바꾸기

export function dataUrlToBlob(src: string): Blob {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
  if (!m) throw new Error("data URL이 아니에요");
  const bytes = m[2] ? Uint8Array.from(atob(m[3] as string), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3] as string));
  return new Blob([bytes], { type: m[1] });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * 예전 형식(사진이 data URL로 박힌 쪽)을 새 형식으로 — 사진을 media에 넣고 mediaId로 바꾼다.
 * 바꾼 게 없으면 changed = false (그대로 둔다).
 */
export async function migrateItemMedia(items: readonly CanvasItem[]): Promise<{ items: CanvasItem[]; changed: boolean }> {
  let changed = false;
  const out: CanvasItem[] = [];
  for (const it of items) {
    if (it.kind === "object" && it.ir.kind === "image" && !it.ir.data.mediaId && it.ir.data.src) {
      const { src, ...rest } = it.ir.data;
      const id = await putMedia(dataUrlToBlob(src), rest.w, rest.h);
      out.push({ ...it, ir: { ...it.ir, data: { ...rest, mediaId: id } } });
      changed = true;
    } else out.push(it);
  }
  return { items: out, changed };
}

/** 항목들이 가리키는 사진 id */
export function mediaIdsOf(items: readonly CanvasItem[]): string[] {
  return items.flatMap((it) => (it.kind === "object" && it.ir.kind === "image" && it.ir.data.mediaId ? [it.ir.data.mediaId] : []));
}

/** 내보낼 그림 안의 blob: 주소를 data URL로 (SVG를 그림으로 바꿀 때 blob:은 못 불러온다) */
export async function inlineBlobImages(root: Element): Promise<void> {
  const nodes = [...root.querySelectorAll("image, img")];
  await Promise.all(
    nodes.map(async (n) => {
      const attr = n.tagName.toLowerCase() === "img" ? "src" : "href";
      const href = n.getAttribute(attr) ?? n.getAttribute("xlink:href");
      if (!href?.startsWith("blob:")) return;
      try {
        n.setAttribute(attr, await blobToDataUrl(await (await fetch(href)).blob()));
      } catch (error) {
        debugLog.warn("media", "내보낼 사진을 넣지 못했습니다", error);
      }
    }),
  );
}

/** 어느 쪽에서도 안 쓰는 사진 파일 지우기 (노트를 영구 삭제한 뒤) — 쓰는 id 목록을 받아 나머지를 지운다 */
export async function sweepMedia(used: ReadonlySet<string>): Promise<number> {
  const db = getDB();
  if (!db) return 0;
  const d = await db;
  const keys = (await d.getAllKeys(MEDIA)) as string[];
  let n = 0;
  for (const k of keys) {
    if (used.has(k)) continue;
    await d.delete(MEDIA, k);
    const u = urls.get(k);
    if (u) URL.revokeObjectURL(u);
    urls.delete(k);
    n += 1;
  }
  return n;
}
