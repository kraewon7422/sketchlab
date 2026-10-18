import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { IDENTITY_VIEW, type View } from "../ink/geometry";

/**
 * 캔버스 이동·확대 상태 (v4 §12.2). 문서가 아니라 "보는 위치"라서 Undo·저장 대상이 아니다.
 */
export interface ViewportState extends View {
  setView(view: View): void;
  reset(): void;
}

export const viewportStore = createStore<ViewportState>((set) => ({
  ...IDENTITY_VIEW,
  setView: (view) => set({ tx: view.tx, ty: view.ty, k: view.k }),
  reset: () => set(IDENTITY_VIEW),
}));

export function useViewport<T>(selector: (state: ViewportState) => T): T {
  return useStore(viewportStore, selector);
}
