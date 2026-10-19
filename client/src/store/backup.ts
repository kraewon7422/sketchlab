import type { CanvasItem } from "../ink/types";
import { flushSaves, loadItems, reviveItems, saveItems } from "./persistence";
import { itemsKey, pagesStore, type Background, type PageMeta } from "./pages";
import { sessionStore } from "./session";

/**
 * 노트 백업 (제안 #11 — 사용자가 고른 방식: 파일 하나로 옮기기).
 * 모든 쪽을 JSON 파일 하나로 → 구글 드라이브·삼성 클라우드·카톡 등으로 다른 기기에 옮겨 불러온다.
 * 불러오기는 지금 노트를 지우지 않고 쪽을 "덧붙인다" (실수로 덮어쓰지 않게).
 */

const FORMAT = "sketchlab-notebook";
const VERSION = 1;

interface BackupFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  pages: Array<{ title: string; background: Background; items: CanvasItem[] }>;
}

const BACKGROUNDS: readonly Background[] = ["blank", "ruled", "grid", "graph", "dots"];

/** 모든 쪽을 백업 파일 내용으로 */
export async function buildBackup(): Promise<BackupFile> {
  const { pages, currentId } = pagesStore.getState();
  await saveItems(sessionStore.getState().items, itemsKey(currentId));
  await flushSaves();
  const out: BackupFile["pages"] = [];
  for (const p of pages) {
    const items = p.id === currentId ? sessionStore.getState().items : ((await loadItems(itemsKey(p.id))) ?? []);
    out.push({ title: p.title, background: p.background, items: [...items] });
  }
  return { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), pages: out };
}

export function backupFileName(): string {
  return `SketchLab-노트-${new Date().toISOString().slice(0, 10)}.json`;
}

/**
 * 백업 파일 → 쪽 덧붙이기. 형식이 다르면 오류.
 * 그림 객체의 내용(IR)은 저장소에서 읽을 때와 똑같이 검사한다 (reviveItems) — 손상된 객체는 원본 손글씨로.
 */
export async function importBackup(text: string): Promise<number> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("SketchLab 백업 파일이 아니에요");
  }
  const b = data as Partial<BackupFile>;
  if (b.format !== FORMAT || !Array.isArray(b.pages)) throw new Error("SketchLab 백업 파일이 아니에요");
  if ((b.version ?? 0) > VERSION) throw new Error("더 새 버전의 SketchLab에서 만든 백업이에요 · 앱을 새로 고쳐 주세요");

  const s = pagesStore.getState();
  const added: PageMeta[] = [];
  let n = 0;
  for (const raw of b.pages) {
    if (!raw || !Array.isArray(raw.items)) continue;
    const items = reviveItems(raw.items.filter((i): i is CanvasItem => !!i && typeof i === "object" && (i.kind === "ink" || i.kind === "object") && typeof i.id === "string"));
    n += 1;
    const page: PageMeta = {
      id: `p${Date.now().toString(36)}${n.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
      title: `${(typeof raw.title === "string" && raw.title.trim()) || `${n}쪽`} (불러옴)`.slice(0, 60),
      background: BACKGROUNDS.includes(raw.background as Background) ? (raw.background as Background) : "blank",
      createdAt: Date.now(),
    };
    await saveItems(items, itemsKey(page.id));
    added.push(page);
  }
  if (added.length === 0) throw new Error("불러올 쪽이 없어요");
  await flushSaves();
  pagesStore.getState().set([...s.pages, ...added]);
  return added.length;
}
