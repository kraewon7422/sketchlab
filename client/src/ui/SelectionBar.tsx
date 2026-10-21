import { Atom, BringToFront, ChartSpline, Circle, ClipboardPaste, Copy, CopyPlus, Dices, Download, EllipsisVertical, ListChecks, Lock, LockOpen, Palette, Pencil, Scissors, SendToBack, Share2, Sigma, Trash2 } from "lucide-react";
import { useStore } from "zustand";
import { aiConfigured } from "../ai/settings";
import { canRecolor, canTransformFreely, rotOf, scaleAbout, selectionBox, type Affine } from "../ink/editing";
import { rainbow } from "../ink/color";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import type { CanvasItem } from "../ink/types";
import { penOpts, theme } from "../render/theme";
import { AxisPanel } from "./AxisPanel";
import { sessionStore, useSession } from "../store/session";
import { copyItems, cutItems, pasteItems, selectionUi, type Frame } from "../store/selectionUi";
import { useViewport, viewportStore } from "../store/viewport";

/**
 * 선택 상자와 그 메뉴 (삼성노트처럼).
 *   상자: 내용과 함께 기운다. 모서리 4개 = 비율 그대로 크기, 위 동그라미 = 돌리기 (무엇이든 — 사진·그래프·손글씨),
 *         돌리는 동안 가운데에 각도, 0·90·180·270°에 착 붙는다. 변 4개 = 한쪽으로 늘이기 (똑바로 선 손글씨·도형만)
 *   막대: [잘라내기] [복사] [붙여넣기] [삭제] [스타일] [⋮] — ⋮ 안에 검산·이미지로 저장·공유·맨 앞/뒤·잠금·복제
 *         그래프는 [축] [이름], 화학 구조식은 [원] [모든 원자], 글 상자는 [편집]이 앞에 붙는다.
 *   [복사]는 앱 안 붙여넣기용 + (하나면) 그림(PNG)으로도 클립보드에 — 삼성노트·GoodNotes에서 길게 눌러 붙여넣기
 *   끄는 동안은 상자에 그림자 (들어 올린 느낌), 메뉴는 숨긴다.
 *   아무것도 안 골랐을 때 빈 곳을 길게 누르면(복사해 둔 것이 있으면) [붙여넣기] 말풍선.
 * 내보내기 코드는 누를 때 불러온다 (lazy).
 */

type Action = "copy" | "save" | "share" | "check" | "practice";

