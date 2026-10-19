import { Sparkles } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { DebugPanel } from "./DebugPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { PointerCanvas } from "./ink/PointerCanvas";
import { recognizeGroup } from "./recognize/recognize";
import { ObjectOverlays } from "./render/ObjectOverlays";
import { runExport, SelectionBar } from "./ui/SelectionBar";
import { theme } from "./render/theme";
import { sessionStore, useSession } from "./store/session";
import { useViewport, viewportStore } from "./store/viewport";
import { penStore } from "./store/pen";
import { useLayoutMode } from "./ui/layoutMode";
import { aiConfigured, modelName } from "./ai/settings";
import { ToolRail, type RailTool } from "./ui/ToolRail";
import { EraserOptions } from "./ui/EraserOptions";
import { TextPanel } from "./ui/TextPanel";
import { PagePanel } from "./ui/PagePanel";
import { ShapeOptions } from "./ui/ShapeOptions";
import { commitTextEdit } from "./ui/TextEditor";
import { textEditStore, useTextEdit } from "./store/textEdit";
import { textToHtml } from "./ui/richText";

/**
 * 앱 셸 — 마스터스펙 v4 §15.2의 화면 구조.
 *
 *   ┌──────────────────────────┬──┐
 *   │  캔버스 (전면, 크롬 최소)   │도│   결과는 그린 자리에 in-place 교체.
 *   │           [활성 그룹 hint] │구│   ✨ FAB는 레일 옆 엄지 존.
 *   │                     (✨)  │레│   노트 앱처럼 도구는 오른쪽 세로 레일 (ToolRail).
 *   └──────────────────────────┴──┘   compact(팝업 창·폰)는 아래 가로 막대.
 */

/** 수식 입력 시트 — Compute Engine·KaTeX를 쓰므로 처음 열 때 내려받는다 */
const FormulaSheet = lazy(() => import("./ui/FormulaSheet"));
const AiSettings = lazy(() => import("./ui/AiSettings"));

const penStoreKind = () => penStore.getState().kind;

const NO_MATCH_MESSAGE = "도형이 아니에요 · 손글씨(글자·수식·화학)를 알아보려면 🤖 AI 설정에서 연결해 주세요";

