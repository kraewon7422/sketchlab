import type { CSSProperties, ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";

/**
 * 표 — 붙여넣은 자료·엑셀·CSV. 교과서 표처럼: 가는 테두리, 제목 줄은 옅은 바탕·굵게, 숫자는 오른쪽 맞춤.
 * 크기는 transform.scale(글자 크기 배율, 기본 1)로 — 모서리로 키우면 글자도 같이 커진다.
 */
const BASE_FONT = 15;
const isNum = (s: string) => s.trim() !== "" && Number.isFinite(Number(s.replace(/,/g, "")));

export function tableCellStyle(head: boolean, numeric: boolean, scale: number): CSSProperties {
  return {
    padding: `${5 * scale}px ${10 * scale}px`,
    border: `1px solid #C9CFD8`,
    textAlign: numeric ? "right" : "left",
    fontWeight: head ? 600 : 400,
    background: head ? "#EEF2F8" : "#FFFFFF",
    whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
  };
}

function TableView({ rows, header, scale }: { rows: string[][]; header: boolean; scale: number }): ReactElement {
  return (
    <table style={{ borderCollapse: "collapse", fontSize: BASE_FONT * scale, color: theme.color.ink, fontFamily: theme.font.ui, lineHeight: 1.35 }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => {
              const head = header && i === 0;
              const Cell = head ? "th" : "td";
              return (
                <Cell key={j} style={tableCellStyle(head, !head && isNum(c), scale)}>
                  {c}
                </Cell>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TableObject({ item }: { item: ObjectItem }): ReactElement | null {
  if (item.ir.kind !== "table") return null;
  const fresh = isFresh(item.id);
  return (
    <div data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, pointerEvents: "none" }}>
      <TableView rows={item.ir.data.rows} header={item.ir.data.header} scale={item.transform.scale} />
    </div>
  );
}

/** 놓기 전에 실제 크기를 잰다 (화면 밖에 잠깐 그려 보고) */
export async function measureTable(rows: string[][], header: boolean): Promise<{ w: number; h: number }> {
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-10000px;top:0;visibility:hidden";
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(<TableView rows={rows} header={header} scale={1} />));
  const r = host.getBoundingClientRect();
  root.unmount();
  host.remove();
  return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
}
