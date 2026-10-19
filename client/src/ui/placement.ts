import { theme } from "../render/theme";
import { sessionStore } from "../store/session";

/**
 * 새 객체 자리: 위에서부터 훑으며 기존 잉크·객체와 겹치지 않는 첫 자리.
 * 빈 자리가 없으면 가운데 (겹치더라도 보이게).
 */
export function freeSpot(w: number, h: number, area: Area): { x: number; y: number } {
  const gap = theme.space[5];
  const items = sessionStore.getState().items;
  const taken = items.map((i) => i.bbox);
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
  // 보이는 곳에 빈 자리가 없다: 한가운데에 겹쳐 쌓지 말고 비스듬히 엇갈려 놓는다
  const k = items.filter((i) => i.kind === "object").length % 6;
  return {
    x: Math.max(left, Math.min(right - w, left + k * theme.space[6])),
    y: Math.max(top, Math.min(bottom - h, top + k * theme.space[6])),
  };
}

/** 지금 화면에 보이는 캔버스 영역 (월드 좌표) */
export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}
