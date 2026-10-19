import { Atom, ChartSpline, Circle, Copy, CopyPlus, Download, Palette, Pencil, Share2, Sigma, Trash2 } from "lucide-react";
import { canRecolor, selectionBox } from "../ink/editing";
import { rainbow } from "../ink/color";
import { useEffect, useLayoutEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import type { CanvasItem } from "../ink/types";
import { penOpts, theme } from "../render/theme";
import { sessionStore, useSession } from "../store/session";
import { useViewport, viewportStore } from "../store/viewport";

/**
 * 선택한 객체의 작은 메뉴 — 노트로 보내기 (마스터스펙 v4 §14).
 *   [복사] 클립보드 PNG → 삼성노트·GoodNotes에서 길게 눌러 붙여넣기 (PC는 Ctrl+V)
 *   [저장] PNG 파일 → 갤러리/내 파일 → 노트에 이미지 삽입 (항상 되는 길)
 *   [공유] 안드로이드·iPad 공유 시트 → 노트 앱 선택
 *   [복제] [삭제]
 * 여러 개를 골랐으면(올가미) [복제] [삭제]만. 고른 것은 끌어서 옮긴다 (PointerCanvas).
 * 그래프는 [축] [이름], 화학 구조식은 [원] [모든 원자] 켜고 끄기가 앞에 붙는다.
 * 내보내기 코드는 누를 때 불러온다 (lazy).
 */

type Action = "copy" | "save" | "share";

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
  const above = box.top - pad - barH - theme.space[2] > 0;
  const canShare = typeof navigator.share === "function";

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

  /** 오른쪽 아래 손잡이를 끌어 크기 바꾸기 — 왼쪽 위를 고정점으로 (Undo 1단위) */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
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
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처 실패해도 요소 위에서는 계속 받는다 */
    }
    let k = 1;
    const move = (ev: PointerEvent) => {
      const wx = (ev.clientX - main.left - view.tx) / view.k;
      const wy = (ev.clientY - main.top - view.ty) / view.k;
      k = Math.min(8, Math.max(0.2, ((wx - wbox.minX) / w0 + (wy - wbox.minY) / h0) / 2));
      sessionStore.getState().previewScale(ids, k, wbox.minX, wbox.minY, base);
    };
    const end = (cancel: boolean) => () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancelFn);
      sessionStore.getState().commitScale(ids, cancel ? 1 : k, wbox.minX, wbox.minY, base);
    };
    const up = end(false);
    const cancelFn = end(true);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancelFn);
  };

  return (
    <>
      <div
        role="slider"
        aria-label="크기 바꾸기"
        aria-valuenow={1}
        title="끌어서 크기 바꾸기"
        onPointerDown={startResize}
        style={{
          position: "absolute",
          left: box.left + box.width + pad - 13,
          top: box.top + box.height + pad - 13,
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: theme.color.bg,
          border: `2px solid ${theme.color.accent}`,
          boxShadow: "0 1px 4px rgba(26,26,26,0.2)",
          cursor: "nwse-resize",
          touchAction: "none",
          zIndex: 16,
          boxSizing: "border-box",
        }}
      />
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
        aria-label="선택한 그림"
        style={{
          position: "absolute",
          left: Math.max(theme.space[2], box.left - pad),
          top: above ? box.top - pad - barH - theme.space[2] : box.top + box.height + pad + theme.space[2],
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
        {plotData && button("축", ChartSpline, () => toggle("showAxes", "축 표시"), false, plotData.showAxes)}
        {plotData && button("이름", Sigma, () => toggle("showCaption", "식 표시"), false, plotData.showCaption)}
        {chemData && button("원", Circle, () => chemToggle("circle"), false, chemData.aromaticCircle)}
        {chemData && button("모든 원자", Atom, () => chemToggle("full"), false, chemData.style === "full")}
        {item?.kind === "object" && item.ir.kind === "text" && onEditText && button("편집", Pencil, () => onEditText(item.id))}
        {item && button("복사", Copy, () => void act("copy"))}
        {item && button("저장", Download, () => void act("save"))}
        {item && canShare && button("공유", Share2, () => void act("share"))}
        {paintable.length > 0 &&
          button("색", Palette, () => {
            setPaintKey(`paint-${Date.now()}`);
            setPaintOpen((o) => !o);
          }, false, paintOpen || undefined)}
        {button("복제", CopyPlus, () => sessionStore.getState().duplicateItems(ids))}
        {button("삭제", Trash2, () => sessionStore.getState().removeItems(ids), true)}
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
