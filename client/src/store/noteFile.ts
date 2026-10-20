import type { CanvasItem } from "../ink/types";
import { libraryStore } from "./library";
import { createNote } from "./noteActions";
import { itemsKey, pagesStore, type Background, type PageMeta } from "./pages";
import type { Layout } from "./paper";
import { loadItems, loadPages, reviveItems } from "./persistence";
import { sessionStore } from "./session";

/**
 * 노트 파일 (.sketchlab) — 노트 한 권을 파일 하나로 내보내고 가져오기 (다른 기기로 옮기기·보관).
 * 가져오기는 예전 "노트 백업" 파일(sketchlab-notebook)도 받는다 — 둘 다 새 노트가 된다.
 * 그림 객체의 내용은 저장소에서 읽을 때와 똑같이 검사한다 (reviveItems).
 */
const FORMAT = "sketchlab-note";
const VERSION = 1;

type PageOut = Omit<PageMeta, "id" | "createdAt"> & { items: CanvasItem[] };

export interface NoteFile {
  format: typeof FORMAT;
  version: number;
  title: string;
  exportedAt: string;
  pages: PageOut[];
}

/** 노트 한 권 → 파일 내용 (열려 있는 노트면 화면의 지금 쪽까지 그대로) */
export async function buildNoteFile(noteId: string): Promise<NoteFile> {
  const note = libraryStore.getState().notes.find((n) => n.id === noteId);
  const open = libraryStore.getState().openNoteId === noteId;
  const index = open ? { pages: pagesStore.getState().pages, currentId: pagesStore.getState().currentId } : await loadPages(noteId);
  const pages: PageOut[] = [];
  for (const p of index?.pages ?? []) {
    const items = open && p.id === index?.currentId ? sessionStore.getState().items : ((await loadItems(itemsKey(p.id))) ?? []);
    const { id: _id, createdAt: _c, ...meta } = p;
    pages.push({ ...meta, items: [...items] });
  }
  return { format: FORMAT, version: VERSION, title: note?.title ?? "노트", exportedAt: new Date().toISOString(), pages };
}

export function noteFileName(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "노트"}.sketchlab`;
}

const BACKGROUNDS: readonly Background[] = ["blank", "ruled", "grid", "graph", "dots"];
const LAYOUTS: readonly Layout[] = ["canvas", "vertical", "horizontal", "two", "continuous"];

/** 파일 → 새 노트 (지금 보던 폴더에). 새 노트 id */
export async function importNoteFile(text: string, fallbackTitle: string, folderId: string | null): Promise<string> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("SketchLab 노트 파일이 아니에요", { cause: e });
  }
  const f = data as { format?: string; version?: number; title?: unknown; pages?: unknown };
  if ((f.format !== FORMAT && f.format !== "sketchlab-notebook") || !Array.isArray(f.pages)) throw new Error("SketchLab 노트 파일이 아니에요");
  if ((f.version ?? 0) > VERSION && f.format === FORMAT) throw new Error("더 새 버전의 SketchLab에서 만든 파일이에요 · 앱을 새로 고쳐 주세요");
  const content = (f.pages as Array<Record<string, unknown>>)
    .filter((p) => p && Array.isArray(p.items))
    .map((p, i) => ({
      meta: {
        title: (typeof p.title === "string" && p.title.trim()) || `${i + 1}쪽`,
        background: BACKGROUNDS.includes(p.background as Background) ? (p.background as Background) : ("blank" as Background),
        ...(LAYOUTS.includes(p.layout as Layout) ? { layout: p.layout as Layout, sheets: Math.max(1, Math.min(2000, Math.floor(Number(p.sheets) || 1))) } : {}),
        ...(Number(p.sheetW) > 0 && Number(p.sheetH) > 0 ? { sheetW: Number(p.sheetW), sheetH: Number(p.sheetH) } : {}),
      },
      items: reviveItems((p.items as CanvasItem[]).filter((i) => !!i && typeof i === "object" && (i.kind === "ink" || i.kind === "object") && typeof i.id === "string")),
    }));
  if (content.length === 0) throw new Error("가져올 쪽이 없어요");
  const title = typeof f.title === "string" && f.title.trim() ? f.title : fallbackTitle;
  return createNote(title, folderId, content);
}
