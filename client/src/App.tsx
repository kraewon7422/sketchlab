import { Eraser, Lasso, Pen, Redo2, Sparkles, SquareFunction, Undo2 } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { DebugPanel } from "./DebugPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { PointerCanvas, type Tool } from "./ink/PointerCanvas";
import { recognizeGroup } from "./recognize/recognize";
import { ObjectOverlays } from "./render/ObjectOverlays";
import { theme } from "./render/theme";
import { sessionStore, useSession } from "./store/session";
import { useLayoutMode, type LayoutMode } from "./ui/layoutMode";

/**
 * 앱 셸 — 마스터스펙 v4 §15.2의 화면 구조.
 *
 *   ┌─────────────────────────────┐
 *   │  캔버스 (전면, 크롬 최소)      │   결과는 그린 자리에 in-place 교체.
 *   │              [활성 그룹 hint] │   ✨ FAB는 우하단 엄지 존.
 *   │                        (✨)  │
 *   ├─ 툴바 ──────────────────────┤   펜/지우개/올가미/undo/redo만.
 *   └─────────────────────────────┘   wide·split은 위, compact(팝업 창·폰)는 아래.
 */

/** 수식 입력 시트 — Compute Engine·KaTeX를 쓰므로 처음 열 때 내려받는다 */
const FormulaSheet = lazy(() => import("./ui/FormulaSheet"));

const NO_MATCH_MESSAGE = "도형으로 알아보지 못했어요 · 수식·그래프 인식은 다음 단계에서 붙어요";

export function App(): ReactElement {
  const [tool, setTool] = useState<Tool>("pen");
  const mode = useLayoutMode();
  const { toast, showToast } = useToast();
  const [sheetArea, setSheetArea] = useState<{ width: number; height: number } | null>(null);
  const openSheet = useCallback(() => {
    const r = document.querySelector("main")?.getBoundingClientRect();
    setSheetArea({ width: r?.width ?? window.innerWidth, height: r?.height ?? window.innerHeight });
  }, []);

  const recognize = useCallback(
    (groupId: string | null) => {
      if (!groupId) return;
      const outcome = recognizeGroup(groupId);
      if (!outcome.ok && outcome.reason === "no-match") showToast(NO_MATCH_MESSAGE);
    },
    [showToast],
  );

  useKeyboardShortcuts(() => recognize(sessionStore.getState().activeGroupId));

  const toolbar = <Toolbar tool={tool} onToolChange={setTool} mode={mode} onFormula={openSheet} />;

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
      {mode !== "compact" && toolbar}

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
          <PointerCanvas tool={tool} onHoldSnap={recognize} />
        </ErrorBoundary>
        <ObjectOverlays />

        <EmptyHint />
        <Toast message={toast} />
        <RecognizeFab onRecognize={() => recognize(sessionStore.getState().activeGroupId)} />
        <DebugPanel />
        {sheetArea && (
          <Suspense fallback={null}>
            <FormulaSheet area={sheetArea} onClose={() => setSheetArea(null)} />
          </Suspense>
        )}
      </main>

      {mode === "compact" && toolbar}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── 키보드 (PC·DeX, v4 §6.2)

function useKeyboardShortcuts(onRecognize: () => void): void {
  const ref = useRef(onRecognize);
  ref.current = onRecognize;

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === "z") {
        event.preventDefault();
        if (event.shiftKey) sessionStore.getState().redo();
        else sessionStore.getState().undo();
      } else if (mod && key === "y") {
        event.preventDefault();
        sessionStore.getState().redo();
      } else if (!mod && event.key === "Enter") {
        event.preventDefault();
        ref.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

// ─────────────────────────────────────────────────────────── 툴바

interface ToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  mode: LayoutMode;
  onFormula: () => void;
}

function Toolbar({ tool, onToolChange, mode, onFormula }: ToolbarProps): ReactElement {
  const canUndo = useSession((s) => s.history.undo.length > 0);
  const canRedo = useSession((s) => s.history.redo.length > 0);
  const bottom = mode === "compact";
  const pad = theme.space[1];
  const side = theme.space[3];

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: theme.space[1],
        padding: bottom
          ? `${pad}px ${side}px calc(${pad}px + env(safe-area-inset-bottom))`
          : `calc(${pad}px + env(safe-area-inset-top)) ${side}px ${pad}px`,
        ...(bottom
          ? { borderTop: `1px solid ${theme.color.sub}` }
          : { borderBottom: `1px solid ${theme.color.sub}` }),
        flex: "0 0 auto",
        justifyContent: bottom ? "space-around" : "flex-start",
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
        hint="S Pen 버튼을 누른 채 그어도 지워집니다"
        onClick={() => onToolChange("eraser")}
      />
      <ToolButton label="올가미" Icon={Lasso} disabled hint="P7에서 활성화" />
      <ToolButton label="수식·그래프 입력" Icon={SquareFunction} onClick={onFormula} hint="y=x^2, sin(x), x^2+y^2=4 …" />

      {!bottom && <span style={{ width: theme.space[2] }} />}

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

      {mode === "wide" && (
        <>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: theme.color.asymptote }}>SketchLab · P3</span>
        </>
      )}
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
        도형을 그리고 ✨를 누르세요
        <br />
        <span style={{ fontSize: 13 }}>획 끝에서 펜을 잠깐 멈추면 바로 반듯해져요 · 그래프는 ƒ 버튼</span>
      </p>
    </div>
  );
}

/** ✨ 정리하기 — 엄지 존 FAB (§12.2 원칙 2). 활성 그룹이 있을 때만 누를 수 있다. */
function RecognizeFab({ onRecognize }: { onRecognize: () => void }): ReactElement {
  const hasGroup = useSession((s) => s.activeGroupId !== null);

  return (
    <button
      type="button"
      disabled={!hasGroup}
      onClick={onRecognize}
      aria-label="정리하기"
      title={hasGroup ? "정리하기 (Enter)" : "정리할 그룹이 없습니다"}
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
        color: theme.color.bg,
        opacity: hasGroup ? 1 : 0.25,
        cursor: hasGroup ? "pointer" : "not-allowed",
        boxShadow: `0 4px 16px ${theme.color.selection}`,
        transition: `opacity ${theme.motion.base}ms ${theme.motion.easeOut}`,
      }}
    >
      <Sparkles size={24} strokeWidth={1.5} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────── 토스트

function useToast(): { toast: string | null; showToast: (message: string) => void } {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { toast, showToast };
}

function Toast({ message }: { message: string | null }): ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        left: "50%",
        bottom: theme.space[6] + 56,
        transform: "translateX(-50%)",
        maxWidth: `calc(100% - ${theme.space[6] * 2}px)`,
        padding: `${theme.space[2]}px ${theme.space[4]}px`,
        borderRadius: theme.radius.m,
        background: theme.color.ink,
        color: theme.color.bg,
        fontSize: 14,
        lineHeight: 1.5,
        textAlign: "center",
        pointerEvents: "none",
        opacity: message ? 0.92 : 0,
        transition: `opacity ${theme.motion.base}ms ${theme.motion.easeOut}`,
      }}
    >
      {message}
    </div>
  );
}
