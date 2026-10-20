import type { CodeOutput } from "@sketchlab/shared";
import { libraryStore } from "../store/library";

/**
 * 코드 실행기 (주피터의 "커널") — 언어마다 작업자 하나, 노트마다 새로.
 *   같은 노트의 셀끼리 변수를 나눠 쓴다 · 노트를 바꾸면 처음부터.
 *   실행은 차례로 (모두 실행이 위에서 아래로 순서대로 되게).
 *   너무 오래 걸리면(무한 반복) 작업자를 끝내고 새로 만든다 — 앱은 멈추지 않는다, 변수는 사라진다.
 */

export type Lang = "js" | "python";
export interface RunResult {
  items: CodeOutput[];
  ms: number;
}

const LIMIT_MS: Record<Lang, number> = { js: 10_000, python: 30_000 };
/** 파이썬을 처음 불러오는 시간은 따로 (느린 태블릿·인터넷) */
const PY_LOAD_MS = 120_000;

class Kernel {
  private worker: Worker | null = null;
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private loaded = false;

  constructor(private readonly lang: Lang) {}

  private spawn(): Worker {
    this.worker ??=
      this.lang === "js"
        ? new Worker(new URL("./jsWorker.ts", import.meta.url), { type: "module" })
        : new Worker(new URL("./pyWorker.ts", import.meta.url), { type: "module" });
    return this.worker;
  }

  kill(): void {
    this.worker?.terminate();
    this.worker = null;
    this.loaded = false;
  }

  run(code: string, onStatus?: (s: "loading" | "running") => void): Promise<RunResult> {
    const job = this.queue.then(() => this.runNow(code, onStatus));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private runNow(code: string, onStatus?: (s: "loading" | "running") => void): Promise<RunResult> {
    const w = this.spawn();
    const id = ++this.seq;
    onStatus?.("running");
    return new Promise((resolve) => {
      let limit = this.lang === "python" && !this.loaded ? PY_LOAD_MS : LIMIT_MS[this.lang];
      let timer = setTimeout(onTimeout, limit);
      const done = (r: RunResult) => {
        clearTimeout(timer);
        w.removeEventListener("message", onMessage);
        w.removeEventListener("error", onError);
        resolve(r);
      };
      const onMessage = (e: MessageEvent<{ id: number; status?: "loading"; items?: CodeOutput[]; ms?: number }>) => {
        if (e.data.id !== id) return;
        if (e.data.status === "loading") {
          onStatus?.("loading");
          return;
        }
        if (this.lang === "python") this.loaded = true;
        done({ items: e.data.items ?? [], ms: e.data.ms ?? 0 });
      };
      const onError = (e: ErrorEvent) => {
        this.kill();
        done({ items: [{ t: "text", text: `실행기 오류: ${e.message || "알 수 없음"}`, error: true }], ms: 0 });
      };
      function onTimeout() {
        kernelKill();
        done({ items: [{ t: "text", text: `${Math.round(limit / 1000)}초가 넘어 멈췄어요 (끝나지 않는 반복?) — 변수는 처음부터 다시예요`, error: true }], ms: limit });
      }
      const kernelKill = () => this.kill();
      // 처음 불러오기가 끝나면 그때부터 실행 시간을 잰다
      const reArm = (e: MessageEvent<{ id: number; status?: string }>) => {
        if (e.data.id === id && e.data.status === "loading") {
          clearTimeout(timer);
          limit = PY_LOAD_MS;
          timer = setTimeout(onTimeout, limit);
        }
      };
      w.addEventListener("message", reArm);
      w.addEventListener("message", onMessage);
      w.addEventListener("error", onError);
      const indexURL = new URL(`${import.meta.env.BASE_URL}pyodide/`, location.href).href;
      w.postMessage(this.lang === "python" ? { id, code, indexURL } : { id, code });
    });
  }
}

const kernels: Partial<Record<Lang, Kernel>> = {};
let kernelNote: string | null = null;

export function runCell(lang: Lang, code: string, onStatus?: (s: "loading" | "running") => void): Promise<RunResult> {
  const note = libraryStore.getState().openNoteId;
  if (note !== kernelNote) resetKernels(note);
  const k = (kernels[lang] ??= new Kernel(lang));
  return k.run(code, onStatus);
}

/** 변수 모두 지우기 (새로 시작) — 노트를 바꿀 때도 */
export function resetKernels(note: string | null = libraryStore.getState().openNoteId): void {
  for (const k of Object.values(kernels)) k?.kill();
  delete kernels.js;
  delete kernels.python;
  kernelNote = note;
}
