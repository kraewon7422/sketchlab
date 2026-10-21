import type { CodeOutput } from "@sketchlab/shared";
import type { WebR } from "webr";

/**
 * R을 기기 안에서 (webR — R을 웹어셈블리로). 처음 한 번 R(약 20 MB)을 webr.r-wasm.org에서 받는다.
 * 같은 노트의 셀끼리 변수를 나눠 쓴다. plot()은 그림으로 결과에 붙는다.
 * GitHub Pages는 교차 출처 격리를 못 켜서 PostMessage 통로를 쓴다 (실행 중 끊기는 못 함 → 너무 길면 R을 새로).
 */
const BASE = "https://webr.r-wasm.org/v0.6.0/";
let r: Promise<WebR> | null = null;

async function getR(): Promise<WebR> {
  r ??= (async () => {
    const { WebR, ChannelType } = await import("webr");
    const w = new WebR({ baseUrl: BASE, channelType: ChannelType.PostMessage, interactive: false });
    await w.init();
    return w;
  })();
  try {
    return await r;
  } catch (e) {
    r = null;
    throw e;
  }
}

export function rLoaded(): boolean {
  return r !== null;
}

/** R을 끝내고 처음부터 (변수 지우기·너무 오래 걸릴 때) */
export function resetR(): void {
  const old = r;
  r = null;
  void old?.then((w) => w.close()).catch(() => undefined);
}

async function bitmapToPng(img: ImageBitmap): Promise<CodeOutput | null> {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return { t: "image", src: c.toDataURL("image/png"), w: img.width, h: img.height };
}

export async function runR(code: string, onLoading: () => void, onRunning: () => void): Promise<{ items: CodeOutput[]; ms: number }> {
  if (!r) onLoading();
  const w = await getR();
  onRunning();
  const t0 = performance.now();
  const shelter = await new w.Shelter();
  const items: CodeOutput[] = [];
  try {
    const cap = await shelter.captureR(code, { withAutoprint: true, captureStreams: true, captureConditions: false, captureGraphics: { width: 560, height: 380 } });
    let text = "";
    let err = "";
    for (const o of cap.output) {
      if (o.type === "stdout") text += `${String(o.data)}\n`;
      else if (o.type === "stderr") err += `${String(o.data)}\n`;
    }
    if (text) items.push({ t: "text", text: text.slice(0, 19900) });
    if (err) items.push({ t: "text", text: err.slice(0, 6000), error: true });
    for (const img of cap.images.slice(0, 4)) {
      const png = await bitmapToPng(img);
      if (png) items.push(png);
    }
  } catch (e) {
    items.push({ t: "text", text: (e instanceof Error ? e.message : String(e)).replace(/^Error:\s*/, "오류: ").slice(0, 4000), error: true });
  } finally {
    await shelter.purge();
  }
  return { items, ms: performance.now() - t0 };
}
