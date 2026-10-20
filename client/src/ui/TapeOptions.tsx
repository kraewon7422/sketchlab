import { useState, type ReactElement } from "react";
import { TAPE_PATTERNS } from "../ink/tape";
import { tapeBackground, TapePatternDef } from "../render/TapeObject";
import { penOpts, theme } from "../render/theme";
import { penStore, usePen } from "../store/pen";
import { sessionStore, useSession } from "../store/session";
import { ColorPicker } from "./ColorPicker";

/**
 * 마스킹 테이프 패널 — 삼성노트 테이프 패널처럼.
 *   미리보기 · 폭 · 직선 자동 보정 · [색상 | 패턴] 탭 · 테이프 모두 지우기
 * 펜처럼 자유롭게 그어 붙이고, 톡 치면 벗겨졌다 붙었다 (외우기·문제 풀기).
 */
export function TapeOptions(): ReactElement {
  const color = usePen((s) => s.tapeColor);
  const width = usePen((s) => s.tapeWidth);
  const pattern = usePen((s) => s.tapePattern);
  const straight = usePen((s) => s.straightTape);
  const tapeIds = useSession((s) => s.items.filter((i) => i.kind === "object" && i.ir.kind === "tape").map((i) => i.id).join(","));
  const [tab, setTab] = useState<"color" | "pattern">("color");
  const { min, max } = penOpts.tapeWidth;

  const tabBtn = (key: "color" | "pattern", label: string) => (
    <button
      type="button"
      aria-pressed={tab === key}
      onClick={() => setTab(key)}
      style={{
        flex: 1,
        height: 34,
        border: "none",
        borderRadius: 999,
        background: tab === key ? theme.color.selection : "transparent",
        color: tab === key ? theme.color.accent : theme.color.ink,
        fontSize: 13,
        fontWeight: tab === key ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "grid", gap: theme.space[3] }}>
      <strong style={{ fontSize: 14 }}>마스킹 테이프</strong>

      {/* 미리보기 — 자유롭게 그은 테이프 (실제 테이프와 같은 무늬) */}
      {(() => {
        const sw = Math.min(width, 60);
        const H = Math.max(44, sw + 20);
        const y = H / 2;
        return (
          <svg width="100%" height={H} viewBox={`0 0 268 ${H}`} aria-hidden style={{ display: "block", borderRadius: theme.radius.s, background: "#FAFAFA" }}>
            {pattern !== "plain" && (
              <defs>
                <TapePatternDef id="tape-preview" color={color} pattern={pattern} />
              </defs>
            )}
            <path d={`M20,${y} C90,${y - 14} 170,${y + 14} 248,${y}`} fill="none" stroke={pattern === "plain" ? color : "url(#tape-preview)"} strokeWidth={sw} />
          </svg>
        );
      })()}

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

      <label style={{ display: "flex", alignItems: "center", gap: theme.space[2], fontSize: 13 }}>
        <input type="checkbox" checked={straight} onChange={(e) => penStore.getState().set({ straightTape: e.target.checked })} style={{ width: 18, height: 18, accentColor: theme.color.accent }} />
        직선 자동 보정 (곧게 그으면 곧은 테이프로)
      </label>

      <div style={{ display: "flex", gap: 4, padding: 3, borderRadius: 999, background: "#F3F4F6" }}>
        {tabBtn("color", "색상")}
        {tabBtn("pattern", "패턴")}
      </div>

      {tab === "color" ? (
        <>
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
                  style={{ width: 44, height: 44, display: "grid", placeItems: "center", border: `2px solid ${on ? theme.color.accent : "transparent"}`, borderRadius: theme.radius.s, background: "transparent", cursor: "pointer" }}
                >
                  <span style={{ width: 32, height: 14, borderRadius: 2, background: tapeBackground(c, pattern), transform: "rotate(-12deg)" }} />
                </button>
              );
            })}
          </div>
          <ColorPicker value={color} onChange={(c) => penStore.getState().set({ tapeColor: c })} onCommit={(c) => penStore.getState().set({ tapeColor: c })} />
        </>
      ) : (
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
      )}

      <button
        type="button"
        disabled={!tapeIds}
        onClick={() => sessionStore.getState().removeItems(tapeIds.split(","))}
        style={{
          height: 40,
          border: `1px solid ${theme.color.sub}`,
          borderRadius: theme.radius.s,
          background: theme.color.bg,
          color: tapeIds ? theme.color.danger : theme.color.asymptote,
          fontSize: 14,
          fontWeight: 600,
          cursor: tapeIds ? "pointer" : "default",
        }}
      >
        이 쪽의 테이프 모두 지우기{tapeIds ? ` (${tapeIds.split(",").length})` : ""}
      </button>
      <span style={{ fontSize: 12, color: theme.color.asymptote, marginTop: -theme.space[2] }}>
        펜처럼 그어 붙이기 · 톡 = 벗기기/붙이기 · 지우개로 문지르면 떼어져요 · 옮기려면 올가미 · 모두 지우기도 되돌릴 수 있어요
      </span>
    </div>
  );
}
