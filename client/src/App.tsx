import { Eraser, Lasso, Pen, Redo2, Sparkles, Undo2 } from "lucide-react";
import { useState, type ReactElement } from "react";
import { DebugPanel } from "./DebugPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { PointerCanvas, type Tool } from "./ink/PointerCanvas";
import { theme } from "./render/theme";
import { sessionStore, useSession } from "./store/session";

/**
 * 앱 셸 — 마스터스펙 §12.2의 화면 구조.
 *
 *   ┌─────────────────────────────┐
 *   │  캔버스 (전면, 크롬 최소)      │   결과는 그린 자리에 in-place 교체.
 *   │              [활성 그룹 hint] │   ✨ FAB는 우하단 엄지 존.
 *   │                        (✨)  │
 *   ├─ 상단 얇은 툴바 ─────────────┤   펜/지우개/올가미/undo/redo만.
 *   └─────────────────────────────┘   그 외 기능은 객체 탭 → 바텀시트.
 */
export function App(): ReactElement {
  const [tool, setTool] = useState<Tool>("pen");

  return (
    <div
      style={{
        // 100dvh: 모바일 주소창이 접히고 펴져도 높이가 튀지 않는다 (§12.4)
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: theme.color.bg,
        color: theme.color.ink,
        fontFamily: theme.font.ui,
        touchAction: "none",
      }}
    >
      <Toolbar tool={tool} onToolChange={setTool} />

      <main
        style={{
          position: "relative",
          flex: "1 1 auto",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* 캔버스가 죽어도 툴바까지 백지가 되지는 않게 따로 감싼다. */}
        <ErrorBoundary area="canvas">
          <PointerCanvas tool={tool} />
        </ErrorBoundary>

        <EmptyHint />
        <RecognizeFab />
      </main>

      <DebugPanel />
    </div>
  );
}

// ─────────────────────────────────────────────────────────── 툴바

interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
}

function Toolbar({ tool, onToolChange }: ToolbarProps): ReactElement {
  const canUndo = useSession((s) => s.history.undo.length > 0);
  const canRedo = useSession((s) => s.history.redo.length > 0);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: theme.space[1],
        padding: `calc(${theme.space[1]}px + env(safe-area-inset-top)) ${theme.space[3]}px ${theme.space[1]}px`,
        borderBottom: `1px solid ${theme.color.sub}`,
        flex: "0 0 auto",
      }}
    >
      <ToolButton
        label="펜"
        Icon={Pen}
        active={tool === "pen"}
        onClick={() => onToolChange("pen")}
      />
      <ToolButton
        label="지우개"
        Icon={Eraser}
        active={tool === "eraser"}
        onClick={() => onToolChange("eraser")}
      />
      <ToolButton label="올가미" Icon={Lasso} disabled hint="P7에서 활성화" />

      <span style={{ width: theme.space[2] }} />

      <ToolButton
        label="실행 취소"
        Icon={Undo2}
        disabled={!canUndo}
        onClick={() => sessionStore.getState().undo()}
      />
      <ToolButton
        label="다시 실행"
        Icon={Redo2}
        disabled={!canRedo}
        onClick={() => sessionStore.getState().redo()}
      />

      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 12, color: theme.color.asymptote }}>SketchLab · P1</span>
    </header>
  );
}

interface ToolButtonProps {
  label: string;
  Icon: typeof Pen;
  active?: boolean;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
}

function ToolButton({
  label,
  Icon,
  active = false,
  disabled = false,
  hint,
  onClick,
}: ToolButtonProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={hint ? `${label} — ${hint}` : label}
      style={{
        width: theme.touch.minTarget,
        height: theme.touch.minTarget,
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
      <Icon size={20} strokeWidth={1.5} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────── 오버레이

/** 첫 실행 고스트 힌트 (§12.3). 첫 스트로크에 페이드아웃한다. */
function EmptyHint(): ReactElement {
  const isEmpty = useSession((s) => s.items.length === 0);

  return (
    <div
      aria-hidden={!isEmpty}
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        padding: theme.space[5],
        textAlign: "center",
        opacity: isEmpty ? 1 : 0,
        transition: `opacity ${theme.motion.base}ms ${theme.motion.easeOut}`,
      }}
    >
      <p style={{ margin: 0, color: theme.color.asymptote, fontSize: 15, lineHeight: 1.6 }}>
        도형이나 수식을 그리고 ✨를 누르세요
      </p>
    </div>
  );
}

/** ✨ 정리하기 — 엄지 존 FAB (§12.2 원칙 2). 인식은 P2에서 붙는다. */
function RecognizeFab(): ReactElement {
  const hasGroup = useSession((s) => s.activeGroupId !== null);

  return (
    <button
      type="button"
      disabled
      aria-label="정리하기"
      title={hasGroup ? "정리하기 — P2에서 활성화" : "정리할 그룹이 없습니다"}
      style={{
        position: "absolute",
        right: `calc(${theme.space[4]}px + env(safe-area-inset-right))`,
        bottom: `calc(${theme.space[4]}px + env(safe-area-inset-bottom))`,
        width: 56,
        height: 56,
        display: "grid",
        placeItems: "center",
        borderRadius: "50%",
        border: "none",
        background: theme.color.accent,
        color: "#fff",
        // 그룹이 있으면 "곧 눌릴 것"임을 알 수 있게 조금 더 진하게.
        opacity: hasGroup ? 0.6 : 0.25,
        cursor: "not-allowed",
        boxShadow: "0 4px 16px rgba(37,99,235,0.25)",
        transition: `opacity ${theme.motion.base}ms ${theme.motion.easeOut}`,
      }}
    >
      <Sparkles size={24} strokeWidth={1.5} />
    </button>
  );
}