export function App(): ReactElement {
  const [tool, setTool] = useState<RailTool>(() => (penStoreKind() === "highlighter" ? "highlighter" : "pen"));
  // 캔버스가 아는 입력 방식 — 펜·형광펜은 그리기(색·굵기는 penStore), 지우개는 지우기
  const canvasTool = tool === "eraser" ? "eraser" : tool === "lasso" ? "lasso" : tool === "text" ? "text" : tool === "shape" ? "shape" : "pen";
  const editingText = useTextEdit((s) => s.session !== null);
  // 다른 도구로 바꾸면 쓰던 글 상자를 저장한다
  useEffect(() => {
    if (tool !== "text") commitTextEdit();
  }, [tool]);
  /** 글 상자 열기: 새로(빈 자리) 또는 기존 것 고치기 */
  const openText = useCallback((x: number, y: number, hitId: string | null) => {
    commitTextEdit();
    const item = hitId ? sessionStore.getState().items.find((i) => i.id === hitId) : undefined;
    if (item?.kind === "object" && item.ir.kind === "text") {
      sessionStore.getState().setSelection([]);
      textEditStore.getState().open({ id: item.id, x: item.transform.x, y: item.transform.y, html: item.ir.data.html ?? textToHtml(item.ir.data.text) });
    } else {
      textEditStore.getState().open({ id: null, x, y: y - 16, html: "" });
    }
  }, []);
  const drawing = tool === "pen" || tool === "highlighter";
  const mode = useLayoutMode();
  const { toast, showToast } = useToast();
  const [sheetArea, setSheetArea] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const openSheet = useCallback(() => {
    const r = document.querySelector("main")?.getBoundingClientRect();
    // 이동·확대된 화면에서 지금 보이는 부분 (월드 좌표)
    const { tx, ty, k } = viewportStore.getState();
    const w = r?.width ?? window.innerWidth;
    const h = r?.height ?? window.innerHeight;
    setSheetArea({ x: -tx / k, y: -ty / k, width: w / k, height: h / k });
  }, []);

  const recognize = useCallback(
    (groupId: string | null, useAi = true) => {
      if (!groupId) return;
      const outcome = recognizeGroup(groupId);
      if (outcome.ok || outcome.reason !== "no-match") return;
      // 도형이 아니면 손글씨 — AI에게 (멈춤 스냅은 도형 전용이라 AI로 넘기지 않는다)
      if (!useAi) return;
      if (!aiConfigured()) {
        showToast(NO_MATCH_MESSAGE);
        return;
      }
      showToast(`AI가 읽는 중… (${modelName()})`, 120_000);
      void import("./ai/recognize")
        .then((m) => m.recognizeWithAi(groupId))
        .then((r) => showToast(r.ok ? `${r.label}(으)로 바꿨어요 · 되돌리기로 손글씨 복구` : r.message));
    },
    [showToast],
  );

  useKeyboardShortcuts(() => recognize(sessionStore.getState().activeGroupId), showToast);

  const [aiOpen, setAiOpen] = useState(false);
  const toolbar = <ToolRail tool={tool} onTool={setTool} mode={mode} onFormula={openSheet} onAi={() => setAiOpen(true)} panels={{ eraser: () => <EraserOptions />, text: () => <TextPanel />, shape: () => <ShapeOptions />, page: () => <PagePanel onMessage={showToast} /> }} forcePanel={editingText && tool === "text" ? "text" : null} />;

  return (
    <div
      style={{
        // 100dvh: 모바일 주소창이 접히고 펴져도 높이가 튀지 않는다 (§12.4)
        height: "100dvh",
        display: "flex",
        flexDirection: mode === "compact" ? "column" : "row",
        background: theme.color.bg,
        color: theme.color.ink,
        fontFamily: theme.font.ui,
        touchAction: "none",
      }}
    >
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
          <PointerCanvas tool={canvasTool} onHoldSnap={(id) => recognize(id, false)} onTextTap={openText} />
        </ErrorBoundary>
        <ObjectOverlays interactive={drawing} />

        <EmptyHint />
        <Toast message={toast} />
        <SelectionBar
          onMessage={showToast}
          onEditText={(id) => {
            const it = sessionStore.getState().items.find((i) => i.id === id);
            if (!it) return;
            setTool("text");
            // 도구를 바꾼 뒤(저장 효과가 끝난 뒤) 연다
            setTimeout(() => openText(it.bbox.minX, it.bbox.minY, id), 0);
          }}
        />
        <RecognizeFab onRecognize={() => recognize(sessionStore.getState().activeGroupId)} />
        <ZoomReset />
        <DebugPanel />
        {sheetArea && (
          <Suspense fallback={null}>
            <FormulaSheet
              area={sheetArea}
              onClose={() => setSheetArea(null)}
              onOpenAiSettings={() => {
                setSheetArea(null);
                setAiOpen(true);
              }}
            />
          </Suspense>
        )}
        {aiOpen && (
          <Suspense fallback={null}>
            <AiSettings onClose={() => setAiOpen(false)} />
          </Suspense>
        )}
      </main>

      {toolbar}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── 키보드 (PC·DeX, v4 §6.2)

function useKeyboardShortcuts(onRecognize: () => void, onMessage: (m: string) => void): void {
  const ref = useRef(onRecognize);
  ref.current = onRecognize;
  const msgRef = useRef(onMessage);
  msgRef.current = onMessage;

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
      } else if (!mod && (event.key === "Delete" || event.key === "Backspace")) {
        const { selection, items } = sessionStore.getState();
        const sel = selection.filter((id) => !items.find((i) => i.id === id)?.locked); // 잠근 것은 Delete로도 안 지운다
        if (sel.length) {
          event.preventDefault();
          sessionStore.getState().removeItems(sel);
        }
      } else if (mod && key === "c") {
        // PC: 선택한 그림을 Ctrl+C → 노트 앱에서 Ctrl+V
        const { selection, items } = sessionStore.getState();
        const item = items.find((i) => i.id === selection[0]);
        if (item) {
          event.preventDefault();
          void runExport("copy", item).then((m) => m && msgRef.current(m));
        }
      } else if (event.key === "Escape") {
        sessionStore.getState().setSelection([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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

/** 이동·확대했을 때만 보이는 "원래대로" 알약 — 지금 배율도 알려 준다 */
function ZoomReset(): ReactElement | null {
  const k = useViewport((s) => s.k);
  const moved = useViewport((s) => s.tx !== 0 || s.ty !== 0 || s.k !== 1);
  if (!moved) return null;
  return (
    <button
      type="button"
      onClick={() => viewportStore.getState().reset()}
      title="원래 위치·크기로"
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: `calc(${theme.space[4]}px + env(safe-area-inset-bottom))`,
        minHeight: 36,
        padding: `0 ${theme.space[4]}px`,
        border: `1px solid ${theme.color.sub}`,
        borderRadius: 999,
        background: theme.color.bg,
        color: theme.color.ink,
        fontSize: 13,
        boxShadow: "0 2px 10px rgba(26,26,26,0.10)",
        cursor: "pointer",
      }}
    >
      {Math.round(k * 100)}% · 원래대로
    </button>
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

function useToast(): { toast: string | null; showToast: (message: string, ms?: number) => void } {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, ms = 2600) => {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), ms);
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
