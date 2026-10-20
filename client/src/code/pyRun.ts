import type { CodeOutput } from "@sketchlab/shared";
import type { PyodideInterface } from "pyodide";
import { Collector } from "./output";

/**
 * Python 셀 실행 (Pyodide). 작업자 안에서도, 시험(node)에서도 같은 함수를 쓴다.
 * 변수는 Pyodide 전역에 남아 다음 셀에서 쓸 수 있다. 마지막 식의 값은 repr로 보여 준다.
 *
 *   print(…)                       글
 *   table(rows, header=None)       표
 *   plot(xs, ys=None, kind="line", label=None)   그래프 ("scatter", "bar")
 *
 * import numpy 처럼 기본에 없는 꾸러미는 처음 쓸 때 내려받는다 (인터넷 필요).
 */

const HELPERS = `
import json as _sl_json
def table(rows, header=None):
    rows = [[str(c) for c in r] for r in rows]
    if header is not None:
        rows = [[str(c) for c in header]] + rows
    _sl_emit(_sl_json.dumps({"t": "table", "rows": rows}))
def plot(xs, ys=None, kind="line", label=None):
    xs = list(xs)
    if ys is None:
        ys = xs
        xs = list(range(len(ys)))
    ys = list(ys)
    _sl_emit(_sl_json.dumps({"t": "chart", "kind": kind, "xs": [float(v) for v in xs], "ys": [float(v) for v in ys], "label": label}))
`;

let current: Collector | null = null;
const ready = new WeakSet<PyodideInterface>();

function setup(py: PyodideInterface): void {
  if (ready.has(py)) return;
  py.globals.set("_sl_emit", (s: string) => {
    const o = JSON.parse(s) as { t: string; rows?: unknown; kind?: string; xs?: unknown; ys?: unknown; label?: unknown };
    if (!current) return;
    if (o.t === "table") current.table(o.rows);
    else current.chart(o.kind === "scatter" || o.kind === "bar" ? o.kind : "line", o.xs, o.ys, o.label ?? undefined);
  });
  py.runPython(HELPERS);
  py.setStdout({ batched: (s: string) => current?.text(s) });
  py.setStderr({ batched: (s: string) => current?.text(s, true) });
  ready.add(py);
}

/** 파이썬 오류 → 마지막 몇 줄 (사용자 코드 줄과 오류 이름만) */
export function trimTraceback(message: string): string {
  const lines = message.trimEnd().split("\n");
  const start = lines.findIndex((l) => l.includes('File "<exec>"'));
  const tail = start >= 0 ? lines.slice(start) : lines.slice(-4);
  return tail.map((l) => l.replace('File "<exec>"', "셀")).join("\n");
}

export async function runPy(py: PyodideInterface, code: string): Promise<CodeOutput[]> {
  setup(py);
  const col = new Collector();
  current = col;
  try {
    try {
      // "Loading numpy" 같은 안내는 결과에 섞지 않는다
      await py.loadPackagesFromImports(code, { messageCallback: () => undefined });
    } catch (e) {
      col.text(`꾸러미를 내려받지 못했어요 (인터넷 연결 확인): ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`, true);
    }
    const result: unknown = await py.runPythonAsync(code);
    if (result !== undefined && result !== null) {
      const proxy = result as { toString(): string; destroy?: () => void; type?: string };
      if (typeof result === "object" && typeof proxy.destroy === "function") {
        const repr = py.globals.get("repr") as (x: unknown) => string;
        col.text(repr(result));
        proxy.destroy();
      } else if (typeof result === "string") col.text(JSON.stringify(result).replace(/^"|"$/g, "'"));
      else if (typeof result === "boolean") col.text(result ? "True" : "False");
      else col.text(String(result));
    }
  } catch (e) {
    col.text(trimTraceback(e instanceof Error ? e.message : String(e)), true);
  } finally {
    current = null;
  }
  return col.items;
}
