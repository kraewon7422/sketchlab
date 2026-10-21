import { runC } from "./cRun";

/** C·C++ 작업자 — 끝나지 않는 반복은 kernel이 작업자째 끝낸다 */
self.onmessage = (e: MessageEvent<{ id: number; code: string; stdin?: string }>) => {
  const t0 = performance.now();
  const r = runC(e.data.code, e.data.stdin ?? "");
  self.postMessage({ id: e.data.id, items: r.items, unsupported: r.unsupported, ms: performance.now() - t0 });
};
