import type { ReactElement } from "react";
import { theme } from "../render/theme";
import { penStore, usePen, type LaserStyle } from "../store/pen";

/**
 * 레이저 포인터 옵션 (레일에서 레이저를 한 번 더 누르면 열린다) — 삼성노트처럼.
 *   모양: 빛나는 선 · 윤곽선(가운데가 흰 선) · 점(자국 없이 펜촉만)
 *   색:   레인보우(빨강부터 무지개를 돌아 다시 빨강) / 단일 색상
 * 레이저 자국은 노트에 남지 않는다 (손을 떼면 잠시 뒤 사라진다).
 */
const SINGLE_COLORS = ["#FF2D2D", "#FF9F1C", "#FFE14D", "#3DDC97", "#2EC4F0", "#3B6CFF", "#A259FF", "#FF5CA8", "#FFFFFF"];

export function LaserOptions(): ReactElement {
  const style = usePen((s) => s.laserStyle);
  const mode = usePen((s) => s.laserColorMode);
  const color = usePen((s) => s.laserColor);
  const sample = mode === "rainbow" ? "url(#sl-laser-sample)" : color;

  const styleButton = (st: LaserStyle, label: string) => (
    <button
      key={st}
      type="button"
      aria-label={label}
      aria-pressed={style === st}
      title={label}
      onClick={() => penStore.getState().set({ laserStyle: st })}
      style={{
        height: 44,
        display: "grid",
        placeItems: "center",
        border: `1px solid ${style === st ? theme.color.accent : theme.color.sub}`,
        borderRadius: 999,
        background: style === st ? theme.color.selection : "#1F2024",
        cursor: "pointer",
      }}
    >
      <svg width={64} height={20} aria-hidden style={{ overflow: "visible" }}>
        {st === "dot" ? (
          <circle cx={32} cy={10} r={6} fill={sample} stroke="#fff" strokeWidth={2} filter="url(#sl-laser-sample-glow)" />
        ) : (
          <>
            <line x1={8} y1={10} x2={56} y2={10} stroke={sample} strokeWidth={st === "outline" ? 7 : 5} strokeLinecap="round" filter="url(#sl-laser-sample-glow)" />
            {st === "outline" && <line x1={8} y1={10} x2={56} y2={10} stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />}
          </>
        )}
      </svg>
    </button>
  );

  const radio = (m: "rainbow" | "single", label: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: theme.space[2], fontSize: 14, color: theme.color.ink, cursor: "pointer" }}>
      <input type="radio" name="laser-color" checked={mode === m} onChange={() => penStore.getState().set({ laserColorMode: m })} style={{ width: 20, height: 20, accentColor: theme.color.accent }} />
      {label}
    </label>
  );

  return (
    <div style={{ display: "grid", gap: theme.space[3] }}>
      <svg width={0} height={0} aria-hidden style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="sl-laser-sample" x1="0" x2="1">
            {["#FF2D2D", "#FF9F1C", "#FFE14D", "#3DDC97", "#2EC4F0", "#3B6CFF", "#A259FF"].map((c, i, a) => (
              <stop key={c} offset={i / (a.length - 1)} stopColor={c} />
            ))}
          </linearGradient>
          <filter id="sl-laser-sample-glow" x="-50%" y="-200%" width="200%" height="500%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      <strong style={{ fontSize: 14 }}>레이저 포인터</strong>
      <div role="group" aria-label="모양" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: theme.space[2] }}>
        {styleButton("glow", "빛나는 선")}
        {styleButton("outline", "윤곽선")}
        {styleButton("dot", "점")}
      </div>
      <div role="radiogroup" aria-label="색" style={{ display: "grid", gap: theme.space[2] }}>
        {radio("rainbow", "레인보우")}
        {radio("single", "단일 색상")}
      </div>
      {mode === "single" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SINGLE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`레이저 색 ${c}`}
              aria-pressed={color === c}
              onClick={() => penStore.getState().set({ laserColor: c })}
              style={{
                width: 30,
                height: 30,
                padding: 0,
                border: "none",
                borderRadius: "50%",
                background: c,
                boxShadow: color === c ? `0 0 0 2px ${theme.color.bg}, 0 0 0 4px ${theme.color.accent}` : `0 0 0 1px ${theme.color.sub}`,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}
      <span style={{ fontSize: 12, color: theme.color.asymptote }}>레이저 자국은 노트에 남지 않아요 — 손을 떼면 잠시 뒤 사라져요</span>
    </div>
  );
}
