import { Eraser, Lasso, Pen, Redo2, Sparkles, Undo2 } from "lucide-react";
import type { ReactElement } from "react";
import { DebugPanel } from "./DebugPanel";
import { theme } from "./render/theme";

/**
 * 앱 셸 — 마스터스펙 §12.2의 화면 구조.
 *
 *   ┌─────────────────────────────┐
 *   │  캔버스 (전면, 크롬 최소)      │   결과는 그린 자리에 in-place 교체.
 *   │                        (✨)  │   ✨ FAB는 우하단 엄지 존.
 *   ├─ 상단 얇은 툴바 ─────────────┤   펜/지우개/올가미/undo/redo만.
 *   └─────────────────────────────┘
 *
 * P0에서는 레이아웃과 토큰 배선만 검증한다. 도구는 전부 비활성이고,
 * 실제 동작은 P1(잉크) 이후에 붙는다 — 되는 척하는 버튼을 두지 않기 위해
 * disabled + title로 어느 Phase에서 켜지는지 명시한다.
 */

interface Tool {
  readonly id: string;
  readonly label: string;
  readonly Icon: typeof Pen;
  readonly enabledFrom: string;
}

const TOOLS: readonly Tool[] = [
  { id: "pen", label: "펜", Icon: Pen, enabledFrom: "P1" },
  { id: "eraser", label: "지우개", Icon: Eraser, enabledFrom: "P1" },
  { id: "lasso", label: "올가미", Icon: Lasso, enabledFrom: "P1" },
  { id: "undo", label: "실행 취소", Icon: Undo2, enabledFrom: "P1" },
  { id: "redo", label: "다시 실행", Icon: Redo2, enabledFrom: "P1" },
];

export function App(): ReactElement {
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
        // 캔버스 위 제스처를 우리가 전부 처리한다. P1에서 필수 (함정 #1)
        touchAction: "none",
      }}
    >
      <Toolbar />
      <CanvasArea />
      <DebugPanel />
    </div>
  );
}

function Toolbar(): ReactElement {
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
      {TOOLS.map(({ id, label, Icon, enabledFrom }) => (
        <button
          key={id}
          type="button"
          disabled
          aria-label={label}
          title={`${label} — ${enabledFrom}에서 활성화`}
          style={{
            width: theme.touch.minTarget,
            height: theme.touch.minTarget,
            display: "grid",
            placeItems: "center",
            border: "none",
            borderRadius: theme.radius.s,
            background: "transparent",
            color: theme.color.ink,
            opacity: 0.3,
            cursor: "not-allowed",
          }}
        >
          <Icon size={20} strokeWidth={1.5} />
        </button>
      ))}

      <span style={{ flex: 1 }} />

      <span style={{ fontSize: 12, color: theme.color.asymptote }}>SketchLab · P0</span>
    </header>
  );
}

function CanvasArea(): ReactElement {
  return (
    <main
      style={{
        position: "relative",
        flex: "1 1 auto",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <EmptyHint />
      <RecognizeFab />
    </main>
  );
}

/** 첫 실행 고스트 힌트 (§12.3). P1에서 첫 스트로크에 페이드아웃한다. */
function EmptyHint(): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        padding: theme.space[5],
        textAlign: "center",
      }}
    >
      <p style={{ margin: 0, color: theme.color.asymptote, fontSize: 15, lineHeight: 1.6 }}>
        도형이나 수식을 그리고 ✨를 누르세요
        <br />
        <span style={{ fontSize: 13, opacity: 0.8 }}>
          잉크 입력은 P1에서 켜집니다
        </span>
      </p>
    </div>
  );
}

/** ✨ 정리하기 — 엄지 존 FAB (§12.2 원칙 2). 활성 그룹이 없으면 비활성. */
function RecognizeFab(): ReactElement {
  return (
    <button
      type="button"
      disabled
      aria-label="정리하기"
      title="정리하기 — P2에서 활성화"
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
        opacity: 0.35,
        cursor: "not-allowed",
        boxShadow: "0 4px 16px rgba(37,99,235,0.25)",
        transition: `opacity ${theme.motion.base}ms ${theme.motion.easeOut}`,
      }}
    >
      <Sparkles size={24} strokeWidth={1.5} />
    </button>
  );
}
