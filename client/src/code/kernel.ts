import type { CodeOutput } from "@sketchlab/shared";
import { libraryStore } from "../store/library";
import { runOnline } from "./online";
import { resetR, runR } from "./rRun";

/**
 * 코드 실행기 (주피터의 "커널") — 언어마다 작업자 하나, 노트마다 새로.
 *   같은 노트의 셀끼리 변수를 나눠 쓴다 · 노트를 바꾸면 처음부터.
 *   실행은 차례로 (모두 실행이 위에서 아래로 순서대로 되게).
 *   너무 오래 걸리면(무한 반복) 작업자를 끝내고 새로 만든다 — 앱은 멈추지 않는다, 변수는 사라진다.
 * 언어:  js·python·c·cpp = 작업자 (c·cpp는 JSCPP, 모르는 머리말이면 온라인으로 다시)
 *        r = webR (자기 작업자) · java = 온라인(Wandbox) · html = 실행 없이 그대로 결과(샌드박스 화면)
 */

export type Lang = "js" | "python" | "r" | "c" | "cpp" | "java" | "html";
type WorkerLang = "js" | "python" | "c" | "cpp";
export interface RunResult {
  items: CodeOutput[];
  ms: number;
}

const LIMIT_MS: Record<WorkerLang, number> = { js: 10_000, python: 30_000, c: 10_000, cpp: 10_000 };
/** 파이썬을 처음 불러오는 시간은 따로 (느린 태블릿·인터넷) */
const PY_LOAD_MS = 120_000;

class Kernel {
  private worker: Worker | null = null;
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private loaded = false;

  constructor(private readonly lang: WorkerLang) {}

  private spawn(): Worker {
    this.worker ??=
      this.lang === "js"
        ? new Worker(new URL("./jsWorker.ts", import.meta.url), { type: "module" })
        : this.lang === "python"
          ? new Worker(new URL("./pyWorker.ts", import.meta.url), { type: "module" })
          : new Worker(new URL("./cWorker.ts", import.meta.url), { type: "module" });
    return this.worker;
  }

  kill(): void {
    this.worker?.terminate();
    this.worker = null;
    this.loaded = false;
  }

  run(code: string, onStatus?: (s: "loading" | "running") => void, stdin = ""): Promise<RunResult & { unsupported?: string }> {
    const job = this.queue.then(() => this.runNow(code, onStatus, stdin));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private runNow(code: string, onStatus?: (s: "loading" | "running") => void, stdin = ""): Promise<RunResult & { unsupported?: string }> {
    const w = this.spawn();
    const id = ++this.seq;
    onStatus?.("running");
    return new Promise((resolve) => {
      let limit = this.lang === "python" && !this.loaded ? PY_LOAD_MS : LIMIT_MS[this.lang];
      let timer = setTimeout(onTimeout, limit);
      const done = (r: RunResult & { unsupported?: string }) => {
        clearTimeout(timer);
        w.removeEventListener("message", onMessage);
        w.removeEventListener("error", onError);
        resolve(r);
      };
      const onMessage = (e: MessageEvent<{ id: number; status?: "loading"; items?: CodeOutput[]; ms?: number; unsupported?: string }>) => {
        if (e.data.id !== id) return;
        if (e.data.status === "loading") {
          onStatus?.("loading");
          return;
        }
        if (this.lang === "python") this.loaded = true;
        done({ items: e.data.items ?? [], ms: e.data.ms ?? 0, ...(e.data.unsupported ? { unsupported: e.data.unsupported } : {}) });
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
      w.postMessage(this.lang === "python" ? { id, code, indexURL, stdin } : { id, code, stdin });
    });
  }
}

const kernels: Partial<Record<WorkerLang, Kernel>> = {};
let kernelNote: string | null = null;
/** R은 webR 하나 — 차례로 */
let rQueue: Promise<unknown> = Promise.resolve();
const R_LIMIT_MS = 30_000;
const R_LOAD_MS = 180_000;

export async function runCell(lang: Lang, code: string, onStatus?: (s: "loading" | "running") => void, stdin = ""): Promise<RunResult> {
  const note = libraryStore.getState().openNoteId;
  if (note !== kernelNote) resetKernels(note);
  if (lang === "html") return { items: [{ t: "html", html: code.slice(0, 20000) }], ms: 0 };
  if (lang === "java") {
    onStatus?.("running");
    return runOnline("java", code, stdin);
  }
  if (lang === "r") {
    const job = rQueue.then(() => runRWithLimit(code, onStatus, stdin));
    rQueue = job.catch(() => undefined);
    return job;
  }
  const k = (kernels[lang] ??= new Kernel(lang));
  const r = await k.run(code, onStatus, stdin);
  if ((lang === "c" || lang === "cpp") && r.unsupported) {
    // 기기 안 실행기가 못 하는 것 (vector·string 등) → 온라인 컴파일러로
    const online = await runOnline(lang, code, stdin);
    return { items: [{ t: "text", text: `ℹ️ 기기 안 실행기가 지원하지 않아 (${r.unsupported}) 온라인(Wandbox)으로 실행했어요` }, ...online.items], ms: online.ms };
  }
  return r;
}

function runRWithLimit(code: string, onStatus?: (s: "loading" | "running") => void, stdin = ""): Promise<RunResult> {
  let limit = R_LOAD_MS;
  return new Promise<RunResult>((resolve) => {
    let timer = setTimeout(onTimeout, limit);
    function onTimeout() {
      resetR();
      resolve({ items: [{ t: "text", text: `${Math.round(limit / 1000)}초가 넘어 R을 멈췄어요 (끝나지 않는 반복?) — 변수는 처음부터 다시예요`, error: true }], ms: limit });
    }
    runR(
      code,
      () => onStatus?.("loading"),
      () => {
        // 불러오기가 끝나면 그때부터 실행 시간을 잰다
        clearTimeout(timer);
        limit = R_LIMIT_MS;
        timer = setTimeout(onTimeout, limit);
        onStatus?.("running");
      },
      stdin,
    )
      .then((r) => {
        clearTimeout(timer);
        resolve(r);
      })
      .catch((e: unknown) => {
        clearTimeout(timer);
        resetR();
        resolve({ items: [{ t: "text", text: `R을 불러오지 못했어요 — 인터넷 연결을 확인해 주세요 (${e instanceof Error ? e.message : String(e)})`, error: true }], ms: 0 });
      });
  });
}

/** 변수 모두 지우기 (새로 시작) — 노트를 바꿀 때도 */
export function resetKernels(note: string | null = libraryStore.getState().openNoteId): void {
  for (const k of Object.values(kernels)) k?.kill();
  for (const key of Object.keys(kernels) as WorkerLang[]) delete kernels[key];
  resetR();
  kernelNote = note;
}
