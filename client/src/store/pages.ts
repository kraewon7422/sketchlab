import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { A4, type Layout, type Paper } from "./paper";

/**
 * 페이지 목록 (노트 앱의 여러 쪽). 각 쪽의 그림은 IndexedDB에 따로 저장된다 (persistence.ts).
 * 이 스토어는 "어떤 쪽들이 있고 지금 어느 쪽인지"와 쪽마다의 배경만 안다.
 */
export type Background = "blank" | "ruled" | "grid" | "graph" | "dots";

export interface PageMeta {
  id: string;
  title: string;
  background: Background;
  createdAt: number;
  /** 쪽 모양 (없으면 캔버스 — 예전 쪽) · 종이 장 수 · 종이 크기 (PDF는 그 PDF의 비율) */
  layout?: Layout;
  sheets?: number;
  sheetW?: number;
  sheetH?: number;
}

export interface PagesState {
  pages: PageMeta[];
  currentId: string;
  /** 부팅 시 저장소에서 읽은 목록으로 바꾼다 */
  load(pages: PageMeta[], currentId: string): void;
  set(pages: PageMeta[], currentId?: string): void;
}

/** 처음 쓰는 기기·예전 버전의 한 쪽짜리 노트는 이 쪽이 된다 (저장 키도 예전 그대로) */
export const FIRST_PAGE: PageMeta = { id: "p1", title: "1쪽", background: "blank", createdAt: 0 };

export const pagesStore = createStore<PagesState>((set) => ({
  pages: [FIRST_PAGE],
  currentId: FIRST_PAGE.id,
  load: (pages, currentId) => set({ pages: pages.length ? pages : [FIRST_PAGE], currentId: pages.some((p) => p.id === currentId) ? currentId : (pages[0]?.id ?? FIRST_PAGE.id) }),
  set: (pages, currentId) => set((s) => ({ pages, currentId: currentId ?? s.currentId })),
}));

export function usePages<T>(selector: (s: PagesState) => T): T {
  return useStore(pagesStore, selector);
}

export function currentPage(): PageMeta {
  const s = pagesStore.getState();
  return s.pages.find((p) => p.id === s.currentId) ?? (s.pages[0] as PageMeta);
}

/** 이 쪽의 종이 (캔버스면 null) */
export function paperOf(p: PageMeta | undefined): Paper | null {
  if (!p?.layout || p.layout === "canvas") return null;
  return { layout: p.layout, sheets: Math.max(1, p.sheets ?? 1), w: p.sheetW ?? A4.w, h: p.sheetH ?? A4.h };
}

/** 쪽 그림의 저장 키 — 1쪽은 예전 버전과 같은 "items" */
export function itemsKey(pageId: string): string {
  return pageId === FIRST_PAGE.id ? "items" : `items:${pageId}`;
}
