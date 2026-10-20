import { IR_VERSION } from "@sketchlab/shared";
import type { ObjectItem } from "../ink/types";
import { addPageWith } from "../store/pageActions";
import { A4, sheetRect, type Paper } from "../store/paper";
import { newId } from "../store/session";
import { rasterToData } from "./insertMedia";

/**
 * PDF 가져오기 — PDF 한 권 = 새 쪽 하나 (세로로 넘기는 종이 모드), PDF 한 쪽 = 종이 한 장.
 * 각 장에 PDF 쪽 그림을 잠근 배경으로 깔아 두고, 그 위에 바로 필기한다 (삼성노트 PDF 필기처럼).
 * pdf.js는 PDF를 처음 열 때만 내려받는다.
 */
const MAX_PAGES = 300;
/** PDF 쪽을 그릴 폭 px — 종이 폭(794)의 약 2배라 확대해도 글자가 또렷하다 */
const RENDER_W = 1600;

export async function importPdf(file: File, onProgress?: (done: number, total: number) => void): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (e) {
    throw new Error(e instanceof Error && /password/i.test(e.message) ? "암호가 걸린 PDF는 열 수 없어요" : "PDF를 열지 못했어요", { cause: e });
  }
  const total = Math.min(doc.numPages, MAX_PAGES);
  const first = (await doc.getPage(1)).getViewport({ scale: 1 });
  // 종이 크기 = 첫 쪽 비율 (폭은 A4 폭)
  const paper: Paper = { layout: "vertical", sheets: total, w: A4.w, h: Math.round((A4.w * first.height) / first.width) };

  const items: ObjectItem[] = [];
  for (let n = 1; n <= total; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: RENDER_W / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport, background: "#FFFFFF" }).promise;
    const { src, w, h } = await rasterToData(canvas, RENDER_W, 0.82);
    page.cleanup();
    // 장 안에 맞춰 (비율이 다른 쪽은 가운데)
    const r = sheetRect(paper, n - 1);
    const scale = Math.min(r.w / w, r.h / h);
    const x = r.x + (r.w - w * scale) / 2;
    const y = r.y + (r.h - h * scale) / 2;
    items.push({
      id: newId("obj"),
      kind: "object",
      ir: { version: IR_VERSION, confidence: 1, source: "manual", kind: "image", data: { src, w, h, name: `${file.name} ${n}쪽` } },
      transform: { x, y, scale },
      bbox: { minX: x, minY: y, maxX: x + w * scale, maxY: y + h * scale },
      sourceStrokes: [],
      locked: true,
    });
    onProgress?.(n, total);
  }
  await doc.cleanup();

  const title = file.name.replace(/\.pdf$/i, "").slice(0, 60) || "PDF";
  await addPageWith({ title, background: "blank", layout: "vertical", sheets: total, sheetW: paper.w, sheetH: paper.h }, items);
  return doc.numPages > MAX_PAGES ? `PDF 앞 ${MAX_PAGES}쪽을 새 쪽 "${title}"으로 넣었어요` : `PDF ${total}쪽을 새 쪽 "${title}"으로 넣었어요 · 그 위에 바로 쓰세요`;
}
