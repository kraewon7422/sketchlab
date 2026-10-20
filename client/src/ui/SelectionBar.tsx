import { Atom, BringToFront, ChartSpline, Circle, Copy, CopyPlus, Dices, Download, ListChecks, Lock, LockOpen, Palette, Pencil, SendToBack, Share2, Sigma, Trash2 } from "lucide-react";
import { aiConfigured } from "../ai/settings";
import { canRecolor, canTransformFreely, rotationAbout, scaleAbout, selectionBox, type Affine } from "../ink/editing";
import { rainbow } from "../ink/color";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import type { CanvasItem } from "../ink/types";
import { penOpts, theme } from "../render/theme";
import { AxisPanel } from "./AxisPanel";
import { sessionStore, useSession } from "../store/session";
import { useViewport, viewportStore } from "../store/viewport";

/**
 * 선택한 객체의 작은 메뉴 — 노트로 보내기 (마스터스펙 v4 §14).
 *   [복사] 클립보드 PNG → 삼성노트·GoodNotes에서 길게 눌러 붙여넣기 (PC는 Ctrl+V)
 *   [저장] PNG 파일 → 갤러리/내 파일 → 노트에 이미지 삽입 (항상 되는 길)
 *   [공유] 안드로이드·iPad 공유 시트 → 노트 앱 선택
 *   [복제] [삭제]
 * 여러 개를 골랐으면(올가미) [복제] [삭제]만. 고른 것은 끌어서 옮긴다 (PointerCanvas).
 * 그래프는 [축] [이름] ([축] 두 번 톡 = 축별 확대·축소 패널, 공간좌표는 [축] 한 번), 화학 구조식은 [원] [모든 원자] 켜고 끄기가 앞에 붙는다.
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
  if (el && main) {
    const r = el.getBoundingClientRect();
    return { left: r.left - main.left, top: r.top - main.top, width: r.width, height: r.height };
  }
  const { minX, minY, maxX, maxY } = item.bbox;
  const { tx, ty, k } = viewportStore.getState();
  return { left: minX * k + tx, top: minY * k + ty, width: (maxX - minX) * k, height: (maxY - minY) * k };
}

export function SelectionBar({ onMessage, onEditText }: { onMessage: (message: string) => void; onEditText?: (id: string) => void }): ReactElement | null {
  const selection = useSession((s) => s.selection);
  const items = useSession((s) => s.items);
  const chosen = items.filter((i) => selection.includes(i.id));
  const item = chosen.length === 1 ? chosen[0] : undefined;
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  /** [색] 단추로 연 다시 칠하기 줄 */
  const [paintOpen, setPaintOpen] = useState(false);
  const [paintKey, setPaintKey] = useState("");
  const selKey = selection.join(",");
  useEffect(() => setPaintOpen(false), [selKey]);
  /** 축 패널 (축별 확대·축소) */
  const [axisOpen, setAxisOpen] = useState(false);
  useEffect(() => setAxisOpen(false), [selKey]);
  const lastAxisTap = useRef(0);
  const viewKey = useViewport((s) => `${s.tx},${s.ty},${s.k}`);

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
  const zoom = useViewport((s) => s.k);
  const sizeKey = box ? `${Math.round(box.width / zoom)}x${Math.round(box.height / zoom)}` : "";
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

  if (chosen.length === 0 || !box) return null;
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
  // 돌리기 손잡이가 위에 있으면 메뉴를 그만큼 더 위로 (손잡이를 가리지 않게)
  const knob = chosen.every(canTransformFreely) && !chosen.some((i) => i.locked) ? 44 : 0;
  const above = box.top - pad - barH - theme.space[2] - knob > 0;
  const canShare = typeof navigator.share === "function";

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
      }}
    >
      <Icon size={18} strokeWidth={1.6} />
      <span>{label}</span>
    </button>
  );

  /**
   * 선택 상자 손잡이 (삼성노트처럼)
   *   모서리 4개: 반대쪽 모서리를 고정점으로 비율 그대로 크기 (모든 항목)
   *   변 4개:     한쪽으로만 늘이기·누르기 (손글씨·정리한 도형만)
   *   위 동그라미: 가운데를 중심으로 돌리기, 15°마다 착 붙는다 (손글씨·정리한 도형만)
   * 끄는 동안은 이력 없이 미리 보이고, 손을 떼면 Undo 1단위.
   */
  type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot";
  const startHandle = (h: Handle) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const state = sessionStore.getState();
    const wbox = selectionBox(state.items, ids);
    const main = document.querySelector("main")?.getBoundingClientRect();
    if (!wbox || !main) return;
    const base = state.items;
    const view = viewportStore.getState();
    const w0 = Math.max(1, wbox.maxX - wbox.minX);
    const h0 = Math.max(1, wbox.maxY - wbox.minY);
    const cx = (wbox.minX + wbox.maxX) / 2;
    const cy = (wbox.minY + wbox.maxY) / 2;
    const toWorldPt = (ev: { clientX: number; clientY: number }) => ({ x: (ev.clientX - main.left - view.tx) / view.k, y: (ev.clientY - main.top - view.ty) / view.k });
    const start = toWorldPt(e);
    const a0 = Math.atan2(start.y - cy, start.x - cx);
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처 실패해도 요소 위에서는 계속 받는다 */
    }
    // 고정점 (반대쪽)
    const ax = h.includes("w") ? wbox.maxX : wbox.minX;
    const ay = h.includes("n") ? wbox.maxY : wbox.minY;
    const corner = h === "nw" || h === "ne" || h === "se" || h === "sw";
    let k = 1;
    let m: Affine | null = null;
    const clampS = (v: number) => Math.min(8, Math.max(0.1, v));
    const move = (ev: PointerEvent) => {
      const p = toWorldPt(ev);
      const st = sessionStore.getState();
      if (corner) {
        const kx = (h.includes("w") ? ax - p.x : p.x - ax) / w0;
        const ky = (h.includes("n") ? ay - p.y : p.y - ay) / h0;
        k = Math.min(8, Math.max(0.2, (kx + ky) / 2));
        st.previewScale(ids, k, ax, ay, base);
      } else if (h === "rot") {
        let a = Math.atan2(p.y - cy, p.x - cx) - a0;
        const step = Math.PI / 12; // 15°
        const snapped = Math.round(a / step) * step;
        if (Math.abs(a - snapped) < (4 * Math.PI) / 180) a = snapped;
        m = rotationAbout(a, cx, cy);
        st.previewAffine(ids, m, base);
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
      if (corner) st.commitScale(ids, cancel ? 1 : k, ax, ay, base);
      else st.commitAffine(ids, cancel ? null : m, base, h === "rot" ? "돌리기" : "늘이기");
    };
    const up = end(false);
    const cancelFn = end(true);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancelFn);
  };

  const free = chosen.every(canTransformFreely);
  const L = box.left - pad;
  const T = box.top - pad;
  const R = box.left + box.width + pad;
  const B = box.top + box.height + pad;
  const handles: Array<[Handle, number, number, string]> = [
    ["nw", L, T, "nwse-resize"],
    ["ne", R, T, "nesw-resize"],
    ["se", R, B, "nwse-resize"],
    ["sw", L, B, "nesw-resize"],
    ...(free
      ? ([
          ["n", (L + R) / 2, T, "ns-resize"],
          ["e", R, (T + B) / 2, "ew-resize"],
          ["s", (L + R) / 2, B, "ns-resize"],
          ["w", L, (T + B) / 2, "ew-resize"],
          ["rot", (L + R) / 2, T - 34, "grab"],
        ] as Array<[Handle, number, number, string]>)
      : []),
  ];
  const HANDLE_NAMES: Record<Handle, string> = { nw: "크기 (왼쪽 위)", ne: "크기 (오른쪽 위)", se: "크기 바꾸기", sw: "크기 (왼쪽 아래)", n: "위로 늘이기", e: "옆으로 늘이기", s: "아래로 늘이기", w: "왼쪽으로 늘이기", rot: "돌리기" };

  return (
    <>
      {!locked && free && <div aria-hidden style={{ position: "absolute", left: (L + R) / 2 - 0.75, top: T - 22, width: 1.5, height: 22, background: theme.color.accent, pointerEvents: "none", zIndex: 16 }} />}
      {!locked &&
        handles.map(([h, x, y, cursor]) => (
          <div
            key={h}
            role="slider"
            aria-label={HANDLE_NAMES[h]}
            aria-valuenow={1}
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
          left: box.left - pad,
          top: box.top - pad,
          width: box.width + pad * 2,
          height: box.height + pad * 2,
          border: `1.5px dashed ${theme.color.accent}`,
          borderRadius: theme.radius.s,
          background: theme.color.groupHint,
          pointerEvents: "none",
        }}
      />
      <div
        role="toolbar"
        className="sl-pop"
        aria-label="선택한 그림"
        style={{
          position: "absolute",
          left: Math.max(theme.space[2], box.left - pad),
          top: above ? box.top - pad - barH - theme.space[2] - knob : box.top + box.height + pad + theme.space[2] + 12,
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
        {checkable && button(busy === "check" ? "검산 중…" : "검산", ListChecks, () => void study("check"))}
        {checkable && aiConfigured() && button(busy === "practice" ? "만드는 중…" : "비슷한 문제", Dices, () => void study("practice"))}
        {item && button("복사", Copy, () => void act("copy"))}
        {item && button("저장", Download, () => void act("save"))}
        {item && canShare && button("공유", Share2, () => void act("share"))}
        {!locked && paintable.length > 0 &&
          button("색", Palette, () => {
            setPaintKey(`paint-${Date.now()}`);
            setPaintOpen((o) => !o);
          }, false, paintOpen || undefined)}
        {!locked && button("잠금", Lock, () => sessionStore.getState().setLocked(ids, true))}
        {!locked && button("맨 앞", BringToFront, () => sessionStore.getState().reorder(ids, "front"))}
        {!locked && button("맨 뒤", SendToBack, () => sessionStore.getState().reorder(ids, "back"))}
        {button("복제", CopyPlus, () => sessionStore.getState().duplicateItems(ids))}
        {!locked && button("삭제", Trash2, () => sessionStore.getState().removeItems(ids), true)}
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
    </>
  );
}
