import { useSyncExternalStore } from "react";
import { theme } from "../render/theme";

/**
 * 반응형 3단계 (v4 §15.2).
 *
 *   wide    ≥ 900px   상단 툴바 + 캔버스 + 우하단 FAB
 *   split   480~899   (갤럭시 탭 분할 화면) 툴바 아이콘만
 *   compact < 480     (팝업 창·폰) 툴바를 하단 엄지 존으로
 *
 * 분할 화면·팝업 창에서는 window.innerWidth가 "앱이 차지한 폭"이므로 그대로 쓰면 된다.
 */
export type LayoutMode = "wide" | "split" | "compact";

export function layoutModeFor(width: number): LayoutMode {
  if (width >= theme.layout.wide) return "wide";
  if (width >= theme.layout.compact) return "split";
  return "compact";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

export function useLayoutMode(): LayoutMode {
  return useSyncExternalStore(
    subscribe,
    () => layoutModeFor(window.innerWidth),
    () => "wide",
  );
}
