/**
 * 에러·진단 수집소 — 앱 전체에서 여기 한 곳으로만 모인다.
 *
 * 규약 §2-6: 에러를 삼키지 않는다. 잡은 에러는 UI 에러 카드로 보여주거나
 * 최소한 이 로그에 남긴다. try/catch로 조용히 덮는 코드는 금지.
 *
 * React 밖(전역 핸들러, fetch 실패)에서도 호출되므로 React에 의존하지 않는다.
 */

export type DebugLevel = "error" | "warn" | "info";

export interface DebugEntry {
  readonly id: number;
  /** performance.now() 기준 ms — 벽시계가 아니라 세션 상대 시각 */
  readonly at: number;
  readonly level: DebugLevel;
  /** 어느 모듈이 남겼는지. 예: "ink", "tier0", "export" */
  readonly source: string;
  readonly message: string;
  readonly detail?: string;
}

/** 메모리 폭주 방지. 오래된 항목부터 버린다. */
const MAX_ENTRIES = 200;

let nextId = 1;
let snapshot: readonly DebugEntry[] = [];
const listeners = new Set<() => void>();

/** useSyncExternalStore 계약: 데이터가 바뀔 때만 새 참조를 돌려준다. */
export function getEntries(): readonly DebugEntry[] {
  return snapshot;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function record(
  level: DebugLevel,
  source: string,
  message: string,
  detail?: unknown,
): DebugEntry {
  const entry: DebugEntry = {
    id: nextId++,
    at: now(),
    level,
    source,
    message,
    ...(detail === undefined ? {} : { detail: stringifyDetail(detail) }),
  };

  const next = [...snapshot, entry];
  snapshot = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
  for (const listener of listeners) listener();

  // 개발 중에는 콘솔에도 남긴다. 패널을 열지 않아도 놓치지 않도록.
  if (import.meta.env.DEV) {
    const line = `[${source}] ${message}`;
    if (level === "error") console.error(line, detail ?? "");
    else if (level === "warn") console.warn(line, detail ?? "");
    else console.info(line, detail ?? "");
  }

  return entry;
}

export const debugLog = {
  error: (source: string, message: string, detail?: unknown) =>
    record("error", source, message, detail),
  warn: (source: string, message: string, detail?: unknown) =>
    record("warn", source, message, detail),
  info: (source: string, message: string, detail?: unknown) =>
    record("info", source, message, detail),
};

export function clearEntries(): void {
  snapshot = [];
  for (const listener of listeners) listener();
}

let globalHandlersInstalled = false;

/**
 * 잡히지 않은 에러도 패널에 남긴다. 부팅 시 1회 호출.
 * 중복 호출은 무시 (HMR로 모듈이 다시 실행돼도 핸들러가 쌓이지 않게).
 */
export function installGlobalHandlers(target: Window = window): void {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  target.addEventListener("error", (event: ErrorEvent) => {
    debugLog.error(
      "window",
      event.message || "알 수 없는 에러",
      event.error ?? `${event.filename}:${event.lineno}:${event.colno}`,
    );
  });

  target.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    debugLog.error("promise", "처리되지 않은 Promise 거부", event.reason);
  });
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : 0;
}

function stringifyDetail(detail: unknown): string {
  if (detail instanceof Error) return detail.stack ?? `${detail.name}: ${detail.message}`;
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail, null, 2) ?? String(detail);
  } catch {
    // 순환 참조 등 직렬화 불가 — 그래도 정보는 남긴다.
    return String(detail);
  }
}

/** 테스트 전용. 모듈 상태를 초기화한다. */
export function __resetForTest(): void {
  snapshot = [];
  listeners.clear();
  nextId = 1;
  globalHandlersInstalled = false;
}
