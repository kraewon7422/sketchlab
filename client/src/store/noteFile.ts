import type { CanvasItem } from "../ink/types";
import { libraryStore } from "./library";
import { getMedia, mediaIdsOf, migrateItemMedia, putMedia } from "./media";
import { createNote } from "./noteActions";
import { itemsKey, pagesStore, type Background, type PageMeta } from "./pages";
import type { Layout } from "./paper";
import { loadItems, loadPages, reviveItems } from "./persistence";
import { sessionStore } from "./session";

/**
 * 노트 파일 (.sketchlab) — 노트 한 권을 파일 하나로 (다른 기기로 옮기기·보관). 삼성노트 .sdocx처럼 zip 꾸러미:
 *
 *   manifest.json        형식·판·제목·쪽 목록(쪽 설정) ·사진 목록(크기)
 *   pages/001.json …     쪽마다 그림 항목들
 *   media/<id>.webp …    사진·PDF 쪽 그림 — 진짜 그림 파일 (글자로 바꿔 넣지 않아 작고 빠르다)
 *
 * 가져오기는 예전 형식(JSON 하나: 판 1, 사진은 data URL)과 예전 "노트 백업"(sketchlab-notebook)도 받는다.
 * 그림 객체의 내용은 저장소에서 읽을 때와 똑같이 검사한다 (reviveItems).
 */
const FORMAT = "sketchlab-note";
const VERSION = 2;

type PageMetaOut = Omit<PageMeta, "id" | "createdAt">;

interface Manifest {
  format: typeof FORMAT;
  version: number;
  title: string;
  exportedAt: string;
  pages: Array<PageMetaOut & { file: string }>;
  media: Array<{ id: string; file: string; w: number; h: number; type: string }>;
}

const EXT: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

/** 노트 한 권의 쪽들 (열려 있는 노트면 화면의 지금 쪽까지 그대로) */
async function notePages(noteId: string): Promise<Array<{ meta: PageMetaOut; items: CanvasItem[] }>> {
  const open = libraryStore.getState().openNoteId === noteId;
  const index = open ? { pages: pagesStore.getState().pages, currentId: pagesStore.getState().currentId } : await loadPages(noteId);
  const out: Array<{ meta: PageMetaOut; items: CanvasItem[] }> = [];
  for (const p of index?.pages ?? []) {
    const items = open && p.id === index?.currentId ? sessionStore.getState().items : ((await loadItems(itemsKey(p.id))) ?? []);
    const { id: _id, createdAt: _c, ...meta } = p;
    out.push({ meta, items: [...items] });
  }
  // 한 번도 열지 않은 노트는 저장된 쪽 목록이 없다 — 빈 쪽 하나로
  if (out.length === 0) out.push({ meta: { title: "1쪽", background: "blank" }, items: [] });
  return out;
}

/** 노트 한 권 → .sketchlab (zip) */
export async function buildNoteZip(noteId: string): Promise<{ blob: Blob; title: string }> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const title = libraryStore.getState().notes.find((n) => n.id === noteId)?.title ?? "노트";
  const pages = await notePages(noteId);
  const manifest: Manifest = { format: FORMAT, version: VERSION, title, exportedAt: new Date().toISOString(), pages: [], media: [] };
  const seen = new Set<string>();
  for (const [i, p] of pages.entries()) {
    const file = `pages/${String(i + 1).padStart(3, "0")}.json`;
    zip.file(file, JSON.stringify({ items: p.items }));
    manifest.pages.push({ ...p.meta, file });
    for (const id of mediaIdsOf(p.items)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const m = await getMedia(id);
      if (!m) continue;
      const mfile = `media/${id}.${EXT[m.blob.type] ?? "bin"}`;
      // 그림 파일은 이미 압축되어 있다 — 다시 압축하지 않는다 (빠르게)
      zip.file(mfile, m.blob, { compression: "STORE" });
      manifest.media.push({ id, file: mfile, w: m.w, h: m.h, type: m.blob.type });
    }
  }
  zip.file("manifest.json", JSON.stringify(manifest, null, 1));
  return { blob: await zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/zip" }), title };
}

