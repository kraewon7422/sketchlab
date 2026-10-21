/// <reference lib="webworker" />
import { loadPyodide, type PyodideInterface } from "pyodide";
import { runPy } from "./pyRun";

/**
 * Python 셀 작업자 — 처음 실행할 때 Pyodide(파이썬, 약 10 MB)를 불러온다.
 * 기본 파이썬은 앱과 같은 곳(indexURL)에서, numpy 같은 꾸러미는 처음 import할 때 CDN에서.
 */
const PACKAGES = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
let py: Promise<PyodideInterface> | null = null;

self.onmessage = async (e: MessageEvent<{ id: number; code: string; indexURL: string; stdin?: string }>) => {
  const { id, code, indexURL, stdin } = e.data;
  if (!py) {
    self.postMessage({ id, status: "loading" });
    py = loadPyodide({ indexURL, packageBaseUrl: PACKAGES });
  }
  try {
    const p = await py;
    const t0 = performance.now();
    const items = await runPy(p, code, stdin ?? "");
    self.postMessage({ id, items, ms: performance.now() - t0 });
  } catch (err) {
    py = null;
    self.postMessage({ id, items: [{ t: "text", text: `파이썬을 불러오지 못했어요: ${err instanceof Error ? err.message : String(err)}`, error: true }], ms: 0 });
  }
};
