import { itemAabb } from "../ink/editing";
import { themeCssVars } from "../render/theme";
import { inlineBlobImages } from "../store/media";
import { withAllRendered } from "../store/culling";
import { currentPage, paperOf } from "../store/pages";
import { sheetIndexAt, sheetRect, type Rect } from "../store/paper";
import { sessionStore } from "../store/session";
import { viewportStore } from "../store/viewport";
import { blobToDataUrl, embeddedKatexCss, embeddedPageFontsCss, toPng, type ExportResult, type Rendered } from "./exportImage";

/**
 * 쪽 전체 내보내기 (제안 #6) — 그 쪽의 손글씨·도형·배경·그래프·구조식·글 상자를 이미지 한 장으로.
 * PDF는 브라우저 인쇄의 "PDF로 저장"을 쓴다 (라이브러리 없이 태블릿·PC 모두).
 *
 *   캔버스 SVG(월드 좌표 그룹)를 복제 + 객체 층의 HTML을 foreignObject로 → SVG 한 장 → PNG
 *   화면에서 보이는 그대로가 나간다 (렌더러를 두 벌 두지 않는다).
 */

const SVGNS = "http://www.w3.org/2000/svg";
const XHTML = "http://www.w3.org/1999/xhtml";

/** 화면에서 지금 쓰는 스타일 중 글 상자(.sl-rich) 규칙만 모은다 — 체크 목록 모양 등 */
function richCss(): string {
  const out: string[] = [];
  for (const sheet of [...document.styleSheets]) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of [...rules]) if (r.cssText.includes(".sl-rich")) out.push(r.cssText);
  }
  const vars = Object.entries(themeCssVars())
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return `:root,div{${vars}}${out.join("")}`;
}

/**
 * 쪽 전체를 SVG 한 장으로. 빈 쪽이면 null.
 * region을 주면 그 사각형(월드)만 — 종이 모드의 종이 한 장.
 */
export async function pageToSvg(region?: Rect): Promise<Rendered | null> {
  // 화면 밖이라 그리지 않던 것까지 전부 그려 놓고 찍는다
  return withAllRendered(() => pageToSvgNow(region));
}

async function pageToSvgNow(region?: Rect): Promise<Rendered | null> {
  const items = sessionStore.getState().items;
  if (items.length === 0 && !region) return null;
  const main = document.querySelector("main")?.getBoundingClientRect();
  const { tx, ty, k } = viewportStore.getState();

  // 내용이 차지하는 월드 영역 — 객체는 화면에 실제로 그려진 크기로
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    let b = itemAabb(it); // 돌린 사진은 돌린 모양을 감싸는 상자
    const el = document.querySelector(`[data-overlay-id="${it.id}"]`);
    if (el && main) {
      const r = el.getBoundingClientRect();
      b = { minX: (r.left - main.left - tx) / k, minY: (r.top - main.top - ty) / k, maxX: (r.right - main.left - tx) / k, maxY: (r.bottom - main.top - ty) / k };
    }
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  const pad = region ? 0 : 32;
  if (region) {
    minX = region.x;
    minY = region.y;
    maxX = region.x + region.w;
    maxY = region.y + region.h;
  }
  const W = Math.ceil(maxX - minX + pad * 2);
  const H = Math.ceil(maxY - minY + pad * 2);
  const ox = -minX + pad;
  const oy = -minY + pad;

  // 1) 캔버스: 월드 좌표 그룹을 통째로 복제 (속지 배경 포함), 진행 중 획·올가미·커서는 뺀다
  const world = document.querySelector<SVGGElement>("main > svg > g");
  let canvasPart = "";
  if (world) {
    const g = world.cloneNode(true) as SVGGElement;
    g.removeAttribute("transform");
    g.querySelectorAll("path:not([d]), path[d=''], circle[visibility='hidden']").forEach((n) => n.remove());
    g.querySelectorAll(".sl-fade-out, [data-export-skip]").forEach((n) => n.remove());
    await inlineBlobImages(g);
    canvasPart = `<g transform="translate(${ox} ${oy})">${new XMLSerializer().serializeToString(g)}</g>`;
  }

  // 2) 객체 층(그래프·구조식·수식·글 상자): 같은 자리 그대로 foreignObject 안에
  // 객체 층 전체 (객체마다 돌리기·고르기 껍질에 싸여 있다 — 껍질째 복제해야 돌린 각도가 남는다)
  const layer = document.querySelector<HTMLElement>("main [data-overlay-layer]");
  let htmlPart = "";
  if (layer) {
    const clone = layer.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input, [data-export-skip], [data-text-editor]").forEach((n) => (n.closest("label") ?? n).remove());
    clone.querySelectorAll("[class*='sl-fade']").forEach((n) => n.classList.remove("sl-fade-in"));
    clone.style.cssText = `position:absolute;left:${ox}px;top:${oy}px`;
    clone.setAttribute("xmlns", XHTML);
    const css = (await embeddedKatexCss()) + (await embeddedPageFontsCss());
    htmlPart =
      `<foreignObject x="0" y="0" width="${W}" height="${H}">` +
      `<div xmlns="${XHTML}" style="position:relative;width:${W}px;height:${H}px;font-family:${getComputedStyle(document.body).fontFamily.replace(/"/g, "'")};color:#1A1A1A">` +
      `<style>${css}${richCss()}</style>${new XMLSerializer().serializeToString(clone)}</div></foreignObject>`;
  }

  const svg = `<svg xmlns="${SVGNS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${canvasPart}${htmlPart}</svg>`;
  return { svg, width: W, height: H };
}