export async function runExport(action: Action, item: CanvasItem): Promise<string> {
  const m = await import("../export/exportImage");
  const r = action === "copy" ? await m.copyImage(item) : action === "save" ? await m.downloadImage(item) : await m.shareImage(item);
  return r.message;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function boxOf(item: CanvasItem): Box {
  const main = document.querySelector("main")?.getBoundingClientRect();
  const el = document.querySelector(`[data-overlay-id="${item.id}"]`);
  if (el && main && !rotOf(item)) {
    const r = el.getBoundingClientRect();
    return { left: r.left - main.left, top: r.top - main.top, width: r.width, height: r.height };
  }
  const { minX, minY, maxX, maxY } = selectionBox([item], [item.id]) ?? item.bbox;
  const { tx, ty, k } = viewportStore.getState();
  return { left: minX * k + tx, top: minY * k + ty, width: (maxX - minX) * k, height: (maxY - minY) * k };
}

const normDeg = (d: number) => {
  const r = ((d % 360) + 360) % 360;
  return r > 359.5 ? 0 : r;
};
/** 화면(y 아래)에서 시계 방향으로 deg 돌린 (dx, dy) */
const turn = (dx: number, dy: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [dx * c - dy * s, dx * s + dy * c];
};

export function SelectionBar({ onMessage, onEditText }: { onMessage: (message: string) => void; onEditText?: (id: string) => void }): ReactElement | null {
  const selection = useSession((s) => s.selection);
  const items = useSession((s) => s.items);
  const chosen = items.filter((i) => selection.includes(i.id));
  const item = chosen.length === 1 ? chosen[0] : undefined;
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  /** [스타일] 단추로 연 다시 칠하기 줄 */
  const [paintOpen, setPaintOpen] = useState(false);
  const [paintKey, setPaintKey] = useState("");
  const [more, setMore] = useState(false);
  const selKey = selection.join(",");
  useEffect(() => {
    setPaintOpen(false);
    setMore(false);
  }, [selKey]);
  /** 축 패널 (축별 확대·축소) */
  const [axisOpen, setAxisOpen] = useState(false);
  useEffect(() => setAxisOpen(false), [selKey]);
  const lastAxisTap = useRef(0);
  const view = useViewport((s) => s);
  const viewKey = `${view.tx},${view.ty},${view.k}`;
  const ui = useStore(selectionUi);
  /** 끄는 중의 상자 (돌리기·크기) — 미리보기와 함께 기울어지게 */
  const [live, setLive] = useState<Frame | null>(null);
  /** 돌리는 중 (가운데에 각도 배지) */
  const [spinning, setSpinning] = useState(false);

  useLayoutEffect(() => {
    if (chosen.length === 0) {
      setBox(null);
      return;
    }
    // 여러 개면 모두를 감싸는 상자
    const boxes = chosen.map(boxOf);
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    setBox({ left, top, width: Math.max(...boxes.map((b) => b.left + b.width)) - left, height: Math.max(...boxes.map((b) => b.top + b.height)) - top });
    if (!item) return;
    // 그림 크기가 나중에 바뀌는 객체(화학 구조식은 RDKit 계산 후 그려진다)도 상자가 따라가게
    const el = document.querySelector(`[data-overlay-id="${item.id}"]`);
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBox(boxOf(item)));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chosen은 items·selection에서 나온다
  }, [items, selection, viewKey]);

  // 끌어서 노트에 놓을 수 있는 미리보기 이미지 (선택할 때마다, 그림 크기가 바뀔 때마다 새로 만든다)
  const [thumb, setThumb] = useState<string | null>(null);
  // 미리보기는 그림 자체가 바뀔 때만 (확대·이동으로 상자 크기가 바뀌는 건 무시)
  const sizeKey = box ? `${Math.round(box.width / view.k)}x${Math.round(box.height / view.k)}` : "";
  useEffect(() => {
    let alive = true;
    setThumb(null);
    if (!item) return;
    void import("../export/exportImage")
      .then((m) => m.pngDataUrl(item))
      .then((url) => {
        if (alive) setThumb(url);
      })
      .catch(() => {
        /* 미리보기가 없어도 복사·저장 버튼은 그대로 쓸 수 있다 */
      });
    return () => {
      alive = false;
    };
    // 옮기기만 해서는 다시 만들지 않는다 — 내용(IR·획 수)이나 크기가 바뀔 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.kind === "object" ? item.ir : item?.strokes.map((s) => `${s.color ?? ""}/${s.width ?? ""}`).join(","), sizeKey]);

  if (chosen.length === 0 || !box) {
    // 빈 곳을 길게 눌러 뜬 [붙여넣기] 말풍선
    if (!ui.chip || ui.clipboard.length === 0) return null;
    const at = ui.chip;
    return (
      <button
        type="button"
        className="sl-pop"
        onClick={() => {
          const n = pasteItems(at);
          if (n) onMessage(`${n}개 붙여넣었어요`);
        }}
        style={{
          position: "absolute",
          left: at.x * view.k + view.tx - 50,
          top: at.y * view.k + view.ty - 56,
          height: theme.touch.minTarget,
          padding: `0 ${theme.space[3]}px`,
          display: "flex",
          alignItems: "center",
          gap: theme.space[1],
          border: `1px solid ${theme.color.sub}`,
          borderRadius: theme.radius.m,
          background: theme.color.bg,
          color: theme.color.ink,
          boxShadow: "0 4px 20px rgba(26,26,26,0.14)",
          fontSize: 14,
          cursor: "pointer",
          zIndex: 15,
        }}
      >
        <ClipboardPaste size={18} strokeWidth={1.6} /> 붙여넣기
      </button>
    );
  }
  const ids = chosen.map((i) => i.id);
  const locked = chosen.some((i) => i.locked);
  const paintable = chosen.filter(canRecolor);
  const inkWidths = chosen.flatMap((i) => (i.kind === "ink" ? i.strokes.filter((s) => s.tool !== "highlighter").map((s) => s.width ?? 2.6) : []));
  const paint = (color: string | undefined, width: number | undefined) =>
    sessionStore.getState().recolorItems(
      paintable.map((i) => i.id),
      color,
      width,
      width !== undefined ? paintKey : undefined,
    );
  const pad = theme.space[2];
  const barH = theme.touch.minTarget;
  const canShare = typeof navigator.share === "function";
  const free = chosen.every(canTransformFreely);
  /** 객체 하나(손글씨·도형 아님)는 각도가 객체에 저장된다 — 상자를 따로 기억할 필요가 없다 */
  const objectFrame = !!item && item.kind === "object" && !canTransformFreely(item);

  // ── 상자 (월드 좌표) ─────────────────────────────────────
  const frame = ((): Frame => {
    if (live) return live;
    const sp = ui.spun;
    if (!objectFrame && sp && sp.key === selKey) {
      const a = items.find((i) => i.id === sp.anchorId);
      if (a) return { ...sp.frame, cx: sp.frame.cx + a.bbox.minX - sp.ax, cy: sp.frame.cy + a.bbox.minY - sp.ay };
    }
    if (item && rotOf(item)) {
      const b = item.bbox;
      return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, w: b.maxX - b.minX, h: b.maxY - b.minY, deg: rotOf(item) };
    }
    // 똑바로 선 상자: 화면에 실제로 그려진 크기 (그래프·구조식은 IR 상자보다 정확)
    return { cx: (box.left + box.width / 2 - view.tx) / view.k, cy: (box.top + box.height / 2 - view.ty) / view.k, w: box.width / view.k, h: box.height / view.k, deg: 0 };
  })();
  /** 돌린 상자를 기억 (손글씨·여러 개) — 선택이 바뀌면 잊는다 */
  const rememberFrame = (f: Frame) => {
    if (objectFrame || f.deg === 0) {
      selectionUi.setState({ spun: null });
      return;
    }
    const a = sessionStore.getState().items.find((i) => i.id === ids[0]);
    if (a) selectionUi.setState({ spun: { key: selKey, anchorId: a.id, ax: a.bbox.minX, ay: a.bbox.minY, frame: f } });
  };

  // 화면 좌표 (main 기준)
  const SX = frame.cx * view.k + view.tx;
  const SY = frame.cy * view.k + view.ty;
  const HW = (frame.w * view.k) / 2 + pad;
  const HH = (frame.h * view.k) / 2 + pad;
  const at = (dx: number, dy: number): [number, number] => {
    const [x, y] = turn(dx, dy, frame.deg);
    return [SX + x, SY + y];
  };
  const KNOB = 34;
  const upright = frame.deg === 0;

  /**
   * 손잡이 끌기 — 끄는 동안은 이력 없이 미리 보이고, 손을 떼면 Undo 1단위.
   *   모서리: 반대쪽 모서리를 고정점으로 비율 그대로 (돌린 상자에서도 그 방향으로)
   *   변:     한쪽으로만 늘이기·누르기 (똑바로 선 손글씨·도형만)
   *   돌리기: 상자 가운데를 중심으로, 0·90·180·270°에서 6° 안이면 착 붙는다
   */
  type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot";
  const SIGN: Record<"nw" | "ne" | "se" | "sw", [number, number]> = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };
  const startHandle = (h: Handle) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const state = sessionStore.getState();
    const wbox = selectionBox(state.items, ids);
    const main = document.querySelector("main")?.getBoundingClientRect();
    if (!wbox || !main) return;
    const base = state.items;
    const v = viewportStore.getState();
    const f0 = frame;
    const toWorldPt = (ev: { clientX: number; clientY: number }) => ({ x: (ev.clientX - main.left - v.tx) / v.k, y: (ev.clientY - main.top - v.ty) / v.k });
    const start = toWorldPt(e);
    const a0 = Math.atan2(start.y - f0.cy, start.x - f0.cx);
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처 실패해도 요소 위에서는 계속 받는다 */
    }
    const corner = h === "nw" || h === "ne" || h === "se" || h === "sw";
    // 모서리: 고정점 = 반대쪽 모서리 (월드, 상자를 돌린 채로)
    const [sx0, sy0] = corner ? SIGN[h] : [0, 0];
    const [ox, oy] = turn((-sx0 * f0.w) / 2, (-sy0 * f0.h) / 2, f0.deg);
    const [qx, qy] = turn((sx0 * f0.w) / 2, (sy0 * f0.h) / 2, f0.deg);
    const ax = f0.cx + ox;
    const ay = f0.cy + oy;
    const ux = f0.cx + qx - ax;
    const uy = f0.cy + qy - ay;
    const len2 = Math.max(1e-6, ux * ux + uy * uy);
    let k = 1;
    let rad = 0;
    let total = f0.deg;
    let m: Affine | null = null;
    const clampS = (n: number) => Math.min(8, Math.max(0.1, n));
    const w0 = Math.max(1, wbox.maxX - wbox.minX);
    const h0 = Math.max(1, wbox.maxY - wbox.minY);
    const move = (ev: PointerEvent) => {
      const p = toWorldPt(ev);
      const st = sessionStore.getState();
      if (corner) {
        k = Math.min(8, Math.max(0.2, ((p.x - ax) * ux + (p.y - ay) * uy) / len2));
        st.previewScale(ids, k, ax, ay, base);
        setLive({ cx: ax + (f0.cx - ax) * k, cy: ay + (f0.cy - ay) * k, w: f0.w * k, h: f0.h * k, deg: f0.deg });
      } else if (h === "rot") {
        total = f0.deg + ((Math.atan2(p.y - f0.cy, p.x - f0.cx) - a0) * 180) / Math.PI;
        const right = Math.round(total / 90) * 90;
        if (Math.abs(total - right) < 6) total = right;
        total = normDeg(total);
        rad = ((total - f0.deg) * Math.PI) / 180;
        st.previewRotate(ids, rad, f0.cx, f0.cy, base);
        setLive({ ...f0, deg: total });
        setSpinning(true);
      } else {
        const sx = h === "e" ? clampS((p.x - wbox.minX) / w0) : h === "w" ? clampS((wbox.maxX - p.x) / w0) : 1;
        const sy = h === "s" ? clampS((p.y - wbox.minY) / h0) : h === "n" ? clampS((wbox.maxY - p.y) / h0) : 1;
        m = scaleAbout(sx, sy, h === "w" ? wbox.maxX : wbox.minX, h === "n" ? wbox.maxY : wbox.minY);
        st.previewAffine(ids, m, base);
      }
    };
    const end = (cancel: boolean) => () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancelFn);
      const st = sessionStore.getState();
      if (corner) {
        st.commitScale(ids, cancel ? 1 : k, ax, ay, base);
        if (!cancel && f0.deg !== 0) rememberFrame({ cx: ax + (f0.cx - ax) * k, cy: ay + (f0.cy - ay) * k, w: f0.w * k, h: f0.h * k, deg: f0.deg });
      } else if (h === "rot") {
        st.commitRotate(ids, cancel ? 0 : rad, f0.cx, f0.cy, base);
        if (!cancel) rememberFrame({ ...f0, deg: total });
      } else {
        st.commitAffine(ids, cancel ? null : m, base, "늘이기");
        selectionUi.setState({ spun: null });
      }
      setLive(null);
      setSpinning(false);
    };
    const up = end(false);
    const cancelFn = end(true);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancelFn);
  };

  const handles: Array<[Handle, number, number, string]> = [
    ["nw", ...at(-HW, -HH), "nwse-resize"],
    ["ne", ...at(HW, -HH), "nesw-resize"],
    ["se", ...at(HW, HH), "nwse-resize"],
    ["sw", ...at(-HW, HH), "nesw-resize"],
    ...(free && upright
      ? ([
          ["n", ...at(0, -HH), "ns-resize"],
          ["e", ...at(HW, 0), "ew-resize"],
          ["s", ...at(0, HH), "ns-resize"],
          ["w", ...at(-HW, 0), "ew-resize"],
        ] as Array<[Handle, number, number, string]>)
      : []),
    ["rot", ...at(0, -HH - KNOB), "grab"],
  ];
  const HANDLE_NAMES: Record<Handle, string> = { nw: "크기 (왼쪽 위)", ne: "크기 (오른쪽 위)", se: "크기 바꾸기", sw: "크기 (왼쪽 아래)", n: "위로 늘이기", e: "옆으로 늘이기", s: "아래로 늘이기", w: "왼쪽으로 늘이기", rot: "돌리기" };

  // 메뉴 자리: 돌린 상자(+손잡이)를 감싸는 화면 상자의 위, 안 되면 아래
  const pts = [at(-HW, -HH), at(HW, -HH), at(HW, HH), at(-HW, HH), at(0, -HH - KNOB)];
  const topY = Math.min(...pts.map((p) => p[1]));
  const bottomY = Math.max(...pts.map((p) => p[1]));
  const leftX = Math.min(...pts.map((p) => p[0]));
  const above = topY - barH - theme.space[3] > 0;

  // 8단계: 풀이 검산 · 비슷한 문제 — 손글씨·수식·글 상자가 있을 때
  const checkable = chosen.some((i) => i.kind === "ink" || i.ir.kind === "formula" || i.ir.kind === "text");
  const study = async (what: "check" | "practice") => {
    setBusy(what);
    try {
      if (what === "check") {
        const { checkSelection } = await import("../ai/steps");
        const r = await checkSelection(ids);
        onMessage(r.ok ? r.summary : r.message);
      } else {
        const { makePractice } = await import("../ai/practice");
        const r = await makePractice(ids);
        onMessage(r.ok ? r.summary : r.message);
      }
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "하지 못했어요");
    } finally {
      setBusy(null);
    }
  };

  const act = async (action: Action) => {
    if (!item) return;
    setBusy(action);
    try {
      const msg = await runExport(action, item);
      if (msg) onMessage(msg);
    } finally {
      setBusy(null);
    }
  };

  /** 그래프 표시 설정 켜고 끄기 (Undo 1단위) */
  const toggle = (key: "showAxes" | "showCaption", label: string) => {
    if (!item || item.kind !== "object" || item.ir.kind !== "plot2d") return;
    const before = item.ir;
    sessionStore.getState().commitObjectIR(item.id, before, { ...before, data: { ...before.data, [key]: !before.data[key] } }, label);
  };
  const plotData = item?.kind === "object" && item.ir.kind === "plot2d" ? item.ir.data : null;
  const chemData = item?.kind === "object" && item.ir.kind === "chem" ? item.ir.data : null;
  /** 화학 구조식 표시 설정 (Undo 1단위) */
  const chemToggle = (patch: "circle" | "full") => {
    if (!item || item.kind !== "object" || item.ir.kind !== "chem") return;
    const before = item.ir;
    const data =
      patch === "circle"
        ? { ...before.data, aromaticCircle: !before.data.aromaticCircle }
        : { ...before.data, style: before.data.style === "full" ? ("skeletal" as const) : ("full" as const) };
    sessionStore.getState().commitObjectIR(item.id, before, { ...before, data }, patch === "circle" ? "방향족 원 표기" : "구조식 종류");
  };

  const button = (label: string, Icon: typeof Copy, onClick: () => void, danger = false, pressed?: boolean) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      disabled={busy !== null}
      style={{
        minWidth: theme.touch.minTarget,
        height: barH,
        padding: `0 ${theme.space[3]}px`,
        display: "flex",
        alignItems: "center",
        gap: theme.space[1],
        border: "none",
        borderRadius: theme.radius.s,
        background: pressed ? theme.color.groupHint : "transparent",
        color: pressed ? theme.color.accent : pressed === false ? theme.color.asymptote : danger ? theme.color.danger : theme.color.ink,
        fontSize: 14,
        cursor: "pointer",
        opacity: busy !== null ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={18} strokeWidth={1.6} />
      <span>{label}</span>
    </button>
  );

  const copy = () => {
    const n = copyItems(ids);
    // 하나면 그림(PNG)으로도 — 다른 노트 앱에 붙여넣을 수 있게
    if (item) void act("copy");
    else onMessage(`${n}개 복사했어요 · 빈 곳을 길게 눌러 붙여넣기`);
  };

  return (
    <>
      {!locked && <div aria-hidden style={{ position: "absolute", left: at(0, -HH - KNOB / 2)[0] - 0.75, top: at(0, -HH - KNOB / 2)[1] - KNOB / 2, width: 1.5, height: KNOB, background: theme.color.accent, pointerEvents: "none", zIndex: 16, transform: `rotate(${frame.deg}deg)` }} />}
      {!locked &&
        !ui.lifting &&
        handles.map(([h, x, y, cursor]) => (
          <div
            key={h}
            role="slider"
            aria-label={HANDLE_NAMES[h]}
            aria-valuenow={h === "rot" ? Math.round(frame.deg) : 1}
            title={HANDLE_NAMES[h]}
            onPointerDown={startHandle(h)}
            style={{
              position: "absolute",
              left: x - (h === "rot" ? 13 : 11),
              top: y - (h === "rot" ? 13 : 11),
              width: h === "rot" ? 26 : 22,
              height: h === "rot" ? 26 : 22,
              borderRadius: "50%",
              background: h === "rot" ? theme.color.accent : theme.color.bg,
              border: `2px solid ${theme.color.accent}`,
              boxShadow: "0 1px 4px rgba(26,26,26,0.2)",
              cursor,
              touchAction: "none",
              zIndex: 16,
              boxSizing: "border-box",
            }}
          />
        ))}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: SX - HW,
          top: SY - HH,
          width: HW * 2,
          height: HH * 2,
          transform: frame.deg ? `rotate(${frame.deg}deg)` : undefined,
          border: `1.5px dashed ${theme.color.accent}`,
          borderRadius: theme.radius.s,
          background: theme.color.groupHint,
          boxShadow: ui.lifting ? "0 12px 28px rgba(26,26,26,0.22)" : undefined,
          transition: "box-shadow 120ms ease-out",
          pointerEvents: "none",
        }}
      />
      {spinning && (
        <div
          aria-live="polite"
          style={{ position: "absolute", left: SX - 30, top: SY - 16, width: 60, height: 32, display: "grid", placeItems: "center", borderRadius: 999, background: "rgba(26,26,26,0.78)", color: "#fff", fontSize: 14, fontWeight: 600, pointerEvents: "none", zIndex: 17 }}
        >
          {Math.round(frame.deg) % 360}°
        </div>
      )}
      {!ui.lifting && !live && (
        <div
          role="toolbar"
          className="sl-pop"
          aria-label="선택한 그림"
          style={{
            position: "absolute",
            left: Math.max(theme.space[2], leftX),
            top: above ? topY - barH - theme.space[3] - theme.space[1] * 2 : bottomY + theme.space[3],
            display: "flex",
            gap: theme.space[1],
            padding: theme.space[1],
            borderRadius: theme.radius.m,
            background: theme.color.bg,
            boxShadow: "0 4px 20px rgba(26,26,26,0.14)",
            border: `1px solid ${theme.color.sub}`,
            zIndex: 15,
            flexWrap: "wrap",
            maxWidth: "calc(100vw - 16px)",
          }}
        >
          {!item && <span style={{ alignSelf: "center", padding: `0 ${theme.space[2]}px`, fontSize: 14, color: theme.color.asymptote }}>{chosen.length}개</span>}
          {locked && button("잠금 해제", LockOpen, () => sessionStore.getState().setLocked(ids, false))}
          {plotData &&
            button("축", ChartSpline, () => {
              // 한 번 = 축 보이기/숨기기, 두 번 톡 = 축 패널 (두 번째 톡이 첫 번째를 되돌려 표시는 그대로)
              const now = performance.now();
              const double = now - lastAxisTap.current < 400;
              lastAxisTap.current = double ? 0 : now;
              toggle("showAxes", "축 표시");
              if (double) setAxisOpen(true);
            }, false, plotData.showAxes)}
          {item?.kind === "object" && item.ir.kind === "space3d" && button("축", ChartSpline, () => setAxisOpen((o) => !o), false, axisOpen || undefined)}
          {plotData && button("이름", Sigma, () => toggle("showCaption", "식 표시"), false, plotData.showCaption)}
          {chemData && button("원", Circle, () => chemToggle("circle"), false, chemData.aromaticCircle)}
          {chemData && button("모든 원자", Atom, () => chemToggle("full"), false, chemData.style === "full")}
          {!locked && item?.kind === "object" && item.ir.kind === "text" && onEditText && button("편집", Pencil, () => onEditText(item.id))}
          {!locked && button("잘라내기", Scissors, () => onMessage(`${cutItems(ids)}개 잘라냈어요 · 빈 곳을 길게 눌러 붙여넣기`))}
          {button("복사", Copy, copy)}
          {ui.clipboard.length > 0 && button("붙여넣기", ClipboardPaste, () => void pasteItems())}
          {!locked && button("삭제", Trash2, () => sessionStore.getState().removeItems(ids), true)}
          {!locked && paintable.length > 0 &&
            button("스타일", Palette, () => {
              setPaintKey(`paint-${Date.now()}`);
              setPaintOpen((o) => !o);
              setMore(false);
            }, false, paintOpen || undefined)}
          {button("더 보기", EllipsisVertical, () => {
            setMore((o) => !o);
            setPaintOpen(false);
          }, false, more || undefined)}
          {more && (
            <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", gap: theme.space[1], paddingTop: theme.space[1], borderTop: `1px solid ${theme.color.sub}` }}>
              {checkable && button(busy === "check" ? "검산 중…" : "검산", ListChecks, () => void study("check"))}
              {checkable && aiConfigured() && button(busy === "practice" ? "만드는 중…" : "비슷한 문제", Dices, () => void study("practice"))}
              {item && button("이미지 저장", Download, () => void act("save"))}
              {item && canShare && button("공유", Share2, () => void act("share"))}
              {!locked && button("맨 앞으로", BringToFront, () => sessionStore.getState().reorder(ids, "front"))}
              {!locked && button("맨 뒤로", SendToBack, () => sessionStore.getState().reorder(ids, "back"))}
              {!locked && button("잠금", Lock, () => sessionStore.getState().setLocked(ids, true))}
              {button("복제", CopyPlus, () => sessionStore.getState().duplicateItems(ids))}
              {item && thumb && (
                <img
                  src={thumb}
                  alt="끌어서 노트에 놓기"
                  title="분할 화면에서 노트 앱으로 끌어다 놓기"
                  draggable
                  style={{
                    height: barH,
                    maxWidth: barH * 1.6,
                    objectFit: "contain",
                    border: `1px solid ${theme.color.sub}`,
                    borderRadius: theme.radius.s,
                    background: theme.color.bg,
                    cursor: "grab",
                    userSelect: "auto",
                    WebkitUserDrag: "element",
                  } as CSSProperties}
                />
              )}
            </div>
          )}
          {axisOpen && item?.kind === "object" && (
            <div style={{ flexBasis: "100%", padding: theme.space[2], borderTop: `1px solid ${theme.color.sub}` }}>
              <AxisPanel item={item} />
            </div>
          )}
          {paintOpen && (
            <div style={{ flexBasis: "100%", display: "grid", gap: theme.space[2], padding: theme.space[2], borderTop: `1px solid ${theme.color.sub}` }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[...penOpts.colors, ...rainbow(penOpts.rainbowPen.s, penOpts.rainbowPen.l)].map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`색 ${c}`}
                    onClick={() => paint(c, undefined)}
                    style={{ width: 26, height: 26, padding: 0, border: "none", borderRadius: "50%", background: c, boxShadow: `0 0 0 1px ${theme.color.sub}`, cursor: "pointer" }}
                  />
                ))}
              </div>
              {inkWidths.length > 0 && (
                <label style={{ display: "flex", alignItems: "center", gap: theme.space[2], fontSize: 13 }}>
                  굵기
                  <input
                    type="range"
                    aria-label="손글씨 굵기"
                    min={penOpts.penWidth.min}
                    max={penOpts.penWidth.max}
                    step={0.1}
                    defaultValue={inkWidths[0]}
                    onChange={(e) => paint(undefined, Number(e.target.value))}
                    style={{ flex: 1, accentColor: theme.color.accent }}
                  />
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
