import { ChevronDown, Plus, X } from "lucide-react";
import { useState, type ReactElement } from "react";
import { HIGHLIGHT_BRUSHES, LINE_STYLES, PEN_BRUSHES, strokeAttrs, strokeD, type StrokeLook } from "../ink/brushes";
import type { Point } from "../ink/types";
import { penOpts, theme } from "../render/theme";
import { currentStrokeStyle, penStore, usePen, type PenPreset } from "../store/pen";
import { ColorPicker } from "./ColorPicker";

/**
 * 펜·형광펜 옵션 패널 (도구 레일에서 펜/형광펜을 한 번 더 누르면 열린다) — 삼성노트 펜 패널처럼.
 *   즐겨 찾는 펜 선반 (+ 지금 펜 저장)
 *   펜 종류 (볼펜·만년필·캘리그래피·연필·붓 / 형광펜: 둥근 촉·사각 촉)
 *   굵기 · (형광펜) 투명도 · (펜) 선 모양 · 직선 자동 보정
 *   색: 자주 쓰는 색 + 최근 색 + 직접 고르기(색 판·밝기·HEX/RGB·스포이트)
 *   흔들림 보정 · 손가락으로는 그리지 않기
 */

/** 미리보기 물결 — 필압이 오르내리는 획 */
function wave(w: number, h: number, pressure: boolean): Point[] {
  return Array.from({ length: 40 }, (_, i) => ({
    x: w * 0.06 + (i * w * 0.88) / 39,
    y: h / 2 + Math.sin(i / 5) * h * 0.22,
    p: pressure ? 0.25 + 0.55 * Math.sin((i / 39) * Math.PI) : 0.5,
    t: i * 8,
  }));
}

/** 그 펜으로 그린 짧은 획 미리보기 (실제 펜과 같은 brushes.ts) */
function StrokeSample({ look, w, h, points }: { look: StrokeLook; w: number; h: number; points?: Point[] }): ReactElement {
  const { mixBlendMode, ...attrs } = strokeAttrs(look);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: "block" }}>
      <path d={strokeD(points ?? wave(w, h, look.tool === "pen"), look)} {...attrs} style={mixBlendMode ? { mixBlendMode } : undefined} />
    </svg>
  );
}

const presetLook = (pr: PenPreset): StrokeLook => ({ tool: pr.kind, color: pr.color, width: pr.width, brush: pr.brush, line: pr.line, opacity: pr.opacity });

