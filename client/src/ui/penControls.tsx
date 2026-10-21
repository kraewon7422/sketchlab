import { Pipette } from "lucide-react";
import { useState, type ReactElement } from "react";
import type { PenBrush } from "../ink/brushes";
import { penOpts, theme } from "../render/theme";
import { ColorPicker } from "./ColorPicker";
import { startEyedropper } from "./eyedropper";

/**
 * 삼성노트 펜 패널의 부품 — 펜·형광펜·스타일 변경 패널이 같이 쓴다.
 *   LevelSlider: − ●(숫자) ···· +   (1~100)
 *   OpacitySlider: 바둑판 → 색으로 짙어지는 막대 위의 ●(숫자)
 *   ColorGrid: 4줄 × 8 색 + 최근 색 줄 + 스포이트 · 직접 고르기
 *   Switch: 켜고 끄는 단추
 *   PenGlyph: 펜 그림 (만년필·캘리그래피 펜·펜·연필·브러시)
 */

const round = { width: 30, height: 30, display: "grid", placeItems: "center", padding: 0, border: "none", background: "transparent", color: theme.color.ink, fontSize: 22, lineHeight: 1, cursor: "pointer", flex: "0 0 auto" } as const;

/** − ●(값) ···· + — 막대를 끌거나 톡, −/+로 한 칸씩 */
export function LevelSlider({ label, value, onChange, min = 1, max = 100, track }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; track?: string }): ReactElement {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button type="button" aria-label={`${label} 줄이기`} onClick={() => onChange(Math.max(min, value - 1))} style={round}>
        −
      </button>
      <div style={{ position: "relative", flex: 1, height: 30 }}>
        {/* 막대: 점 아홉 개 (삼성노트처럼) 또는 지정한 배경 */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 11,
            height: 8,
            borderRadius: 4,
            background: track ?? "#EEF0F3",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0 6px",
          }}
        >
          {!track &&
            Array.from({ length: 9 }, (_, i) => <span key={i} style={{ width: 2 + i * 0.5, height: 2 + i * 0.5, borderRadius: "50%", background: "#C7CCD3" }} />)}
        </div>
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", margin: 0, opacity: 0, cursor: "pointer", touchAction: "pan-x" }}
        />
        {/* 값 방울 */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 1,
            left: `calc(${pct}% - ${(pct / 100) * 28}px)`,
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 4px rgba(0,0,0,0.22)",
            display: "grid",
            placeItems: "center",
            fontSize: 11.5,
            fontWeight: 600,
            color: theme.color.ink,
            pointerEvents: "none",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
      </div>
      <button type="button" aria-label={`${label} 늘리기`} onClick={() => onChange(Math.min(max, value + 1))} style={round}>
        +
      </button>
    </div>
  );
}

/** 투명도 막대: 바둑판(투명) → 고른 색 */
export function OpacitySlider({ value, color, onChange }: { value: number; color: string; onChange: (v: number) => void }): ReactElement {
  const checker = `repeating-conic-gradient(#BFC4CB 0% 25%, #fff 0% 50%) 0 0 / 8px 8px`;
  return <LevelSlider label="투명도" value={value} onChange={onChange} min={10} max={100} track={`linear-gradient(90deg, transparent, ${color}), ${checker}`} />;
}

/** 4줄 × 8 색 판 + 최근 색 줄(+ 스포이트 · 직접 고르기) */
export function ColorGrid({ value, recent, onPick, translucent = false }: { value: string; recent: readonly string[]; onPick: (c: string) => void; translucent?: boolean }): ReactElement {
  const [custom, setCustom] = useState(false);
  const dot = (c: string, key: string, label: string) => {
    const on = value.toUpperCase() === c.toUpperCase();
    return (
      <button
        key={key}
        type="button"
        aria-label={label}
        aria-pressed={on}
        title={label}
        onClick={() => onPick(c)}
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          border: "none",
          padding: 0,
          background: c,
          opacity: translucent ? 0.8 : 1,
          boxShadow: on ? `0 0 0 2px #fff, 0 0 0 3.5px ${c}` : "inset 0 0 0 1px rgba(0,0,0,0.08)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
        }}
      >
        {on && (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M3 7.5l2.6 2.6L11 4.6" fill="none" stroke={c.toUpperCase() === "#FFFFFF" ? "#333" : "#fff"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    );
  };
  const tool = { width: 26, height: 26, borderRadius: "50%", border: `1px solid ${theme.color.sub}`, padding: 0, background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: theme.color.ink } as const;
  const lastRow = recent.slice(0, 5);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 26px)", justifyContent: "space-between", rowGap: 10 }}>
        {penOpts.palette.map((c, i) => dot(c, `p${i}`, c))}
        {lastRow.map((c, i) => dot(c, `r${i}`, `최근 ${c}`))}
        {Array.from({ length: 5 - lastRow.length }, (_, i) => (
          <span key={`e${i}`} aria-hidden style={{ width: 26, height: 26, borderRadius: "50%", background: "repeating-linear-gradient(135deg, #F1F2F4 0 3px, #fff 3px 6px)", boxShadow: "inset 0 0 0 1px #E4E6EA" }} />
        ))}
        <button type="button" aria-label="스포이트 — 노트에서 색 집기" title="스포이트" onClick={() => void startEyedropper(onPick)} style={tool}>
          <Pipette size={13} />
        </button>
        <button type="button" aria-label="직접 고르기" aria-expanded={custom} title="직접 고르기" onClick={() => setCustom((o) => !o)} style={{ ...tool, background: "conic-gradient(#F00, #FF0, #0F0, #0FF, #00F, #F0F, #F00)", border: "none" }} />
        <span aria-hidden />
      </div>
      {custom && <ColorPicker value={value} onChange={onPick} onCommit={onPick} />}
    </div>
  );
}

