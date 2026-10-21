import { Plus, Trash2, X } from "lucide-react";
import { useState, type ReactElement } from "react";
import { HIGHLIGHT_BRUSHES, hasLineStyles, LINE_STYLES, PEN_BRUSHES, strokeAttrs, strokeD, type StrokeLook } from "../ink/brushes";
import type { Point } from "../ink/types";
import { theme } from "../render/theme";
import { currentStrokeStyle, levelToWidth, penStore, usePen, widthToLevel, type PenPreset } from "../store/pen";
import { ColorGrid, LevelSlider, OpacitySlider, PenGlyph, Switch } from "./penControls";

/**
 * 펜·형광펜 옵션 패널 (도구 레일에서 펜/형광펜을 한 번 더 누르면 열린다) — 삼성노트 펜 패널 차례 그대로:
 *   펜 그림 다섯 (만년필 · 캘리그래피 펜 · 펜 · 연필 · 브러시) / 형광펜: 둥근 촉 · 사각 촉
 *   굵기 1~100 · (연필·형광펜) 투명도
 *   (펜·연필) 선 모양: 실선 · 끝이 가는 선 · 파선 · 점선
 *   직선 자동 보정 · 손글씨 자동 정리(AI, 기본 끔)
 *   색 판 (4줄 × 8 + 최근 색 · 스포이트 · 직접 고르기)
 *   즐겨찾는 펜 (+ 지금 펜 저장 · 🗑 빼기)
 *   더 보기: 흔들림 보정 · 손가락으로는 그리지 않기
 */

/** 그 펜으로 그린 짧은 획 미리보기 (실제 펜과 같은 brushes.ts) */
function StrokeSample({ look, w, h, points }: { look: StrokeLook; w: number; h: number; points?: Point[] }): ReactElement {
  const { mixBlendMode, ...attrs } = strokeAttrs(look);
  const pts =
    points ??
    Array.from({ length: 40 }, (_, i) => ({ x: w * 0.06 + (i * w * 0.88) / 39, y: h / 2 + Math.sin(i / 5) * h * 0.22, p: 0.25 + 0.55 * Math.sin((i / 39) * Math.PI), t: i * 8 }));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden style={{ display: "block", overflow: "visible" }}>
      <path d={strokeD(pts, look)} {...attrs} style={mixBlendMode ? { mixBlendMode } : undefined} />
    </svg>
  );
}

const presetLook = (pr: PenPreset): StrokeLook => ({ tool: pr.kind, color: pr.color, width: pr.width, brush: pr.brush, line: pr.line, opacity: pr.opacity });
const flat = (w: number, y: number): Point[] => [
  { x: 10, y, p: 0.5, t: 0 },
  { x: w - 10, y, p: 0.5, t: 8 },
];

