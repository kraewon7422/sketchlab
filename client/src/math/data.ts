import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { plot } from "../render/theme";

/**
 * 표·차트 — 붙여넣은 자료(엑셀에서 복사한 칸 = 탭, CSV = 쉼표)나 파일에서 읽은 표를
 *   표 · 산점도(+ 회귀선, r²) · 꺾은선그래프 · 막대그래프 로.
 * 첫 줄이 글자고 둘째 줄부터 숫자면 첫 줄은 제목 줄.
 */

export type Table = { rows: string[][]; header: boolean };
export type ChartKind = "scatter" | "line" | "bar";

const MAX_ROWS = 300;
const MAX_COLS = 20;

const isNum = (s: string | undefined): boolean => s !== undefined && s.trim() !== "" && Number.isFinite(Number(s.replace(/,/g, "").trim()));
const num = (s: string): number => Number(s.replace(/,/g, "").trim());

/** 글자 → 표. 칸 나누기는 탭 > 쉼표 > 세미콜론 > 공백 순으로 가장 그럴듯한 것 */
export function parseTable(text: string): Table | null {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .slice(0, MAX_ROWS);
  if (lines.length === 0) return null;
  const seps = ["\t", ",", ";", /\s{2,}|\s/];
  let rows: string[][] = [];
  for (const sep of seps) {
    const r = lines.map((l) => splitLine(l, sep).slice(0, MAX_COLS));
    const widths = new Set(r.map((x) => x.length));
    if ((r[0]?.length ?? 0) > 1 && widths.size === 1) {
      rows = r;
      break;
    }
    if (rows.length === 0 && (r[0]?.length ?? 0) > 1) rows = r;
  }
  if (rows.length === 0) rows = lines.map((l) => [l.trim()]);
  const width = Math.max(...rows.map((r) => r.length));
  rows = rows.map((r) => [...r, ...Array.from({ length: width - r.length }, () => "")]);
  return fromRows(rows);
}

/** 이미 칸으로 나뉜 자료(엑셀 파일) → 표 */
export function fromRows(raw: ReadonlyArray<ReadonlyArray<unknown>>): Table | null {
  const rows = raw
    .slice(0, MAX_ROWS)
    .map((r) => r.slice(0, MAX_COLS).map((c) => (c === null || c === undefined ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim())))
    .filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) return null;
  const first = rows[0] as string[];
  const second = rows[1];
  const header = rows.length > 1 && first.some((c) => c !== "" && !isNum(c)) && !!second && second.some(isNum);
  return { rows, header };
}