/** 종이 모드: 지금 화면 가운데에 있는 장 (캔버스면 null) */
function sheetInView(): Rect | null {
  const paper = paperOf(currentPage());
  if (!paper) return null;
  const r = document.querySelector("main")?.getBoundingClientRect();
  const { tx, ty, k } = viewportStore.getState();
  const cx = ((r?.width ?? window.innerWidth) / 2 - tx) / k;
  const cy = ((r?.height ?? window.innerHeight) / 2 - ty) / k;
  return sheetRect(paper, sheetIndexAt(paper, cx, cy));
}

const fileName = (ext: string) => `${currentPage().title.replace(/[\\/:*?"<>|]/g, "_")}-${new Date().toISOString().slice(0, 10)}.${ext}`;

export async function downloadPagePng(): Promise<ExportResult> {
  try {
    const r = await pageToSvg(sheetInView() ?? undefined);
    if (!r) return { ok: false, message: "빈 쪽이에요" };
    const png = await toPng(r, "white", 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = fileName("png");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    return { ok: true, message: "쪽 전체를 이미지로 저장했어요" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
}

export async function sharePage(): Promise<ExportResult> {
  try {
    const r = await pageToSvg(sheetInView() ?? undefined);
    if (!r) return { ok: false, message: "빈 쪽이에요" };
    const file = new File([await toPng(r, "white", 2)], fileName("png"), { type: "image/png" });
    if (!navigator.canShare?.({ files: [file] })) return { ok: false, message: "이 기기는 공유 시트를 지원하지 않아요 · 이미지 저장을 써 주세요" };
    await navigator.share({ files: [file] });
    return { ok: true, message: "공유했어요" };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: true, message: "" };
    return { ok: false, message: "공유하지 못했어요" };
  }
}

/**
 * PDF: 쪽 이미지를 새 창에 A4 폭으로 놓고 인쇄 창을 연다 → "PDF로 저장".
 * (팝업이 막히면 이미지 저장으로 안내)
 */
export async function printPagePdf(): Promise<ExportResult> {
  const w = window.open("", "_blank");
  if (!w) return { ok: false, message: "새 창이 막혔어요 · 이미지 저장을 써 주세요" };
  try {
    // 종이 모드: 장마다 PDF 한 쪽 (여백 없이 종이 그대로) · 캔버스: 내용 전체를 한 장
    const paper = paperOf(currentPage());
    const regions: Array<Rect | undefined> = paper ? Array.from({ length: paper.sheets }, (_, i) => sheetRect(paper, i)) : [undefined];
    const urls: string[] = [];
    for (const region of regions) {
      const r = await pageToSvg(region);
      if (r) urls.push(await blobToDataUrl(await toPng(r, "white", 2)));
    }
    if (urls.length === 0) {
      w.close();
      return { ok: false, message: "빈 쪽이에요" };
    }
    const title = currentPage().title.replace(/</g, "&lt;");
    const pageCss = paper ? `@page{size:${paper.w}px ${paper.h}px;margin:0}` : "@page{margin:12mm}";
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
        `<style>${pageCss}html,body{margin:0}img{width:100%;height:auto;display:block;break-after:page}img:last-child{break-after:auto}</style></head>` +
        `<body>${urls.map((u) => `<img src="${u}" alt="">`).join("")}</body></html>`,
    );
    w.document.close();
    const imgs = [...w.document.querySelectorAll("img")];
    const go = () => {
      w.focus();
      w.print();
    };
    void Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((res) => (im.onload = res))))).then(go);
    return { ok: true, message: "인쇄 창에서 'PDF로 저장'을 고르세요" };
  } catch (e) {
    w.close();
    return { ok: false, message: e instanceof Error ? e.message : "PDF를 만들지 못했어요" };
  }
}
