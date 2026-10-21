import { itemAabb } from "../ink/editing";
import { theme } from "../render/theme";
import { sessionStore } from "../store/session";
import { viewportStore } from "../store/viewport";

/**
 * 새 객체 자리: 위에서부터 훑으며 기존 잉크·객체와 겹치지 않는 첫 자리 (옆·아래 빈 곳).
 * 보이는 곳에 빈 자리가 없으면 겹쳐 놓지 않고 — 지금 보는 세로줄에서 맨 아래 것의 바로 밑에 놓고,
 * 화면을 그쪽으로 부드럽게 내려 보여 준다 (사용자 결정 2026-10-21).
 */
export function freeSpot(w: number, h: number, area: Area): { x: number; y: number } {
  const gap = theme.space[5];
  const items = sessionStore.getState().items;
  const taken = items.map(itemAabb);
  const hits = (x: number, y: number) =>
    taken.some((b) => x < b.maxX + gap && x + w > b.minX - gap && y < b.maxY + gap && y + h > b.minY - gap);
  // 후보 자리 = 왼쪽·위 여백, 그리고 기존 것들의 바로 오른쪽·바로 아래 (격자로 훑으면 몇 px 차이로 놓친다)
  const left = area.x + gap;
  const top = area.y + gap;
  const right = area.x + area.width - gap;
  const bottom = area.y + area.height - gap;
  const xs = [left, ...taken.map((b) => b.maxX + gap)].filter((x) => x >= left).sort((a, b) => a - b);
  const ys = [top, ...taken.map((b) => b.maxY + gap)].filter((y) => y >= top).sort((a, b) => a - b);
  for (const y of ys) {
    if (y + h > bottom) continue;
    for (const x of xs) {
      if (x + w <= right && !hits(x, y)) return { x, y };
    }
  }
  // 보이는 곳에 빈 자리가 없다: 이 세로줄(왼쪽 여백부터 w 폭)의 맨 아래 것 바로 밑 → 화면을 그쪽으로
  const x = left;
  const below = taken.filter((b) => b.maxX + gap > x && b.minX - gap < x + w && b.maxY > top);
  let y = Math.max(top, ...below.map((b) => b.maxY + gap));
  // 혹시 그 자리에도 무언가 걸리면(옆줄에서 넘어온 큰 것) 걸리지 않을 때까지 내린다
  for (let guard = 0; guard < 50 && hits(x, y); guard++) {
    const blocker = taken.filter((b) => x < b.maxX + gap && x + w > b.minX - gap && y < b.maxY + gap && y + h > b.minY - gap);
    y = Math.max(y + gap, ...blocker.map((b) => b.maxY + gap));
  }
  scrollToShow(y - gap, area);
  return { x, y };
}

/** 화면을 부드럽게 위아래로 옮겨 월드 y가 보이는 곳 맨 위 근처에 오게 */
function scrollToShow(worldY: number, area: Area): void {
  const v = viewportStore.getState();
  const dy = (worldY - area.y) * v.k;
  if (Math.abs(dy) < 1) return;
  const from = v.ty;
  const to = v.ty - dy;
  if (typeof requestAnimationFrame === "undefined") {
    viewportStore.getState().setView({ ...v, ty: to });
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / 320);
    const e = 1 - (1 - t) ** 3;
    viewportStore.getState().setView({ ...viewportStore.getState(), ty: from + (to - from) * e });
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 지금 화면에 보이는 캔버스 영역 (월드 좌표) */
export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}
