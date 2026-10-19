import { deleteItems, flushSaves, loadItems, saveItems } from "./persistence";
import { itemsKey, pagesStore, type Background, type PageMeta } from "./pages";
import { sessionStore, type SessionState } from "./session";
import { viewportStore } from "./viewport";

/**
 * 쪽 다루기 — 새 쪽·넘기기·이름·순서·지우기·배경.
 * 쪽을 넘기면 지금 쪽을 먼저 확실히 저장한 뒤 다음 쪽을 불러온다.
 * 되돌리기 기록은 쪽마다 따로 들고 있다가 돌아오면 이어 쓴다 (앱을 닫으면 사라진다).
 */

/** 쪽 id → 그 쪽의 되돌리기 기록 (메모리에만) */
const histories = new Map<string, SessionState["history"]>();

let counter = 0;
const newPageId = () => `p${Date.now().toString(36)}${(++counter).toString(36)}`;

export async function switchPage(id: string): Promise<void> {
  const s = pagesStore.getState();
  if (id === s.currentId || !s.pages.some((p) => p.id === id)) return;
  await saveItems(sessionStore.getState().items, itemsKey(s.currentId));
  await flushSaves();
  const items = (await loadItems(itemsKey(id))) ?? [];
  // 쪽 번호를 먼저 바꾼 뒤 불러온다 — 불러오는 순간의 자동 저장이 새 쪽 키로 가도록
  pagesStore.getState().set(s.pages, id);
  histories.set(s.currentId, sessionStore.getState().history);
  sessionStore.getState().hydrate(items);
  const kept = histories.get(id);
  if (kept) sessionStore.setState({ history: kept });
  viewportStore.getState().reset();
}

export async function addPage(): Promise<void> {
  const s = pagesStore.getState();
  const current = s.pages.find((p) => p.id === s.currentId);
  const page: PageMeta = {
    id: newPageId(),
    title: `${s.pages.length + 1}쪽`,
    background: current?.background ?? "blank", // 새 쪽은 지금 쪽 배경을 이어 받는다
    createdAt: Date.now(),
  };
  const at = s.pages.findIndex((p) => p.id === s.currentId) + 1;
  pagesStore.getState().set([...s.pages.slice(0, at), page, ...s.pages.slice(at)]);
  await switchPage(page.id);
}

export function renamePage(id: string, title: string): void {
  const s = pagesStore.getState();
  const t = title.trim() || "제목 없음";
  pagesStore.getState().set(s.pages.map((p) => (p.id === id ? { ...p, title: t } : p)));
}

export function movePage(id: string, dir: -1 | 1): void {
  const pages = [...pagesStore.getState().pages];
  const i = pages.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= pages.length) return;
  [pages[i], pages[j]] = [pages[j] as PageMeta, pages[i] as PageMeta];
  pagesStore.getState().set(pages);
}

/** 쪽 지우기 — 마지막 한 쪽은 지우지 않고 비운다 */
export async function deletePage(id: string): Promise<void> {
  const s = pagesStore.getState();
  if (s.pages.length <= 1) {
    sessionStore.getState().clearAll();
    return;
  }
  const i = s.pages.findIndex((p) => p.id === id);
  const rest = s.pages.filter((p) => p.id !== id);
  if (id === s.currentId) await switchPage((rest[Math.max(0, i - 1)] as PageMeta).id);
  pagesStore.getState().set(rest);
  histories.delete(id);
  await deleteItems(itemsKey(id));
}

export function setBackground(bg: Background): void {
  const s = pagesStore.getState();
  pagesStore.getState().set(s.pages.map((p) => (p.id === s.currentId ? { ...p, background: bg } : p)));
}
