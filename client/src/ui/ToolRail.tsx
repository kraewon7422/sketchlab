import { Bot, Eraser, Highlighter, Keyboard, Lasso, Pen, Redo2, SquareFunction, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { theme } from "../render/theme";
import { penStore, usePen } from "../store/pen";
import { sessionStore, useSession } from "../store/session";
import type { LayoutMode } from "./layoutMode";
import { PenOptions } from "./PenPalette";

/**
 * 도구 레일 — 노트 앱처럼 (삼성노트·GoodNotes의 세로 도구 막대).
 *
 *   태블릿·PC(wide·split): 오른쪽 세로 레일. 고른 도구를 한 번 더 누르면 왼쪽에 옵션 패널.
 *   폰(compact):          아래쪽 가로 막대. 패널은 위로 열린다.
 *
 *   [텍스트] [펜] [형광펜] [지우개] [올가미] │ [되돌리기] [다시] │ [ƒ 입력] [AI]
 */

export type RailTool = "text" | "pen" | "highlighter" | "eraser" | "lasso";

/** 옵션 패널이 있는 도구 → 패널 내용 */
export type ToolPanels = Partial<Record<RailTool, () => ReactNode>>;

interface ToolRailProps {
  tool: RailTool;
  onTool: (tool: RailTool) => void;
  mode: LayoutMode;
  onFormula: () => void;
  onAi: () => void;
  /** 아직 쓸 수 없는 도구 (다음 단계) */
  disabled?: readonly RailTool[];
  /** 펜·형광펜 외의 도구 패널 (지우개·텍스트 등) */
  panels?: ToolPanels;
}

export function ToolRail({ tool, onTool, mode, onFormula, onAi, disabled = [], panels = {} }: ToolRailProps): ReactElement {
  const vertical = mode !== "compact";
  const [panel, setPanel] = useState<RailTool | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const canUndo = useSession((s) => s.history.undo.length > 0);
  const canRedo = useSession((s) => s.history.redo.length > 0);
  const penColor = usePen((s) => s.penColor);
  const highlightColor = usePen((s) => s.highlightColor);

  const allPanels: ToolPanels = { pen: () => <PenOptions />, highlighter: () => <PenOptions />, ...panels };

  // 바깥을 누르면 패널을 닫는다 — 닫으려고 캔버스를 톡 친 것은 점이 찍히지 않게 삼킨다
  useEffect(() => {
    if (!panel) return;
    const close = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setPanel(null);
      if ((e.target as Element | null)?.closest("main")) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [panel]);

  const choose = (t: RailTool) => {
    if (t === tool) {
      // 고른 도구를 한 번 더 → 옵션 패널 열고 닫기
      setPanel((p) => (p === t || !allPanels[t] ? null : t));
      return;
    }
    if (t === "pen" || t === "highlighter") penStore.getState().set({ kind: t });
    setPanel(null);
    onTool(t);
  };

  const btn = (t: RailTool, label: string, Icon: typeof Pen, color?: string) => {
    const active = tool === t;
    const off = disabled.includes(t);
    return (
      <RailButton key={t} label={label} active={active} disabled={off} onClick={() => choose(t)} hint={allPanels[t] ? "한 번 더 누르면 설정" : undefined}>
        <Icon size={21} strokeWidth={1.6} color={active && color ? color : undefined} />
        {color && (
          <span
            aria-hidden
            style={{ position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)", width: 14, height: 3, borderRadius: 2, background: color, opacity: t === "highlighter" ? 0.7 : 1 }}
          />
        )}
      </RailButton>
    );
  };

  const divider = <span aria-hidden style={vertical ? { height: 1, width: 28, background: theme.color.sub, margin: `${theme.space[1]}px 0` } : { width: 1, height: 28, background: theme.color.sub }} />;

  return (
    <div ref={rootRef} style={{ position: "relative", flex: "0 0 auto", zIndex: 25 }}>
      <nav
        aria-label="도구"
        style={{
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          alignItems: "center",
          justifyContent: vertical ? "flex-start" : "space-around",
          gap: 2,
          height: vertical ? "100%" : undefined,
          padding: vertical ? `calc(${theme.space[2]}px + env(safe-area-inset-top)) ${theme.space[1]}px ${theme.space[2]}px` : `${theme.space[1]}px ${theme.space[2]}px calc(${theme.space[1]}px + env(safe-area-inset-bottom))`,
          ...(vertical ? { borderLeft: `1px solid ${theme.color.sub}` } : { borderTop: `1px solid ${theme.color.sub}` }),
          background: "#FAFAFB",
          overflowY: vertical ? "auto" : undefined,
          boxSizing: "border-box",
        }}
      >
        {btn("text", "텍스트", Keyboard)}
        {btn("pen", "펜", Pen, penColor)}
        {btn("highlighter", "형광펜", Highlighter, highlightColor)}
        {btn("eraser", "지우개", Eraser)}
        {btn("lasso", "올가미", Lasso)}
        {divider}
        <RailButton label="실행 취소" disabled={!canUndo} onClick={() => sessionStore.getState().undo()}>
          <Undo2 size={21} strokeWidth={1.6} />
        </RailButton>
        <RailButton label="다시 실행" disabled={!canRedo} onClick={() => sessionStore.getState().redo()}>
          <Redo2 size={21} strokeWidth={1.6} />
        </RailButton>
        {divider}
        <RailButton label="수식·그래프 입력" hint="식·그래프·화학·AI에게 부탁" onClick={onFormula}>
          <SquareFunction size={21} strokeWidth={1.6} />
        </RailButton>
        <RailButton label="AI 설정" hint="손글씨 인식·AI 그리기에 쓸 모델" onClick={onAi}>
          <Bot size={21} strokeWidth={1.6} />
        </RailButton>
      </nav>

      {panel && allPanels[panel] && (
        <div
          role="dialog"
          aria-label={`${panel} 설정`}
          style={{
            position: "absolute",
            ...(vertical
              ? { right: "100%", top: theme.space[2], marginRight: theme.space[2], maxHeight: `calc(100% - ${theme.space[4]}px)` }
              : { bottom: "100%", left: theme.space[2], right: theme.space[2], marginBottom: theme.space[2], maxHeight: "60vh" }),
            width: vertical ? 300 : undefined,
            overflowY: "auto",
            padding: theme.space[4],
            background: theme.color.bg,
            border: `1px solid ${theme.color.sub}`,
            borderRadius: theme.radius.m,
            boxShadow: "0 8px 28px rgba(26,26,26,0.16)",
            touchAction: "pan-y",
            boxSizing: "border-box",
          }}
        >
          {allPanels[panel]?.()}
        </div>
      )}
    </div>
  );
}

function RailButton({
  label,
  hint,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  hint?: string | undefined;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={hint ? `${label} — ${hint}` : label}
      style={{
        position: "relative",
        width: theme.touch.minTarget,
        height: theme.touch.minTarget,
        flex: "0 0 auto",
        display: "grid",
        placeItems: "center",
        border: "none",
        borderRadius: theme.radius.s,
        background: active ? theme.color.selection : "transparent",
        color: active ? theme.color.accent : theme.color.ink,
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: `background ${theme.motion.fast}ms ${theme.motion.easeOut}`,
      }}
    >
      {children}
    </button>
  );
}
