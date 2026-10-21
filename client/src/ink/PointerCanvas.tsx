import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { debugLog } from "../debug";
import { ObjectItemView } from "../render/Shape2DView";
import { ink, penOpts, theme, viewport } from "../render/theme";
import { createStroke, sessionStore, useSession } from "../store/session";
import { selectionUi } from "../store/selectionUi";
import { viewportStore } from "../store/viewport";
import { paperOf, usePages } from "../store/pages";
import { inView, useVisibleRect } from "../store/culling";
import { PageBackground } from "../render/PageBackground";
import { currentStrokeStyle, penStore, usePen } from "../store/pen";
import { createStabilizer } from "./stabilize";
import { GroupHint, InkItemView } from "./InkLayer";
import { hitItem, itemAabb, itemsInLasso, itemsTouchedByLasso, selectionBox } from "./editing";
import { asPoints, buildFreeTape, buildTape, TAPE_MIN_LEN } from "./tape";
import { centerlinePath } from "./smoothOutline";
import { laserHue } from "./color";
import { straightenStroke } from "./straighten";
import { colorAt, eyedropperStore } from "../ui/eyedropper";
import { buildShape } from "./shapes";
import { IR_VERSION } from "@sketchlab/shared";
import { primitivePolyline } from "../render/shape2dGeometry";
import { markFresh } from "../render/Shape2DView";
import { distance, toWorld, zoomAbout, type View } from "./geometry";
import { simplifyEpsilonAt, simplifyRDP } from "./simplify";
import { snapShape } from "./holdShape";
import { isLineDrawn, strokeAttrs, strokeD, inkFilterMarkup } from "./brushes";
import { createPalmRejector } from "./palmRejection";
import type { InkItem, Point } from "./types";

/** 질감 필터 정의 (한 번만 만든다) */
const INK_FILTERS = inkFilterMarkup();

