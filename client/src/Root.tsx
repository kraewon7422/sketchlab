import type { ReactElement } from "react";
import { App } from "./App";
import { useLibrary } from "./store/library";
import { Library } from "./ui/Library";

/**
 * 맨 위 화면 고르기 — 노트 보관함 ↔ 노트(편집 화면).
 * 노트마다 편집 화면을 새로 그린다 (key) — 도구·확대 같은 그 노트의 화면 상태가 다른 노트로 새지 않게.
 */
export function Root(): ReactElement {
  const ready = useLibrary((s) => s.ready);
  const open = useLibrary((s) => s.openNoteId);
  if (!ready) return <div style={{ height: "100dvh", background: "#F4F5F7" }} />;
  return open ? <App key={open} /> : <Library />;
}
