import { useEffect, useRef } from "react";
import { debugLog } from "../debug";
import { ObjectItemView } from "../render/Shape2DView";
import { ink, theme, viewport } from "../render/theme";
import { createStroke, sessionStore, useSession } from "../store/session";
import { useViewport, viewportStore } from "../store/viewport";
import { GroupHint, InkItemView } from "./InkLayer";
import { distance, toWorld, zoomAbout, type View } from "./geometry";
import { simplifyRDP } from "./simplify";
import { smoothStrokePath } from "./smoothOutline";
import { createPalmRejector } from "./palmRejection";
import type { InkItem, Point } from "./types";

export type Tool = "pen" | "eraser";

/**
 * S Pen 측면 버튼(2) 또는 지우개 버튼(32)이 눌린 상태인가 (v4 §6.1).
 * ⚠️ 펜이 공중에 있을 때 버튼을 누르면 삼성 "에어 커맨드"가 열린다 — 그래서 접촉(pointerdown)
 *    순간에 눌려 있을 때만 의미를 준다: 그 획 동안 임시 지우개.
 */
function isBarrelPressed(event: PointerEvent): boolean {
  return event.pointerType === "pen" && (event.buttons & (2 | 32)) !== 0;
}

interface PointerCanvasProps {
  tool: Tool;
  /** "그리고 멈추기"로 획 하나가 새 그룹으로 확정됐다 — 호출측이 바로 인식한다. */
  onHoldSnap?: (groupId: string) => void;
}

/**
 * 잉크 입력 표면.
 *
 * 왜 React 합성 이벤트가 아니라 네이티브 리스너인가:
 * pointermove는 초당 수백 번 들어온다. 그 경로에 React의 이벤트 위임과
 * 상태 갱신을 태우면 60fps를 지킬 수 없다. 그래서
 *   - 진행 중인 획은 React 상태가 아니라 ref + DOM 속성 직접 조작으로 그리고,
 *   - 스토어에는 획이 끝났을 때 딱 한 번 커밋한다 (§5.3).
 *
 * 진행 중 획은 프레임마다(rAF 1회) 매끈한 외곽선 하나로 통째로 다시 만든다 (smoothOutline.ts).
 * 조각을 이어 붙이던 v1은 이음새가 고해상도 화면에서 흐려 보였다. 3000점 획도 수 ms라 충분히 빠르다.
 *
 * P1.5 추가 (v4 §6.1)
 *  - 호버 커서: S Pen이 화면 위 공중에 있으면 펜촉 위치에 작은 원
 *  - 예측 점: getPredictedEvents()로 1~2점 앞을 임시로 그려 체감 지연을 줄인다.
 *    예측 점은 화면에 그릴 때만 덧붙이고 확정 획(drawing.points)에는 절대 넣지 않는다.
 *  - 측면 버튼: 누른 채 닿으면 그 획은 지우개
 *  - 그리고 멈추기: 획 끝에서 ink.holdMs 동안 멈추면 그 획만 바로 도형으로
 *
 * 이동·확대 (v4 §12.2): 손가락 두 개 = 이동 + 핀치 확대, 휠 = 이동, Ctrl+휠(트랙패드 핀치) = 확대.
 * 펜으로 그리는 중에는 손(손바닥) 터치를 무시한다 — 획이 끊기지 않게.
 * 그림은 <g transform> 하나 안에 월드 좌표 그대로 있고, 포인터 → 월드 변환은 toWorld 한 곳.
 */
