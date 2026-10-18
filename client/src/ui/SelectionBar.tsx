import { Copy, Download, Share2, Trash2 } from "lucide-react";
import { useLayoutEffect, useState, type ReactElement } from "react";
import type { CanvasItem } from "../ink/types";
import { theme } from "../render/theme";
import { sessionStore, useSession } from "../store/session";

/**
 * 선택한 객체의 작은 메뉴 — 노트로 보내기 (마스터스펙 v4 §14).
 *   [복사] 클립보드 PNG → 삼성노트·GoodNotes에서 길게 눌러 붙여넣기 (PC는 Ctrl+V)
 *   [저장] PNG 파일 → 갤러리/내 파일 → 노트에 이미지 삽입 (항상 되는 길)
 *   [공유] 안드로이드·iPad 공유 시트 → 노트 앱 선택
 *   [삭제]
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
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

export function SelectionBar({ onMessage }: { onMessage: (message: string) => void }): ReactElement | null {
  const selection = useSession((s) => s.selection);
  const items = useSession((s) => s.items);
  const item = selection.length === 1 ? items.find((i) => i.id === selection[0]) : undefined;
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);

  useLayoutEffect(() => {
    setBox(item ? boxOf(item) : null);
  }, [item]);

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

  const button = (label: string, Icon: typeof Copy, onClick: () => void, danger = false) => (
    <button
      type="button"
      aria-label={label}
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
        background: "transparent",
        color: danger ? theme.color.danger : theme.color.ink,
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
        }}
      >
        {button("복사", Copy, () => void act("copy"))}
        {button("저장", Download, () => void act("save"))}
        {canShare && button("공유", Share2, () => void act("share"))}
        {button("삭제", Trash2, () => sessionStore.getState().removeItems([item.id]), true)}
      </div>
    </>
  );
}
