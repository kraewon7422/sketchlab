import type { ReactElement } from "react";
import { TAPE_PATTERNS } from "../ink/tape";
import { tapeBackground } from "../render/TapeObject";
import { penOpts, theme } from "../render/theme";
import { penStore, usePen } from "../store/pen";

/**
 * 마스킹 테이프 패널 — 색과 폭. 끌어서 붙이고, 톡 치면 벗겨졌다 붙었다 (외우기·문제 풀기).
 */
export function TapeOptions(): ReactElement {
  const color = usePen((s) => s.tapeColor);
  const width = usePen((s) => s.tapeWidth);
  const pattern = usePen((s) => s.tapePattern);
  const { min, max } = penOpts.tapeWidth;
  return (
    <div style={{ display: "grid", gap: theme.space[3] }}>
      <strong style={{ fontSize: 14 }}>마스킹 테이프</strong>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {penOpts.tapeColors.map((c, i) => {
          const on = color === c;
          return (
            <button
              key={c}
              type="button"
              aria-label={penOpts.tapeNames[i]}
              aria-pressed={on}
              title={penOpts.tapeNames[i]}
              onClick={() => penStore.getState().set({ tapeColor: c })}
              style={{
                width: 44,
                height: 44,
                display: "grid",
                placeItems: "center",
                border: `2px solid ${on ? theme.color.accent : "transparent"}`,
                borderRadius: theme.radius.s,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <span style={{ width: 32, height: 14, borderRadius: 2, background: tapeBackground(c, pattern), transform: "rotate(-12deg)" }} />
            </button>
          );
        })}
      </div>
      <div style={{ display: "grid", gap: 4, fontSize: 14 }}>
        <span>무늬</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {TAPE_PATTERNS.map(([k, label]) => {
            const on = pattern === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => penStore.getState().set({ tapePattern: k })}
                style={{
                  display: "grid",
                  justifyItems: "center",
                  gap: 4,
                  padding: "6px 2px",
                  border: `1px solid ${on ? theme.color.accent : theme.color.sub}`,
                  borderRadius: theme.radius.s,
                  background: on ? theme.color.selection : theme.color.bg,
                  color: on ? theme.color.accent : theme.color.ink,
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
              >
                <span style={{ width: 44, height: 18, borderRadius: 2, background: tapeBackground(color, k) }} />
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <label style={{ display: "grid", gap: 4, fontSize: 14 }}>
        <span style={{ display: "flex", justifyContent: "space-between" }}>
          <span>폭</span>
          <span style={{ color: theme.color.asymptote }}>{Math.round(width)}px</span>
        </span>
        <input
          type="range"
          aria-label="테이프 폭"
          min={min}
          max={max}
          step={1}
          value={width}
          onChange={(e) => penStore.getState().set({ tapeWidth: Number(e.target.value) })}
          style={{ width: "100%", accentColor: theme.color.accent }}
        />
      </label>
      <div style={{ height: Math.min(width, 60), borderRadius: 2, background: tapeBackground(color, pattern) }} aria-hidden />
      <span style={{ fontSize: 12, color: theme.color.asymptote }}>
        끌어서 붙이기 · 테이프를 톡 = 벗기기/붙이기 · 지우개로 문지르면 떼어져요 · 옮기려면 올가미로 골라요
      </span>
    </div>
  );
}
