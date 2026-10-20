import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { hitItem } from "../ink/editing";
import type { CanvasItem } from "../ink/types";
import { theme } from "../render/theme";

/**
 * 스포이트 — 노트에 있는 색 가져오기.
 *   PC 크롬 등 EyeDropper를 지원하면: 화면 어디서나 (그래프 색까지)
 *   안 되면(갤럭시 탭 등): 다음 한 번 톡 친 곳의 손글씨·도형·글 상자·테이프 색 (PointerCanvas가 처리)
 */
export const eyedropperStore = createStore<{ onPick: ((color: string) => void) | null }>(() => ({ onPick: null }));

export function useEyedropperActive(): boolean {
  return useStore(eyedropperStore, (s) => s.onPick !== null);
}

interface NativeEyeDropper {
  open(): Promise<{ sRGBHex: string }>;
}

export async function startEyedropper(onPick: (color: string) => void): Promise<void> {
  const Native = (window as unknown as { EyeDropper?: new () => NativeEyeDropper }).EyeDropper;
  if (Native) {
    try {
      const r = await new Native().open();
      const hex = r.sRGBHex.startsWith("#") ? r.sRGBHex : rgbStringToHex(r.sRGBHex);
      if (hex) onPick(hex.toUpperCase());
    } catch {
      /* Esc로 취소 */
    }
    return;
  }
  eyedropperStore.setState({ onPick });
}

export function cancelEyedropper(): void {
  eyedropperStore.setState({ onPick: null });
}

/** 월드 좌표 (x, y)에 있는 항목의 색 (없으면 null) */
export function colorAt(items: readonly CanvasItem[], x: number, y: number, slop: number): string | null {
  const hit = hitItem(items, x, y, slop);
  if (!hit) return null;
  if (hit.kind === "ink") {
    // 가장 가까운 획의 색
    let best: { d: number; color: string } | null = null;
    for (const s of hit.strokes) {
      for (const p of s.points) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (!best || d < best.d) best = { d, color: s.color ?? theme.color.ink };
      }
    }
    return best?.color ?? null;
  }
  const ir = hit.ir;
  if (ir.kind === "shape2d" || ir.kind === "text") return ir.data.color ?? theme.color.ink;
  if (ir.kind === "tape") return ir.data.color;
  return null;
}

function rgbStringToHex(s: string): string | null {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s);
  if (!m) return null;
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
}
