import { lazy, Suspense, useLayoutEffect, useRef, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { useSession } from "../store/session";
import { inView, useVisibleRect } from "../store/culling";
import { viewportStore } from "../store/viewport";
import { ErrorBoundary } from "../ErrorBoundary";
import { TapeObject } from "./TapeObject";
import { TextObject } from "./TextObject";
import { TableObject } from "./TableObject";
import { TextEditorHost } from "../ui/TextEditor";

/**
 * 그래프·수식 객체 층 — 캔버스(SVG) 위에 겹친 HTML 층.
 * KaTeX(HTML)·슬라이더(input) 때문에 SVG 안이 아니라 여기서 그린다.
 * 층 전체가 pointer-events: none 이라 그 위에 계속 필기할 수 있다.
 *
 * PlotObject는 lazy — Compute Engine·KaTeX(수백 KB)는 그래프가 처음 생길 때 내려받는다.
 */
const PlotObject = lazy(() => import("./PlotObject"));
/** 입체는 따로 — 수학 엔진 없이 가벼운 청크라 그래프 청크를 끌어오지 않는다 */
const SolidObject = lazy(() => import("./SolidObject"));
const SpaceObject = lazy(() => import("./SpaceObject"));
/** 화학은 RDKit(WASM 약 7 MB)을 쓰는 따로 된 청크 — 구조식을 처음 그릴 때만 내려받는다 */
const ChemObject = lazy(() => import("./ChemObject"));
/** 벤 다이어그램도 KaTeX를 쓰므로 따로 (처음 그릴 때만) */
const VennObject = lazy(() => import("./VennObject").then((m) => ({ default: m.VennObject })));

/** 6단계: 텐서·위상(도넛↔컵)·신경망 — 각자 따로 된 작은 청크 */
const TensorObject = lazy(() => import("./TensorObject"));
const TopologyObject = lazy(() => import("./TopologyObject"));
const NNetObject = lazy(() => import("./NNetObject"));

/** 7단계: 코드 블록 — 실행기(작업자·Pyodide)는 ▶를 누를 때 */
const CodeObject = lazy(() => import("./CodeObject"));

const OVERLAY_KINDS = new Set(["plot2d", "formula", "chemEq", "solid3d", "space3d", "chem", "text", "venn", "table", "tensor", "topology", "nnet", "code"]);

/** interactive: 펜 도구일 때만 입체를 돌릴 수 있다 (지우개일 땐 터치가 캔버스로 가야 지워진다) */
export function ObjectOverlays({ interactive }: { interactive: boolean }): ReactElement {
  const items = useSession((s) => s.items);
  // 화면 둘레만 그린다 — 내보낼 때는 전부 (withAllRendered)
  const visible = useVisibleRect();
  const overlays = items.filter((i): i is ObjectItem => i.kind === "object" && OVERLAY_KINDS.has(i.ir.kind) && inView(i.bbox, visible));
  const tapes = items.filter((i): i is ObjectItem => i.kind === "object" && i.ir.kind === "tape" && inView(i.bbox, visible));
  // 고른 입체는 돌리지 않고 끌어서 옮긴다 (돌리기는 고르지 않았을 때)
  const selection = useSession((s) => s.selection);
  // 이동·확대는 React를 거치지 않고 transform만 바꾼다 (그래프 수십 개가 있어도 핀치가 매끄럽게)
  const layerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const apply = ({ tx, ty, k }: { tx: number; ty: number; k: number }) => {
      if (layerRef.current) layerRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
    };
    apply(viewportStore.getState());
    return viewportStore.subscribe(apply);
  }, []);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* 캔버스와 같은 이동·확대 (화면 = 월드 × k + t) */}
      <div ref={layerRef} style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", willChange: "transform" }}>
      <ErrorBoundary area="graphs">
        <Suspense fallback={null}>
          {overlays.map((item) =>
            item.ir.kind === "solid3d" ? (
              <SolidObject key={item.id} item={item} interactive={interactive && !selection.includes(item.id)} />
            ) : item.ir.kind === "space3d" ? (
              <SpaceObject key={item.id} item={item} interactive={interactive && !selection.includes(item.id)} />
            ) : item.ir.kind === "chem" ? (
              <ChemObject key={item.id} item={item} />
            ) : item.ir.kind === "text" ? (
              <TextObject key={item.id} item={item} />
            ) : item.ir.kind === "venn" ? (
              <VennObject key={item.id} item={item} />
            ) : item.ir.kind === "table" ? (
              <TableObject key={item.id} item={item} />
            ) : item.ir.kind === "tensor" ? (
              <TensorObject key={item.id} item={item} interactive={interactive && !selection.includes(item.id)} />
            ) : item.ir.kind === "topology" ? (
              <TopologyObject key={item.id} item={item} interactive={interactive && !selection.includes(item.id)} />
            ) : item.ir.kind === "nnet" ? (
              <NNetObject key={item.id} item={item} />
            ) : item.ir.kind === "code" ? (
              <CodeObject key={item.id} item={item} interactive={interactive && !selection.includes(item.id)} />
            ) : (
              <PlotObject key={item.id} item={item} />
            ),
          )}
        </Suspense>
      </ErrorBoundary>
      {/* 마스킹 테이프는 맨 위 — 아래의 손글씨·그래프·구조식을 모두 가린다 */}
      {tapes.map((item) => (
        <TapeObject key={item.id} item={item} />
      ))}
      {/* 글 상자 편집기도 같은 층 — 이동·확대를 그대로 따른다 */}
      <TextEditorHost />
      </div>
    </div>
  );
}
