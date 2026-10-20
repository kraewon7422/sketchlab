import { deleteItems, flushSaves, loadItems, saveItems } from "./persistence";
import { itemsKey, pagesStore, paperOf, type Background, type PageMeta } from "./pages";
import { A4, paperBounds, relayoutItems, sheetsNeeded, type Layout, type Paper } from "./paper";
import type { CanvasItem } from "../ink/types";
import { sessionStore, type SessionState } from "./session";
import { viewportStore } from "./viewport";

/**
 * 쪽 다루기 — 새 쪽·넘기기·이름·순서·지우기·배경.
 * 쪽을 넘기면 지금 쪽을 먼저 확실히 저장한 뒤 다음 쪽을 불러온다.
 * 되돌리기 기록은 쪽마다 따로 들고 있다가 돌아오면 이어 쓴다 (앱을 닫으면 사라진다).
 */

/** 쪽 id → 그 쪽의 되돌리기 기록 (메모리에만) */
const histories = new Map<string, SessionState["history"]>();

/** 다른 노트를 열 때 — 쪽별 되돌리기 기록을 비운다 */
export function forgetHistories(): void {
  histories.clear();
}

let counter = 0;
export const newPageId = (): string => `p${Date.now().toString(36)}${(++counter).toString(36)}`;

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
  const paper = paperOf(pagesStore.getState().pages.find((p) => p.id === id));
  if (paper) fitPaper(paper);
  else viewportStore.getState().reset();
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

// ─────────────────────────────────────────────────────────── 쪽 모양 (종이)

/** 종이 첫 장이 화면에 꽉 차게 (가로로 넘기기는 높이에, 나머지는 폭에 맞춘다) */
export function fitPaper(paper: Paper): void {
  const r = document.querySelector("main")?.getBoundingClientRect();
  const W = r?.width ?? window.innerWidth;
  const H = r?.height ?? window.innerHeight;
  const pad = 24;
  if (paper.layout === "horizontal") {
    const k = Math.min(1.25, (H - pad * 2) / paper.h, (W - pad * 2) / paper.w);
    viewportStore.getState().setView({ k, tx: pad, ty: (H - paper.h * k) / 2 });
    return;
  }
  const spread = paper.layout === "two" ? paperBounds({ ...paper, sheets: 2 }).w : paper.w;
  const k = Math.min(1.25, (W - pad * 2) / spread);
  viewportStore.getState().setView({ k, tx: (W - spread * k) / 2, ty: pad });
}

/**
 * 쪽 모양 바꾸기. 종이 → 종이: 글씨가 자기 장을 따라 옮겨진다.
 * 옮겨지는 경우 이 쪽의 되돌리기 기록은 새로 시작한다 (옮기기 전 자리로 되돌리면 장이 어긋나서).
 */
export function setLayout(layout: Layout): void {
  const s = pagesStore.getState();
  const page = s.pages.find((p) => p.id === s.currentId);
  if (!page || (page.layout ?? "canvas") === layout) return;
  const from = paperOf(page);
  let next: PageMeta = { ...page, layout };
  if (layout !== "canvas") {
    const to: Paper = { layout, sheets: Math.max(1, page.sheets ?? 1, from?.sheets ?? 1), w: page.sheetW ?? A4.w, h: page.sheetH ?? A4.h };
    const items = sessionStore.getState().items;
    const moved = relayoutItems(items, from, to);
    to.sheets = Math.max(to.sheets, sheetsNeeded(to, moved));
    next = { ...next, sheets: to.sheets };
    if (from && moved.some((m, i) => m !== items[i] && (m.bbox.minX !== items[i]?.bbox.minX || m.bbox.minY !== items[i]?.bbox.minY))) {
      sessionStore.getState().hydrate(moved);
      histories.delete(page.id);
    }
    pagesStore.getState().set(s.pages.map((p) => (p.id === page.id ? next : p)));
    fitPaper(to);
    return;
  }
  pagesStore.getState().set(s.pages.map((p) => (p.id === page.id ? next : p)));
}

/** 종이 한 장 더 */
export function addSheet(): void {
  const s = pagesStore.getState();
  s.set(s.pages.map((p) => (p.id === s.currentId && paperOf(p) ? { ...p, sheets: Math.max(1, p.sheets ?? 1) + 1 } : p)));
}

/** PDF 배경(잠근 사진)은 장 수 계산에서 뺀다 — PDF 쪽 수 그대로 */
const counts = (i: CanvasItem) => !(i.kind === "object" && i.ir.kind === "image" && i.locked);

/**
 * 마지막 장에 쓰기 시작하면 빈 장을 하나 더 붙인다 (삼성노트처럼 — 계속 아래로 쓸 수 있게).
 * 부팅 때 한 번 건다 (main.tsx).
 */
export function startPaperAutoExtend(): () => void {
  return sessionStore.subscribe((st, prev) => {
    if (st.items === prev.items) return;
    const ps = pagesStore.getState();
    const page = ps.pages.find((p) => p.id === ps.currentId);
    const paper = paperOf(page);
    if (!page || !paper) return;
    const content = st.items.filter(counts);
    if (content.length === 0) return;
    const need = sheetsNeeded(paper, content) + 1;
    if (need > paper.sheets) ps.set(ps.pages.map((p) => (p.id === page.id ? { ...p, sheets: need } : p)));
  });
}

/**
 * 내용이 정해진 새 쪽을 지금 쪽 다음에 만들고 넘어간다 (PDF 가져오기).
 * 그림은 먼저 저장해 두고 넘긴다 — 넘기는 순간 그 쪽을 저장소에서 읽는다.
 */
export async function addPageWith(meta: Omit<PageMeta, "id" | "createdAt">, items: CanvasItem[]): Promise<string> {
  const s = pagesStore.getState();
  const page: PageMeta = { ...meta, id: newPageId(), createdAt: Date.now() };
  await saveItems(items, itemsKey(page.id));
  await flushSaves();
  const at = s.pages.findIndex((p) => p.id === s.currentId) + 1;
  pagesStore.getState().set([...s.pages.slice(0, at), page, ...s.pages.slice(at)]);
  await switchPage(page.id);
  return page.id;
}