function splitLine(line: string, sep: string | RegExp): string[] {
  if (sep === ",") {
    // CSV: 따옴표 안의 쉼표는 나누지 않는다
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  return line.split(sep).map((c) => c.trim());
}

/** 숫자 칸 번호들 (제목 줄 빼고 모든 칸이 숫자) */
export function numericColumns(t: Table): number[] {
  const body = t.header ? t.rows.slice(1) : t.rows;
  const width = t.rows[0]?.length ?? 0;
  return Array.from({ length: width }, (_, c) => c).filter((c) => body.length > 0 && body.every((r) => isNum(r[c])));
}

/** 이 표로 그릴 수 있는 차트 */
export function chartOptions(t: Table): ChartKind[] {
  const cols = numericColumns(t);
  const out: ChartKind[] = [];
  if (cols.length >= 2) out.push("scatter");
  if (cols.length >= 1 && (t.rows.length - (t.header ? 1 : 0)) >= 2) out.push("line", "bar");
  return out;
}

/** 최소제곱 직선 y = ax + b 와 결정계수 r² */
export function linearRegression(pts: ReadonlyArray<readonly [number, number]>): { a: number; b: number; r2: number } | null {
  const n = pts.length;
  if (n < 2) return null;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
    syy += (y - my) ** 2;
  }
  if (sxx === 0) return null;
  const a = sxy / sxx;
  const b = my - a * mx;
  return { a, b, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}

const r4 = (v: number) => String(Number(v.toPrecision(4)));
const pad = (lo: number, hi: number) => {
  const span = hi - lo || Math.abs(hi) || 1;
  return [lo - span * 0.12, hi + span * 0.12] as const;
};

/** 표 → 차트 IR */
export function buildChart(t: Table, kind: ChartKind): SceneIR | null {
  const head = t.header ? (t.rows[0] as string[]) : null;
  const body = t.header ? t.rows.slice(1) : t.rows;
  const cols = numericColumns(t);
  const name = (c: number) => head?.[c] || `열 ${c + 1}`;
  const base = { version: IR_VERSION, confidence: 1, source: "manual" } as const;
  const common = { grid: false, showAxes: true, showCaption: true } as const;

  if (kind === "scatter") {
    const [cx, cy] = cols;
    if (cx === undefined || cy === undefined) return null;
    const pts = body.map((r) => [num(r[cx] as string), num(r[cy] as string)] as [number, number]);
    const reg = linearRegression(pts);
    const [xmin, xmax] = pad(Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0])));
    const [ymin, ymax] = pad(Math.min(0, ...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1])));
    const line = reg ? `y=${r4(reg.a)}x${reg.b < 0 ? "" : "+"}${r4(reg.b)}` : null;
    return {
      ...base,
      kind: "plot2d",
      data: {
        ...common,
        functions: line ? [{ latex: line, kind: "explicit", color: plot.palette[2] }] : [],
        series: [{ pts, line: false, color: plot.palette[1] }],
        view: { xmin, xmax, ymin, ymax, aspect: "auto", xTicks: "auto", xLabel: name(cx), yLabel: name(cy) },
        // 두 줄 (가운데) — 식 중간에서 줄이 바뀌지 않게
        caption: line && reg
          ? `\\begin{gathered}\\text{${tex(name(cx))} → ${tex(name(cy))}}\\\\ ${line},\\quad r^2=${reg.r2.toFixed(3)}\\end{gathered}`
          : `\\text{${tex(name(cx))} → ${tex(name(cy))}}`,
      },
    };
  }

  // 꺾은선·막대: 첫 칸이 숫자가 아니면 그 칸을 이름(가로축)으로, 아니면 1, 2, 3 …
  const labelCol = cols.includes(0) ? null : 0;
  const valueCols = cols.filter((c) => c !== labelCol);
  if (valueCols.length === 0) return null;
  const labels = body.map((r, i) => (labelCol !== null ? (r[labelCol] as string) : String(i + 1)));
  const values = (c: number) => body.map((r) => num(r[c] as string));
  const all = valueCols.flatMap(values);
  const [ymin, ymax] = pad(Math.min(0, ...all), Math.max(0, ...all));
  const view = { xmin: 0.3, xmax: body.length + 0.7, ymin: Math.min(0, ymin), ymax, aspect: "auto" as const, xTicks: "auto" as const };
  const legend = valueCols.map((c) => `\\text{${tex(name(c))}}`).join(",\\ ");

  if (kind === "bar") {
    const c = valueCols[0] as number;
    return {
      ...base,
      kind: "plot2d",
      data: {
        ...common,
        functions: [],
        bars: values(c).map((h, i) => ({ x: i + 1, h, label: labels[i] })),
        barWidth: 0.62,
        xCategories: labels,
        view,
        caption: `\\text{${tex(name(c))}}`,
      },
    };
  }
  return {
    ...base,
    kind: "plot2d",
    data: {
      ...common,
      functions: [],
      series: valueCols.map((c, k) => ({ pts: values(c).map((v, i) => [i + 1, v] as [number, number]), line: true, color: plot.palette[(k + 1) % plot.palette.length], label: name(c) })),
      xCategories: labels,
      view,
      caption: legend,
    },
  };
}

/** \text{} 안에 넣어도 되게 (LaTeX 특수 문자 빼기) */
function tex(s: string): string {
  return s.replace(/[\\{}$&#%^_~]/g, "").slice(0, 40);
}

/** 표 객체 IR */
export function buildTableIR(t: Table): SceneIR {
  return { version: IR_VERSION, confidence: 1, source: "manual", kind: "table", data: { rows: t.rows, header: t.header } };
}
