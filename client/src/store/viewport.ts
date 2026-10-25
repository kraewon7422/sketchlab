import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { IDENTITY_VIEW, type View } from "../ink/geometry";

/**
 * 캔버스 이동·확대 상태 (v4 §12.2). 문서가 아니라 "보는 위치"라서 Undo·저장 대상이 아니다.
 *
 * moving: 손가락·휠로 화면을 움직이는 중. 이동 중에는 손글씨·그래프 층을 다시 그리지 않고
 * 그림 한 장처럼 GPU로 옮기기만 하다가(굿노트·삼성노트처럼), 멈추면 한 번 선명하게 다시 그린다.
 * 매 프레임 SVG 전체를 다시 그리면 획이 많은 노트에서 태블릿 핀치가 버벅인다.
 */
export interface ViewportState extends View {
  moving: boolean;
  setView(view: View): void;
  reset(): void;
}

export const viewportStore = createStore<ViewportState>((set) => ({
  ...IDENTITY_VIEW,
  moving: false,
  setView: (view) => set({ tx: view.tx, ty: view.ty, k: view.k }),
  reset: () => set({ ...IDENTITY_VIEW, moving: false }),
}));

/** 이 시간 동안 움직임이 없으면 멈춘 것으로 보고 선명하게 다시 그린다 */
const SETTLE_MS = 140;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

/** 손가락·휠로 화면 옮기기 — 이동 중 표시를 켜고, 잠깐 멈추면 끈다 */
export function moveView(view: View): void {
  const s = viewportStore.getState();
  if (!s.moving) viewportStore.setState({ moving: true });
  s.setView(view);
  if (settleTimer !== null) clearTimeout(settleTimer);
  settleTimer = setTimeout(settleView, SETTLE_MS);
}

/** 이동 끝 — 지금 위치로 선명하게 다시 그린다 */
export function settleView(): void {
  if (settleTimer !== null) clearTimeout(settleTimer);
  settleTimer = null;
  if (viewportStore.getState().moving) viewportStore.setState({ moving: false });
}

export function useViewport<T>(selector: (state: ViewportState) => T): T {
  return useStore(viewportStore, selector);
}