export function noteFileName(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "노트"}.sketchlab`;
}

const BACKGROUNDS: readonly Background[] = ["blank", "ruled", "grid", "graph", "dots"];
const LAYOUTS: readonly Layout[] = ["canvas", "vertical", "horizontal", "two", "continuous"];

/** 쪽 설정을 검사해서 받는다 (모르는 값은 기본값) */
function cleanMeta(p: Record<string, unknown>, i: number): PageMetaOut {
  return {
    title: (typeof p.title === "string" && p.title.trim()) || `${i + 1}쪽`,
    background: BACKGROUNDS.includes(p.background as Background) ? (p.background as Background) : "blank",
    ...(LAYOUTS.includes(p.layout as Layout) ? { layout: p.layout as Layout, sheets: Math.max(1, Math.min(2000, Math.floor(Number(p.sheets) || 1))) } : {}),
    ...(Number(p.sheetW) > 0 && Number(p.sheetH) > 0 ? { sheetW: Number(p.sheetW), sheetH: Number(p.sheetH) } : {}),
  };
}

const cleanItems = (raw: unknown): CanvasItem[] =>
  Array.isArray(raw) ? reviveItems((raw as CanvasItem[]).filter((i) => !!i && typeof i === "object" && (i.kind === "ink" || i.kind === "object") && typeof i.id === "string")) : [];

/** 파일 → 새 노트 (지금 보던 폴더에). 새 노트 id */
export async function importNoteFile(file: Blob, fallbackTitle: string, folderId: string | null): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // "PK"
  return isZip ? importZip(file, fallbackTitle, folderId) : importJson(await file.text(), fallbackTitle, folderId);
}

async function importZip(file: Blob, fallbackTitle: string, folderId: string | null): Promise<string> {
  const { default: JSZip } = await import("jszip");
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (e) {
    throw new Error("SketchLab 노트 파일이 아니에요", { cause: e });
  }
  const mf = zip.file("manifest.json");
  if (!mf) {
    // 전체 백업(노트 파일 여러 개를 담은 zip) — 노트마다 새 노트로
    const inner = zip.file(/\.sketchlab$/i);
    if (inner.length === 0) throw new Error("SketchLab 노트 파일이 아니에요 (manifest.json이 없어요)");
    let first = "";
    for (const f of inner) {
      const id = await importNoteFile(await f.async("blob"), f.name.replace(/\.sketchlab$/i, ""), folderId);
      first ||= id;
    }
    return first;
  }
  const { title, content } = await readNoteZip(zip, mf);
  // 쪽이 없는 노트(한 번도 열지 않은 빈 노트)는 빈 쪽 하나로
  return createNote(title || fallbackTitle, folderId, content);
}

/** 노트 하나짜리 zip → 제목과 쪽들 (사진 파일은 저장소에 넣는다) */
async function readNoteZip(zip: import("jszip"), mf: import("jszip").JSZipObject): Promise<{ title: string; content: Array<{ meta: PageMetaOut; items: CanvasItem[] }> }> {
  const m = JSON.parse(await mf.async("string")) as Partial<Manifest>;
  if (m.format !== FORMAT || !Array.isArray(m.pages)) throw new Error("SketchLab 노트 파일이 아니에요");
  if ((m.version ?? 0) > VERSION) throw new Error("더 새 버전의 SketchLab에서 만든 파일이에요 · 앱을 새로 고쳐 주세요");
  // 사진 파일 먼저 (같은 id면 덮어쓴다 — 같은 노트를 또 가져와도 사진이 두 벌 되지 않게)
  for (const md of m.media ?? []) {
    const f = typeof md.file === "string" ? zip.file(md.file) : null;
    if (!f || typeof md.id !== "string" || !/^[\w-]{1,80}$/.test(md.id)) continue;
    const bytes = await f.async("arraybuffer");
    await putMedia(new Blob([bytes], { type: typeof md.type === "string" ? md.type : "image/webp" }), Number(md.w) || 1, Number(md.h) || 1, md.id);
  }
  const content: Array<{ meta: PageMetaOut; items: CanvasItem[] }> = [];
  for (const [i, p] of m.pages.entries()) {
    const f = typeof p.file === "string" ? zip.file(p.file) : null;
    const items = f ? cleanItems((JSON.parse(await f.async("string")) as { items?: unknown }).items) : [];
    content.push({ meta: cleanMeta(p as unknown as Record<string, unknown>, i), items: (await migrateItemMedia(items)).items });
  }
  return { title: typeof m.title === "string" ? m.title.trim() : "", content };
}

/**
 * 동기화: 받은 노트 파일로 이 기기의 노트 내용을 바꾼다 (같은 노트 id 그대로 — 새 노트를 만들지 않는다).
 * 예전 쪽들은 지우고, 받은 쪽들을 새로 쓴다. 쪽 수를 돌려준다. 열려 있는 노트에는 쓰지 않는다 (부르는 쪽이 막는다).
 */
export async function restoreNoteZip(noteId: string, file: Blob): Promise<number> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);
  const mf = zip.file("manifest.json");
  if (!mf) throw new Error("노트 파일이 아니에요");
  const { content } = await readNoteZip(zip, mf);
  const [{ newPageId }, { deleteItems, flushSaves, saveItems, savePages }] = await Promise.all([import("./pageActions"), import("./persistence")]);
  const old = await loadPages(noteId);
  for (const p of old?.pages ?? []) await deleteItems(itemsKey(p.id));
  const now = Date.now();
  const pages: PageMeta[] = (content.length ? content : [{ meta: { title: "1쪽", background: "blank" as const }, items: [] }]).map((c) => ({ ...c.meta, id: newPageId(), createdAt: now }));
  for (const [i, c] of content.entries()) if (c.items.length) await saveItems(c.items, itemsKey((pages[i] as PageMeta).id));
  await flushSaves();
  await savePages(pages, (pages[0] as PageMeta).id, noteId);
  return pages.length;
}

/** 예전 형식: JSON 하나 (판 1 노트 파일 · 노트 백업) */
async function importJson(text: string, fallbackTitle: string, folderId: string | null): Promise<string> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("SketchLab 노트 파일이 아니에요", { cause: e });
  }
  const f = data as { format?: string; title?: unknown; pages?: unknown };
  if ((f.format !== FORMAT && f.format !== "sketchlab-notebook") || !Array.isArray(f.pages)) throw new Error("SketchLab 노트 파일이 아니에요");
  const content: Array<{ meta: PageMetaOut; items: CanvasItem[] }> = [];
  for (const [i, p] of (f.pages as Array<Record<string, unknown>>).entries()) {
    if (!p || !Array.isArray(p.items)) continue;
    // 예전 파일의 사진(data URL)은 여기서 사진 파일로 옮긴다
    content.push({ meta: cleanMeta(p, i), items: (await migrateItemMedia(cleanItems(p.items))).items });
  }
  if (content.length === 0) throw new Error("가져올 쪽이 없어요");
  return createNote(typeof f.title === "string" && f.title.trim() ? f.title : fallbackTitle, folderId, content);
}
