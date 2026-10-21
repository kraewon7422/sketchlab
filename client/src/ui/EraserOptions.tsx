import { Switch } from "./penControls";
import type { ReactElement } from "react";
import { penOpts, theme } from "../render/theme";
import { penStore, usePen } from "../store/pen";
import { sessionStore } from "../store/session";

/**
 * 지우개 옵션 패널 (레일에서 지우개를 한 번 더 누르면 열린다) — 삼성노트처럼.
 *   획 지우기:   닿은 획을 통째로
 *   영역 지우기: 문지른 부분만 잘라 낸다
 *   크기 · 페이지 모두 지우기 (되돌리기 가능)
 * 그래프·화학 구조식·입체·수식·글 상자는 어느 쪽으로도 지워지지 않는다 (선택해서 [삭제]).
 */
export function EraserOptions(): ReactElement {
  const eraseHighlightOnly = usePen((s) => s.eraseHighlightOnly);
  const eraseTapeOnly = usePen((s) => s.eraseTapeOnly);
  const mode = usePen((s) => s.eraserMode);
  const size = usePen((s) => s.eraserSize);

  const modeButton = (m: "stroke" | "area", label: string, desc: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => penStore.getState().set({ eraserMode: m })}
      style={{
        display: "grid",
        gap: 2,
        textAlign: "left",
        padding: `${theme.space[2]}px ${theme.space[3]}px`,
        border: `1px solid ${mode === m ? theme.color.accent : theme.color.sub}`,
        borderRadius: theme.radius.s,
        background: mode === m ? theme.color.selection : theme.color.bg,
        color: theme.color.ink,
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: mode === m ? theme.color.accent : theme.color.ink }}>{label}</span>
      <span style={{ fontSize: 12, color: theme.color.asymptote }}>{desc}</span>
    </button>
  );

  return (
    <div style={{ display: "grid", gap: theme.space[3] }}>
      <strong style={{ fontSize: 14 }}>지우개</strong>
      {modeButton("stroke", "획 지우기", "닿은 획을 통째로 지워요")}
      {modeButton("area", "영역 지우기", "문지른 부분만 지워요")}

      <label style={{ display: "grid", gap: 4, fontSize: 13, color: theme.color.ink }}>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>크기</span>
          <span
            aria-hidden
            style={{ width: Math.min(40, size * 1.2), height: Math.min(40, size * 1.2), borderRadius: "50%", border: `1.5px solid ${theme.color.accent}`, display: "inline-block" }}
          />
        </span>
        <input
          type="range"
          aria-label="지우개 크기"
          min={penOpts.eraserSize.min}
          max={penOpts.eraserSize.max}
          step={1}
          value={size}
          onChange={(e) => penStore.getState().set({ eraserSize: Number(e.target.value) })}
          style={{ width: "100%", accentColor: theme.color.accent }}
        />
      </label>

      <Switch label="형광펜만 지우기" checked={eraseHighlightOnly} onChange={(v) => penStore.getState().set({ eraseHighlightOnly: v })} />
      <Switch label="테이프만 지우기" checked={eraseTapeOnly} onChange={(v) => penStore.getState().set({ eraseTapeOnly: v })} />

      <button
        type="button"
        onClick={() => sessionStore.getState().clearAll()}
        style={{
          height: theme.touch.minTarget,
          border: `1px solid ${theme.color.danger}`,
          borderRadius: theme.radius.s,
          background: theme.color.bg,
          color: theme.color.danger,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        손글씨 모두 지우기
      </button>
      <span style={{ fontSize: 12, color: theme.color.asymptote, marginTop: -theme.space[2] }}>되돌리기(↶)로 다시 살릴 수 있어요</span>
    </div>
  );
}
