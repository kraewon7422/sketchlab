import { createStore } from "zustand/vanilla";
import { selectionBox } from "../ink/editing";
import type { CanvasItem } from "../ink/types";
import { sessionStore } from "./session";

/**
 * 선택 상자 둘레의 화면 상태 (저장하지 않는다) — 삼성노트처럼:
 *   clipboard: 앱 안 [잘라내기]·[복사]한 항목 → [붙여넣기] (다른 쪽·노트에도)
 *   chip:      빈 곳을 길게 눌렀을 때 뜨는 [붙여넣기] 말풍선 자리 (월드 좌표)
 *   lifting:   고른 것을 끌고 있는 중 → 상자에 그림자 (들어 올린 느낌)
 *   spun:      손글씨·여러 개를 돌린 뒤의 돌린 상자 — 선택이 그대로인 동안 상자가 내용과 함께 기울어 있게
 */
export interface Frame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 도, 시계 방향 */
  deg: number;
}

interface SelectionUi {
  clipboard: CanvasItem[];
  chip: { x: number; y: number } | null;
  lifting: boolean;
  spun: { key: string; anchorId: string; ax: number; ay: number; frame: Frame } | null;
}

export const selectionUi = createStore<SelectionUi>(() => ({ clipboard: [], chip: null, lifting: false, spun: null }));

/** 고른 것을 앱 안 클립보드에 (원본은 그대로) */
export function copyItems(ids: readonly string[]): number {
  const items = sessionStore.getState().items.filter((i) => ids.includes(i.id));
  if (items.length > 0) selectionUi.setState({ clipboard: structuredClone(items) as CanvasItem[] });
  return items.length;
}

/** 잘라내기 = 복사 + 삭제 (Undo 1단위는 삭제) */
export function cutItems(ids: readonly string[]): number {
  const n = copyItems(ids);
  if (n > 0) sessionStore.getState().removeItems(ids);
  return n;
}

let pasteCount = 0;
/**
 * 붙여넣기 — (x, y)를 주면 그 자리(왼쪽 위)에, 아니면 원래 자리에서 조금씩 비켜서.
 * 붙인 것은 바로 골라진다.
 */
export function pasteItems(at?: { x: number; y: number }): number {
  const { clipboard } = selectionUi.getState();
  if (clipboard.length === 0) return 0;
  const box = selectionBox(clipboard, clipboard.map((i) => i.id));
  if (!box) return 0;
  pasteCount += 1;
  const dx = at ? at.x - box.minX : 24 * pasteCount;
  const dy = at ? at.y - box.minY : 24 * pasteCount;
  sessionStore.getState().pasteItems(clipboard, dx, dy);
  selectionUi.setState({ chip: null });
  return clipboard.length;
}