export function PenOptions(): ReactElement {
  const pen = usePen((s) => s);
  const style = currentStrokeStyle(pen);
  const highlighter = pen.kind === "highlighter";
  const current = style.color;
  const [custom, setCustom] = useState(false);

  const setColor = (c: string) => penStore.getState().set(highlighter ? { highlightColor: c } : { penColor: c });

  const presets: readonly string[] = highlighter ? penOpts.highlightColors : penOpts.colors;
  const names: readonly string[] = highlighter ? penOpts.highlightNames : penOpts.colorNames;
  const recent = highlighter ? pen.recentHighlight : pen.recentPen;
  const widthRange = highlighter ? penOpts.highlightWidth : penOpts.penWidth;

  const swatch = (c: string, label: string) => (
    <button
      key={label + c}
      type="button"
      aria-label={label}
      aria-pressed={current === c}
      title={label}
      onClick={() => penStore.getState().pickColor(c)}
      style={{
        width: 30,
        height: 30,
        borderRadius: "50%",
        border: "none",
        padding: 0,
        background: c,
        opacity: highlighter ? 0.8 : 1,
        boxShadow: current === c ? `0 0 0 2px ${theme.color.bg}, 0 0 0 4px ${theme.color.accent}` : `0 0 0 1px ${theme.color.sub}`,
        cursor: "pointer",
        flex: "0 0 auto",
      }}
    />
  );

  const choice = (on: boolean) =>
    ({
      display: "grid",
      justifyItems: "center",
      gap: 2,
      padding: "4px 2px",
      border: `1px solid ${on ? theme.color.accent : theme.color.sub}`,
      borderRadius: theme.radius.s,
      background: on ? theme.color.selection : theme.color.bg,
      color: on ? theme.color.accent : theme.color.ink,
      fontSize: 11,
      cursor: "pointer",
    }) as const;

  const slider = (label: string, value: number, shown: string, min: number, max: number, step: number, onChange: (v: number) => void) => (
    <label style={{ display: "grid", gap: 4, fontSize: 13, color: theme.color.ink }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: theme.color.asymptote }}>{shown}</span>
      </span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: theme.color.accent }} />
    </label>
  );

  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label style={{ display: "flex", alignItems: "center", gap: theme.space[2], fontSize: 13, color: theme.color.ink }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: theme.color.accent }} />
      {label}
    </label>
  );

  const section = (title: string) => <div style={{ fontSize: 12, color: theme.color.asymptote, marginBottom: -theme.space[1] }}>{title}</div>;
  const flat = (y: number): Point[] => [
    { x: 4, y, p: 0.5, t: 0 },
    { x: 48, y, p: 0.5, t: 8 },
  ];

  return (
    <div style={{ display: "grid", gap: theme.space[3] }}>
      <strong style={{ fontSize: 14 }}>{highlighter ? "형광펜" : "펜"}</strong>

      {/* 즐겨 찾는 펜 선반 — 누르면 그 펜으로 (종류·선·투명도까지), ×로 빼기 */}
      {section("즐겨 찾는 펜")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }} aria-label="즐겨 찾는 펜">
        {pen.presets.map((pr, i) => {
          const on =
            pr.kind === pen.kind &&
            pr.color === current &&
            Math.abs(pr.width - style.width) < 0.05 &&
            (pr.brush ?? (pr.kind === "pen" ? "ballpoint" : "round")) === style.brush &&
            (pr.line ?? "solid") === style.line;
          return (
            <span key={`${pr.color}-${pr.width}-${i}`} style={{ position: "relative" }}>
              <button
                type="button"
                aria-label={`즐겨 찾는 펜 ${i + 1}`}
                onClick={() =>
                  penStore.getState().set(
                    pr.kind === "highlighter"
                      ? { kind: "highlighter", highlightColor: pr.color, highlightWidth: pr.width, highlightBrush: pr.brush === "chisel" ? "chisel" : "round", ...(pr.opacity !== undefined ? { highlightOpacity: pr.opacity } : {}) }
                      : { kind: "pen", penColor: pr.color, penWidth: pr.width, penBrush: pr.brush && pr.brush !== "round" && pr.brush !== "chisel" ? pr.brush : "ballpoint", penLine: pr.line ?? "solid" },
                  )
                }
                style={{ ...choice(on), width: "100%", height: 40, padding: 0, placeItems: "center" }}
              >
                <StrokeSample look={presetLook(pr)} w={56} h={30} />
              </button>
              <button
                type="button"
                aria-label={`즐겨 찾는 펜 ${i + 1} 빼기`}
                onClick={() => penStore.getState().set({ presets: pen.presets.filter((_, j) => j !== i) })}
                style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, padding: 0, display: "grid", placeItems: "center", border: "none", borderRadius: "50%", background: theme.color.sub, color: theme.color.ink, cursor: "pointer" }}
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
        {pen.presets.length < 12 && (
          <button
            type="button"
            aria-label="지금 펜을 즐겨 찾는 펜에 저장"
            title="지금 펜 저장"
            onClick={() =>
              penStore.getState().set({
                presets: [
                  ...pen.presets,
                  { kind: pen.kind, color: current, width: style.width, brush: style.brush, ...(style.line !== "solid" ? { line: style.line } : {}), ...(style.opacity !== undefined ? { opacity: style.opacity } : {}) },
                ],
              })
            }
            style={{ height: 40, display: "grid", placeItems: "center", border: `1px dashed ${theme.color.accent}`, borderRadius: theme.radius.s, background: theme.color.bg, color: theme.color.accent, cursor: "pointer" }}
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {/* 펜 종류 — 단추마다 그 펜으로 그린 미리보기 */}
      {section(highlighter ? "형광펜 촉" : "펜 종류")}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${highlighter ? 2 : 5}, 1fr)`, gap: 4 }}>
        {(highlighter ? HIGHLIGHT_BRUSHES : PEN_BRUSHES).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={style.brush === k}
            aria-label={label}
            onClick={() => penStore.getState().set(highlighter ? { highlightBrush: k === "chisel" ? "chisel" : "round" } : { penBrush: k as typeof pen.penBrush })}
            style={choice(style.brush === k)}
          >
            <StrokeSample look={{ ...style, brush: k, line: "solid", width: highlighter ? 12 : 3 }} w={highlighter ? 100 : 44} h={24} />
            {label}
          </button>
        ))}
      </div>

      {/* 미리보기 (글씨 위에 그어 본 모양) */}
      <div style={{ position: "relative", height: 52, borderRadius: theme.radius.s, background: "#FAFAFA", overflow: "hidden" }}>
        {highlighter && <span style={{ position: "absolute", left: 20, top: 13, fontSize: 20, color: theme.color.ink, opacity: 0.75 }}>가나다 abc 123</span>}
        <div style={{ position: "absolute", inset: 0 }}>
          <StrokeSample look={style} w={268} h={52} />
        </div>
      </div>

      {slider(highlighter ? "형광펜 굵기" : "펜 굵기", style.width, `${style.width.toFixed(highlighter ? 0 : 1)}px`, widthRange.min, widthRange.max, highlighter ? 1 : 0.1, (w) =>
        penStore.getState().set(highlighter ? { highlightWidth: w } : { penWidth: w }),
      )}
      {highlighter &&
        slider("투명도", Math.round((1 - pen.highlightOpacity) * 100), `${Math.round((1 - pen.highlightOpacity) * 100)}%`, 10, 90, 1, (t) => penStore.getState().set({ highlightOpacity: 1 - t / 100 }))}

      {!highlighter && (
        <>
          {section("선 모양")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
            {LINE_STYLES.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={style.line === k} aria-label={label} onClick={() => penStore.getState().set({ penLine: k })} style={{ ...choice(style.line === k), padding: "6px 2px" }}>
                <StrokeSample look={{ tool: "pen", width: 3, line: k, color: theme.color.ink }} w={52} h={10} points={flat(5)} />
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {toggle("직선 자동 보정 (곧게 그으면 곧은 선으로)", highlighter ? pen.straightHighlight : pen.straightPen, (v) => penStore.getState().set(highlighter ? { straightHighlight: v } : { straightPen: v }))}

      {section("색")}
      <div style={{ display: "flex", flexWrap: "wrap", gap: theme.space[2] }}>
        {presets.map((c, i) => swatch(c, names[i] ?? c))}
        {recent.map((c) => swatch(c, `최근 ${c}`))}
      </div>
      <button
        type="button"
        aria-expanded={custom}
        onClick={() => setCustom((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: 6, padding: 0, border: "none", background: "transparent", color: theme.color.ink, fontSize: 13, cursor: "pointer" }}
      >
        <span style={{ width: 22, height: 22, borderRadius: "50%", background: "conic-gradient(#F00, #FF0, #0F0, #0FF, #00F, #F0F, #F00)" }} />
        직접 고르기 (색 판 · 코드 · 스포이트)
        <ChevronDown size={16} style={{ transform: custom ? "rotate(180deg)" : undefined }} />
      </button>
      {custom && <ColorPicker value={current} onChange={setColor} onCommit={(c) => penStore.getState().pickColor(c)} />}

      {slider("흔들림 보정", pen.smoothing, pen.smoothing === 0 ? "끔" : `${Math.round(pen.smoothing * 100)}%`, 0, 0.9, 0.05, (v) => penStore.getState().set({ smoothing: v }))}

      {toggle("손가락으로는 그리지 않기 (S Pen 전용)", pen.penOnly, (v) => penStore.getState().set({ penOnly: v }))}
      <span style={{ fontSize: 12, color: theme.color.asymptote, marginTop: -theme.space[2] }}>손가락은 화면 이동·확대와 고르기만 해요</span>
    </div>
  );
}
