import type { CodeOutput } from "@sketchlab/shared";
import { Collector, formatValue, shareTopLevel } from "./output";

/**
 * JavaScript 셀 실행 — 작업자(Web Worker) 안에서 부른다 (화면이 멈추지 않게, 오래 걸리면 통째로 끝낼 수 있게).
 * 전역에서 실행하므로 var·function·(맨 앞 let·const)은 다음 셀에서도 쓸 수 있다.
 * 마지막 식의 값이 있으면 주피터처럼 보여 준다.
 *
 *   print(…)                  글 (console.log도 같다)
 *   table(rows)               표 — [[…]] 또는 [{…}]
 *   plot(xs, ys, "line"|"scatter"|"bar", 이름)  그래프 — plot(ys)만 써도 된다
 */
export async function runJs(code: string): Promise<CodeOutput[]> {
  const col = new Collector();
  const g = globalThis as unknown as Record<string, unknown>;
  const print = (...a: unknown[]) => col.text(a.map((x) => formatValue(x)).join(" "));
  g["print"] = print;
  g["table"] = (rows: unknown) => col.table(rows);
  g["plot"] = (xs: unknown, ys?: unknown, kind?: unknown, label?: unknown) => col.chart(kind === "scatter" || kind === "bar" ? kind : "line", xs, ys, label);
  const cons = globalThis.console;
  const saved = { log: cons.log, info: cons.info, warn: cons.warn, error: cons.error };
  cons.log = print;
  cons.info = print;
  cons.warn = print;
  cons.error = (...a: unknown[]) => col.text(a.map((x) => formatValue(x)).join(" "), true);
  try {
    // 간접 eval = 전역에서 실행 (이 함수의 변수는 안 보인다)
    let result: unknown = (0, eval)(shareTopLevel(code));
    if (result && typeof (result as { then?: unknown }).then === "function") result = await result;
    if (result !== undefined) col.text(formatValue(result));
  } catch (e) {
    col.text(e instanceof Error ? `${e.name}: ${e.message}` : `오류: ${formatValue(e)}`, true);
  } finally {
    Object.assign(cons, saved);
  }
  return col.items;
}
