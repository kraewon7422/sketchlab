import type { SceneIR } from "@sketchlab/shared";
import katex from "katex";
import "katex/dist/katex.min.css";
import { memo, useMemo, useState, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { cellIndex, formatCell, resizeTensor, sliceLatex, type Dims } from "../math/tensor";
import { rotate, type View3 } from "../solid/project";
import { sessionStore } from "../store/session";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";
import { useTurntable } from "./useTurntable";

/**
 * 3D 텐서 — 칸(작은 정육면체)을 쌓은 블록. 돌려 볼 수 있고, 단면(겹·행·열) 하나를 골라 진하게 + 그 행렬을 아래에.
 * 그리기: 정육면체마다 보는 쪽 면(최대 3개)을 먼 것부터 칠한다 (같은 크기 칸의 격자라 중심 깊이 순서로 충분).
 */

type TensorIR = Extract<SceneIR, { kind: "tensor" }>;
type V = [number, number, number];
const DEG = Math.PI / 180;
const DEFAULT_VIEW: View3 = { yaw: -32 * DEG, pitch: 24 * DEG };
const AXES = ["겹", "행", "열"] as const;

/** 정육면체의 여섯 면: 바깥 법선 + 네 꼭짓점 (중심 기준 ±0.5) */
const FACES: Array<{ n: V; v: V[] }> = [
  { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];

export default memo(function TensorObject({ item, interactive }: { item: ObjectItem; interactive: boolean }): ReactElement | null {
  if (item.ir.kind !== "tensor") return null;
  return <TensorBox item={item} ir={item.ir} interactive={interactive} />;
});

interface Drawn {
  key: string;
  faces: Array<{ d: string; fill: string }>;
  label: { x: number; y: number; text: string } | null;
  on: boolean;
}

function TensorBox({ item, ir, interactive }: { item: ObjectItem; ir: TensorIR; interactive: boolean }) {
  const S = item.transform.scale;
  /** 톡 친 칸 (값 고치기) */
  const [picked, setPicked] = useState<[number, number, number] | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  // 칸을 톡 → 그 칸을 고른다 (객체 선택 대신). 빈 곳을 톡하면 원래대로 객체 선택
  const { view, handlers } = useTurntable(item, ir.data.view, DEFAULT_VIEW, (x, y) => {
    const cellEl = document.elementFromPoint(x, y)?.closest("[data-cell]");
    const key = cellEl?.getAttribute("data-cell");
    if (!key || !interactive) return false;
    setPicked(key.split(",").map(Number) as [number, number, number]);
    setDraft(null);
    return true;
  });
  const dims = ir.data.dims as Dims;
  const slice = ir.data.slice;
  const fresh = isFresh(item.id);

  const cubes = useMemo((): Drawn[] => {
    const radius = 0.5 * Math.hypot(...dims);
    const scale = (S * 0.45) / radius;
    const cx = S / 2;
    const cy = S / 2;
    const out: Array<Drawn & { z: number }> = [];
    for (let i = 0; i < dims[0]; i++)
      for (let j = 0; j < dims[1]; j++)
        for (let k = 0; k < dims[2]; k++) {
          const c: V = [k - (dims[2] - 1) / 2, (dims[1] - 1) / 2 - j, (dims[0] - 1) / 2 - i];
          const on = !slice || [i, j, k][slice.axis] === slice.index;
          const rc = rotate(c, view);
          let best: { nz: number; x: number; y: number } | null = null;
          const faces: Drawn["faces"] = [];
          for (const f of FACES) {
            const nz = rotate(f.n, view)[2];
            if (nz <= 1e-6) continue;
            const pts = f.v.map((o) => rotate([c[0] + o[0] / 2, c[1] + o[1] / 2, c[2] + o[2] / 2], view));
            const s = pts.map((p) => [cx + p[0] * scale, cy - p[1] * scale] as const);
            // 위·옆·앞 면의 밝기를 다르게 (교과서 블록 그림)
            const tone = f.n[1] === 1 ? 0 : f.n[0] !== 0 ? 2 : 1;
            const fill = on ? ["#CFE0FB", "#A9C7F5", "#86ACE6"][tone] : ["#F3F4F6", "#E6E8EC", "#D9DCE2"][tone];
            faces.push({ d: `M${s.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}Z`, fill: fill as string });
            const mid = pts.reduce<V>((m, p) => [m[0] + p[0] / 4, m[1] + p[1] / 4, m[2] + p[2] / 4], [0, 0, 0]);
            if (!best || nz > best.nz) best = { nz, x: cx + mid[0] * scale, y: cy - mid[1] * scale };
          }
          const value = ir.data.values[cellIndex(dims, i, j, k)];
          out.push({
            key: `${i},${j},${k}`,
            faces,
            on,
            label: best && best.nz > 0.35 && value !== undefined ? { x: best.x, y: best.y, text: formatCell(value) } : null,
            z: rc[2],
          });
        }
    return out.sort((a, b) => a.z - b.z);
  }, [dims, slice, view, S, ir.data.values]);

  const cell = (S * 0.45) / (0.5 * Math.hypot(...dims));
  const caption = useMemo(
    () => katex.renderToString(slice ? sliceLatex(dims, ir.data.values, slice.axis, slice.index) : `T\\in\\mathbb{R}^{${dims.join("\\times")}}`, { throwOnError: false, displayMode: true }),
    [dims, ir.data.values, slice],
  );

  const current = (): TensorIR | null => {
    const now = sessionStore.getState().items.find((x) => x.id === item.id);
    return now && now.kind === "object" && now.ir.kind === "tensor" ? now.ir : null;
  };
  /** 고른 칸에 값 쓰기 */
  const writeValue = (text: string) => {
    const now = current();
    const v = Number(text.replace(/[−–]/g, "-").replace(",", ".").trim());
    if (!now || !picked || text.trim() === "" || !Number.isFinite(v)) return;
    const d = now.data.dims as Dims;
    const values = [...now.data.values];
    values[cellIndex(d, ...picked)] = v;
    sessionStore.getState().commitObjectIR(item.id, now, { ...now, data: { ...now.data, values } }, "텐서 값");
  };
  /** 축 하나를 늘리거나 줄이기 (값은 그대로, 새 칸은 0) */
  const resize = (axis: number, delta: number) => {
    const now = current();
    if (!now) return;
    const d = now.data.dims as Dims;
    const nextDims = d.map((n, i) => (i === axis ? n + delta : n)) as Dims;
    const r = resizeTensor(d, now.data.values, nextDims);
    if (r.dims.every((n, i) => n === d[i])) return;
    const { slice: sl, ...rest } = now.data;
    const keep = sl && sl.index < r.dims[sl.axis]! ? { slice: sl } : {};
    sessionStore.getState().commitObjectIR(item.id, now, { ...now, data: { ...rest, ...keep, dims: r.dims, values: r.values } }, "텐서 크기");
    if (picked && picked.some((v, i) => v >= r.dims[i]!)) setPicked(null);
  };

  const setSlice = (next: TensorIR["data"]["slice"]) => {
    const now = sessionStore.getState().items.find((x) => x.id === item.id);
    if (!now || now.kind !== "object" || now.ir.kind !== "tensor") return;
    const { slice: _old, ...rest } = now.ir.data;
    const after: TensorIR = { ...now.ir, data: next ? { ...rest, slice: next } : rest };
    sessionStore.getState().commitObjectIR(item.id, now.ir, after, "텐서 단면");
  };

  const btn = (active: boolean) =>
    ({
      minWidth: 40,
      minHeight: 34,
      padding: "4px 10px",
      border: `1px solid ${active ? theme.color.accent : theme.color.sub}`,
      borderRadius: 999,
      background: active ? theme.color.accent : theme.color.bg,
      color: active ? "#fff" : theme.color.ink,
      fontSize: 13,
      cursor: "pointer",
      whiteSpace: "nowrap",
    }) as const;

  return (
    <div data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: S, pointerEvents: "none" }}>
      <svg
        width={S}
        height={S}
        style={{ display: "block", overflow: "visible", pointerEvents: interactive ? "auto" : "none", touchAction: "none", cursor: interactive ? "grab" : undefined }}
        {...handlers}
      >
        <rect x={0} y={0} width={S} height={S} fill="transparent" />
        {cubes.map((c) => (
          <g key={c.key} data-cell={c.key} opacity={c.on ? 1 : 0.55}>
            {c.faces.map((f, i) => (
              <path key={i} d={f.d} fill={picked && picked.join(",") === c.key ? "#FFD08A" : f.fill} stroke={picked && picked.join(",") === c.key ? "#C77700" : c.on ? "#3D5F99" : "#A0A6B0"} strokeWidth={picked && picked.join(",") === c.key ? 2 : 1} strokeLinejoin="round" />
            ))}
            {c.label && (
              <text
                x={c.label.x}
                y={c.label.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(9, Math.min(18, cell * 0.36))}
                fontFamily="KaTeX_Main, 'Times New Roman', serif"
                fill={c.on ? theme.color.ink : "#9AA0AA"}
              >
                {c.label.text}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div style={{ textAlign: "center", color: theme.color.ink, fontSize: 15, overflowX: "auto", overflowY: "hidden" }} dangerouslySetInnerHTML={{ __html: caption }} />
      {interactive && (
        <div data-export-skip style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 6, pointerEvents: "auto", marginTop: 2 }}>
          <button type="button" style={btn(!slice)} onClick={() => setSlice(undefined)}>
            전체
          </button>
          {AXES.map((name, axis) => (
            <button key={name} type="button" style={btn(slice?.axis === axis)} onClick={() => setSlice({ axis, index: slice?.axis === axis ? (slice.index + 1) % dims[axis]! : 0 })}>
              {name} {slice?.axis === axis ? `${slice.index + 1}/${dims[axis]}` : ""}
            </button>
          ))}
        </div>
      )}
      {interactive && picked && (
        <div data-export-skip style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 6, pointerEvents: "auto", marginTop: 6, fontSize: 13, color: theme.color.ink }}>
          <span style={{ fontFamily: "KaTeX_Main, 'Times New Roman', serif" }}>
            T[{picked.map((v) => v + 1).join(", ")}] =
          </span>
          <input
            aria-label="칸 값"
            inputMode="decimal"
            autoFocus
            value={draft ?? formatCell(ir.data.values[cellIndex(dims, ...picked)] ?? 0)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              e.stopPropagation();
            }}
            onBlur={() => {
              if (draft !== null) writeValue(draft);
              setDraft(null);
            }}
            style={{ width: 72, height: 30, padding: "0 8px", border: `1px solid ${theme.color.accent}`, borderRadius: 8, fontSize: 14, textAlign: "center" }}
          />
          <button type="button" onClick={() => setPicked(null)} style={{ ...btn(false), minHeight: 30 }}>
            닫기
          </button>
        </div>
      )}
      {interactive && (
        <div data-export-skip style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, pointerEvents: "auto", marginTop: 6, fontSize: 12.5, color: theme.color.asymptote }}>
          {AXES.map((name, axis) => (
            <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
              {name}
              <button type="button" aria-label={`${name} 줄이기`} disabled={dims[axis] === 1} onClick={() => resize(axis, -1)} style={{ ...btn(false), minWidth: 28, minHeight: 28, padding: 0, opacity: dims[axis] === 1 ? 0.4 : 1 }}>
                −
              </button>
              <b style={{ color: theme.color.ink, minWidth: 10, textAlign: "center" }}>{dims[axis]}</b>
              <button type="button" aria-label={`${name} 늘리기`} disabled={dims[axis] === 5} onClick={() => resize(axis, 1)} style={{ ...btn(false), minWidth: 28, minHeight: 28, padding: 0, opacity: dims[axis] === 5 ? 0.4 : 1 }}>
                +
              </button>
            </span>
          ))}
        </div>
      )}
      {interactive && (
        <div data-export-skip style={{ textAlign: "center", fontSize: 12, color: theme.color.asymptote, marginTop: 4 }}>
          드래그해서 돌리기 · 칸을 톡 눌러 값 고치기 · 겹·행·열 단추로 단면
        </div>
      )}
    </div>
  );
}
