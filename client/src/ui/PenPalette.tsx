import { Highlighter, Pen } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { penOpts, theme } from "../render/theme";
import { currentStrokeStyle, penStore, usePen, type PenKind, type PenSettings } from "../store/pen";

/**
 * 펜 팔레트 — 툴바의 색 단추를 누르면 열린다.
 *   [펜 | 형광펜]  색  굵기  흔들림 보정
 * 무엇을 고르든 도구는 펜으로 돌아간다 (지우개 상태에서 색을 고르면 바로 쓰고 싶은 것).
 */
export function PenPalette({ onPick, openUp }: { onPick: () => void; openUp: boolean }): ReactElement {
  const [open, setOpen] = useState(false);
  const pen = usePen((s) => s);
  const style = currentStrokeStyle(pen);
  const rootRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      // 닫으려고 캔버스를 톡 친 것 — 점이 찍히지 않게 삼킨다 (다른 단추는 그대로 눌린다)
      if ((e.target as Element | null)?.closest("main")) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [open]);

  const choose = (patch: Partial<PenSettings>) => {
    penStore.getState().set(patch);
    onPick();
  };
  const highlighter = pen.kind === "highlighter";
  const colors = highlighter ? penOpts.highlightColors : penOpts.colors;
  const names = highlighter ? penOpts.highlightNames : penOpts.colorNames;
  const current = highlighter ? pen.highlightColor : pen.penColor;
  const sizes = highlighter ? penOpts.highlightSizes : penOpts.sizes;

  const kindButton = (kind: PenKind, label: string, Icon: typeof Pen) => (
    <button
      type="button"
      aria-pressed={pen.kind === kind}
      onClick={() => choose({ kind })}
      style={{
        flex: 1,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.space[1],
        border: "none",
        borderRadius: theme.radius.s,
        background: pen.kind === kind ? theme.color.selection : "transparent",
        color: pen.kind === kind ? theme.color.accent : theme.color.ink,
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      <Icon size={18} strokeWidth={1.6} />
      {label}
    </button>
  );

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="펜 색·굵기"
        aria-expanded={open}
        title="펜 색·굵기·형광펜"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: theme.touch.minTarget,
          height: theme.touch.minTarget,
          display: "grid",
          placeItems: "center",
          border: "none",
          borderRadius: theme.radius.s,
          background: open ? theme.color.selection : "transparent",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: style.color,
            opacity: highlighter ? 0.7 : 1,
            boxShadow: `0 0 0 2px ${theme.color.bg}, 0 0 0 3px ${theme.color.sub}`,
          }}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="펜 설정"
          style={{
            position: "absolute",
            left: 0,
            ...(openUp ? { bottom: theme.touch.minTarget + theme.space[2] } : { top: theme.touch.minTarget + theme.space[2] }),
            width: 264,
            padding: theme.space[3],
            display: "grid",
            gap: theme.space[3],
            background: theme.color.bg,
            border: `1px solid ${theme.color.sub}`,
            borderRadius: theme.radius.m,
            boxShadow: "0 8px 28px rgba(26,26,26,0.16)",
            zIndex: 30,
            touchAction: "auto",
          }}
        >
          <div style={{ display: "flex", gap: theme.space[1] }}>
            {kindButton("pen", "펜", Pen)}
            {kindButton("highlighter", "형광펜", Highlighter)}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: theme.space[2] }}>
            {colors.map((c, i) => (
              <button
                key={c}
                type="button"
                aria-label={names[i]}
                aria-pressed={current === c}
                title={names[i]}
                onClick={() => choose(highlighter ? { highlightColor: c } : { penColor: c })}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: "none",
                  background: c,
                  opacity: highlighter ? 0.75 : 1,
                  boxShadow: current === c ? `0 0 0 3px ${theme.color.bg}, 0 0 0 5px ${theme.color.accent}` : `0 0 0 1px ${theme.color.sub}`,
                  cursor: "pointer",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: theme.space[2], alignItems: "center" }}>
            {sizes.map((w, i) => (
              <button
                key={w}
                type="button"
                aria-label={["가늘게", "보통", "굵게"][i]}
                aria-pressed={pen.size === i}
                onClick={() => choose({ size: i as 0 | 1 | 2 })}
                style={{
                  flex: 1,
                  height: 40,
                  display: "grid",
                  placeItems: "center",
                  border: `1px solid ${pen.size === i ? theme.color.accent : theme.color.sub}`,
                  borderRadius: theme.radius.s,
                  background: theme.color.bg,
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: Math.max(2, Math.min(18, w * (highlighter ? 0.7 : 1.4))),
                    borderRadius: 99,
                    background: current,
                    opacity: highlighter ? 0.6 : 1,
                  }}
                />
              </button>
            ))}
          </div>

          <label style={{ display: "grid", gap: theme.space[1], fontSize: 13, color: theme.color.ink }}>
            <span style={{ display: "flex", justifyContent: "space-between" }}>
              <span>흔들림 보정</span>
              <span style={{ color: theme.color.asymptote }}>{pen.smoothing === 0 ? "끔" : `${Math.round(pen.smoothing * 100)}%`}</span>
            </span>
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.05}
              value={pen.smoothing}
              onChange={(e) => penStore.getState().set({ smoothing: Number(e.target.value) })}
              style={{ width: "100%", accentColor: theme.color.accent }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
