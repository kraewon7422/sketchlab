import { currentPage, paperOf } from "../store/pages";
import { sheetRect, type Rect } from "../store/paper";
import { sessionStore } from "../store/session";

/** 캔버스 쪽: 내용 왼쪽 위부터 종이 비율(3:4) 영역 — 글씨가 표지에 실제 크기 비율로 (너무 크게 부풀지 않게) */
function canvasRegion(): Rect | undefined {
  const items = sessionStore.getState().items;
  if (items.length === 0) return undefined;
  const minX = Math.min(...items.map((i) => i.bbox.minX));
  const minY = Math.min(...items.map((i) => i.bbox.minY));
  const maxX = Math.max(...items.map((i) => i.bbox.maxX));
  const w = Math.max(maxX - minX + 64, 720);
  return { x: minX - 32, y: minY - 32, w, h: (w * 4) / 3 };
}

/**
 * 노트 표지 — 지금 화면에 그려진 쪽을 작게 (보관함 카드의 미리보기).
 * 종이 모드면 첫 장, 캔버스면 내용 전체. 빈 쪽이면 없음 (카드에 빈 종이로 보인다).
 */
const COVER_W = 240;

export async function captureCover(): Promise<string | undefined> {
  const { pageToSvg } = await import("./pageExport");
  const { toPng } = await import("./exportImage");
  const paper = paperOf(currentPage());
  const r = await pageToSvg(paper ? sheetRect(paper, 0) : canvasRegion());
  if (!r) return undefined;
  const png = await toPng(r, "white", Math.min(1, (COVER_W * 2) / r.width));
  const bmp = await createImageBitmap(png);
  try {
    const w = COVER_W;
    const h = Math.round((COVER_W * bmp.height) / bmp.width);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = Math.min(h, Math.round(w * 1.6)); // 아주 긴 캔버스는 윗부분만
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, w, h);
    const url = c.toDataURL("image/webp", 0.72);
    return url.startsWith("data:image/webp") ? url : c.toDataURL("image/png");
  } finally {
    bmp.close();
  }
}
