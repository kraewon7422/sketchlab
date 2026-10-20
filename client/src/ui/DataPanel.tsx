import { useMemo, useRef, useState, type ReactElement } from "react";
import { buildChart, buildTableIR, chartOptions, fromRows, parseTable, type ChartKind, type Table } from "../math/data";
import { markFresh } from "../render/Shape2DView";
import { plot, theme } from "../render/theme";
import { sessionStore } from "../store/session";
import { freeSpot, type Area } from "./placement";

/**
 * ƒ의 "표·차트" — 자료를 붙여넣거나(엑셀에서 칸 복사 → 붙여넣기) CSV·엑셀 파일을 열어
 *   표 · 산점도(+회귀선) · 꺾은선 · 막대그래프 로 노트에 넣는다.
 * 엑셀(.xlsx) 읽기는 파일을 고를 때만 내려받는다.
 */
const EXAMPLE = "공부 시간\t점수\n1\t52\n2\t60\n3\t71\n4\t77\n5\t90";

const CHARTS: Array<[ChartKind, string]> = [
  ["scatter", "산점도 + 회귀선"],
  ["line", "꺾은선그래프"],
  ["bar", "막대그래프"],
];

export function DataPanel({ area, onClose }: { area: Area; onClose: () => void }): ReactElement {
  const [text, setText] = useState("");
  const [fileTable, setFileTable] = useState<Table | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const table = useMemo(() => fileTable ?? (text.trim() ? parseTable(text) : null), [text, fileTable]);
  const options = table ? chartOptions(table) : [];

  const openFile = async (f: File) => {
    setMessage(null);
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const rows = await readSheet(f);
        const t = fromRows(rows as unknown[][]);
        if (!t) throw new Error("빈 시트예요");
        setFileTable(t);
        setText("");
        setMessage(`${f.name} · 첫 시트 ${t.rows.length}줄`);
      } else {
        setFileTable(null);
        setText(await f.text());
        setMessage(f.name);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "파일을 읽지 못했어요");
    }
  };

  const place = (w: number, h: number) => freeSpot(w, h, area);

  const addTable = async () => {
    if (!table) return;
    const { measureTable } = await import("../render/TableObject");
    const { w, h } = await measureTable(table.rows, table.header);
    const { x, y } = place(w, h);
    const id = sessionStore.getState().addObject(buildTableIR(table), { x, y, scale: 1 }, { minX: x, minY: y, maxX: x + w, maxY: y + h });
    markFresh(id);
    onClose();
  };

  const addChart = (kind: ChartKind) => {
    if (!table) return;
    const ir = buildChart(table, kind);
    if (!ir) {
      setMessage("이 자료로는 그 차트를 그릴 수 없어요 · 숫자 칸이 필요해요");
      return;
    }
    const w = Math.min(plot.width, area.width - theme.space[6] * 2);
    const h = w * plot.aspect + 60;
    const { x, y } = place(w, h);
    const id = sessionStore.getState().addObject(ir, { x, y, scale: w }, { minX: x, minY: y, maxX: x + w, maxY: y + h });
    markFresh(id);
    onClose();
  };

  const btn = (enabled: boolean, primary = false) =>
    ({
      height: 38,
      padding: "0 14px",
      border: primary ? "none" : `1px solid ${theme.color.sub}`,
      borderRadius: 999,
      background: primary ? theme.color.accent : theme.color.bg,
      color: primary ? "#fff" : theme.color.ink,
      fontSize: 14,
      fontWeight: 600,
      whiteSpace: "nowrap",
      opacity: enabled ? 1 : 0.4,
      cursor: enabled ? "pointer" : "default",
    }) as const;

  return (
    <div style={{ display: "grid", gap: theme.space[3] }}>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setFileTable(null);
          setMessage(null);
        }}
        placeholder={"엑셀·구글 시트에서 칸을 복사해 붙여넣거나, 쉼표로 적어도 돼요\n예)\n과목,1학기,2학기\n국어,80,85\n수학,90,95"}
        aria-label="표 자료"
        spellCheck={false}
        rows={6}
        style={{ width: "100%", boxSizing: "border-box", padding: 10, border: `1px solid ${theme.color.sub}`, borderRadius: theme.radius.s, fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 14, resize: "vertical", userSelect: "text", WebkitUserSelect: "text" }}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <button type="button" onClick={() => fileRef.current?.click()} style={btn(true)}>
          CSV·엑셀 파일 열기
        </button>
        <button
          type="button"
          onClick={() => {
            setText(EXAMPLE);
            setFileTable(null);
          }}
          style={btn(true)}
        >
          예시 자료
        </button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv" hidden onChange={(e) => (e.target.files?.[0] && void openFile(e.target.files[0]), (e.target.value = ""))} />
        {message && <span style={{ fontSize: 12.5, color: theme.color.asymptote, minWidth: 0, overflowWrap: "anywhere" }}>{message}</span>}
      </div>

      {table && (
        <div style={{ maxHeight: 180, overflow: "auto", border: `1px solid ${theme.color.sub}`, borderRadius: theme.radius.s }}>
          <table style={{ borderCollapse: "collapse", fontSize: 13, width: "max-content", minWidth: "100%" }}>
            <tbody>
              {table.rows.slice(0, 8).map((r, i) => (
                <tr key={i} style={{ background: table.header && i === 0 ? "#EEF2F8" : undefined, fontWeight: table.header && i === 0 ? 600 : 400 }}>
                  {r.map((c, j) => (
                    <td key={j} style={{ padding: "4px 10px", borderBottom: `1px solid ${theme.color.sub}`, whiteSpace: "nowrap" }}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {table.rows.length > 8 && <div style={{ padding: "4px 10px", fontSize: 12, color: theme.color.asymptote }}>… 모두 {table.rows.length}줄</div>}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button type="button" disabled={!table} onClick={() => void addTable()} style={btn(!!table, true)}>
          표로 넣기
        </button>
        {CHARTS.map(([k, label]) => (
          <button key={k} type="button" disabled={!options.includes(k)} onClick={() => addChart(k)} style={btn(options.includes(k))}>
            {label}
          </button>
        ))}
      </div>
      <span style={{ fontSize: 12, color: theme.color.asymptote, wordBreak: "keep-all" }}>
        산점도는 숫자 칸 두 개(첫째 = 가로축), 꺾은선·막대는 첫 칸이 이름이면 그것을 가로축으로 써요
      </span>
    </div>
  );
}