export function PenOptions(): ReactElement {
  const pen = usePen((s) => s);
  const style = currentStrokeStyle(pen);
  const highlighter = pen.kind === "highlighter";
  const current = style.color;
  const [more, setMore] = useState(false);
  const recent = highlighter ? pen.recentHighlight : pen.recentPen;
  const level = widthToLevel(pen.kind, style.width);
  const set = penStore.getState().set;

  const pill = (on: boolean) =>
    ({
      height: 34,
      display: "grid",
      placeItems: "center",
      padding: 0,
      border: `1px solid ${on ? "#C4C9D0" : theme.color.sub}`,
      borderRadius: 17,
      background: on ? "#E4E7EB" : theme.color.bg,
      cursor: "pointer",
      overflow: "hidden",
    }) as const;

  // 지금 펜과 같은 즐겨찾기 (선반에서 표시)
  const isCurrent = (pr: PenPreset) =>
    pr.kind === pen.kind && pr.color === current && Math.abs(pr.width - style.width) < 0.05 && (pr.brush ?? (pr.kind === "pen" ? "ballpoint" : "round")) === style.brush && (pr.line ?? "solid") === style.line;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* 펜 그림 — 고른 펜은 위로 올라오고 아래 띠가 지금 색 */}
      {!highlighter ? (
        <div role="radiogroup" aria-label="펜 종류" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "10px 6px 0", borderBottom: `1px solid ${theme.color.sub}` }}>
          {PEN_BRUSHES.map(([k, label]) => {
            const on = style.brush === k;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} aria-label={label} title={label} onClick={() => set({ penBrush: k })} style={{ display: "grid", justifyItems: "center", gap: 2, padding: 0, border: "none", background: "transparent", cursor: "pointer", color: on ? theme.color.ink : theme.color.asymptote, fontSize: 10.5, whiteSpace: "nowrap" }}>
                <PenGlyph brush={k} color={on ? current : "#A9AFB7"} active={on} />
                <span style={{ marginBottom: 4 }}>{label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div role="radiogroup" aria-label="형광펜 촉" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {HIGHLIGHT_BRUSHES.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={style.brush === k} aria-label={label} onClick={() => set({ highlightBrush: k === "chisel" ? "chisel" : "round" })} style={{ ...pill(style.brush === k), height: 48, gap: 0, fontSize: 11, color: theme.color.ink }}>
              <StrokeSample look={{ ...style, brush: k, width: 12 }} w={100} h={26} />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* 굵기 1~100 · 투명도 */}
      <LevelSlider label={highlighter ? "형광펜 굵기" : "펜 굵기"} value={level} onChange={(L) => set(highlighter ? { highlightWidth: levelToWidth("highlighter", L) } : { penWidth: levelToWidth("pen", L) })} />
      {(highlighter || style.brush === "pencil") && (
        <OpacitySlider
          color={current}
          value={Math.round((highlighter ? pen.highlightOpacity : pen.pencilOpacity) * 100)}
          onChange={(v) => set(highlighter ? { highlightOpacity: Math.min(0.9, v / 100) } : { pencilOpacity: v / 100 })}
        />
      )}

      {/* 선 모양 (펜·연필) */}
      {!highlighter && hasLineStyles(style.brush) && (
        <div role="radiogroup" aria-label="선 모양" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {LINE_STYLES.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={style.line === k} aria-label={label} title={label} onClick={() => set({ penLine: k })} style={pill(style.line === k)}>
              <StrokeSample look={{ tool: "pen", brush: style.brush, width: 3.2, line: k, color: theme.color.ink, ...(style.opacity !== undefined ? { opacity: style.opacity } : {}) }} w={100} h={12} points={flat(100, 6)} />
            </button>
          ))}
        </div>
      )}

      <Switch label="직선 자동 보정" checked={highlighter ? pen.straightHighlight : pen.straightPen} onChange={(v) => set(highlighter ? { straightHighlight: v } : { straightPen: v })} />
      <Switch label="손글씨 자동 정리 (AI)" hint="켜면 쓰는 손글씨 묶음을 파란 상자로 보여 주고 ✨로 정리해요" checked={pen.autoTidy} onChange={(v) => set({ autoTidy: v })} />

      {/* 색 판 */}
      <ColorGrid value={current} recent={recent} translucent={highlighter} onPick={(c) => penStore.getState().pickColor(c)} />

      {/* 즐겨찾는 펜 */}
      {pen.presets.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }} aria-label="즐겨찾는 펜">
          {pen.presets.map((pr, i) => (
            <span key={`${pr.color}-${pr.width}-${i}`} style={{ position: "relative" }}>
              <button
                type="button"
                aria-label={`즐겨찾는 펜 ${i + 1}`}
                onClick={() =>
                  set(
                    pr.kind === "highlighter"
                      ? { kind: "highlighter", highlightColor: pr.color, highlightWidth: pr.width, highlightBrush: pr.brush === "chisel" ? "chisel" : "round", ...(pr.opacity !== undefined ? { highlightOpacity: pr.opacity } : {}) }
                      : { kind: "pen", penColor: pr.color, penWidth: pr.width, penBrush: pr.brush && pr.brush !== "round" && pr.brush !== "chisel" ? pr.brush : "ballpoint", penLine: pr.line ?? "solid", ...(pr.brush === "pencil" && pr.opacity !== undefined ? { pencilOpacity: pr.opacity } : {}) },
                  )
                }
                style={{ ...pill(isCurrent(pr)), width: "100%", height: 40, borderRadius: 10 }}
              >
                <StrokeSample look={presetLook(pr)} w={56} h={28} />
              </button>
              <button
                type="button"
                aria-label={`즐겨찾는 펜 ${i + 1} 빼기`}
                onClick={() => set({ presets: pen.presets.filter((_, j) => j !== i) })}
                style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, padding: 0, display: "grid", placeItems: "center", border: "none", borderRadius: "50%", background: theme.color.sub, color: theme.color.ink, cursor: "pointer" }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button
          type="button"
          aria-label="지금 펜을 즐겨찾는 펜에 추가"
          disabled={pen.presets.length >= 12}
          onClick={() =>
            set({
              presets: [...pen.presets, { kind: pen.kind, color: current, width: style.width, brush: style.brush, ...(style.line !== "solid" ? { line: style.line } : {}), ...(style.opacity !== undefined ? { opacity: style.opacity } : {}) }],
            })
          }
          style={{ ...pill(false), color: theme.color.ink, opacity: pen.presets.length >= 12 ? 0.4 : 1 }}
        >
          <Plus size={18} />
        </button>
        <button type="button" aria-label="즐겨찾는 펜 모두 빼기" disabled={pen.presets.length === 0} onClick={() => set({ presets: [] })} style={{ ...pill(false), color: theme.color.asymptote, opacity: pen.presets.length === 0 ? 0.4 : 1 }}>
          <Trash2 size={16} />
        </button>
      </div>
      {pen.presets.length === 0 && <div style={{ fontSize: 12, color: theme.color.asymptote, textAlign: "center", marginTop: -6 }}>즐겨찾는 펜을 여기에 추가하고 더 간편하게 사용해 보세요.</div>}

      {/* 더 보기 */}
      <button type="button" aria-expanded={more} onClick={() => setMore((o) => !o)} style={{ justifySelf: "start", padding: 0, border: "none", background: "transparent", color: theme.color.asymptote, fontSize: 12.5, cursor: "pointer" }}>
        {more ? "▾" : "▸"} 더 보기 (흔들림 보정 · 손가락)
      </button>
      {more && (
        <>
          <LevelSlider label="흔들림 보정" value={Math.round(pen.smoothing * 100)} min={0} max={90} onChange={(v) => set({ smoothing: v / 100 })} />
          <Switch label="손가락으로는 그리지 않기 (S Pen 전용)" hint="손가락은 화면 이동·확대와 고르기만 해요" checked={pen.penOnly} onChange={(v) => set({ penOnly: v })} />
        </>
      )}
    </div>
  );
}

/** 스타일 변경 도구 패널 — 크기·색을 고르고 획을 쓸고 지나가면 그 획이 바뀐다 */
export function StyleOptions(): ReactElement {
  const styleWidth = usePen((s) => s.styleWidth);
  const styleColor = usePen((s) => s.styleColor);
  const recent = usePen((s) => s.recentPen);
  const set = penStore.getState().set;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <strong style={{ fontSize: 14 }}>스타일 변경</strong>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: -8 }}>크기</div>
      <LevelSlider label="스타일 변경 크기" value={widthToLevel("pen", styleWidth)} onChange={(L) => set({ styleWidth: levelToWidth("pen", L) })} />
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: -8 }}>색상</div>
      <ColorGrid value={styleColor} recent={recent} onPick={(c) => set({ styleColor: c.toUpperCase() })} />
      <div style={{ fontSize: 12, color: theme.color.asymptote, wordBreak: "keep-all" }}>바꿀 손글씨 위를 펜으로 쓸고 지나가면 그 획의 크기와 색이 바뀌어요 (되돌리기 가능)</div>
    </div>
  );
}
