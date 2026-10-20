import { ChevronLeft, Sparkles } from "lucide-react";
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
import { penStore, usePen } from "./store/pen";
import { useLibrary } from "./store/library";
import { useLayoutMode } from "./ui/layoutMode";
import { aiConfigured, modelName } from "./ai/settings";
import { ToolRail, type RailTool } from "./ui/ToolRail";
import { EraserOptions } from "./ui/EraserOptions";
import { TextPanel } from "./ui/TextPanel";
import { PagePanel } from "./ui/PagePanel";
import { ShapeOptions } from "./ui/ShapeOptions";
import { LassoOptions } from "./ui/LassoOptions";
import { TapeOptions } from "./ui/TapeOptions";
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
  const canvasTool = tool === "pen" || tool === "highlighter" ? "pen" : tool;
  const editingText = useTextEdit((s) => s.session !== null);
  // 즐겨 찾는 펜으로 펜↔형광펜이 바뀌면 레일의 도구도 따라간다
  const penKind = usePen((s) => s.kind);
  useEffect(() => {
    setTool((t) => (t === "pen" || t === "highlighter" ? penKind : t));
  }, [penKind]);
  const dark = usePen((s) => s.dark);
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
  const [aiOpen, setAiOpen] = useState(false);
  const openSheet = useCallback(() => {
    const r = document.querySelector("main")?.getBoundingClientRect();
    // 이동·확대된 화면에서 지금 보이는 부분 (월드 좌표)
    const { tx, ty, k } = viewportStore.getState();
    const w = r?.width ?? window.innerWidth;
    const h = r?.height ?? window.innerHeight;
    // 위쪽 56px은 노트 이름 막대 자리 — 새 그림이 그 밑에 숨지 않게
    const top = 56;
    setSheetArea({ x: -tx / k, y: (top - ty) / k, width: w / k, height: (h - top) / k });
    setAiOpen(false); // 아래에서 올라오는 시트는 한 번에 하나만 (겹치지 않게)
  }, []);

  const recognize = useCallback(
    (groupId: string | null, useAi = true) => {
      if (!groupId) return;
      const outcome = recognizeGroup(groupId);
      if (!outcome.ok && outcome.reason === "highlight-no-match") {
        if (useAi) showToast("형광펜 자국은 직선·원·사각형 같은 도형만 정리해요");
        return;
      }
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

  /** 사진·PDF 넣기 (단추·붙여넣기·끌어다 놓기 공통) */
  const insertFiles = useCallback(
    async (files: File[], at?: { x: number; y: number }) => {
      const m = await import("./ui/insertMedia");
      for (const f of files) {
        try {
          if (m.isPdfFile(f)) {
            const { importPdf } = await import("./ui/importPdf");
            showToast("PDF를 여는 중…", 120_000);
            const r = await importPdf(f, (done, total) => showToast(`PDF 쪽 넣는 중… ${done}/${total}`, 120_000));
            showToast(r);
          } else if (m.isImageFile(f)) {
            await m.insertImageFile(f, at);
            showToast("사진을 넣었어요 · 끌어서 옮기고 모서리로 크기를 바꿔요");
          } else {
            showToast(`${f.name}: 사진이나 PDF만 넣을 수 있어요`);
          }
        } catch (e) {
          showToast(e instanceof Error ? e.message : "파일을 넣지 못했어요");
        }
      }
    },
    [showToast],
  );
  // 붙여넣기(Ctrl+V)·끌어다 놓기로도 사진·PDF를 넣는다 (글 상자에 붙여넣는 글자는 그대로)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as Element | null)?.closest?.("input, textarea, [contenteditable='true']")) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        void insertFiles(files);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      const r = document.querySelector("main")?.getBoundingClientRect();
      const { tx, ty, k } = viewportStore.getState();
      void insertFiles(files, r ? { x: (e.clientX - r.left - tx) / k, y: (e.clientY - r.top - ty) / k } : undefined);
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [insertFiles]);

  const toolbar = <ToolRail tool={tool} onTool={setTool} mode={mode} onFormula={openSheet} onFiles={(f) => void insertFiles(f)} onAi={() => {
        setSheetArea(null); // ƒ 시트가 열려 있으면 닫고 AI 설정을 연다
        setAiOpen(true);
      }} panels={{ eraser: () => <EraserOptions />, text: () => <TextPanel />, shape: () => <ShapeOptions />, lasso: () => <LassoOptions />, tape: () => <TapeOptions />, page: () => <PagePanel onMessage={showToast} /> }} forcePanel={editingText && tool === "text" ? "text" : null} />;

  return (
    <div
      style={{
        // 100dvh: 모바일 주소창이 접히고 펴져도 높이가 튀지 않는다 (§12.4)
        height: "100dvh",
        overflow: "hidden", // 앱 화면 자체는 절대 옆·아래로 밀리지 않는다
        display: "flex",
        flexDirection: mode === "compact" ? "column" : "row",
        background: theme.color.bg,
        color: theme.color.ink,
        fontFamily: theme.font.ui,
        touchAction: "none",
        // 어두운 화면: 밝기만 뒤집고 색상은 그대로 (내보내기 그림은 원래 색)
        filter: dark ? "invert(0.9) hue-rotate(180deg)" : undefined,
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
        <NoteBar />
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
  // 핀치하는 동안 매 프레임 다시 그리지 않게 — 퍼센트가 바뀔 때만
  const pct = useViewport((s) => Math.round(s.k * 100));
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
      {pct}% · 원래대로
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

/**
 * 노트 위 막대 (왼쪽 위): ‹ 보관함으로 · 노트 이름 (톡 = 이름 바꾸기).
 * 보관함으로 갈 때 첫 쪽을 표지로 찍는다.
 */
function NoteBar(): ReactElement | null {
  const id = useLibrary((s) => s.openNoteId);
  const title = useLibrary((s) => s.notes.find((n) => n.id === s.openNoteId)?.title ?? "");
  const [renaming, setRenaming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (!id) return null;
  const back = async () => {
    if (leaving) return;
    setLeaving(true);
    commitTextEdit();
    const [{ closeNote }, { captureCover }] = await Promise.all([import("./store/noteActions"), import("./export/cover")]);
    await closeNote(captureCover);
  };
  return (
    <div
      className="sl-pop"
      style={{
        position: "absolute",
        left: `calc(${theme.space[2]}px + env(safe-area-inset-left))`,
        top: `calc(${theme.space[2]}px + env(safe-area-inset-top))`,
        zIndex: 16,
        display: "flex",
        alignItems: "center",
        maxWidth: "min(60%, 360px)",
        height: 40,
        padding: "0 6px 0 2px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.94)",
        boxShadow: "0 2px 10px rgba(26,26,26,0.12)",
        border: `1px solid ${theme.color.sub}`,
      }}
    >
      <button
        type="button"
        aria-label="노트 보관함으로"
        title="노트 보관함으로"
        onClick={() => void back()}
        style={{ width: 36, height: 36, flex: "0 0 auto", display: "grid", placeItems: "center", border: "none", borderRadius: "50%", background: "transparent", color: theme.color.ink, cursor: "pointer" }}
      >
        <ChevronLeft size={20} />
      </button>
      {renaming ? (
        <input
          autoFocus
          defaultValue={title}
          aria-label="노트 이름"
          maxLength={80}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            void import("./store/noteActions").then((m) => m.renameNote(id, e.target.value));
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            e.stopPropagation();
          }}
          style={{ minWidth: 0, width: 200, height: 30, padding: "0 8px", border: `1px solid ${theme.color.accent}`, borderRadius: 8, fontSize: 14, userSelect: "text" }}
        />
      ) : (
        <button
          type="button"
          title="톡 하면 이름 바꾸기"
          onClick={() => setRenaming(true)}
          style={{ minWidth: 0, padding: "0 6px", border: "none", background: "transparent", fontSize: 14, fontWeight: 600, color: theme.color.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "text" }}
        >
          {leaving ? "저장하는 중…" : title}
        </button>
      )}
    </div>
  );
}
