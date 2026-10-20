import type { CodeOutput } from "@sketchlab/shared";

/**
 * 코드 셀의 결과 모으기 (JS·Python 공용) — print·table·plot이 부르는 곳.
 * 저장 한도(IR)를 넘지 않게 여기서 자른다: 글 2만 자, 조각 60개, 표 60줄×20칸, 그래프 점 5000개.
 */

/** IR 한도 20000보다 조금 작게 — 자른 표시(…)와 줄바꿈이 들어갈 자리 */
const TEXT_MAX = 19_900;
const ITEMS_MAX = 60;

export class Collector {
  readonly items: CodeOutput[] = [];
  private textLen = 0;
  private cut = false;

  text(s: string, error = false): void {
    if (this.textLen >= TEXT_MAX) {
      if (!this.cut) this.push({ t: "text", text: "… (결과가 너무 길어 생략했어요)" });
      this.cut = true;
      return;
    }
    const room = TEXT_MAX - this.textLen;
    const part = s.length > room ? `${s.slice(0, room)}…` : s;
    this.textLen += part.length + 1; // 줄바꿈까지
    const last = this.items[this.items.length - 1];
    // 이어지는 print는 한 덩어리로 (오류는 따로)
    if (last && last.t === "text" && !last.error && !error) last.text += `\n${part}`;
    else this.push({ t: "text", text: part, ...(error ? { error: true } : {}) });
  }

  table(raw: unknown): void {
    const rows = normalizeTable(raw);
    if (!rows) {
      this.text("table(): 2차원 배열(행들의 배열)이나 객체들의 배열을 넣어 주세요", true);
      return;
    }
    this.push({ t: "table", rows });
  }

  chart(kind: "line" | "scatter" | "bar", xs: unknown, ys: unknown, label?: unknown): void {
    const X = toNumbers(xs);
    let Y = ys === undefined || ys === null ? null : toNumbers(ys);
    let xv = X;
    if (Y === null && X) {
      // plot(ys) 하나만 → x는 0, 1, 2, …
      Y = X;
      xv = X.map((_, i) => i);
    }
    if (!xv || !Y || xv.length === 0 || xv.length !== Y.length) {
      this.text("plot(): x와 y가 같은 길이의 숫자 목록이어야 해요", true);
      return;
    }
    this.push({ t: "chart", kind, xs: xv.slice(0, 5000), ys: Y.slice(0, 5000), ...(typeof label === "string" && label ? { label: label.slice(0, 80) } : {}) });
  }

  private push(item: CodeOutput): void {
    if (this.items.length < ITEMS_MAX) this.items.push(item);
  }
}

function toNumbers(v: unknown): number[] | null {
  if (!v || typeof v !== "object" || !(Symbol.iterator in v)) return null;
  const out: number[] = [];
  for (const x of v as Iterable<unknown>) {
    const n = typeof x === "number" ? x : Number(x);
    if (!Number.isFinite(n)) return null;
    out.push(n);
    if (out.length > 5000) break;
  }
  return out;
}

const cell = (v: unknown) => (typeof v === "string" ? v : formatValue(v)).slice(0, 200);

/** [[…], …] 또는 [{a:1,b:2}, …] → 글자 칸 (객체면 첫 줄이 열 이름) */
export function normalizeTable(raw: unknown): string[][] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  if (raw.every((r) => Array.isArray(r))) return (raw as unknown[][]).slice(0, 60).map((r) => r.slice(0, 20).map(cell));
  if (raw.every((r) => r && typeof r === "object")) {
    const keys = [...new Set((raw as Array<Record<string, unknown>>).flatMap((r) => Object.keys(r)))].slice(0, 20);
    return [keys, ...(raw as Array<Record<string, unknown>>).slice(0, 59).map((r) => keys.map((k) => cell(r[k] ?? "")))];
  }
  return raw.slice(0, 60).map((v) => [cell(v)]);
}

/** JS 값 → 보기 좋은 글자 (콘솔처럼: 문자열은 그대로, 객체는 JSON 비슷하게) */
export function formatValue(v: unknown, depth = 0): string {
  if (typeof v === "string") return depth === 0 ? v : JSON.stringify(v);
  if (typeof v === "number") return Number.isInteger(v) || !Number.isFinite(v) ? String(v) : String(Math.round(v * 1e10) / 1e10);
  if (typeof v === "bigint") return `${v}n`;
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "function") return `ƒ ${v.name || "(익명)"}()`;
  if (typeof v !== "object") return String(v);
  if (depth > 3) return Array.isArray(v) ? "[…]" : "{…}";
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (Array.isArray(v)) {
    const head = v.slice(0, 100).map((x) => formatValue(x, depth + 1));
    return `[${head.join(", ")}${v.length > 100 ? `, … (${v.length}개)` : ""}]`;
  }
  if (v instanceof Map) return `Map(${v.size}) {${[...v].slice(0, 50).map(([k, x]) => `${formatValue(k, depth + 1)} => ${formatValue(x, depth + 1)}`).join(", ")}}`;
  if (v instanceof Set) return `Set(${v.size}) {${[...v].slice(0, 50).map((x) => formatValue(x, depth + 1)).join(", ")}}`;
  const entries = Object.entries(v as Record<string, unknown>).slice(0, 50);
  return `{${entries.map(([k, x]) => `${k}: ${formatValue(x, depth + 1)}`).join(", ")}}`;
}

/**
 * 셀끼리 변수를 나눠 쓰게: 맨 앞(들여쓰기 없는) let·const → var.
 * 셀은 따로따로 실행되는데, 전역의 let·const는 그 실행 안에서만 살아 있어서다 (var·function은 남는다).
 */
export function shareTopLevel(code: string): string {
  return code.replace(/^(let|const)(\s)/gm, "var$2");
}
