import { themeCssVars } from "../render/theme";
import { currentPage } from "../store/pages";
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

/** 쪽 전체를 SVG 한 장으로. 빈 쪽이면 null */
export async function pageToSvg(): Promise<Rendered | null> {
  const items = sessionStore.getState().items;
  if (items.length === 0) return null;
  const main = document.querySelector("main")?.getBoundingClientRect();
  const { tx, ty, k } = viewportStore.getState();

  // 내용이 차지하는 월드 영역 — 객체는 화면에 실제로 그려진 크기로
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    let b = it.bbox;
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
  const pad = 32;
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
    canvasPart = `<g transform="translate(${ox} ${oy})">${new XMLSerializer().serializeToString(g)}</g>`;
  }

  // 2) 객체 층(그래프·구조식·수식·글 상자): 같은 자리 그대로 foreignObject 안에
  const layer = document.querySelector<HTMLElement>("main [data-overlay-id]")?.parentElement;
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

const fileName = (ext: string) => `${currentPage().title.replace(/[\\/:*?"<>|]/g, "_")}-${new Date().toISOString().slice(0, 10)}.${ext}`;

export async function downloadPagePng(): Promise<ExportResult> {
  try {
    const r = await pageToSvg();
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
    const r = await pageToSvg();
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
    const r = await pageToSvg();
    if (!r) {
      w.close();
      return { ok: false, message: "빈 쪽이에요" };
    }
    const url = await blobToDataUrl(await toPng(r, "white", 2));
    const title = currentPage().title.replace(/</g, "&lt;");
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
        `<style>@page{margin:12mm}html,body{margin:0}img{width:100%;height:auto;display:block}</style></head>` +
        `<body><img src="${url}" alt=""></body></html>`,
    );
    w.document.close();
    const img = w.document.querySelector("img");
    const go = () => {
      w.focus();
      w.print();
    };
    if (img && !img.complete) img.onload = go;
    else go();
    return { ok: true, message: "인쇄 창에서 'PDF로 저장'을 고르세요" };
  } catch (e) {
    w.close();
    return { ok: false, message: e instanceof Error ? e.message : "PDF를 만들지 못했어요" };
  }
}