export type Tool = "pen" | "eraser" | "lasso" | "text" | "shape" | "tape" | "laser" | "style";

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
  /** 글 상자 도구로 페이지를 톡: (월드 x, y, 누른 글 상자 id 또는 null) */
  onTextTap?: (x: number, y: number, hitId: string | null) => void;
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
export function PointerCanvas({ tool, onHoldSnap, onTextTap }: PointerCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  /** 진행 중 획: 색·투명도는 이 그룹에, 모양은 아래 두 조각에 */
  const livePathRef = useRef<SVGGElement>(null);
  /** 앞부분(굳힌 부분) — 수십 점마다 한 번만 다시 만든다 */
  const livePrefixRef = useRef<SVGPathElement>(null);
  /** 끝부분(최근 점 + 예측 점) — 매 프레임 다시 만든다 */
  const liveTailRef = useRef<SVGPathElement>(null);
  const lassoRef = useRef<SVGPathElement>(null);
  const shapeRef = useRef<SVGPathElement>(null);
  const tapeRef = useRef<SVGPathElement>(null);
  /** 레이저 포인터 자국이 잠깐 머무는 곳 (저장하지 않는다) */
  const laserRef = useRef<SVGGElement>(null);
  const hoverRef = useRef<SVGCircleElement>(null);

  const items = useSession((s) => s.items);
  // 화면 둘레만 그린다 (긴 PDF·큰 노트도 부드럽게) — 내보낼 때는 전부
  const visible = useVisibleRect();
  const activeGroupId = useSession((s) => s.activeGroupId);
  const background = usePages((s) => s.pages.find((p) => p.id === s.currentId)?.background ?? "blank");
  // 종이 모드 (세로·가로·2쪽·끊김 없이) — 장 수가 바뀔 때만 다시 그린다
  const paperKey = usePages((s) => JSON.stringify(paperOf(s.pages.find((p) => p.id === s.currentId))));
  const paper = useMemo(() => JSON.parse(paperKey) as ReturnType<typeof paperOf>, [paperKey]);
  /** 월드 좌표 그룹 — 이동·확대는 React를 거치지 않고 이 요소의 transform만 바꾼다 (핀치가 매끄럽게) */
  const worldRef = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const apply = ({ tx, ty, k }: View) => worldRef.current?.setAttribute("transform", `translate(${tx} ${ty}) scale(${k})`);
    apply(viewportStore.getState());
    return viewportStore.subscribe(apply);
  }, []);

  // 리스너를 다시 붙이지 않기 위해 도구·콜백은 ref로 읽는다.
  const toolRef = useRef<Tool>(tool);
  toolRef.current = tool;
  const holdSnapRef = useRef(onHoldSnap);
  holdSnapRef.current = onHoldSnap;
  const textTapRef = useRef(onTextTap);
  textTapRef.current = onTextTap;
  /** 진행 중인 모든 것(그리기·끌기·올가미·지우기·제스처)을 버린다 — 도구를 바꿀 때 */
  const resetRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    // 도구를 바꾸면 고른 것도 푼다 (삼성노트처럼) — 고른 그래프 위에 쓰면 그래프가 끌려가던 문제
    resetRef.current?.();
    sessionStore.getState().setSelection([]);
  }, [tool]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const rejector = createPalmRejector();

    /** 진행 중인 획. null이면 그리는 중이 아니다. */
    let drawing: {
      pointerId: number;
      pointerType: string;
      /** 이 획의 펜 (그리는 중에 팔레트를 바꿔도 획은 그대로) */
      style: ReturnType<typeof currentStrokeStyle>;
      stabilizer: ReturnType<typeof createStabilizer>;
      /** 보정 전 마지막 실제 펜촉 — 뗄 때 끝을 여기까지 잇는다 */
      lastRaw: Point | undefined;
      points: Point[];
      startedAt: number;
      length: number;
      /** 멈춤 판정 기준점 — 이보다 ink.holdTolerance 이상 움직이면 타이머를 다시 건다 */
      anchor: Point;
      held: boolean;
      /** 그리기 시작할 때의 확대 배율 — 크게 확대해 쓴 획은 더 촘촘히 남긴다 */
      k: number;
      /** 멈춰서 반듯해진 도형 (삼성노트처럼 잉크 그대로) — 떼면 이 점들로 저장 */
      snap?: Point[] | undefined;
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
    let gesture: { mx: number; my: number; dist: number; view: View; lastMx: number; lastMy: number } | null = null;
    /** 제스처 뒤 남은 손가락은 다 뗄 때까지 그리지 않는다 (한 손가락 떼는 순간 점이 찍히지 않게) */
    let gestureLock = false;
    const view = (): View => viewportStore.getState();

    /**
     * 손으로 다루기 (그리기가 아닌 것):
     *   move — 고른 것 위를 누르고 끌기 → 옮기기 (펜·손가락·마우스)
     *   pan  — 펜을 쓰는 기기에서 손가락 하나 → 화면 이동, 톡 치면 고르기 (노트 앱 관례)
     */
    let manip: {
      kind: "move" | "pan";
      pointerId: number;
      pointerType: string;
      sx: number;
      sy: number;
      t: number;
      moved: number;
      ids: string[];
      base: ReturnType<typeof sessionStore.getState>["items"];
      view: View;
      /** 길게 눌러 고른 뒤의 끌기 — 떼는 순간을 톡으로 보지 않는다 (톡이면 방금 고른 것이 풀린다) */
      held?: boolean;
    } | null = null;
    /** 올가미로 두르는 중 (월드 좌표) */
    let lasso: { pointerId: number; pts: Point[] } | null = null;
    /** 도형 도구로 끄는 중 (월드 좌표 시작점) */
    let shapeDrag: { pointerId: number; a: { x: number; y: number } } | null = null;
    /**
     * 테이프를 긋는 중 — 펜처럼 자유롭게 (삼성노트 기본). 그은 길(월드)과 화면 시작점(짧으면 톡).
     * 직선 자동 보정이 켜져 있고 거의 곧게 그었으면 손을 뗄 때 곧은 테이프로.
     */
    let tapeDrag: { pointerId: number; pts: Array<{ x: number; y: number }>; sx: number; sy: number } | null = null;
    /**
     * 레이저 포인터 — 빛나는 자국이 손을 떼면 서서히 사라진다 (발표·설명용, 노트에 남지 않는다).
     * 무지개: 빨강에서 시작해 그은 길이를 따라 주황·노랑·초록·파랑·보라 → 다시 빨강 (한 바퀴 = 화면 600px).
     * 경로 하나는 길이를 따라 색을 바꿀 수 없어서 짧은 조각마다 색을 준다.
     * 매끄럽게: 사이 점(coalesced)까지 모두 쓰고, 점과 점의 가운데를 잇는 2차 곡선으로 그린 뒤
     * 곡선을 화면 4px 조각으로 잘라 조각마다 색을 조금씩(2.4°) 바꾼다 → 띠 없이 이어지는 무지개.
     */
    let laser: {
      pointerId: number;
      pts: Array<{ x: number; y: number }>;
      drawn: { x: number; y: number };
      dist: number;
      /** 자국 전체 (빛 번짐 필터) — 손을 떼면 이것째로 사라진다 */
      el: SVGGElement;
      /** 색 조각들 */
      line: SVGGElement;
      /** 윤곽선 모양: 가운데 흰 선 */
      core: SVGGElement | null;
      /** 점 모양: 펜촉을 따라다니는 빛나는 점 (자국 없음) */
      dot: SVGCircleElement | null;
      /** 그은 길이(화면 px) → 색 (레인보우는 빨강부터 무지개, 단일 색상은 그 색) */
      colorAt: (dist: number) => string;
    } | null = null;
    /**
     * 길게 누르기 = 그 자리의 것 고르기 (손글씨·사진·그래프 모두, 어느 도구에서든).
     * 거의 움직이지 않고 LONG_PRESS_MS 동안 누르고 있으면 → 그리던 것은 버리고 고른 뒤, 계속 끌면 옮겨진다.
     * 잠근 사진(PDF 쪽 배경)은 고르지 않는다 — 그 위에서 펜을 쉬고 있어도 배경이 잡히지 않게.
     */
    const LONG_PRESS_MS = 500;
    let longPress: { pointerId: number; pointerType: string; sx: number; sy: number; timer: ReturnType<typeof setTimeout> } | null = null;
    const clearLongPress = (): void => {
      if (longPress) clearTimeout(longPress.timer);
      longPress = null;
    };
    /** 마지막으로 진행 중인 손놀림이 움직인 시각 — 오래 멈춘 상태(놓친 pointerup)를 알아보려고 */
    let lastActivity = 0;
    const LASER_HOLD_MS = 700;
    const LASER_FADE_MS = 600;
    const LASER_CYCLE_PX = 600;
    /** from → (ctrl 쪽으로 휘어) → to 곡선을 화면 약 4px 조각으로 그린다 (ctrl 없으면 곧은 선) */
    const laserCurve = (L: NonNullable<typeof laser>, from: { x: number; y: number }, ctrl: { x: number; y: number } | null, to: { x: number; y: number }): void => {
      const k = view().k;
      const c = ctrl ?? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const approx = (Math.hypot(c.x - from.x, c.y - from.y) + Math.hypot(to.x - c.x, to.y - c.y)) * k;
      const n = Math.max(1, Math.ceil(approx / 4));
      let prev = from;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        const q = { x: u * u * from.x + 2 * u * t * c.x + t * t * to.x, y: u * u * from.y + 2 * u * t * c.y + t * t * to.y };
        const step = Math.hypot(q.x - prev.x, q.y - prev.y) * k;
        L.dist += step;
        const seg = document.createElementNS("http://www.w3.org/2000/svg", "path");
        seg.setAttribute("d", `M${prev.x},${prev.y}L${q.x},${q.y}`);
        seg.setAttribute("stroke", L.colorAt(L.dist - step / 2));
        L.line.appendChild(seg);
        if (L.core) {
          const c2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
          c2.setAttribute("d", `M${prev.x},${prev.y}L${q.x},${q.y}`);
          L.core.appendChild(c2);
        }
        prev = q;
      }
      L.drawn = to;
    };
    const fadeLaser = (el: SVGGElement): void => {
      setTimeout(() => {
        el.style.transition = `opacity ${LASER_FADE_MS}ms ease-out`;
        el.style.opacity = "0";
        setTimeout(() => el.remove(), LASER_FADE_MS + 50);
      }, LASER_HOLD_MS);
    };

    const previewTape = (event: PointerEvent): void => {
      if (!tapeDrag || !rect) return;
      const w = toWorld(event.clientX, event.clientY, rect, view());
      const last = tapeDrag.pts[tapeDrag.pts.length - 1];
      if (last && Math.hypot(w.x - last.x, w.y - last.y) * view().k < 2) return;
      tapeDrag.pts.push(w);
      tapeRef.current?.setAttribute("d", centerlinePath(asPoints(tapeDrag.pts)));
    };
    const finishTape = (event: PointerEvent): void => {
      const drag = tapeDrag;
      tapeDrag = null;
      tapeRef.current?.setAttribute("d", "");
      if (!drag) return;
      release(drag.pointerId);
      const { tapeWidth, tapeColor, tapePattern, straightTape } = penStore.getState();
      const straight = straightTape ? straightenStroke(asPoints(drag.pts), TAPE_MIN_LEN) : null;
      const first = drag.pts[0];
      const last = drag.pts[drag.pts.length - 1];
      const t =
        straight && first && last
          ? buildTape(first, last, tapeWidth, tapeColor, tapePattern)
          : buildFreeTape(simplifyRDP(asPoints(drag.pts), 0.8 / view().k), tapeWidth, tapeColor, tapePattern);
      if (!t) {
        // 짧게 톡 = 테이프 벗기기·붙이기 (다른 도구에서와 같게)
        handleTap(drag.sx, drag.sy, event.timeStamp);
        return;
      }
      const id = sessionStore.getState().addObject({ version: IR_VERSION, confidence: 1, source: "manual", kind: "tape", data: t.data }, t.transform, t.bbox);
      markFresh(id);
    };

    /** 도형 미리보기·확정에 쓰는 모양 */
    const shapeAt = (event: PointerEvent) => {
      if (!shapeDrag || !rect) return null;
      const b = toWorld(event.clientX, event.clientY, rect, view());
      const { shapeKind, shapeSquare } = penStore.getState();
      return buildShape(shapeKind, shapeDrag.a, b, shapeSquare || event.shiftKey);
    };
    const previewShape = (event: PointerEvent): void => {
      const s = shapeAt(event);
      const path = shapeRef.current;
      if (!path) return;
      if (!s) {
        path.setAttribute("d", "");
        return;
      }
      const tf = { x: s.ox, y: s.oy, scale: 1 };
      path.setAttribute("stroke", penStore.getState().penColor);
      path.setAttribute(
        "d",
        s.data.primitives
          .map((p) => {
            const pts = primitivePolyline(p, tf);
            const closed = (p.t === "polygon" && p.closed) || p.t === "circle" || p.t === "ellipse";
            return `M${pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join("L")}${closed ? "Z" : ""}`;
          })
          .join(""),
      );
    };
    const finishShape = (event: PointerEvent): void => {
      const s = shapeAt(event);
      if (shapeDrag) release(shapeDrag.pointerId);
      shapeDrag = null;
      shapeRef.current?.setAttribute("d", "");
      if (!s) return;
      const state = sessionStore.getState();
      const id = state.addObject(
        { version: IR_VERSION, confidence: 1, source: "manual", kind: "shape2d", data: { ...s.data, color: penStore.getState().penColor } },
        { x: s.ox, y: s.oy, scale: 1 },
        { minX: s.ox, minY: s.oy, maxX: s.ox + s.width, maxY: s.oy + s.height },
      );
      markFresh(id);
    };

    /**
     * 탭 규칙 (사용자 결정): 옮길 수 있게 고르는 방법은 두 가지뿐 —
     *   ① 올가미로 두르기  ② 그래프·도형·구조식·글 상자를 두 번 톡 (펜·손가락·마우스, 어느 도구에서든)
     * 한 번 톡은 고르지 않는다 (손바닥이 닿거나 스치는 것으로 무언가 움직이지 않게).
     * 무언가 골라져 있을 때 빈 곳을 한 번 톡 = 고르기 풀기.
     * 반환 true = 이 탭은 고르기용으로 쓰였다 (점을 찍지 않는다).
     */
    let lastTap: { x: number; y: number; t: number } | null = null;
    const DOUBLE_TAP_MS = 400;
    const DOUBLE_TAP_PX = 24;
    const handleTap = (clientX: number, clientY: number, t: number): boolean => {
      if (!rect) return false;
      if (selectionUi.getState().chip) selectionUi.setState({ chip: null });
      const v = view();
      const w = toWorld(clientX, clientY, rect, v);
      const state = sessionStore.getState();
      const objects = state.items.filter((i) => i.kind === "object");
      // 테이프는 늘 맨 위 — 한 번 톡 = 벗기기·붙이기 (기록에 남기지 않는다; 고르려면 올가미)
      const tape = hitItem(objects.filter((i) => i.ir.kind === "tape"), w.x, w.y, 2 / v.k);
      if (tape && tape.kind === "object" && tape.ir.kind === "tape" && !state.selection.includes(tape.id)) {
        lastTap = null;
        if (state.selection.length > 0) state.setSelection([]);
        state.previewObjectIR(tape.id, { ...tape.ir, data: { ...tape.ir.data, revealed: !tape.ir.data.revealed } });
        return true;
      }
      // 사진은 한 번 톡으로 고른다 (사용자 결정 2026-10-21). 잠근 사진(PDF 쪽 배경)은 고르지 않는다 — 그 위에 점을 찍을 수 있게
      const photo = hitItem(objects.filter((i) => i.ir.kind === "image" && !i.locked), w.x, w.y, 0);
      const hit = hitItem(objects.filter((i) => i.ir.kind !== "tape" && i.ir.kind !== "image"), w.x, w.y, ink.tapSlop / v.k);
      const prev = lastTap;
      const double = !!prev && t - prev.t < DOUBLE_TAP_MS && distance(prev.x, prev.y, clientX, clientY) < DOUBLE_TAP_PX;
      lastTap = double ? null : { x: clientX, y: clientY, t };
      if (double && hit) {
        state.setSelection([hit.id]);
        return true;
      }
      // 톡한 자리의 것 (그래프·도형 등이 사진보다 위에 있다)
      const under = hit ?? photo;
      if (state.selection.length > 0 && !(under && state.selection.includes(under.id))) {
        // 다른 사진을 톡 = 그 사진으로 바꿔 고르기, 그 밖 = 풀기
        state.setSelection(!hit && photo ? [photo.id] : []);
        return true;
      }
      if (!hit && photo) {
        if (!state.selection.includes(photo.id)) state.setSelection([photo.id]);
        return true;
      }
      // 객체 위 한 번 톡은 점을 남기지 않는다 (곧 두 번째 톡이 올 수 있다)
      return !!hit;
    };

    const armLongPress = (event: PointerEvent): void => {
      clearLongPress();
      const lp = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        sx: event.clientX,
        sy: event.clientY,
        timer: setTimeout(() => {
          if (longPress !== lp) return;
          longPress = null;
          fireLongPress(lp.pointerId, lp.pointerType, lp.sx, lp.sy, performance.now());
        }, LONG_PRESS_MS),
      };
      longPress = lp;
    };
    const fireLongPress = (pointerId: number, pointerType: string, sx: number, sy: number, t: number): void => {
      if (!rect) return;
      const v = view();
      const w = toWorld(sx, sy, rect, v);
      const state = sessionStore.getState();
      const pickable = state.items.filter((i) => !(i.kind === "object" && i.ir.kind === "image" && i.locked));
      const hit = hitItem(pickable, w.x, w.y, ink.tapSlop / v.k);
      if (!hit) {
        // 빈 곳을 길게: 복사해 둔 것이 있으면 [붙여넣기] 말풍선 (그리던 점은 버린다)
        if (selectionUi.getState().clipboard.length === 0) return;
        if (drawing?.pointerId === pointerId) {
          drawing = null;
          clearHold();
          clearLive();
          release(pointerId);
        }
        selectionUi.setState({ chip: { x: w.x, y: w.y } });
        navigator.vibrate?.(12);
        return;
      }
      // 하던 것을 버린다 (찍힌 점·지우개 자국 없이)
      if (drawing?.pointerId === pointerId) {
        drawing = null;
        clearHold();
        clearLive();
      }
      if (erasingPointerId === pointerId) {
        erasingPointerId = null;
        eraseStart = null;
      }
      if (manip?.pointerId === pointerId) manip = null;
      lastTap = null;
      state.setSelection([hit.id]);
      navigator.vibrate?.(12);
      // 손을 떼지 않고 끌면 바로 옮겨진다
      manip = { kind: "move", pointerId, pointerType, sx, sy, t, moved: 0, ids: [hit.id], base: sessionStore.getState().items, view: { ...v }, held: true };
      capture(pointerId);
      lastActivity = t;
    };

    /** 진행 중인 모든 것을 버린다 (도구 바꾸기 · 놓친 pointerup으로 멈춘 상태 풀기) */
    const resetAll = (): void => {
      clearLongPress();
      if (manip) {
        cancelManip();
      }
      if (drawing) {
        release(drawing.pointerId);
        drawing = null;
      }
      clearHold();
      if (lasso) release(lasso.pointerId);
      lasso = null;
      lassoRef.current?.setAttribute("d", "");
      if (shapeDrag) release(shapeDrag.pointerId);
      shapeDrag = null;
      shapeRef.current?.setAttribute("d", "");
      if (tapeDrag) release(tapeDrag.pointerId);
      tapeDrag = null;
      tapeRef.current?.setAttribute("d", "");
      if (laser) fadeLaser(laser.el);
      laser = null;
      erasingPointerId = null;
      eraseStart = null;
      touches.clear();
      gesture = null;
      gestureLock = false;
      clearLive();
    };
    resetRef.current = resetAll;

    /** 끌던 것을 제자리로 (취소) */
    const cancelManip = (): void => {
      if (selectionUi.getState().lifting) selectionUi.setState({ lifting: false });
      if (manip?.kind === "move") sessionStore.getState().commitTranslate(manip.ids, 0, 0, manip.base);
      if (manip) release(manip.pointerId);
      manip = null;
    };

    const moveManip = (event: PointerEvent): void => {
      const m = manip;
      if (!m) return;
      lastActivity = event.timeStamp;
      m.moved = Math.max(m.moved, distance(m.sx, m.sy, event.clientX, event.clientY));
      if (m.moved < ink.tapMaxMove) return; // 손떨림으로 살짝 밀린 것은 탭
      const dx = event.clientX - m.sx;
      const dy = event.clientY - m.sy;
      if (m.kind === "move") {
        if (!selectionUi.getState().lifting) selectionUi.setState({ lifting: true });
        sessionStore.getState().previewTranslate(m.ids, dx / m.view.k, dy / m.view.k, m.base);
      }
      else viewportStore.getState().setView({ ...m.view, tx: m.view.tx + dx, ty: m.view.ty + dy });
    };

    const finishManip = (event: PointerEvent): void => {
      const m = manip;
      if (!m) return;
      manip = null;
      if (selectionUi.getState().lifting) selectionUi.setState({ lifting: false });
      release(m.pointerId);
      const still = m.moved < ink.tapMaxMove;
      const tap = still && !m.held;
      if (m.kind === "move") {
        const dx = (event.clientX - m.sx) / m.view.k;
        const dy = (event.clientY - m.sy) / m.view.k;
        sessionStore.getState().commitTranslate(m.ids, still ? 0 : dx, still ? 0 : dy, m.base);
        // 고른 것 위를 두 번 톡: 그 자리의 객체 하나만 다시 고른다
        if (tap) handleTap(m.sx, m.sy, event.timeStamp);
      } else if (tap) {
        handleTap(m.sx, m.sy, event.timeStamp);
      }
    };

    const finishLasso = (): void => {
      const l = lasso;
      lasso = null;
      lassoRef.current?.setAttribute("d", "");
      if (!l) return;
      release(l.pointerId);
      const first = l.pts[0];
      const span = l.pts.reduce((m, p) => Math.max(m, first ? distance(first.x, first.y, p.x, p.y) : 0), 0);
      const state = sessionStore.getState();
      if (!first || span * view().k < ink.tapMaxMove) {
        // 올가미 도구로 톡 → 그 자리의 것 하나
        const v = view();
        const hit = first ? hitItem(state.items, first.x, first.y, ink.tapSlop / v.k) : undefined;
        state.setSelection(hit ? [hit.id] : []);
        return;
      }
      // 고정형: 두른 고리 안 / 자유형: 그은 선이 닿은 것 + 감싼 것
      state.setSelection(
        penStore.getState().lassoStyle === "samsung" ? itemsTouchedByLasso(state.items, l.pts, 8 / view().k) : itemsInLasso(state.items, l.pts),
      );
    };
    const drawingHighlighter = (): boolean => (drawing ? drawing.style.tool : penStore.getState().kind) === "highlighter";
    /** 진행 중 획의 색·투명도·선 모양을 그 펜에 맞춘다 (저장된 획과 같은 brushes.ts 정의) */
    const styleLive = (style: ReturnType<typeof currentStrokeStyle>): void => {
      const g = livePathRef.current;
      if (!g) return;
      const a = strokeAttrs(style);
      g.setAttribute("fill", a.fill);
      g.setAttribute("opacity", String(a.opacity ?? 1));
      g.style.mixBlendMode = a.mixBlendMode ?? "";
      if (a.mask) g.setAttribute("mask", a.mask);
      else g.removeAttribute("mask");
      for (const [attr, v] of [
        ["stroke", a.stroke],
        ["stroke-width", a.strokeWidth],
        ["stroke-dasharray", a.strokeDasharray],
        ["stroke-linecap", a.strokeLinecap],
        ["stroke-linejoin", a.strokeLinejoin],
      ] as const) {
        if (v === undefined) g.removeAttribute(attr);
        else g.setAttribute(attr, String(v));
      }
    };
    /** 진행 중 획 색만 바꾸기 (멈춤 스냅 표시) — 점선 펜은 선 색, 나머지는 칠 색 */
    const colorLive = (color: string): void => {
      if (!drawing) return;
      livePathRef.current?.setAttribute(isLineDrawn(drawing.style) ? "stroke" : "fill", color);
    };

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
        // 형광펜은 필압과 무관하게 일정한 굵기 (형광펜다움)
        p: drawingHighlighter() ? 0.5 : event.pressure > 0 ? event.pressure : 0.5,
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
      // 펜 끝 표시는 화면에서 늘 같은 작은 점 (확대해도 커지지 않는다)
      dot.setAttribute("r", String(ink.hoverRadius / view().k));
      dot.setAttribute("visibility", "visible");
    };
    const hideHover = (): void => {
      hoverRef.current?.setAttribute("visibility", "hidden");
      hoverRef.current?.setAttribute("r", String(ink.hoverRadius / view().k));
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
        if (!penStore.getState().autoTidy) {
          // 삼성노트처럼: 멈추면 그 자리에서 반듯한 도형으로 바뀌어 보이고, 떼면 그대로 잉크로 남는다
          const snapped = snapShape(drawing.points);
          if (!snapped) return;
          drawing.held = true;
          drawing.snap = snapped.points;
          livePrefixRef.current?.setAttribute("d", "");
          liveTailRef.current?.setAttribute("d", strokeD(snapped.points, drawing.style));
          navigator.vibrate?.(8);
          return;
        }
        drawing.held = true;
        // 확정됐다는 신호: 진행 중 획 색을 강조색으로. 놓으면 도형으로 바뀐다.
        colorLive(theme.color.accent);
        navigator.vibrate?.(8);
      }, ink.holdMs);
    };

    // ── 진행 중 획 그리기 ───────────────────────────────────
    /**
     * 진행 중 획 그리기 — 길게 빨리 써도 프레임마다 드는 시간이 늘지 않게 두 조각으로:
     *   앞부분은 TAIL_EVERY 점마다 한 번 굳히고, 매 프레임에는 끝부분(최근 점 + 예측 점)만 다시 만든다.
     * 두 조각은 살짝 겹친다 (불투명 잉크라 이음새가 안 보이고, 형광펜은 그룹 투명도라 겹쳐도 진해지지 않는다).
     */
    const TAIL_EVERY = 48;
    const TAIL_OVERLAP = 6;
    let frozenUpTo = 0;
    const paint = (): void => {
      frame = null;
      const tail = liveTailRef.current;
      if (!drawing || !tail) return;

      let previous = drawing.points[drawing.points.length - 1];
      for (const point of queued) {
        if (previous) drawing.length += distance(previous.x, previous.y, point.x, point.y);
        drawing.points.push(point);
        previous = point;
      }
      queued = [];

      const pts = drawing.points;
      const look = drawing.style;
      // 붓(양 끝이 가늘어짐)·점선은 획 전체를 봐야 모양이 맞다 — 두 조각으로 나누지 않고 통째로
      const whole = look.brush === "brush" || isLineDrawn(look);
      if (!whole && pts.length - frozenUpTo > TAIL_EVERY + TAIL_OVERLAP) {
        frozenUpTo = pts.length - TAIL_OVERLAP;
        livePrefixRef.current?.setAttribute("d", strokeD(pts.slice(0, frozenUpTo + 1), look));
      }
      // 예측 점은 그릴 때만 덧붙인다 — 다음 프레임에 실제 점으로 대체된다
      const recent = whole ? pts : pts.slice(Math.max(0, frozenUpTo - TAIL_OVERLAP));
      tail.setAttribute("d", strokeD(predicted.length > 0 ? [...recent, ...predicted] : recent, look));
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
      livePrefixRef.current?.setAttribute("d", "");
      liveTailRef.current?.setAttribute("d", "");
      frozenUpTo = 0;
    };

    /** 이번에 문지르는 동작의 이름 — 같은 동작의 지우기는 Undo 1단계로 합친다 */
    let eraseGesture = "";
    let eraseCount = 0;
    /** 직전에 지운 자리 (월드) — 빠르게 쓸어도 사이를 빠짐없이 지우려고 */
    let lastErase: { x: number; y: number } | null = null;

    const eraseAtEvent = (event: PointerEvent): void => {
      if (!rect) return;
      const v = view();
      const { x, y } = toWorld(event.clientX, event.clientY, rect, v);
      const { eraserMode, eraserSize, eraseHighlightOnly, eraseTapeOnly, styleColor, styleWidth } = penStore.getState();
      const session = sessionStore.getState();
      if (toolRef.current === "style") {
        // 스타일 변경: 펜 끝이 스친 획에 고른 굵기·색 (화면에서 반경 10px)
        const rs = 10 / v.k;
        showEraser(x, y, rs);
        const from = lastErase && Math.hypot(x - lastErase.x, y - lastErase.y) * v.k < 150 ? lastErase : { x, y }; // 화면에서 150px 넘게 튄 자리는 잇지 않는다
        const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / (rs / 2)));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          session.restyleAt(from.x + (x - from.x) * t, from.y + (y - from.y) * t, rs, styleColor, styleWidth, eraseGesture);
        }
        lastErase = { x, y };
        return;
      }
      // 지우개 반경은 화면 기준 — 확대해도 손에 느껴지는 크기가 같게
      const r = eraserSize / v.k;
      showEraser(x, y, r);
      const only = { highlight: eraseHighlightOnly, tape: eraseTapeOnly };
      // 빠른 손놀림: 직전 자리와 사이를 반지름의 절반 간격으로 메운다
      const from = lastErase && Math.hypot(x - lastErase.x, y - lastErase.y) * v.k < 150 ? lastErase : { x, y }; // 화면에서 150px 넘게 튄 자리는 잇지 않는다
      const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / (r / 2)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        session.eraseAt(from.x + (x - from.x) * t, from.y + (y - from.y) * t, r, eraserMode, eraseGesture, only);
      }
      lastErase = { x, y };
    };

    /** 지우개 크기를 보여 주는 원 (호버 커서 원을 함께 쓴다) */
    const showEraser = (x: number, y: number, r: number): void => {
      const dot = hoverRef.current;
      if (!dot) return;
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(y));
      dot.setAttribute("r", String(r));
      dot.setAttribute("visibility", "visible");
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
      gesture = { dist: f.dist, mx: f.mx - rect.left, my: f.my - rect.top, view: { ...view() }, lastMx: f.mx - rect.left, lastMy: f.my - rect.top };
      gestureLock = true;
    };
    const moveGesture = (): void => {
      const f = gestureFrame();
      if (!gesture || !f || !rect) return;
      const g = gesture;
      const mx = f.mx - rect.left;
      const my = f.my - rect.top;
      g.lastMx = mx;
      g.lastMy = my;
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

      // 스포이트: 이번 톡은 그 자리의 색 가져오기 (그리지 않는다)
      const onPick = eyedropperStore.getState().onPick;
      if (onPick) {
        event.preventDefault();
        rect = svg.getBoundingClientRect();
        const v = view();
        const w = toWorld(event.clientX, event.clientY, rect, v);
        const c = colorAt(sessionStore.getState().items, w.x, w.y, ink.tapSlop / v.k);
        eyedropperStore.setState({ onPick: null });
        if (c) onPick(c);
        return;
      }

      if (event.pointerType === "touch") {
        // 펜으로 그리는 중의 손 터치는 손바닥 — 무시한다 (획을 끊지 않는다)
        if (drawing && drawing.pointerType === "pen") return;
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size >= 2) {
          // 두 번째 손가락: 그리던 한 손가락 획·끌기는 버리고 이동·확대로
          clearLongPress();
          cancelManip();
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

      if (manip || lasso || tapeDrag || laser) {
        // 놓친 pointerup으로 남은 상태 — 2초 넘게 아무 움직임이 없으면 풀고 새로 시작한다
        if (event.timeStamp - lastActivity < 2000) return;
        debugLog.warn("ink", "멈춘 손놀림 상태를 풀었습니다");
        resetAll();
      }
      lastActivity = event.timeStamp;
      rect = svg.getBoundingClientRect();
      {
        const v = view();
        const w = toWorld(event.clientX, event.clientY, rect, v);
        const state = sessionStore.getState();
        // 1) 고른 것 위를 누르면 → 끌어서 옮기기 (지우개·지우개 버튼 제외)
        const lockedSel = state.items.some((i) => i.locked && state.selection.includes(i.id));
        // 고른 것은 어느 도구에서든 (지우개 포함) 끌어서 옮긴다 — S Pen 버튼(임시 지우개)만 예외
        if (state.selection.length > 0 && !lockedSel && !isBarrelPressed(event)) {
          const box = selectionBox(state.items, state.selection);
          const pad = ink.tapSlop / v.k + 4;
          if (box && w.x >= box.minX - pad && w.x <= box.maxX + pad && w.y >= box.minY - pad && w.y <= box.maxY + pad) {
            manip = { kind: "move", pointerId: event.pointerId, pointerType: event.pointerType, sx: event.clientX, sy: event.clientY, t: event.timeStamp, moved: 0, ids: [...state.selection], base: state.items, view: { ...v } };
            capture(event.pointerId);
            event.preventDefault();
            return;
          }
        }
        // 2) 펜을 쓰는 기기의 손가락 하나 → 화면 이동 (두 번 톡 치면 객체 고르기).
        //    고르지 않은 것은 손가락으로 끌어도 움직이지 않는다 — 손바닥이 닿아 노트가 밀리지 않게.
        if (event.pointerType === "touch" && (rejector.isPenMode() || penStore.getState().penOnly)) {
          manip = { kind: "pan", pointerId: event.pointerId, pointerType: "touch", sx: event.clientX, sy: event.clientY, t: event.timeStamp, moved: 0, ids: [], base: state.items, view: { ...v } };
          capture(event.pointerId);
          armLongPress(event);
          event.preventDefault();
          return;
        }
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

      if (toolRef.current === "text" && !isBarrelPressed(event)) {
        // 글 상자 도구: 누른 자리에 새 글 상자, 기존 글 상자 위면 그 글 상자 고치기
        event.preventDefault();
        const v = view();
        const w = toWorld(event.clientX, event.clientY, rect, v);
        const texts = sessionStore.getState().items.filter((i) => i.kind === "object" && i.ir.kind === "text");
        const hit = hitItem(texts, w.x, w.y, ink.tapSlop / v.k);
        textTapRef.current?.(w.x, w.y, hit?.id ?? null);
        return;
      }

      if (toolRef.current === "shape" && !isBarrelPressed(event)) {
        shapeDrag = { pointerId: event.pointerId, a: toWorld(event.clientX, event.clientY, rect, view()) };
        capture(event.pointerId);
        return;
      }

      if (toolRef.current === "laser") {
        // 삼성노트처럼: 빛나는 선 · 윤곽선(가운데가 흰) · 점, 색은 레인보우 또는 단일 색상
        const NS = "http://www.w3.org/2000/svg";
        const k = view().k;
        const { laserStyle, laserColorMode, laserColor } = penStore.getState();
        const colorAt = (d: number) => (laserColorMode === "rainbow" ? laserHue(d / LASER_CYCLE_PX) : laserColor);
        // 빛 번짐 크기는 화면 기준 (확대해도 같게)
        document.getElementById("sl-laser-blur")?.setAttribute("stdDeviation", String(3.5 / k));
        const el = document.createElementNS(NS, "g");
        el.setAttribute("filter", "url(#sl-laser-glow)");
        laserRef.current?.appendChild(el);
        const p0 = toWorld(event.clientX, event.clientY, rect, view());
        const group = (stroke: string | null, width: number) => {
          const g = document.createElementNS(NS, "g");
          g.setAttribute("fill", "none");
          if (stroke) g.setAttribute("stroke", stroke);
          g.setAttribute("stroke-width", String(width / k));
          g.setAttribute("stroke-linecap", "round");
          g.setAttribute("stroke-linejoin", "round");
          el.appendChild(g);
          return g;
        };
        const line = group(null, laserStyle === "outline" ? 7 : ink.laserWidth + 1);
        const core = laserStyle === "outline" ? group("#FFFFFF", 2.6) : null;
        let dot: SVGCircleElement | null = null;
        if (laserStyle === "dot") {
          dot = document.createElementNS(NS, "circle");
          dot.setAttribute("cx", String(p0.x));
          dot.setAttribute("cy", String(p0.y));
          dot.setAttribute("r", String(7 / k));
          dot.setAttribute("fill", colorAt(0));
          dot.setAttribute("stroke", "#FFFFFF");
          dot.setAttribute("stroke-width", String(2 / k));
          el.appendChild(dot);
        } else {
          // 누르기만 해도 점이 보이게
          for (const g of [line, core]) {
            if (!g) continue;
            const d0 = document.createElementNS(NS, "path");
            d0.setAttribute("d", `M${p0.x},${p0.y}l0,0`);
            if (g === line) d0.setAttribute("stroke", colorAt(0));
            g.appendChild(d0);
          }
        }
        laser = { pointerId: event.pointerId, pts: [p0], drawn: p0, dist: 0, el, line, core, dot, colorAt };
        capture(event.pointerId);
        return;
      }

      if (toolRef.current === "tape" && !isBarrelPressed(event)) {
        tapeDrag = { pointerId: event.pointerId, pts: [toWorld(event.clientX, event.clientY, rect, view())], sx: event.clientX, sy: event.clientY };
        const { tapeColor, tapeWidth } = penStore.getState();
        tapeRef.current?.setAttribute("stroke", tapeColor);
        tapeRef.current?.setAttribute("stroke-width", String(tapeWidth));
        capture(event.pointerId);
        return;
      }

      if (toolRef.current === "lasso" && !isBarrelPressed(event)) {
        const w = toWorld(event.clientX, event.clientY, rect, view());
        lasso = { pointerId: event.pointerId, pts: [{ x: w.x, y: w.y, p: 0.5, t: 0 }] };
        capture(event.pointerId);
        lassoRef.current?.setAttribute("d", "");
        // 자유형은 그은 선만 (안쪽 칠·시작점으로 잇는 선 없음)
        lassoRef.current?.setAttribute("fill", penStore.getState().lassoStyle === "samsung" ? "none" : theme.color.groupHint);
        return;
      }

      if (toolRef.current === "eraser" || toolRef.current === "style" || isBarrelPressed(event)) {
        erasingPointerId = event.pointerId;
        eraseStart = { x: event.clientX, y: event.clientY, t: event.timeStamp, moved: 0 };
        eraseCount += 1;
        eraseGesture = `erase-${eraseCount}-${Math.round(event.timeStamp)}`;
        lastErase = null;
        capture(event.pointerId);
        armLongPress(event);
        eraseAtEvent(event);
        return;
      }

      const startedAt = event.timeStamp;
      const style = currentStrokeStyle();
      // 줄 길이는 화면 기준 px — 확대해도 손에 느껴지는 보정이 같게
      const stabilizer = createStabilizer((penStore.getState().smoothing * penOpts.stabilizeMaxPx) / view().k, view().k);
      rawSeen = false;
      drawing = null;
      const raw = sample(event, startedAt);
      if (!raw) return;
      const first = stabilizer.push(raw) ?? raw;

      capture(event.pointerId);
      drawing = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        style,
        stabilizer,
        lastRaw: raw,
        points: [first],
        startedAt,
        length: 0,
        anchor: first,
        held: false,
        k: view().k,
      };
      armHold();
      armLongPress(event);

      styleLive(style);
      frozenUpTo = 0;
      livePrefixRef.current?.setAttribute("d", "");
      liveTailRef.current?.setAttribute("d", strokeD([first], style));
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (longPress && longPress.pointerId === event.pointerId && distance(longPress.sx, longPress.sy, event.clientX, event.clientY) > ink.tapMaxMove) clearLongPress();
      if (lasso || tapeDrag || laser || shapeDrag) lastActivity = event.timeStamp;
      if (touches.has(event.pointerId)) {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (gesture) {
          moveGesture();
          return;
        }
      }
      if (manip && manip.pointerId === event.pointerId) {
        moveManip(event);
        return;
      }
      if (shapeDrag && shapeDrag.pointerId === event.pointerId) {
        previewShape(event);
        return;
      }
      if (tapeDrag && tapeDrag.pointerId === event.pointerId) {
        previewTape(event);
        return;
      }
      if (laser && laser.pointerId === event.pointerId) {
        if (!rect) return;
        const samples = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
        for (const e of samples.length ? samples : [event]) {
          const p = toWorld(e.clientX, e.clientY, rect, view());
          const last = laser.pts[laser.pts.length - 1] as { x: number; y: number };
          if (Math.hypot(p.x - last.x, p.y - last.y) * view().k < 1.5) continue;
          laser.pts.push(p);
          if (laser.dot) {
            // 점 모양: 자국 없이 펜촉을 따라다닌다 (레인보우면 움직인 만큼 색이 돈다)
            laser.dist += Math.hypot(p.x - last.x, p.y - last.y) * view().k;
            laser.dot.setAttribute("cx", String(p.x));
            laser.dot.setAttribute("cy", String(p.y));
            laser.dot.setAttribute("fill", laser.colorAt(laser.dist));
            laser.drawn = p;
            continue;
          }
          // 마지막에서 둘째 점을 조절점으로, 가운데점에서 가운데점까지
          const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
          laserCurve(laser, laser.drawn, laser.pts.length > 2 ? last : null, mid);
        }
        return;
      }
      if (lasso && lasso.pointerId === event.pointerId) {
        if (!rect) return;
        const w = toWorld(event.clientX, event.clientY, rect, view());
        lasso.pts.push({ x: w.x, y: w.y, p: 0.5, t: 0 });
        const close = penStore.getState().lassoStyle === "samsung" ? "" : "Z";
        lassoRef.current?.setAttribute("d", `M${lasso.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("L")}${close}`);
        return;
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

      // pointerrawupdate가 오는 브라우저(안드로이드·PC Chrome)에서는 좌표를 그쪽에서 받는다 — 더 빨리 온다
      if (!rawSeen) addSamples(event);

      const next =
        typeof event.getPredictedEvents === "function" ? event.getPredictedEvents() : [];
      predicted = [];
      // 보정이 걸려 있는 동안(천천히 그을 때)은 예측 점을 쓰지 않는다 — 늦게 따라가는 선 앞에 예측이 붙으면 끝이 튄다.
      // 빨리 쓸 때는 보정이 거의 꺼지므로 예측 점으로 체감 지연을 줄인다.
      if (drawing.stabilizer.currentRadius() < 0.5) {
        for (const raw of next) {
          const point = sample(raw, drawing.startedAt);
          if (point) predicted.push(point);
        }
      }
      schedulePaint();
    };

    /** pointerrawupdate: 화면 갱신을 기다리지 않고 바로 오는 좌표 (지원하는 브라우저만) */
    let rawSeen = false;
    const onRawUpdate = (event: PointerEvent): void => {
      if (!drawing || drawing.pointerId !== event.pointerId) return;
      rawSeen = true;
      addSamples(event);
      schedulePaint();
    };

    /** 이벤트의 좌표들(브라우저가 합쳐 보낸 중간 좌표 포함)을 획에 더한다 */
    const addSamples = (event: PointerEvent): void => {
      if (!drawing) return;
      // 빠른 획에서 브라우저가 합쳐 보낸 중간 좌표까지 복원한다 (함정 #2).
      // 이게 없으면 빠르게 그은 곡선이 각져 보인다.
      const coalesced =
        typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
      const samples = coalesced.length > 0 ? coalesced : [event];

      for (const raw of samples) {
        const real = sample(raw, drawing.startedAt);
        if (!real) continue;
        drawing.lastRaw = real;
        const point = drawing.stabilizer.push(real);
        if (!point) continue; // 줄이 느슨함 — 떨림이라 선을 움직이지 않는다
        queued.push(point);
        // 멈춘 뒤 다시 움직이면 확정을 풀고 타이머를 다시 건다.
        if (distance(point.x, point.y, drawing.anchor.x, drawing.anchor.y) > ink.holdTolerance) {
          drawing.anchor = point;
          if (drawing.held) {
            drawing.held = false;
            colorLive(drawing.style.color);
            if (drawing.snap) {
              // 다시 움직였다 → 반듯한 도형을 풀고 손글씨 그대로 이어 그린다
              drawing.snap = undefined;
              frozenUpTo = 0;
              livePrefixRef.current?.setAttribute("d", "");
              schedulePaint();
            }
          }
          armHold();
        }
      }
    };

    const finishStroke = (): void => {
      if (!drawing) return;

      predicted = [];
      queued.push(...drawing.stabilizer.finish(drawing.lastRaw)); // 뒤처진 끝을 펜촉까지
      paint(); // 아직 반영 안 된 좌표를 마저 흡수
      const captured = drawing;
      drawing = null;

      // 짧게 톡 친 것 = 탭. 객체 위 탭은 선택, 무언가 선택된 상태의 탭은 선택 해제 (점을 남기지 않는다)
      const state = sessionStore.getState();
      const first = captured.points[0];
      const last = captured.points[captured.points.length - 1];
      const isTap = !!first && !!last && captured.length < ink.tapMaxMove && last.t - first.t < ink.tapMaxMs;
      if (isTap && first && rect) {
        // 두 번 톡 = 객체 고르기, 고른 것이 있을 때 빈 곳 톡 = 풀기 (그 밖의 톡은 점 찍기)
        const v = view();
        const cx = first.x * v.k + v.tx + rect.left;
        const cy = first.y * v.k + v.ty + rect.top;
        if (handleTap(cx, cy, captured.startedAt + (last?.t ?? 0))) {
          clearLive();
          return;
        }
      }
      if (state.selection.length > 0) state.setSelection([]);

      // 멈춰서 반듯해진 도형: 그 점들 그대로 (같은 펜, 같은 묶음)
      if (captured.snap) {
        sessionStore.getState().addStroke(createStroke(captured.snap, Date.now(), captured.style));
        clearLive();
        return;
      }
      // 직선 자동 보정이 켜져 있고 거의 곧게 그었으면 곧은 선으로 (필압 변화는 남기려고 단순화는 건너뛴다)
      const straight = captured.style.straight && !captured.held ? straightenStroke(captured.points) : null;
      // 줄이는 허용 오차는 "화면에서" 0.6px — 1000 % 확대해 쓴 글씨가 손을 떼는 순간 각지지 않게
      const simplified = straight ?? simplifyRDP(captured.points, simplifyEpsilonAt(captured.k));
      if (simplified.length > 0) {
        // 형광펜 획은 형광펜 획끼리만 묶인다 (session.addStroke) — ✨로 형광펜 도형으로 정리된다
        const groupId = sessionStore.getState().addStroke(createStroke(simplified, Date.now(), captured.style), { newGroup: captured.held });
        if (captured.held) holdSnapRef.current?.(groupId);
      }
      clearLive();
    };

    /** 손가락을 뗐다: 제스처 정리. 제스처에 쓰인 손가락이면 true */
    const liftTouch = (pointerId: number): boolean => {
      if (!touches.delete(pointerId)) return false;
      if (touches.size < 2 && gesture) {
        // 100% 근처에서 손을 떼면 100%로 맞춘다 (손가락 중점은 제자리)
        const v = view();
        if (Math.abs(v.k - 1) < viewport.snapToOne && v.k !== 1) {
          viewportStore.getState().setView(zoomAbout(v, gesture.lastMx, gesture.lastMy, 1, viewport.minZoom, viewport.maxZoom));
        }
        gesture = null;
      }
      const wasLocked = gestureLock;
      if (touches.size === 0) gestureLock = false;
      return wasLocked;
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (longPress?.pointerId === event.pointerId) clearLongPress();
      if (liftTouch(event.pointerId)) return;
      if (manip && manip.pointerId === event.pointerId) {
        finishManip(event);
        return;
      }
      if (lasso && lasso.pointerId === event.pointerId) {
        finishLasso();
        return;
      }
      if (shapeDrag && shapeDrag.pointerId === event.pointerId) {
        finishShape(event);
        return;
      }
      if (tapeDrag && tapeDrag.pointerId === event.pointerId) {
        finishTape(event);
        return;
      }
      if (laser && laser.pointerId === event.pointerId) {
        release(event.pointerId);
        // 마지막 가운데점 → 떼는 점까지 남은 끝 조각
        const end = laser.pts[laser.pts.length - 1];
        if (!laser.dot && end && (end.x !== laser.drawn.x || end.y !== laser.drawn.y)) laserCurve(laser, laser.drawn, null, end);
        fadeLaser(laser.el);
        laser = null;
        return;
      }
      if (erasingPointerId === event.pointerId) {
        erasingPointerId = null;
        release(event.pointerId);
        hideHover();
        const start = eraseStart;
        eraseStart = null;
        // 지우개로 두 번 톡: 지우개가 안 지우는 객체(그래프·화학 구조식…)를 골라 [삭제] 버튼을 띄운다
        if (start && start.moved < ink.tapMaxMove && event.timeStamp - start.t < ink.tapMaxMs) handleTap(start.x, start.y, event.timeStamp);
        return;
      }
      if (!drawing || drawing.pointerId !== event.pointerId) return;
      release(event.pointerId);
      finishStroke();
    };

    const onPointerCancel = (event: PointerEvent): void => {
      if (longPress?.pointerId === event.pointerId) clearLongPress();
      liftTouch(event.pointerId);
      if (manip?.pointerId === event.pointerId) cancelManip();
      if (shapeDrag?.pointerId === event.pointerId) {
        shapeDrag = null;
        shapeRef.current?.setAttribute("d", "");
      }
      if (lasso?.pointerId === event.pointerId) {
        lasso = null;
        lassoRef.current?.setAttribute("d", "");
      }
      if (tapeDrag?.pointerId === event.pointerId) {
        tapeDrag = null;
        tapeRef.current?.setAttribute("d", "");
      }
      if (laser?.pointerId === event.pointerId) {
        fadeLaser(laser.el);
        laser = null;
      }
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
    svg.addEventListener("pointerrawupdate" as "pointermove", onRawUpdate);

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
      svg.removeEventListener("pointerrawupdate" as "pointermove", onRawUpdate);
      resizeObserver.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      clearHold();
      clearLongPress();
      resetRef.current = null;
    };
  }, []);

  const activeGroup = items.find(
    (i): i is InkItem => i.id === activeGroupId && i.kind === "ink",
  );

  // 손글씨 자동 정리(AI)가 꺼져 있으면 쓰는 묶음에 파란 상자를 그리지 않는다 (삼성노트처럼 기본 끔)
  const autoTidy = usePen((s) => s.autoTidy);

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
        cursor: tool === "eraser" || tool === "style" ? "cell" : tool === "text" ? "text" : "crosshair",
      }}
    >
      <g ref={worldRef}>
      {/* 연필 알갱이·브러시 번짐 필터 — 같은 그룹 안이라 쪽 내보내기에도 함께 담긴다 */}
      <defs dangerouslySetInnerHTML={{ __html: INK_FILTERS }} />
      <PageBackground kind={background} paper={paper} visible={visible} />
      {activeGroup && autoTidy && <GroupHint item={activeGroup} />}

      {items.filter((item) => inView(itemAabb(item), visible)).map((item) =>
        item.kind === "ink" ? (
          <InkItemView key={item.id} item={item} />
        ) : (
          <ObjectItemView key={item.id} item={item} />
        ),
      )}

      {/* 진행 중인 획 (예측 점 포함). React가 아니라 위 effect가 직접 d를 갱신한다. */}
      <g ref={livePathRef} fill={theme.color.ink} data-export-skip>
        <path ref={livePrefixRef} fillRule="nonzero" shapeRendering="geometricPrecision" />
        <path ref={liveTailRef} fillRule="nonzero" shapeRendering="geometricPrecision" />
      </g>
      {/* 도형 도구 미리보기 */}
      <path ref={shapeRef} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" data-export-skip />
      {/* 레이저 포인터 자국 (잠깐 보였다 사라진다) */}
      {/* 레이저 빛 번짐 — 조각마다 제 색으로 번진다 (흐린 것 두 겹 + 원래 선) */}
      <defs>
        <filter id="sl-laser-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur id="sl-laser-blur" in="SourceGraphic" stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g ref={laserRef} pointerEvents="none" data-export-skip />
      {/* 테이프 붙이는 중 미리보기 */}
      <path ref={tapeRef} fill="none" strokeLinejoin="round" strokeLinecap="butt" opacity={0.85} pointerEvents="none" data-export-skip />
      {/* 올가미 — 점선 테두리, 옅은 안쪽 (선 굵기는 확대와 무관) */}
      <path ref={lassoRef} fill={theme.color.groupHint} stroke={theme.color.accent} strokeWidth={1.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" pointerEvents="none" />

      <circle
        ref={hoverRef}
        r={ink.hoverRadius}
        fill="none"
        stroke={theme.color.accent}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        visibility="hidden"
        pointerEvents="none"
      />
      </g>
    </svg>
  );
}
