import type { SceneIR } from "@sketchlab/shared";
import { Minus, Plus } from "lucide-react";
import { useState, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { equalAspect, validRange, zoomRange, zoomView } from "../math/axisZoom";
import { plot, theme } from "../render/theme";
import { sessionStore } from "../store/session";

/**
 * 축 패널 — 그래프의 [축]을 두 번 톡 (공간좌표는 한 번) 하면 열린다.
 *   2D: x·y 축마다 확대(+)·축소(−)와 범위 직접 입력, 둘 다 함께, 1:1 맞추기
 *   3D: x·y·z 축마다 확대·축소와 끝값 입력, 셋 다 함께
 * 누를 때마다 되돌리기 1단계.
 */
const STEP = 0.8;

export function AxisPanel({ item }: { item: ObjectItem }): ReactElement | null {
  const ir = item.ir;
  const apply = (next: SceneIR) => sessionStore.getState().commitObjectIR(item.id, ir, next, "축 범위");

  if (ir.kind === "plot2d") {
    const v = ir.data.view;
    const setView = (view: { xmin: number; xmax: number; ymin: number; ymax: number }, aspect: "equal" | "auto") =>
      apply({ ...ir, data: { ...ir.data, view: { ...ir.data.view, ...view, aspect } } });
    // 한 축만 바꾸면 1:1이 풀린다, 둘 다 같이 바꾸면 비율 그대로
    const zoom = (axis: "x" | "y" | "both", f: number) => setView(zoomView(v, axis, f), axis === "both" ? v.aspect : "auto");
    return (
      <div style={{ display: "grid", gap: theme.space[2] }}>
        <RangeRow axis="x" min={v.xmin} max={v.xmax} onZoom={(f) => zoom("x", f)} onSet={(a, b) => setView({ ...v, xmin: a, xmax: b }, "auto")} />
        <RangeRow axis="y" min={v.ymin} max={v.ymax} onZoom={(f) => zoom("y", f)} onSet={(a, b) => setView({ ...v, ymin: a, ymax: b }, "auto")} />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: theme.space[2] }}>
          <ZoomButtons label="둘 다" onZoom={(f) => zoom("both", f)} />
          <button type="button" onClick={() => setView(equalAspect(v, plot.aspect), "equal")} disabled={v.aspect === "equal"} style={textBtn(v.aspect !== "equal")}>
            1:1 맞추기
          </button>
          <span style={{ fontSize: 12, color: theme.color.asymptote }}>{v.aspect === "equal" ? "x·y 같은 비율" : "축마다 다른 비율"}</span>
        </div>
      </div>
    );
  }

  if (ir.kind === "space3d") {
    const R = ir.data.view.range;
    const axes = ir.data.view.axes ?? { x: R, y: R, z: R };
    const setAxes = (next: { x: number; y: number; z: number }) => apply({ ...ir, data: { ...ir.data, view: { ...ir.data.view, axes: next } } });
    const zoomOne = (k: "x" | "y" | "z", f: number) => setAxes({ ...axes, [k]: zoomRange(-axes[k], axes[k], f)[1] });
    return (
      <div style={{ display: "grid", gap: theme.space[2] }}>
        {(["x", "y", "z"] as const).map((k) => (
          <RangeRow key={k} axis={k} min={-axes[k]} max={axes[k]} symmetric onZoom={(f) => zoomOne(k, f)} onSet={(_, b) => setAxes({ ...axes, [k]: b })} />
        ))}
        <ZoomButtons
          label="셋 다"
          onZoom={(f) => setAxes({ x: zoomRange(-axes.x, axes.x, f)[1], y: zoomRange(-axes.y, axes.y, f)[1], z: zoomRange(-axes.z, axes.z, f)[1] })}
        />
      </div>
    );
  }
  return null;
}

const textBtn = (on: boolean) =>
  ({
    height: 34,
    padding: `0 ${theme.space[3]}px`,
    border: `1px solid ${theme.color.sub}`,
    borderRadius: theme.radius.s,
    background: theme.color.bg,
    color: on ? theme.color.ink : theme.color.asymptote,
    fontSize: 13,
    cursor: on ? "pointer" : "default",
  }) as const;

function ZoomButtons({ label, onZoom }: { label: string; onZoom: (factor: number) => void }): ReactElement {
  const b = (name: string, icon: ReactElement, f: number) => (
    <button
      type="button"
      aria-label={`${label} ${name}`}
      title={name}
      onClick={() => onZoom(f)}
      style={{ width: 34, height: 34, display: "grid", placeItems: "center", border: `1px solid ${theme.color.sub}`, borderRadius: theme.radius.s, background: theme.color.bg, color: theme.color.ink, cursor: "pointer" }}
    >
      {icon}
    </button>
  );
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ minWidth: 34, fontSize: 13 }}>{label}</span>
      {b("축소", <Minus size={16} />, 1 / STEP)}
      {b("확대", <Plus size={16} />, STEP)}
    </span>
  );
}

/** 축 한 줄: [−][+] 와 범위 입력 (3D는 끝값 하나: −a ~ a) */
function RangeRow({
  axis,
  min,
  max,
  symmetric = false,
  onZoom,
  onSet,
}: {
  axis: string;
  min: number;
  max: number;
  symmetric?: boolean;
  onZoom: (factor: number) => void;
  onSet: (min: number, max: number) => void;
}): ReactElement {
  const fmt = (n: number) => String(Number(n.toPrecision(6)));
  const [lo, setLo] = useState<string | null>(null);
  const [hi, setHi] = useState<string | null>(null);
  const commit = () => {
    const a = symmetric ? -Number((hi ?? fmt(max)).replace(/[−–]/g, "-")) : Number((lo ?? fmt(min)).replace(/[−–]/g, "-"));
    const b = Number((hi ?? fmt(max)).replace(/[−–]/g, "-"));
    setLo(null);
    setHi(null);
    if (validRange(a, b)) onSet(a, b);
  };
  const box = (label: string, value: string, set: (s: string) => void) => (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      style={{ width: 64, height: 32, boxSizing: "border-box", padding: "0 6px", border: `1px solid ${theme.color.sub}`, borderRadius: theme.radius.s, font: "inherit", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
    />
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: theme.space[2] }}>
      <ZoomButtons label={`${axis}축`} onZoom={onZoom} />
      {symmetric ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          −{fmt(max)} ~ {box(`${axis}축 끝값`, hi ?? fmt(max), setHi)}
        </span>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          {box(`${axis}축 최솟값`, lo ?? fmt(min), setLo)} ~ {box(`${axis}축 최댓값`, hi ?? fmt(max), setHi)}
        </span>
      )}
    </div>
  );
}
