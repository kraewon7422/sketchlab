import { useEffect, useState } from "react";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { BBox } from "../ink/types";
import { viewportStore } from "./viewport";

/**
 * 보이는 것만 그리기 — 화면(과 그 둘레 한 화면씩) 밖의 손글씨·그림·종이는 그리지 않는다.
 * PDF 200쪽짜리 노트도 지금 보이는 몇 장만 그리니 부드럽다 (굿노트·삼성노트처럼).
 *
 * 보이는 영역은 512px 칸 단위로 맞춰서만 바뀐다 — 화면을 조금씩 밀 때마다 다시 그리지 않게.
 * 그림·PDF로 내보낼 때·표지를 찍을 때는 잠깐 전부 그린다 (withAllRendered).
 */
const TILE = 512;

export const cullingStore = createStore<{ renderAll: number }>(() => ({ renderAll: 0 }));

/** 안의 일을 하는 동안 전부 그린다 (화면이 다 그려질 때까지 두 프레임 기다린 뒤) */
export async function withAllRendered<T>(fn: () => Promise<T>): Promise<T> {
  cullingStore.setState((s) => ({ renderAll: s.renderAll + 1 }));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    return await fn();
  } finally {
    cullingStore.setState((s) => ({ renderAll: s.renderAll - 1 }));
  }
}

let mainSize = { w: typeof window === "undefined" ? 1280 : window.innerWidth, h: typeof window === "undefined" ? 800 : window.innerHeight };

function rectNow(): BBox {
  const { tx, ty, k } = viewportStore.getState();
  const minX = -tx / k;
  const minY = -ty / k;
  const w = mainSize.w / k;
  const h = mainSize.h / k;
  // 둘레 한 화면씩 더 (밀 때 빈 곳이 보이지 않게), 칸 단위로
  const q = (v: number, up: boolean) => (up ? Math.ceil(v / TILE) : Math.floor(v / TILE)) * TILE;
  return { minX: q(minX - w, false), minY: q(minY - h, false), maxX: q(minX + 2 * w, true), maxY: q(minY + 2 * h, true) };
}

const same = (a: BBox, b: BBox) => a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;

/** 지금 그릴 영역 (월드). 전부 그리는 중이면 null */
export function useVisibleRect(): BBox | null {
  const all = useStore(cullingStore, (s) => s.renderAll > 0);
  const [rect, setRect] = useState<BBox>(rectNow);
  useEffect(() => {
    const main = document.querySelector("main");
    const ro = main
      ? new ResizeObserver(() => {
          const r = main.getBoundingClientRect();
          mainSize = { w: r.width, h: r.height };
          setRect((prev) => {
            const next = rectNow();
            return same(prev, next) ? prev : next;
          });
        })
      : null;
    if (main) ro?.observe(main);
    // 손가락으로 옮기는 중에는 다시 그리지 않는다 (그림째 옮기는 중) — 멈추면 한 번
    const stop = viewportStore.subscribe((s) =>
      s.moving ? undefined : setRect((prev) => {
        const next = rectNow();
        return same(prev, next) ? prev : next;
      }),
    );
    return () => {
      stop();
      ro?.disconnect();
    };
  }, []);
  return all ? null : rect;
}

/** 상자가 그릴 영역에 걸치는가 */
export const inView = (b: BBox, r: BBox | null): boolean => !r || (b.maxX >= r.minX && b.minX <= r.maxX && b.maxY >= r.minY && b.minY <= r.maxY);