/** 켜고 끄는 단추 (삼성노트 스위치) */
export function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }): ReactElement {
  return (
    <label style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, fontSize: 13.5, color: theme.color.ink, cursor: "pointer" }}>
      <span>
        {label}
        {hint && <span style={{ display: "block", fontSize: 11.5, color: theme.color.asymptote, marginTop: 1 }}>{hint}</span>}
      </span>
      <span style={{ position: "relative", width: 40, height: 22 }}>
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} style={{ position: "absolute", inset: 0, opacity: 0, margin: 0, cursor: "pointer" }} />
        <span aria-hidden style={{ position: "absolute", inset: 0, borderRadius: 11, background: checked ? theme.color.accent : "#A7ADB5", transition: "background 120ms" }} />
        <span aria-hidden style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 120ms" }} />
      </span>
    </label>
  );
}

/** 펜 그림 (위에서 내려다본 펜촉 + 몸통, 아래 띠 = 그 펜의 색) */
export function PenGlyph({ brush, color, active }: { brush: PenBrush; color: string; active: boolean }): ReactElement {
  const W = 26;
  const H = 74;
  const body = "#F4F5F7";
  const tip = (() => {
    switch (brush) {
      case "fountain":
        // 금속 펜촉 + 가운데 홈
        return (
          <g>
            <path d={`M13 8 L19 28 Q13 32 7 28 Z`} fill="#BFC5CC" stroke="#8E959D" strokeWidth="0.8" />
            <path d="M13 12 L13 26" stroke="#5E656D" strokeWidth="0.9" />
            <circle cx="13" cy="25" r="1.4" fill="#5E656D" />
          </g>
        );
      case "calligraphy":
        // 넓적한 펜촉 (끝이 비스듬히 잘림)
        return (
          <g>
            <path d={`M8 12 L18 8 L19 28 Q13 32 7 28 Z`} fill="#3A3F45" />
            <path d="M8 12 L18 8" stroke="#1E2125" strokeWidth="1.4" />
          </g>
        );
      case "ballpoint":
        // 둥근 사인펜 촉
        return (
          <g>
            <path d={`M9 16 Q13 6 17 16 L19 28 Q13 32 7 28 Z`} fill="#E9ECEF" stroke="#C9CED4" strokeWidth="0.8" />
            <path d="M10.5 15 Q13 9 15.5 15 Z" fill={color} />
          </g>
        );
      case "pencil":
        // 깎은 나무 + 심
        return (
          <g>
            <path d={`M7 28 L13 9 L19 28 Q13 31 7 28 Z`} fill="#E8C9A0" />
            <path d="M11.2 14.5 L13 9 L14.8 14.5 Z" fill={color} />
          </g>
        );
      default:
        // 붓: 부드럽게 모이는 털
        return <path d={`M7 28 Q8 14 13 6 Q18 14 19 28 Q13 31 7 28 Z`} fill={color} opacity="0.85" />;
    }
  })();
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ display: "block", transform: active ? "translateY(-8px)" : undefined, transition: "transform 120ms" }}>
      {tip}
      <rect x="7" y="28" width="12" height="40" rx="2" fill={body} stroke="#D8DCE1" strokeWidth="0.8" />
      <rect x="7" y="56" width="12" height="12" rx="2" fill={color} />
    </svg>
  );
}
