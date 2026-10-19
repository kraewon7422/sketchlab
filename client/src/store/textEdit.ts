import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

/**
 * 지금 편집 중인 글 상자 (한 번에 하나). 문서가 아니라 화면 상태라 Undo 대상이 아니다.
 * id가 있으면 기존 글 상자를 고치는 중, null이면 새 글 상자.
 */
export interface TextEditSession {
  id: string | null;
  /** 월드 좌표 (글 상자 왼쪽 위) */
  x: number;
  y: number;
  html: string;
}

export interface TextEditState {
  session: TextEditSession | null;
  open(session: TextEditSession): void;
  close(): void;
}

export const textEditStore = createStore<TextEditState>((set) => ({
  session: null,
  open: (session) => set({ session }),
  close: () => set({ session: null }),
}));

export function useTextEdit<T>(selector: (s: TextEditState) => T): T {
  return useStore(textEditStore, selector);
}
