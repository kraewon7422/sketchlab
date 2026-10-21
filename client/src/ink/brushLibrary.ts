import JSZip from "jszip";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { PENCIL, WATERCOLOR, type StampBrush } from "./stampBrush";

/**
 * 내 브러시 — 인터넷에서 받은 브러시를 가져와 펜으로 쓴다.
 *   그림 파일(PNG·JPG·WebP): 붓 모양으로 (투명한 곳 = 안 묻음, 흰 바탕이면 어두운 곳 = 묻음)
 *   Procreate 브러시(.brush) · 브러시 묶음(.brushset): 압축을 풀어 Shape.png(모양)·Grain.png(결)을 꺼낸다
 * 모양은 128 화소로 줄여 이 기기에만 저장한다 (localStorage "sketchlab.brushes").
 * 획에는 브러시 id만 남는다 — 그 브러시가 없는 기기에서는 같은 굵기의 펜으로 보인다.
 */

const KEY = "sketchlab.brushes";
const MAX = 24;

export const BUILTIN: Record<string, StampBrush> = { pencil: PENCIL, brush: WATERCOLOR };

function load(): StampBrush[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as StampBrush[]) : [];
    return Array.isArray(list) ? list.filter((b) => b && typeof b.id === "string" && typeof b.name === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export const brushStore = createStore<{ custom: StampBrush[] }>(() => ({ custom: typeof localStorage === "undefined" ? [] : load() }));
export const useBrushes = () => useStore(brushStore, (s) => s.custom);

function save(list: StampBrush[]): void {
  brushStore.setState({ custom: list });
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 저장 공간이 모자라면 이번 세션만 */
  }
}

export function customBrush(id: string | undefined): StampBrush | undefined {
  return id ? brushStore.getState().custom.find((b) => b.id === id) : undefined;
}

export function removeBrush(id: string): void {
  save(brushStore.getState().custom.filter((b) => b.id !== id));
}

/** 그림 → 128×128 알파 모양 (data URL) */
async function toShape(blob: Blob, invertIfOpaque: "auto" | "white-paints"): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("그림을 읽지 못했어요");
  // 가운데에 맞춰 정사각으로
  const k = Math.min(S / bmp.width, S / bmp.height);
  ctx.drawImage(bmp, (S - bmp.width * k) / 2, (S - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
  const d = ctx.getImageData(0, 0, S, S);
  let transparent = 0;
  let lumSum = 0;
  for (let i = 0; i < S * S; i++) {
    if ((d.data[i * 4 + 3] as number) < 250) transparent++;
    lumSum += ((d.data[i * 4] as number) + (d.data[i * 4 + 1] as number) + (d.data[i * 4 + 2] as number)) / 3;
  }
  const hasAlpha = transparent > S * S * 0.05;
  // Procreate 모양은 검은 바탕의 흰 모양(흰 = 묻음). 흰 바탕 그림이면 어두운 곳이 묻는다
  const whitePaints = invertIfOpaque === "white-paints" || lumSum / (S * S) < 128;
  for (let i = 0; i < S * S; i++) {
    const lum = ((d.data[i * 4] as number) + (d.data[i * 4 + 1] as number) + (d.data[i * 4 + 2] as number)) / 3;
    const a = hasAlpha ? (d.data[i * 4 + 3] as number) : whitePaints ? lum : 255 - lum;
    d.data[i * 4] = 255;
    d.data[i * 4 + 1] = 255;
    d.data[i * 4 + 2] = 255;
    d.data[i * 4 + 3] = a;
  }
  ctx.putImageData(d, 0, 0);
  return c.toDataURL("image/png");
}

async function smallImage(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  c.getContext("2d")?.drawImage(bmp, 0, 0, S, S);
  return c.toDataURL("image/png");
}

const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function fromShape(name: string, shape: string, grain?: string): StampBrush {
  return {
    id: newId(),
    name: name.slice(0, 24),
    shape,
    hardness: 1,
    ...(grain ? { grain } : {}),
    grainDepth: grain ? 0.7 : 0,
    grainScale: 64,
    spacing: 0.1,
    flow: 0.7,
    sizePressure: 0.7,
    opacityPressure: 0.4,
    rotation: "random",
    jitter: 0.1,
    wet: false,
  };
}

/** 파일 → 브러시들 (가져온 개수를 돌려준다) */
export async function importBrushFile(file: File): Promise<number> {
  const lower = file.name.toLowerCase();
  const base = file.name.replace(/\.[^.]+$/, "");
  const found: StampBrush[] = [];
  if (/\.(png|jpe?g|webp)$/.test(lower) || file.type.startsWith("image/")) {
    found.push(fromShape(base, await toShape(file, "auto")));
  } else if (/\.(brush|brushset|zip)$/.test(lower)) {
    const zip = await JSZip.loadAsync(file);
    // 브러시마다 폴더 하나 (묶음) 또는 맨 위 (낱개): 폴더 → Shape.png / Grain.png
    const folders = new Map<string, { shape?: JSZip.JSZipObject; grain?: JSZip.JSZipObject }>();
    zip.forEach((path, entry) => {
      const m = /^(.*?)([^/]+)\.png$/i.exec(path);
      if (!m || entry.dir) return;
      const dir = m[1] as string;
      const nm = (m[2] as string).toLowerCase();
      const f = folders.get(dir) ?? {};
      if (nm === "shape") f.shape = entry;
      if (nm === "grain") f.grain = entry;
      folders.set(dir, f);
    });
    let k = 0;
    for (const [dir, f] of folders) {
      if (!f.shape) continue;
      k++;
      const shape = await toShape(await f.shape.async("blob"), "white-paints");
      const grain = f.grain ? await smallImage(await f.grain.async("blob")) : undefined;
      const label = dir.replace(/\/$/, "").split("/").pop() || (folders.size > 1 ? `${base} ${k}` : base);
      found.push(fromShape(folders.size > 1 && label.length > 20 ? `${base} ${k}` : label, shape, grain));
    }
    if (found.length === 0) throw new Error("이 파일에서 브러시 모양(Shape.png)을 찾지 못했어요");
  } else if (lower.endsWith(".abr")) {
    throw new Error("포토샵 브러시(.abr)는 아직 못 읽어요 — 브러시 모양 PNG나 Procreate 브러시(.brush)를 넣어 주세요");
  } else {
    throw new Error("PNG·JPG 그림이나 Procreate 브러시(.brush · .brushset)를 넣어 주세요");
  }
  save([...brushStore.getState().custom, ...found].slice(-MAX));
  return found.length;
}
