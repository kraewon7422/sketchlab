/// <reference lib="webworker" />
import { runJs } from "./jsRun";

/** JavaScript 셀 작업자 — 노트마다 하나. 오래 걸리면 화면 쪽에서 통째로 끝낸다 (kernel.ts). */
self.onmessage = async (e: MessageEvent<{ id: number; code: string }>) => {
  const t0 = performance.now();
  const items = await runJs(e.data.code);
  self.postMessage({ id: e.data.id, items, ms: performance.now() - t0 });
};
