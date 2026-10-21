import { inlineBlobImages } from "../store/media";
import katexCss from "katex/dist/katex.min.css?inline";
import type { CanvasItem } from "../ink/types";
import { itemAabb, rotOf } from "../ink/editing";
import { exportOpts } from "../render/theme";

/**
 * 객체 → 노트에 붙일 이미지 (마스터스펙 v4 §14, P6). 이 모듈은 lazy — 내보낼 때만 실린다.
 *
 *   화면에 그려진 DOM을 복제 → 독립 SVG 한 장(수식 HTML은 foreignObject, KaTeX CSS·폰트는 data URI로 동봉)
 *   → 캔버스에 3배로 그림 → PNG
 *
 * 왜 화면 DOM을 복제하나: 렌더러를 두 벌(화면용·내보내기용) 두면 언젠가 어긋난다. 보이는 그대로가 나간다.
 * 배경 기본값은 흰색 — 투명 PNG는 노트 앱 다크 모드에서 검은 선이 안 보인다 (v4 G4).
 */

const XHTML = "http://www.w3.org/1999/xhtml";
const SVGNS = "http://www.w3.org/2000/svg";

let fontCss: Promise<string> | null = null;

/** KaTeX CSS의 woff2 폰트를 data URI로 바꿔 넣는다 (이미지 안에서는 외부 파일을 못 불러온다). 1회만. */
export function embeddedKatexCss(): Promise<string> {
  fontCss ??= (async () => {
    // woff·ttf 대체 소스는 버린다 — woff2만으로 충분하고 용량이 3배 줄어든다
    let css = katexCss.replace(/,\s*url\([^)]*\.woff\)\s*format\("woff"\)/g, "").replace(/,\s*url\([^)]*\.ttf\)\s*format\("truetype"\)/g, "");
    const urls = [...new Set([...css.matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => (m[1] as string).replace(/["']/g, "")))];
    const data = await Promise.all(
      urls.map(async (u) => {
        try {
          const blob = await (await fetch(new URL(u, document.baseURI))).blob();
          return [u, await blobToDataUrl(blob)] as const;
        } catch {
          return [u, u] as const; // 폰트 하나 실패해도 내보내기는 계속 (대체 글꼴로)
        }
      }),
    );
    for (const [u, d] of data) css = css.split(u).join(d);
    return css;
  })();
  return fontCss;
}

/**
 * 그림 안에 넣을 글꼴 — 화면에서 이미 내려받은 글꼴 조각(woff2)만 골라 @font-face로 넣는다.
 * (KaTeX 말고 글 상자 글씨체: Pretendard·나눔명조·나눔손글씨 펜.) 내보낸 그림이 화면과 같은 글씨체가 된다.
 */
export async function embeddedPageFontsCss(): Promise<string> {
  const loaded = new Set(
    performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((n) => n.endsWith(".woff2")),
  );
  const rules: string[] = [];
  for (const sheet of [...document.styleSheets]) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of [...list]) {
      if (!(r instanceof CSSFontFaceRule) || /KaTeX/i.test(r.style.getPropertyValue("font-family"))) continue;
      const m = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(r.style.getPropertyValue("src"));
      const url = m?.[1] ? new URL(m[1], sheet.href ?? document.baseURI).href : null;
      if (!url || !loaded.has(url)) continue;
      try {
        const data = await blobToDataUrl(await (await fetch(url)).blob());
        rules.push(r.cssText.replace(/src:[^;]+;/, `src: url(${data}) format("woff2");`));
      } catch {
        /* 글꼴 하나 실패해도 내보내기는 계속 (대체 글꼴로) */
      }
    }
  }
  return rules.join("");
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export interface Rendered {
  svg: string;
  width: number;
  height: number;
}

/** 화면에서 이 객체를 그리고 있는 요소를 찾아 독립 SVG 문자열로 */
export async function objectToSvg(item: CanvasItem): Promise<Rendered> {
  const pad = Math.max(8, Math.round(Math.max(item.bbox.maxX - item.bbox.minX, item.bbox.maxY - item.bbox.minY) * exportOpts.padding));

  // 1) 평면도형·잉크: 캔버스 SVG 안의 <g>
  // (사진은 <g>가 아니라 <image> 하나)
  const g =
    document.querySelector<SVGGElement>(`g[data-object-id="${item.id}"]`) ??
    document.querySelector<SVGElement>(`image[data-object-id="${item.id}"]`) ??
    document.querySelector<SVGGElement>(`g[data-ink-id="${item.id}"]`);
  if (g) {
    const clone = g.cloneNode(true) as SVGElement;
    await inlineBlobImages(clone);
    clone.querySelectorAll(".sl-fade-out").forEach((n) => n.remove()); // 교체 애니메이션의 옛 잉크
    clone.querySelectorAll("[class]").forEach((n) => n.removeAttribute("class"));
    // 돌린 사진: 돌린 모양 그대로 (자리 상자 가운데 둘레로), 그림 크기는 돌린 모양을 감싸는 상자
    const rot = rotOf(item);
    const b = item.bbox;
    const { minX, minY, maxX, maxY } = itemAabb(item);
    const w = Math.ceil(maxX - minX + pad * 2);
    const h = Math.ceil(maxY - minY + pad * 2);
    const body = new XMLSerializer().serializeToString(clone);
    const inner = rot ? `<g transform="rotate(${rot} ${(b.minX + b.maxX) / 2} ${(b.minY + b.maxY) / 2})">${body}</g>` : body;
    const svg = `<svg xmlns="${SVGNS}" width="${w}" height="${h}" viewBox="${minX - pad} ${minY - pad} ${w} ${h}">${inner}</svg>`;
    return { svg, width: w, height: h };
  }

  // 2) 그래프·입체·수식: HTML 층의 상자 — foreignObject로 통째로
  const box = document.querySelector<HTMLElement>(`[data-overlay-id="${item.id}"]`);
  if (!box) throw new Error("화면에서 이 객체를 찾지 못했어요");
  // getBoundingClientRect는 화면 확대가 곱해진 크기 — offset 크기가 원래(월드) 크기다
  const rect = { width: box.offsetWidth, height: box.offsetHeight };
  const clone = box.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input, [data-export-skip]").forEach((n) => (n.closest("label") ?? n).remove()); // 슬라이더·안내 문구
  clone.style.position = "static";
  clone.style.left = clone.style.top = "";
  clone.style.margin = `${pad}px`;
  clone.removeAttribute("class");
  clone.querySelectorAll("[class*='sl-']").forEach((n) => n.setAttribute("class", (n.getAttribute("class") ?? "").replace(/\bsl-[\w-]+\b/g, "")));
  clone.setAttribute("xmlns", XHTML);
  // 돌린 그래프·그림: 돌린 모양을 감싸는 크기의 칸 가운데에 돌려 놓는다
  const rot = rotOf(item);
  const ra = (rot * Math.PI) / 180;
  const fw = rot ? Math.abs(rect.width * Math.cos(ra)) + Math.abs(rect.height * Math.sin(ra)) : rect.width;
  const fh = rot ? Math.abs(rect.width * Math.sin(ra)) + Math.abs(rect.height * Math.cos(ra)) : rect.height;
  if (rot) {
    clone.style.margin = "0";
    clone.style.position = "absolute";
    clone.style.left = `${pad + (fw - rect.width) / 2}px`;
    clone.style.top = `${pad + (fh - rect.height) / 2}px`;
    clone.style.transform = `rotate(${rot}deg)`;
    clone.style.transformOrigin = "center";
  }
  const w = Math.ceil(fw + pad * 2);
  const h = Math.ceil(fh + pad * 2);
  const css = (await embeddedKatexCss()) + (await embeddedPageFontsCss());
  const font = getComputedStyle(document.body).fontFamily;
  const html = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="${SVGNS}" width="${w}" height="${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">` +
    `<div xmlns="${XHTML}" style="position:relative;width:${w}px;height:${h}px;font-family:${font.replace(/"/g, "'")};color:#1A1A1A">` +
    `<style>${css}</style>${html}</div></foreignObject></svg>`;
  return { svg, width: w, height: h };
}

