import { ALargeSmall, Bandage, Bot, ImagePlus, WandSparkles, Eraser, Highlighter, Keyboard, Lasso, NotebookText, Pen, Redo2, Shapes, SquareFunction, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { theme } from "../render/theme";
import { penStore, usePen, type ToolKey } from "../store/pen";
import { sessionStore, useSession } from "../store/session";
import type { LayoutMode } from "./layoutMode";
import { eyedropperStore } from "./eyedropper";
import { PenOptions, StyleOptions } from "./PenPalette";

/**
 * 도구 레일 — 노트 앱처럼 (삼성노트·GoodNotes의 세로 도구 막대).
 *
 *   태블릿·PC(wide·split): 오른쪽 세로 레일. 고른 도구를 한 번 더 누르면 왼쪽에 옵션 패널.
 *   폰(compact):          아래쪽 가로 막대. 패널은 위로 열린다.
 *
 *   [텍스트] [펜] [형광펜] [지우개] [올가미] [도형] [테이프] │ [되돌리기] [다시] │ [ƒ 입력] [AI]
 */

export type RailTool = ToolKey;

/** 도구 이름·아이콘 (도구 막대와 도구 막대 편집이 같이 쓴다) */
export const TOOL_META: Record<ToolKey, [string, typeof Pen]> = {
  text: ["텍스트", Keyboard],
  pen: ["펜", Pen],
  highlighter: ["형광펜", Highlighter],
  eraser: ["지우개", Eraser],
  lasso: ["올가미", Lasso],
  shape: ["도형", Shapes],
  tape: ["마스킹 테이프", Bandage],
  laser: ["레이저 포인터", WandSparkles],
  style: ["스타일 변경", ALargeSmall],
};

/** 패널 이름 — 도구마다 하나 + 쪽(속지·쪽 목록·내보내기) */
export type PanelKey = RailTool | "page";
/** 옵션 패널이 있는 도구 → 패널 내용 */
export type ToolPanels = Partial<Record<PanelKey, () => ReactNode>>;

interface ToolRailProps {
  tool: RailTool;
  onTool: (tool: RailTool) => void;
  mode: LayoutMode;
  onFormula: () => void;
  onAi: () => void;
  /** 사진·PDF 파일을 골랐다 */
  onFiles?: (files: File[]) => void;
  /** 아직 쓸 수 없는 도구 (다음 단계) */
  disabled?: readonly RailTool[];
  /** 펜·형광펜 외의 도구 패널 (지우개·텍스트 등) */
  panels?: ToolPanels;
  /** 이 패널은 누르지 않아도 열어 둔다 (글 상자를 고치는 동안 글자 패널) */
  forcePanel?: PanelKey | null;
}

export function ToolRail({ tool, onTool, mode, onFormula, onAi, onFiles, disabled = [], panels = {}, forcePanel = null }: ToolRailProps): ReactElement {
  const fileRef = useRef<HTMLInputElement>(null);
  const vertical = mode !== "compact";
  const [panel, setPanel] = useState<PanelKey | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const canUndo = useSession((s) => s.history.undo.length > 0);
  const canRedo = useSession((s) => s.history.redo.length > 0);
  const penColor = usePen((s) => s.penColor);
  const highlightColor = usePen((s) => s.highlightColor);
  const toolOrder = usePen((s) => s.toolOrder);
  const hiddenTools = usePen((s) => s.hiddenTools);

  const allPanels: ToolPanels = { pen: () => <PenOptions />, highlighter: () => <PenOptions />, style: () => <StyleOptions />, ...panels };

  // 바깥을 누르면 패널을 닫는다 — 닫으려고 캔버스를 톡 친 것은 점이 찍히지 않게 삼킨다
  useEffect(() => {
    if (!panel) return;
    const close = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      if ((e.target as Element | null)?.closest?.("[data-text-editor]")) return; // 글 상자 안을 누른 것
      if (eyedropperStore.getState().onPick) return; // 스포이트로 노트의 색을 집는 중 — 패널은 그대로
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
    <div ref={rootRef} style={{ position: "relative", flex: "0 0 auto", zIndex: 25, minWidth: 0, maxWidth: "100%" }}>
      <nav
        aria-label="도구"
        style={{
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 2,
          height: vertical ? "100%" : undefined,
          padding: vertical ? `calc(${theme.space[2]}px + env(safe-area-inset-top)) ${theme.space[1]}px ${theme.space[2]}px` : `${theme.space[1]}px ${theme.space[2]}px calc(${theme.space[1]}px + env(safe-area-inset-bottom))`,
          ...(vertical ? { borderLeft: `1px solid ${theme.color.sub}` } : { borderTop: `1px solid ${theme.color.sub}` }),
          background: "#FAFAFB",
          // 폰(아래 막대)은 도구가 많으면 옆으로 밀어 넘긴다 — 화면 밖으로 삐져나가지 않게 (스크롤 막대는 숨김)
          overflowY: vertical ? "auto" : "hidden",
          overflowX: vertical ? "hidden" : "auto",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          boxSizing: "border-box",
        }}
      >
        {/* 그리기 도구 — 순서·숨기기는 쪽 패널의 "도구 막대"에서 (고른 도구는 숨겨도 보인다) */}
        {toolOrder.filter((t) => t === tool || !hiddenTools.includes(t)).map((t) => {
          const [label, Icon] = TOOL_META[t];
          return btn(t, label, Icon, t === "pen" ? penColor : t === "highlighter" ? highlightColor : undefined);
        })}
        {divider}
        <RailButton label="실행 취소" disabled={!canUndo} onClick={() => sessionStore.getState().undo()}>
          <Undo2 size={21} strokeWidth={1.6} />
        </RailButton>
        <RailButton label="다시 실행" disabled={!canRedo} onClick={() => sessionStore.getState().redo()}>
          <Redo2 size={21} strokeWidth={1.6} />
        </RailButton>
        {divider}
        <RailButton label="쪽" hint="속지·쪽 목록·쪽 전체 내보내기" active={panel === "page"} onClick={() => setPanel((p) => (p === "page" ? null : "page"))}>
          <NotebookText size={21} strokeWidth={1.6} />
        </RailButton>
        <RailButton label="사진·PDF 넣기" hint="사진은 옮길 수 있는 그림으로, PDF는 새 쪽으로" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={21} strokeWidth={1.6} />
        </RailButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) onFiles?.(files);
          }}
        />
        <RailButton label="수식·그래프 입력" hint="식·그래프·화학·AI에게 부탁" onClick={onFormula}>
          <SquareFunction size={21} strokeWidth={1.6} />
        </RailButton>
        <RailButton label="AI 설정" hint="손글씨 인식·AI 그리기에 쓸 모델" onClick={onAi}>
          <Bot size={21} strokeWidth={1.6} />
        </RailButton>
      </nav>

      {(() => {
        const shown = forcePanel ?? panel;
        return shown && allPanels[shown] ? (
        <div key="panel-wrap" style={{ display: "contents" }}>
        <div
          role="dialog"
          className="sl-pop"
          aria-label={`${shown} 설정`}
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
          {allPanels[shown]?.()}
        </div>
        </div>
        ) : null;
      })()}
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