export function PointerCanvas({ tool, onHoldSnap }: PointerCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const livePathRef = useRef<SVGPathElement>(null);
  const hoverRef = useRef<SVGCircleElement>(null);

  const items = useSession((s) => s.items);
  const activeGroupId = useSession((s) => s.activeGroupId);
  const tx = useViewport((s) => s.tx);
  const ty = useViewport((s) => s.ty);
  const k = useViewport((s) => s.k);

  // 리스너를 다시 붙이지 않기 위해 도구·콜백은 ref로 읽는다.
  const toolRef = useRef<Tool>(tool);
  toolRef.current = tool;
  const holdSnapRef = useRef(onHoldSnap);
  holdSnapRef.current = onHoldSnap;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const rejector = createPalmRejector();

    /** 진행 중인 획. null이면 그리는 중이 아니다. */
    let drawing: {
      pointerId: number;
      pointerType: string;
      points: Point[];
      startedAt: number;
      length: number;
      /** 멈춤 판정 기준점 — 이보다 ink.holdTolerance 이상 움직이면 타이머를 다시 건다 */
      anchor: Point;
      held: boolean;
    } | null = null;
    /** 지우개 드래그 중인 포인터 */
    let erasingPointerId: number | null = null;
    /** 지우개 탭 판정용 시작점 (화면 좌표) — 지우개로 그래프를 톡 치면 선택 메뉴(삭제)가 뜬다 */
    let eraseStart: { x: number; y: number; t: number; moved: number } | null = null;
    /** getBoundingClientRect는 비싸다. 획 시작 시·리사이즈 시에만 읽는다. */
    let rect: DOMRect | null = null;
    /** 아직 화면에 반영되지 않은 좌표 */
    let queued: Point[] = [];
    /** 가장 최근의 예측 좌표 (확정 획 아님) */
    let predicted: Point[] = [];
    let frame: number | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    /** 화면에 닿아 있는 손가락 (화면 좌표) */
    const touches = new Map<number, { x: number; y: number }>();
    /** 두 손가락 제스처: 시작 때의 중점·거리·화면 상태 */
    let gesture: { mx: number; my: number; dist: number; view: View } | null = null;
    /** 제스처 뒤 남은 손가락은 다 뗄 때까지 그리지 않는다 (한 손가락 떼는 순간 점이 찍히지 않게) */
    let gestureLock = false;
    const view = (): View => viewportStore.getState();

    /**
     * 포인터 캡처는 던질 수 있다 — 포인터가 이미 해제됐거나 다른 요소가 잡고 있으면
     * NotFoundError가 난다. 그대로 두면 pointerdown 핸들러가 통째로 중단돼
     * "화면을 눌러도 아무 반응이 없는" 상태가 된다. 캡처 실패는 치명적이지 않으므로
     * (요소 밖으로 나가면 획이 끊기는 정도) 기록만 하고 그리기는 계속한다.
     */
    const capture = (pointerId: number): void => {
      try {
        svg.setPointerCapture(pointerId);
      } catch (error) {
        debugLog.warn("ink", "포인터 캡처 실패 — 그리기는 계속합니다", error);
      }
    };

    const release = (pointerId: number): void => {
      try {
        svg.releasePointerCapture(pointerId);
      } catch {
        // 이미 해제된 포인터. 정상적인 흐름이라 로그도 남기지 않는다.
      }
    };

    const sample = (event: PointerEvent, startedAt: number): Point | null => {
      if (!rect) return null;
      const { x, y } = toWorld(event.clientX, event.clientY, rect, view());
      return {
        x,
        y,
        // 필압 미지원 입력은 0을 준다. 그대로 쓰면 획이 사라지므로 중간값으로 대체.
        p: event.pressure > 0 ? event.pressure : 0.5,
        t: event.timeStamp - startedAt,
      };
    };

    // ── 호버 커서 ──────────────────────────────────────────
    const showHover = (event: PointerEvent): void => {
      const dot = hoverRef.current;
      if (!dot) return;
      rect ??= svg.getBoundingClientRect();
      const { x, y } = toWorld(event.clientX, event.clientY, rect, view());
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("visibility", "visible");
    };
    const hideHover = (): void => {
      hoverRef.current?.setAttribute("visibility", "hidden");
    };

    // ── 그리고 멈추기 ──────────────────────────────────────
    const clearHold = (): void => {
      if (holdTimer !== null) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };
    const armHold = (): void => {
      clearHold();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (!drawing || drawing.length < ink.holdMinLength) return;
        drawing.held = true;
        // 확정됐다는 신호: 진행 중 획 색을 강조색으로. 놓으면 도형으로 바뀐다.
        livePathRef.current?.setAttribute("fill", theme.color.accent);
        navigator.vibrate?.(8);
      }, ink.holdMs);
    };

    // ── 진행 중 획 그리기 ───────────────────────────────────
    const paint = (): void => {
      frame = null;
      const path = livePathRef.current;
      if (!drawing || !path) return;

      let previous = drawing.points[drawing.points.length - 1];
      for (const point of queued) {
        if (previous) drawing.length += distance(previous.x, previous.y, point.x, point.y);
        drawing.points.push(point);
        previous = point;
      }
      queued = [];

      // 예측 점은 그릴 때만 덧붙인다 — 다음 프레임에 실제 점으로 대체된다
      const shown = predicted.length > 0 ? [...drawing.points, ...predicted] : drawing.points;
      path.setAttribute("d", smoothStrokePath(shown, { baseWidth: ink.width }));
    };

    const schedulePaint = (): void => {
      frame ??= requestAnimationFrame(paint);
    };

    const clearLive = (): void => {
      queued = [];
      predicted = [];
      clearHold();
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      livePathRef.current?.setAttribute("d", "");
      livePathRef.current?.setAttribute("fill", theme.color.ink);
    };

    const eraseAtEvent = (event: PointerEvent): void => {
      if (!rect) return;
      const v = view();
      const { x, y } = toWorld(event.clientX, event.clientY, rect, v);
      // 지우개 반경은 화면 기준 — 확대해도 손에 느껴지는 크기가 같게
      sessionStore.getState().eraseAt(x, y, ink.eraserRadius / v.k);
    };

    // ── 이동·확대 ─────────────────────────────────────────
    const gestureFrame = (): { mx: number; my: number; dist: number } | null => {
      const [a, b] = [...touches.values()];
      if (!a || !b) return null;
      return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    };
    const startGesture = (): void => {
      const f = gestureFrame();
      if (!f) return;
      rect = svg.getBoundingClientRect();
      gesture = { dist: f.dist, mx: f.mx - rect.left, my: f.my - rect.top, view: { ...view() } };
      gestureLock = true;
    };
    const moveGesture = (): void => {
      const f = gestureFrame();
      if (!gesture || !f || !rect) return;
      const g = gesture;
      const mx = f.mx - rect.left;
      const my = f.my - rect.top;
      // 시작 화면에서 중점 아래 있던 점을 기준으로 확대한 뒤, 손가락 중점이 움직인 만큼 옮긴다
      const zoomed = zoomAbout(g.view, g.mx, g.my, g.view.k * (f.dist / g.dist), viewport.minZoom, viewport.maxZoom);
      viewportStore.getState().setView({ k: zoomed.k, tx: zoomed.tx + (mx - g.mx), ty: zoomed.ty + (my - g.my) });
    };

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      rect ??= svg.getBoundingClientRect();
      const v = view();
      const unit = event.deltaMode === 1 ? 16 : 1;
      if (event.ctrlKey) {
        // Ctrl+휠, 트랙패드 핀치(브라우저가 ctrlKey로 보낸다)
        const nk = v.k * Math.exp(-event.deltaY * unit * viewport.wheelZoom);
        viewportStore.getState().setView(zoomAbout(v, event.clientX - rect.left, event.clientY - rect.top, nk, viewport.minZoom, viewport.maxZoom));
      } else {
        viewportStore.getState().setView({ ...v, tx: v.tx - event.deltaX * unit, ty: v.ty - event.deltaY * unit });
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      hideHover();

      if (event.pointerType === "touch") {
        // 펜으로 그리는 중의 손 터치는 손바닥 — 무시한다 (획을 끊지 않는다)
        if (drawing && drawing.pointerType === "pen") return;
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size >= 2) {
          // 두 번째 손가락: 그리던 한 손가락 획은 버리고 이동·확대로
          if (drawing) {
            release(drawing.pointerId);
            drawing = null;
          }
          erasingPointerId = null;
          clearLive();
          if (!gesture) startGesture();
          event.preventDefault();
          return;
        }
        if (gestureLock) return;
      }

      // 이미 그리는 중에 두 번째 포인터가 들어왔다 — 팬·줌 의도로 본다 (§12.2).
      // 진행 중인 획을 버리지 않으면 화면에 지렁이 같은 획이 남는다.
      if (drawing || erasingPointerId !== null) {
        if (drawing) {
          release(drawing.pointerId);
          drawing = null;
        }
        erasingPointerId = null;
        clearLive();
        return;
      }

      const verdict = rejector.evaluate({
        pointerType: event.pointerType,
        width: event.width,
        height: event.height,
        isPrimary: event.isPrimary,
      });

      if (verdict !== "ok") {
        // 조용히 무시하지 않는다 — 손바닥이 걸러졌는지 확인할 길이 있어야 한다.
        debugLog.info("ink", `입력 무시: ${verdict}`, `pointerType=${event.pointerType}`);
        return;
      }

      event.preventDefault();
      rect = svg.getBoundingClientRect();

      if (toolRef.current === "eraser" || isBarrelPressed(event)) {
        erasingPointerId = event.pointerId;
        eraseStart = { x: event.clientX, y: event.clientY, t: event.timeStamp, moved: 0 };
        capture(event.pointerId);
        eraseAtEvent(event);
        return;
      }

      const startedAt = event.timeStamp;
      const first = sample(event, startedAt);
      if (!first) return;

      capture(event.pointerId);
      drawing = { pointerId: event.pointerId, pointerType: event.pointerType, points: [first], startedAt, length: 0, anchor: first, held: false };
      armHold();

      livePathRef.current?.setAttribute("d", smoothStrokePath([first], { baseWidth: ink.width }));
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (touches.has(event.pointerId)) {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (gesture) {
          moveGesture();
          return;
        }
      }
      if (erasingPointerId === event.pointerId) {
        if (eraseStart) eraseStart.moved = Math.max(eraseStart.moved, distance(eraseStart.x, eraseStart.y, event.clientX, event.clientY));
        eraseAtEvent(event);
        return;
      }

      if (!drawing) {
        // 펜 호버: 버튼이 하나도 안 눌린 펜 이동 = 공중에 떠 있음
        if (event.pointerType === "pen" && event.buttons === 0) showHover(event);
        return;
      }
      if (drawing.pointerId !== event.pointerId) return;

      // 빠른 획에서 브라우저가 합쳐 보낸 중간 좌표까지 복원한다 (함정 #2).
      // 이게 없으면 빠르게 그은 곡선이 각져 보인다.
      const coalesced =
        typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
      const samples = coalesced.length > 0 ? coalesced : [event];

      for (const raw of samples) {
        const point = sample(raw, drawing.startedAt);
        if (!point) continue;
        queued.push(point);
        // 멈춘 뒤 다시 움직이면 확정을 풀고 타이머를 다시 건다.
        if (distance(point.x, point.y, drawing.anchor.x, drawing.anchor.y) > ink.holdTolerance) {
          drawing.anchor = point;
          if (drawing.held) {
            drawing.held = false;
            livePathRef.current?.setAttribute("fill", theme.color.ink);
          }
          armHold();
        }
      }

      const next =
        typeof event.getPredictedEvents === "function" ? event.getPredictedEvents() : [];
      predicted = [];
      for (const raw of next) {
        const point = sample(raw, drawing.startedAt);
        if (point) predicted.push(point);
      }
      schedulePaint();
    };

    const finishStroke = (): void => {
      if (!drawing) return;

      predicted = [];
      paint(); // 아직 반영 안 된 좌표를 마저 흡수
      const captured = drawing;
      drawing = null;

      // 짧게 톡 친 것 = 탭. 객체 위 탭은 선택, 무언가 선택된 상태의 탭은 선택 해제 (점을 남기지 않는다)
      const state = sessionStore.getState();
      const first = captured.points[0];
      const last = captured.points[captured.points.length - 1];
      const isTap = !!first && !!last && captured.length < ink.tapMaxMove && last.t - first.t < ink.tapMaxMs;
      if (isTap && first) {
        const hit = [...state.items]
          .reverse()
          .find(
            (i) =>
              i.kind === "object" &&
              first.x >= i.bbox.minX - ink.tapSlop &&
              first.x <= i.bbox.maxX + ink.tapSlop &&
              first.y >= i.bbox.minY - ink.tapSlop &&
              first.y <= i.bbox.maxY + ink.tapSlop,
          );
        if (hit || state.selection.length > 0) {
          state.setSelection(hit ? [hit.id] : []);
          clearLive();
          return;
        }
      }
      if (state.selection.length > 0) state.setSelection([]);

      const simplified = simplifyRDP(captured.points, ink.simplifyEpsilon);
      if (simplified.length > 0) {
        const groupId = sessionStore
          .getState()
          .addStroke(createStroke(simplified, Date.now()), { newGroup: captured.held });
        if (captured.held) holdSnapRef.current?.(groupId);
      }
      clearLive();
    };

    /** 손가락을 뗐다: 제스처 정리. 제스처에 쓰인 손가락이면 true */
    const liftTouch = (pointerId: number): boolean => {
      if (!touches.delete(pointerId)) return false;
      if (touches.size < 2) gesture = null;
      const wasLocked = gestureLock;
      if (touches.size === 0) gestureLock = false;
      return wasLocked;
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (liftTouch(event.pointerId)) return;
      if (erasingPointerId === event.pointerId) {
        erasingPointerId = null;
        release(event.pointerId);
        const start = eraseStart;
        eraseStart = null;
        // 지우개로 톡: 지우개가 안 지우는 객체(그래프·화학 구조식…)면 선택해서 [삭제] 버튼을 띄운다
        if (start && rect && start.moved < ink.tapMaxMove && event.timeStamp - start.t < ink.tapMaxMs) {
          const { x, y } = toWorld(start.x, start.y, rect, view());
          const state = sessionStore.getState();
          const hit = [...state.items]
            .reverse()
            .find(
              (i) =>
                i.kind === "object" &&
                i.ir.kind !== "shape2d" &&
                x >= i.bbox.minX - ink.tapSlop &&
                x <= i.bbox.maxX + ink.tapSlop &&
                y >= i.bbox.minY - ink.tapSlop &&
                y <= i.bbox.maxY + ink.tapSlop,
            );
          state.setSelection(hit ? [hit.id] : []);
        }
        return;
      }
      if (!drawing || drawing.pointerId !== event.pointerId) return;
      release(event.pointerId);
      finishStroke();
    };

    const onPointerCancel = (event: PointerEvent): void => {
      liftTouch(event.pointerId);
      // 시스템이 포인터를 회수했다(전화 수신, 제스처 인식 등). 획은 버린다.
      if (erasingPointerId === event.pointerId) erasingPointerId = null;
      if (drawing?.pointerId === event.pointerId) drawing = null;
      clearLive();
    };

    const onContextMenu = (event: Event): void => {
      // 태블릿 롱프레스에서 컨텍스트 메뉴가 떠 획이 끊기는 것을 막는다.
      event.preventDefault();
    };

    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointercancel", onPointerCancel);
    svg.addEventListener("pointerleave", hideHover);
    svg.addEventListener("contextmenu", onContextMenu);
    svg.addEventListener("wheel", onWheel, { passive: false });

    const resizeObserver = new ResizeObserver(() => {
      // 창 크기가 바뀌면 캐시해 둔 rect가 낡는다.
      rect = svg.getBoundingClientRect();
    });
    resizeObserver.observe(svg);

    return () => {
      svg.removeEventListener("pointerdown", onPointerDown);
      svg.removeEventListener("pointermove", onPointerMove);
      svg.removeEventListener("pointerup", onPointerUp);
      svg.removeEventListener("pointercancel", onPointerCancel);
      svg.removeEventListener("pointerleave", hideHover);
      svg.removeEventListener("contextmenu", onContextMenu);
      svg.removeEventListener("wheel", onWheel);
      resizeObserver.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      clearHold();
    };
  }, []);

  const activeGroup = items.find(
    (i): i is InkItem => i.id === activeGroupId && i.kind === "ink",
  );

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        inset: 0,
        display: "block",
        // 브라우저의 스크롤·핀치 기본동작을 끄고 우리가 전부 처리한다 (함정 #1).
        touchAction: "none",
        cursor: tool === "eraser" ? "cell" : "crosshair",
      }}
    >
      <g transform={`translate(${tx} ${ty}) scale(${k})`}>
      {activeGroup && <GroupHint item={activeGroup} />}

      {items.map((item) =>
        item.kind === "ink" ? (
          <InkItemView key={item.id} item={item} />
        ) : (
          <ObjectItemView key={item.id} item={item} />
        ),
      )}

      {/* 진행 중인 획 (예측 점 포함). React가 아니라 위 effect가 직접 d를 갱신한다. */}
      <path ref={livePathRef} fill={theme.color.ink} fillRule="nonzero" shapeRendering="geometricPrecision" />

      <circle
        ref={hoverRef}
        r={ink.hoverRadius}
        fill="none"
        stroke={theme.color.accent}
        strokeWidth={1}
        visibility="hidden"
        pointerEvents="none"
      />
      </g>
    </svg>
  );
}
