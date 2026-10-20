import { IR_VERSION } from "@sketchlab/shared";
import { markFresh } from "../render/Shape2DView";
import { sessionStore } from "../store/session";
import { viewportStore } from "../store/viewport";
import type { Area } from "./placement";

/**
 * 사진 올리기 — 파일 고르기·붙여넣기·끌어다 놓기가 모두 여기로.
 * 큰 사진은 긴 변 MAX_SIDE px로 줄여 WebP(안 되면 PNG)로 넣는다 — 노트가 무거워지지 않게.
 * 사진은 손글씨 아래(맨 뒤)에 놓인다: 그 위에 바로 필기할 수 있다. 올가미로 골라 옮기기·크기·지우기.
 */
const MAX_SIDE = 1600;

/** 지금 화면에 보이는 캔버스 영역 (월드 좌표) */
export function visibleArea(): Area {
  const r = document.querySelector("main")?.getBoundingClientRect();
  const { tx, ty, k } = viewportStore.getState();
  const w = r?.width ?? window.innerWidth;
  const h = r?.height ?? window.innerHeight;
  const top = 56; // 노트 이름 막대 밑부터
  return { x: -tx / k, y: (top - ty) / k, width: w / k, height: (h - top) / k };
}

/** 그림 → (줄인) data URL + 크기 */
export async function rasterToData(source: CanvasImageSource & { width: number; height: number }, maxSide = MAX_SIDE, quality = 0.86): Promise<{ src: string; w: number; h: number }> {
  const k = Math.min(1, maxSide / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * k));
  const h = Math.max(1, Math.round(source.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("그림을 준비하지 못했어요");
  ctx.drawImage(source, 0, 0, w, h);
  let src = c.toDataURL("image/webp", quality);
  if (!src.startsWith("data:image/webp")) src = c.toDataURL("image/png");
  return { src, w, h };
}

export async function imageFileToData(file: Blob): Promise<{ src: string; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  try {
    return await rasterToData(bmp);
  } finally {
    bmp.close();
  }
}

/** 사진 한 장을 화면 가운데에 (보이는 폭의 60%를 넘지 않게) 맨 뒤로 넣는다. 새 객체 id */
export async function insertImageFile(file: File, at?: { x: number; y: number }): Promise<string> {
  const { src, w, h } = await imageFileToData(file);
  const area = visibleArea();
  const scale = Math.min(1, (area.width * 0.6) / w, (area.height * 0.7) / h);
  const W = w * scale;
  const H = h * scale;
  const x = at ? at.x - W / 2 : area.x + (area.width - W) / 2;
  const y = at ? at.y - H / 2 : area.y + (area.height - H) / 2;
  const id = sessionStore.getState().addObject(
    { version: IR_VERSION, confidence: 1, source: "manual", kind: "image", data: { src, w, h, ...(file.name ? { name: file.name } : {}) } },
    { x, y, scale },
    { minX: x, minY: y, maxX: x + W, maxY: y + H },
    { atBack: true },
  );
  markFresh(id);
  sessionStore.getState().setSelection([id]); // 바로 옮기거나 크기를 바꿀 수 있게
  return id;
}

export const isImageFile = (f: File): boolean => /^image\/(png|jpeg|webp|gif|bmp|avif|heic|heif)$/i.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif|heic)$/i.test(f.name);
export const isPdfFile = (f: File): boolean => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
