import type { CodeOutput, SceneIR } from "@sketchlab/shared";
import { FastForward, Play, RotateCcw } from "lucide-react";
import { memo, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { resetKernels, runCell } from "../code/kernel";
import type { ObjectItem } from "../ink/types";
import { sessionStore } from "../store/session";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";

/**
 * 코드 블록 (7단계) — 이름 붙은 실행 셀. ▶ 실행 · ⏩ 이 쪽의 셀 모두 (위에서 아래로) · ↺ 변수 지우기.
 * 실행은 작업자 안에서 (code/kernel.ts) — 화면은 멈추지 않는다. 결과는 IR에 함께 저장된다.
 * 상자 자체는 터치를 캔버스로 흘려보낸다 (두 번 톡·올가미로 고르기) — 입력칸·단추·결과만 터치를 받는다.
 */

type CodeIR = Extract<SceneIR, { kind: "code" }>;
const MONO = "'JetBrains Mono', 'D2Coding', Consolas, 'Courier New', monospace";

/** 셀마다 실행 상태 (화면에만) */
const statusStore = createStore<Record<string, "loading" | "running" | undefined>>(() => ({}));
const setStatus = (id: string, s: "loading" | "running" | undefined) => statusStore.setState({ [id]: s });

const codeItem = (id: string) => {
  const it = sessionStore.getState().items.find((i) => i.id === id);
  return it && it.kind === "object" && it.ir.kind === "code" ? (it as ObjectItem & { ir: CodeIR }) : null;
};

/** 셀 하나 실행 → 결과를 IR에 기록 (Undo 1단계 "코드 실행") */
export async function runCodeItem(id: string): Promise<void> {
  const item = codeItem(id);
  if (!item) return;
  setStatus(id, "running");
  try {
    const r = await runCell(item.ir.data.lang, item.ir.data.source, (s) => setStatus(id, s));
    const now = codeItem(id);
    if (!now) return;
    sessionStore.getState().commitObjectIR(id, now.ir, { ...now.ir, data: { ...now.ir.data, output: { items: r.items, ms: Math.round(r.ms), ranAt: Date.now() } } }, "코드 실행");
  } finally {
    setStatus(id, undefined);
  }
}

/** 이 쪽의 코드 셀 모두 — 위에서 아래로, 같은 줄이면 왼쪽부터 */
export async function runAllCode(): Promise<void> {
  const cells = sessionStore
    .getState()
    .items.filter((i): i is ObjectItem => i.kind === "object" && i.ir.kind === "code")
    .sort((a, b) => a.bbox.minY - b.bbox.minY || a.bbox.minX - b.bbox.minX);
  for (const c of cells) await runCodeItem(c.id);
}

export default memo(function CodeObject({ item, interactive }: { item: ObjectItem; interactive: boolean }): ReactElement | null {
  if (item.ir.kind !== "code") return null;
  return <CodeBox item={item} ir={item.ir} interactive={interactive} />;
});

function CodeBox({ item, ir, interactive }: { item: ObjectItem; ir: CodeIR; interactive: boolean }) {
  const W = item.transform.scale;
  const data = ir.data;
  const [draft, setDraft] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const status = useStore(statusStore, (s) => s[item.id]);
  const boxRef = useRef<HTMLDivElement>(null);
  const fresh = isFresh(item.id);
  const source = draft ?? data.source;
  const lines = source.split("\n").length;
  const live = interactive ? "auto" : "none";
  const [editing, setEditing] = useState(false);
  const codeStyle = { display: "block", width: "100%", boxSizing: "border-box", padding: "10px 12px", fontFamily: MONO, fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre", tabSize: 2, scrollbarWidth: "thin", pointerEvents: live } as const;

  // 결과가 나오면 키가 바뀐다 → 자리 상자를 실제 크기에 (이력 없이)
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const b = item.bbox;
    if (Math.abs(b.maxY - b.minY - h) > 2 || Math.abs(b.maxX - b.minX - W) > 2) {
      sessionStore.getState().fitObjectBox(item.id, { minX: item.transform.x, minY: item.transform.y, maxX: item.transform.x + W, maxY: item.transform.y + h });
    }
  });

  const save = (patch: Partial<CodeIR["data"]>, label: string) => {
    const now = codeItem(item.id);
    if (!now) return;
    const next = { ...now.ir.data, ...patch };
    if (next.source === now.ir.data.source && next.name === now.ir.data.name) return;
    sessionStore.getState().commitObjectIR(item.id, now.ir, { ...now.ir, data: next }, label);
  };
  const saveDraft = () => {
    if (draft !== null) save({ source: draft.slice(0, 20000) }, "코드 고치기");
    setDraft(null);
  };
  const run = () => {
    saveDraft();
    void runCodeItem(item.id);
  };

  // 실행 단추는 어느 도구에서든 늘 보이고 눌린다 (사용자 요청 — 펜일 때만 되면 불편)
  const btn = { flex: "0 0 auto", height: 32, minWidth: 32, padding: "0 10px", border: "none", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", pointerEvents: "auto" } as const;
  const out = data.output;
  const busy = !!status;

  return (
    <div
      ref={boxRef}
      data-overlay-id={item.id}
      className={fresh ? "sl-fade-in" : undefined}
      style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: W, pointerEvents: "none", background: "#FBFBFD", border: `1px solid ${theme.color.sub}`, borderRadius: 12, boxShadow: "0 2px 10px rgba(26,26,26,0.06)", overflow: "hidden" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px 6px 12px", borderBottom: `1px solid ${theme.color.sub}`, background: "#F3F4F7" }}>
        <input
          aria-label="셀 이름"
          value={name ?? data.name}
          onChange={(e) => setName(e.target.value.slice(0, 40))}
          onBlur={() => {
            if (name !== null) save({ name: name.trim() || data.name }, "셀 이름");
            setName(null);
          }}
          style={{ flex: "1 1 auto", minWidth: 0, border: "none", background: "transparent", fontSize: 13.5, fontWeight: 600, color: theme.color.ink, pointerEvents: live, padding: 0 }}
        />
        <span style={{ flex: "0 0 auto", fontSize: 11.5, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: data.lang === "python" ? "#E7F0FB" : "#FFF4D6", color: data.lang === "python" ? "#2B5D99" : "#8A6100" }}>
          {data.lang === "python" ? "Python" : "JS"}
        </span>
        {(
          <>
            <button type="button" aria-label="변수 모두 지우기 (새로 시작)" title="변수 모두 지우기 (새로 시작)" onClick={() => resetKernels()} style={{ ...btn, padding: 0, background: "transparent", color: theme.color.asymptote }}>
              <RotateCcw size={15} />
            </button>
            <button type="button" aria-label="이 쪽의 셀 모두 실행" title="이 쪽의 셀 모두 실행 (위에서 아래로)" onClick={() => (saveDraft(), void runAllCode())} style={{ ...btn, padding: 0, background: "transparent", color: theme.color.accent }}>
              <FastForward size={16} />
            </button>
            <button type="button" onClick={run} disabled={busy} style={{ ...btn, background: theme.color.accent, color: "#fff", opacity: busy ? 0.6 : 1 }}>
              <Play size={14} fill="#fff" /> 실행
            </button>
          </>
        )}
      </div>
      {!editing ? (
        // 평소엔 글자로 (내보내기에 그대로 찍힌다 — textarea는 친 글자가 복제되지 않는다), 누르면 편집기
        <pre
          role="button"
          tabIndex={interactive ? 0 : -1}
          aria-label={`${data.name} 코드 고치기`}
          onClick={() => interactive && setEditing(true)}
          onKeyDown={(e) => e.key === "Enter" && interactive && setEditing(true)}
          style={{ ...codeStyle, margin: 0, minHeight: `${3 * 1.5}em`, overflowX: "auto", cursor: interactive ? "text" : undefined, color: source ? theme.color.ink : theme.color.asymptote }}
        >
          {source || "print('안녕')  ← 눌러서 코드 쓰기"}
        </pre>
      ) : (
      <textarea
        aria-label={`${data.name} 코드`}
        value={source}
        autoFocus
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={Math.max(3, Math.min(24, lines))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          saveDraft();
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.shiftKey || e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            run();
          } else if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            const t = e.currentTarget;
            const s = t.selectionStart;
            const next = `${source.slice(0, s)}  ${source.slice(t.selectionEnd)}`;
            setDraft(next);
            requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
          }
        }}
        style={{ ...codeStyle, border: "none", outline: "none", resize: "none", background: "transparent", overflowX: "auto", color: theme.color.ink }}
      />
      )}
      {(busy || out) && (
        <div data-code-output style={{ borderTop: `1px dashed ${theme.color.sub}`, padding: "8px 12px 10px", display: "grid", gap: 8 }}>
          {busy ? (
            <div style={{ fontSize: 12.5, color: theme.color.accent }}>{status === "loading" ? "파이썬 준비 중… (처음 한 번, 몇 초)" : "실행 중…"}</div>
          ) : (
            out && (
              <>
                {out.items.length === 0 && <div style={{ fontSize: 12.5, color: theme.color.asymptote }}>(출력 없음)</div>}
                {out.items.map((o, i) => (
                  <OutputView key={i} o={o} width={W - 24} live={live} />
                ))}
                <div data-export-skip style={{ fontSize: 11, color: theme.color.asymptote }}>
                  {out.ms < 1000 ? `${Math.max(1, out.ms)}ms` : `${(out.ms / 1000).toFixed(1)}초`} · {new Date(out.ranAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}

function OutputView({ o, width, live }: { o: CodeOutput; width: number; live: "auto" | "none" }) {
  if (o.t === "text")
    return (
      <pre style={{ margin: 0, maxHeight: 260, overflow: "auto", fontFamily: MONO, fontSize: 12.5, lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: o.error ? "#B3261E" : theme.color.ink, pointerEvents: live }}>
        {o.text}
      </pre>
    );
  if (o.t === "table")
    return (
      <div style={{ maxHeight: 260, overflow: "auto", pointerEvents: live }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
          <tbody>
            {o.rows.map((r, i) => (
              <tr key={i} style={{ background: i === 0 ? "#F1F3F6" : undefined }}>
                {r.map((c, j) => (
                  <td key={j} style={{ border: `1px solid ${theme.color.sub}`, padding: "3px 8px", fontWeight: i === 0 ? 600 : 400, whiteSpace: "nowrap" }}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return <MiniChart o={o} width={width} />;
}

const nice = (v: number) => (Math.abs(v) >= 1000 || Number.isInteger(v) ? String(Math.round(v)) : String(Math.round(v * 100) / 100)).replace("-", "−");

/** 결과 그래프 — 꺾은선·산점도·막대 (축 범위 숫자만 간단히) */
function MiniChart({ o, width }: { o: Extract<CodeOutput, { t: "chart" }>; width: number }) {
  const H = 170;
  const L = 40;
  const B = 22;
  const w = Math.max(80, width - L - 6);
  const h = H - B - 8;
  const xmin = Math.min(...o.xs);
  const xmax = Math.max(...o.xs);
  const ymin = Math.min(0, ...o.ys);
  const ymax = Math.max(0, ...o.ys);
  const sx = (x: number) => L + (xmax === xmin ? w / 2 : ((x - xmin) / (xmax - xmin)) * w);
  const sy = (y: number) => 8 + (ymax === ymin ? h / 2 : h - ((y - ymin) / (ymax - ymin)) * h);
  const color = theme.color.accent;
  const bw = Math.max(2, Math.min(28, (w / Math.max(1, o.xs.length)) * 0.7));
  return (
    <svg width={width} height={H} style={{ display: "block", overflow: "visible" }}>
      <line x1={L} y1={sy(0)} x2={L + w} y2={sy(0)} stroke={theme.color.asymptote} strokeWidth={0.8} />
      <line x1={L} y1={8} x2={L} y2={8 + h} stroke={theme.color.asymptote} strokeWidth={0.8} />
      <g fontSize={10.5} fill={theme.color.asymptote} fontFamily="KaTeX_Main, 'Times New Roman', serif">
        <text x={L - 4} y={12} textAnchor="end">{nice(ymax)}</text>
        <text x={L - 4} y={8 + h} textAnchor="end">{nice(ymin)}</text>
        <text x={L} y={H - 6} textAnchor="start">{nice(xmin)}</text>
        <text x={L + w} y={H - 6} textAnchor="end">{nice(xmax)}</text>
        {o.label && (
          <text x={L + w / 2} y={H - 6} textAnchor="middle" fill={theme.color.ink}>
            {o.label}
          </text>
        )}
      </g>
      {o.kind === "bar" ? (
        <g fill={color} opacity={0.85}>
          {o.xs.map((x, i) => {
            const y = o.ys[i] as number;
            return <rect key={i} x={sx(x) - bw / 2} y={Math.min(sy(y), sy(0))} width={bw} height={Math.abs(sy(y) - sy(0))} />;
          })}
        </g>
      ) : o.kind === "scatter" ? (
        <g fill={color}>
          {o.xs.map((x, i) => (
            <circle key={i} cx={sx(x)} cy={sy(o.ys[i] as number)} r={2.6} />
          ))}
        </g>
      ) : (
        <path d={o.xs.map((x, i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(o.ys[i] as number).toFixed(1)}`).join("")} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      )}
    </svg>
  );
}
