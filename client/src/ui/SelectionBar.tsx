import { Atom, ChartSpline, Circle, Copy, Download, Share2, Sigma, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactElement } from "react";
import type { CanvasItem } from "../ink/types";
import { theme } from "../render/theme";
import { sessionStore, useSession } from "../store/session";
import { useViewport, viewportStore } from "../store/viewport";

/**
 * 선택한 객체의 작은 메뉴 — 노트로 보내기 (마스터스펙 v4 §14).
 *   [복사] 클립보드 PNG → 삼성노트·GoodNotes에서 길게 눌러 붙여넣기 (PC는 Ctrl+V)
 *   [저장] PNG 파일 → 갤러리/내 파일 → 노트에 이미지 삽입 (항상 되는 길)
 *   [공유] 안드로이드·iPad 공유 시트 → 노트 앱 선택
 *   [삭제]
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

export function SelectionBar({ onMessage }: { onMessage: (message: string) => void }): ReactElement | null {
  const selection = useSession((s) => s.selection);
  const items = useSession((s) => s.items);
  const item = selection.length === 1 ? items.find((i) => i.id === selection[0]) : undefined;
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const viewKey = useViewport((s) => `${s.tx},${s.ty},${s.k}`);

  useLayoutEffect(() => {
    setBox(item ? boxOf(item) : null);
    if (!item) return;
    // 그림 크기가 나중에 바뀌는 객체(화학 구조식은 RDKit 계산 후 그려진다)도 상자가 따라가게
    const el = document.querySelector(`[data-overlay-id="${item.id}"]`);
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBox(boxOf(item)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [item, viewKey]);

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
  }, [item, sizeKey]);

  if (!item || !box) return null;
  const pad = theme.space[2];
  const barH = theme.touch.minTarget;
  const above = box.top - pad - barH - theme.space[2] > 0;
  const canShare = typeof navigator.share === "function";

  const act = async (action: Action) => {
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
    if (item.kind !== "object" || item.ir.kind !== "plot2d") return;
    const before = item.ir;
    sessionStore.getState().commitObjectIR(item.id, before, { ...before, data: { ...before.data, [key]: !before.data[key] } }, label);
  };
  const plotData = item.kind === "object" && item.ir.kind === "plot2d" ? item.ir.data : null;
  const chemData = item.kind === "object" && item.ir.kind === "chem" ? item.ir.data : null;
  /** 화학 구조식 표시 설정 (Undo 1단위) */
  const chemToggle = (patch: "circle" | "full") => {
    if (item.kind !== "object" || item.ir.kind !== "chem") return;
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

  return (
    <>
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
        {thumb && (
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
        {button("복사", Copy, () => void act("copy"))}
        {button("저장", Download, () => void act("save"))}
        {canShare && button("공유", Share2, () => void act("share"))}
        {button("삭제", Trash2, () => sessionStore.getState().removeItems([item.id]), true)}
      </div>
    </>
  );
}
