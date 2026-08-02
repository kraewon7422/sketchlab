import { useEffect, useRef } from "react";
import { debugLog } from "../debug";
import { ink, theme } from "../render/theme";
import { createStroke, sessionStore, useSession } from "../store/session";
import { GroupHint, InkItemView } from "./InkLayer";
import { toWorld } from "./geometry";
import { dotOutline, segmentOutline, subpathsToPathData } from "./outline";
import { simplifyRDP } from "./simplify";
import { createPalmRejector } from "./palmRejection";
import type { InkItem, Point } from "./types";

export type Tool = "pen" | "eraser";

/**
 * 잉크 입력 표면.
 *
 * 왜 React 합성 이벤트가 아니라 네이티브 리스너인가:
 * pointermove는 초당 수백 번 들어온다. 그 경로에 React의 이벤트 위임과
 * 상태 갱신을 태우면 60fps를 지킬 수 없다. 그래서
 *   - 진행 중인 획은 React 상태가 아니라 ref + DOM 속성 직접 조작으로 그리고,
 *   - 스토어에는 획이 끝났을 때 딱 한 번 커밋한다 (§5.3).
 *
 * 진행 중 획을 매 프레임 통째로 다시 만들지 않고 새 구간만 이어 붙인다
 * (segmentOutline). 획이 길어져도 프레임당 비용이 일정하다.
 */
export function PointerCanvas({ tool }: { tool: Tool }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const livePathRef = useRef<SVGPathElement>(null);

  const items = useSession((s) => s.items);
  const activeGroupId = useSession((s) => s.activeGroupId);

  // 리스너를 다시 붙이지 않기 위해 도구는 ref로 읽는다.
  const toolRef = useRef<Tool>(tool);
  toolRef.current = tool;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const rejector = createPalmRejector();

    /** 진행 중인 획. null이면 그리는 중이 아니다. */
    let drawing: { pointerId: number; points: Point[]; startedAt: number } | null = null;
    /** 지우개 드래그 중인 포인터 */
    let erasingPointerId: number | null = null;
    /** getBoundingClientRect는 비싸다. 획 시작 시 한 번만 읽는다. */
    let rect: DOMRect | null = null;
    /** 아직 화면에 반영되지 않은 좌표 */
    let queued: Point[] = [];
    let liveData = "";
    let frame: number | null = null;

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
      const { x, y } = toWorld(event.clientX, event.clientY, rect);
      return {
        x,
        y,
        // 필압 미지원 입력은 0을 준다. 그대로 쓰면 획이 사라지므로 중간값으로 대체.
        p: event.pressure > 0 ? event.pressure : 0.5,
        t: event.timeStamp - startedAt,
      };
    };

    const paint = (): void => {
      frame = null;
      const path = livePathRef.current;
      if (!drawing || !path || queued.length === 0) return;

      let previous = drawing.points[drawing.points.length - 1];
      let appended = "";

      for (const point of queued) {
        if (previous) {
          appended += subpathsToPathData(segmentOutline(previous, point, { baseWidth: ink.width }));
        }
        drawing.points.push(point);
        previous = point;
      }
      queued = [];

      liveData += appended;
      path.setAttribute("d", liveData);
    };

    const schedulePaint = (): void => {
      frame ??= requestAnimationFrame(paint);
    };

    const clearLive = (): void => {
      liveData = "";
      queued = [];
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      livePathRef.current?.setAttribute("d", "");
    };

    const eraseAtEvent = (event: PointerEvent): void => {
      if (!rect) return;
      const { x, y } = toWorld(event.clientX, event.clientY, rect);
      sessionStore.getState().eraseAt(x, y, ink.eraserRadius);
    };

    const onPointerDown = (event: PointerEvent): void => {
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

      if (toolRef.current === "eraser") {
        erasingPointerId = event.pointerId;
        capture(event.pointerId);
        eraseAtEvent(event);
        return;
      }

      const startedAt = event.timeStamp;
      const first = sample(event, startedAt);
      if (!first) return;

      capture(event.pointerId);
      drawing = { pointerId: event.pointerId, points: [first], startedAt };

      liveData = subpathsToPathData(dotOutline(first, { baseWidth: ink.width }));
      livePathRef.current?.setAttribute("d", liveData);
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (erasingPointerId === event.pointerId) {
        eraseAtEvent(event);
        return;
      }

      if (!drawing || drawing.pointerId !== event.pointerId) return;

      // 빠른 획에서 브라우저가 합쳐 보낸 중간 좌표까지 복원한다 (함정 #2).
      // 이게 없으면 빠르게 그은 곡선이 각져 보인다.
      const coalesced =
        typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
      const samples = coalesced.length > 0 ? coalesced : [event];

      for (const raw of samples) {
        const point = sample(raw, drawing.startedAt);
        if (point) queued.push(point);
      }
      schedulePaint();
    };

    const finishStroke = (): void => {
      if (!drawing) return;

      paint(); // 아직 반영 안 된 좌표를 마저 흡수
      const captured = drawing;
      drawing = null;

      const simplified = simplifyRDP(captured.points, ink.simplifyEpsilon);
      if (simplified.length > 0) {
        sessionStore.getState().addStroke(createStroke(simplified, Date.now()));
      }
      clearLive();
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (erasingPointerId === event.pointerId) {
        erasingPointerId = null;
        release(event.pointerId);
        return;
      }
      if (!drawing || drawing.pointerId !== event.pointerId) return;
      release(event.pointerId);
      finishStroke();
    };

    const onPointerCancel = (event: PointerEvent): void => {
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
    svg.addEventListener("contextmenu", onContextMenu);

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
      svg.removeEventListener("contextmenu", onContextMenu);
      resizeObserver.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
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
      {activeGroup && <GroupHint item={activeGroup} />}

      {items.map((item) =>
        item.kind === "ink" ? <InkItemView key={item.id} item={item} /> : null,
      )}

      {/* 진행 중인 획. React가 아니라 위 effect가 직접 d를 갱신한다. */}
      <path ref={livePathRef} fill={theme.color.ink} fillRule="nonzero" />
    </svg>
  );
}