/** SVG → PNG (3배, 기본 흰 배경) */
export async function toPng(r: Rendered, background: "white" | "transparent" = exportOpts.background, scale: number = exportOpts.scale): Promise<Blob> {
  // ⚠️ blob: URL로 불러오면 Chrome이 foreignObject(수식 HTML)가 든 SVG를 "오염(tainted)"으로 보고
  //    toBlob을 막는다. data: URL은 막지 않는다 (실측). 그래서 data: URL로 그린다.
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.svg)}`;
  {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("그림을 만들지 못했어요"));
      img.src = url;
    });
    const s = scale;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(r.width * s);
    canvas.height = Math.round(r.height * s);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스를 쓸 수 없어요");
    if (background === "white") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.scale(s, s);
    ctx.drawImage(img, 0, 0, r.width, r.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG를 만들지 못했어요"))), "image/png"),
    );
  }
}

/**
 * 끌어다 놓기용 PNG data URL (분할 화면에서 노트 앱으로 드래그, v4 §14.3 경로 ①).
 * blob: URL은 다른 앱이 읽을 수 없어서 data: URL로 준다.
 */
export async function pngDataUrl(item: CanvasItem): Promise<string> {
  return blobToDataUrl(await toPng(await objectToSvg(item)));
}

/** SVG → PNG data URL (AI에 보낼 손글씨 그림 — 크기는 호출측이 정한다) */
export async function svgToPngDataUrl(r: Rendered, scale = 1): Promise<string> {
  return blobToDataUrl(await toPng(r, "white", scale));
}

export type ExportResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * 클립보드로 복사. ClipboardItem에 **Promise를 그대로** 넘긴다 — 이미지 만드는 동안 기다렸다가
 * write를 부르면 사용자 동작(탭)과 멀어져 Safari·일부 Android에서 거부된다 (함정 #6).
 */
export async function copyImage(item: CanvasItem): Promise<ExportResult> {
  if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    return { ok: false, message: "이 브라우저는 이미지 복사를 지원하지 않아요 · 저장을 눌러 주세요" };
  }
  try {
    const png = objectToSvg(item).then((r) => toPng(r));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return { ok: true, message: "복사했어요 · 노트에서 길게 눌러 붙여넣기" };
  } catch {
    return { ok: false, message: "복사가 막혔어요 · 저장이나 공유를 써 주세요" };
  }
}

export async function downloadImage(item: CanvasItem): Promise<ExportResult> {
  try {
    const png = await toPng(await objectToSvg(item));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = `sketchlab-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    return { ok: true, message: "이미지로 저장했어요" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "저장하지 못했어요" };
  }
}

export async function shareImage(item: CanvasItem): Promise<ExportResult> {
  try {
    const png = await toPng(await objectToSvg(item));
    const file = new File([png], "sketchlab.png", { type: "image/png" });
    if (!navigator.canShare?.({ files: [file] })) return { ok: false, message: "이 기기는 공유 시트를 지원하지 않아요 · 저장을 써 주세요" };
    await navigator.share({ files: [file] });
    return { ok: true, message: "공유했어요" };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: true, message: "" }; // 사용자가 닫음
    return { ok: false, message: "공유하지 못했어요 · 저장을 써 주세요" };
  }
}
