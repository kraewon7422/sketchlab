import { lazy, Suspense, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { useSession } from "../store/session";
import { ErrorBoundary } from "../ErrorBoundary";

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

const OVERLAY_KINDS = new Set(["plot2d", "formula", "chemEq", "solid3d", "space3d"]);

/** interactive: 펜 도구일 때만 입체를 돌릴 수 있다 (지우개일 땐 터치가 캔버스로 가야 지워진다) */
export function ObjectOverlays({ interactive }: { interactive: boolean }): ReactElement {
  const items = useSession((s) => s.items);
  const overlays = items.filter((i): i is ObjectItem => i.kind === "object" && OVERLAY_KINDS.has(i.ir.kind));

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      <ErrorBoundary area="graphs">
        <Suspense fallback={null}>
          {overlays.map((item) =>
            item.ir.kind === "solid3d" ? (
              <SolidObject key={item.id} item={item} interactive={interactive} />
            ) : item.ir.kind === "space3d" ? (
              <SpaceObject key={item.id} item={item} interactive={interactive} />
            ) : (
              <PlotObject key={item.id} item={item} />
            ),
          )}
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
