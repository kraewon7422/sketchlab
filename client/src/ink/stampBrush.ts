import { strokeD } from "./brushes";
import { grainValues } from "./grain";
import type { Point } from "./types";

/**
 * 도장(dab) 브러시 엔진 — 연필 · 수채화 브러시 · 가져온 브러시.
 *
 * 그림 앱(Procreate, Painter, Krita)처럼 획을 따라 촘촘히 붓 모양(shape)을 찍고, 종이 결(grain)로 거른다.
 *   1. 경로를 Catmull-Rom으로 이어 간격(spacing × 크기)마다 도장 자리를 고른다
 *   2. 자리마다 필압 → 크기·진하기 (연필: 살살 = 종이 결이 비치고, 꾹 = 흑연이 뭉쳐 진하게)
 *   3. 도장은 색을 입힌 붓 모양 그림 — 돌리기: 획 방향을 따라 / 무작위 / 안 돌림
 *   4. 종이 결은 월드 좌표에 고정 (겹쳐 그어도 같은 결, 확대해도 지글거리지 않음)
 *   5. 수채화: 물감이 쌓이며 가장자리가 진해지는 젖은 가장자리(wet edge) + 화면에서는 곱하기 합성
 * 결과는 획 하나 = 그림 하나 (월드 상자 + data URL). 확대 단계마다 한 번씩만 다시 만든다.
 */

export interface StampBrush {
  id: string;
  name: string;
  /** 붓 모양 — 알파(흰 = 물감)가 든 정사각 그림 (data URL). 없으면 둥근 모양 */
  shape?: string | undefined;
  /** 둥근 모양일 때 가장자리 단단함 0(부드러움)~1(단단함) */
  hardness: number;
  /** 종이 결 — 그림(data URL) 또는 기본 결 이름 */
  grain?: string | undefined;
  /** 결이 묻는 정도 0~1 (0 = 결 없음) */
  grainDepth: number;
  /** 결 칸 크기 (월드 px) */
  grainScale: number;
  /** 도장 간격 (크기 대비) */
  spacing: number;
  /** 도장 하나의 진하기 */
  flow: number;
  /** 필압 → 크기, 필압 → 진하기 (0 = 영향 없음, 1 = 전부) */
  sizePressure: number;
  opacityPressure: number;
  /** 도장 돌리기 */
  rotation: "follow" | "random" | "none";
  /** 크기 떨림 0~1 */
  jitter: number;
  /** 수채화: 젖은 가장자리 · 곱하기 합성 */
  wet: boolean;
}

export const PENCIL: StampBrush = {
  id: "pencil",
  name: "연필",
  hardness: 0.55,
  grain: "pencil",
  grainDepth: 0.85,
  grainScale: 28,
  spacing: 0.12,
  flow: 0.55,
  sizePressure: 0.35,
  opacityPressure: 0.85,
  rotation: "random",
  jitter: 0.1,
  wet: false,
};

export const WATERCOLOR: StampBrush = {
  id: "brush",
  name: "수채화 브러시",
  hardness: 0.8,
  grain: "paper",
  grainDepth: 0.3,
  grainScale: 90,
  spacing: 0.06,
  flow: 0.09,
  sizePressure: 0.9,
  opacityPressure: 0.5,
  rotation: "random",
  jitter: 0.15,
  wet: true,
};

// ─────────────────────────────────────────────────────────── 그림 재료 (한 번만)

const shapeCache = new Map<string, HTMLCanvasElement>();
const imageCache = new Map<string, HTMLImageElement>();

/** data URL 그림 — 다 읽히면 다시 그리라고 알린다 */
function loadImage(url: string, onReady: () => void): HTMLImageElement | null {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    imageCache.set(url, img);
  }
  if (img.complete && img.naturalWidth > 0) return img;
  img.addEventListener("load", onReady, { once: true });
  return null;
}

/** 붓 모양에 색을 입힌 도장 (128×128) */
function tintedStamp(brush: StampBrush, color: string, onReady: () => void): HTMLCanvasElement | null {
  const key = `${brush.id}|${color}|${brush.hardness}`;
  const hit = shapeCache.get(key);
  if (hit) return hit;
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (brush.shape) {
    const img = loadImage(brush.shape, onReady);
    if (!img) return null;
    ctx.drawImage(img, 0, 0, S, S);
  } else {
    // 둥근 모양: 단단함만큼 가운데는 꽉, 가장자리로 갈수록 옅게
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(Math.max(0.01, Math.min(0.98, brush.hardness)), "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  // 색 입히기: 모양의 알파는 그대로, 색만 바꾼다
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  shapeCache.set(key, c);
  return c;
}

const grainCache = new Map<string, HTMLCanvasElement>();
/** 결 그림 (알파 = 묻는 정도) */
function grainTile(brush: StampBrush, onReady: () => void): HTMLCanvasElement | null {
  const name = brush.grain;
  if (!name) return null;
  const hit = grainCache.get(name);
  if (hit) return hit;
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(S, S);
  if (name === "pencil" || name === "paper") {
    const v = name === "pencil" ? grainValues(11, 0.62, 0.55) : grainValues(41, 0.75, 1.4, 1);
    for (let i = 0; i < v.length; i++) {
      img.data[i * 4 + 3] = Math.round((v[i] as number) * 255);
    }
    ctx.putImageData(img, 0, 0);
  } else {
    // 가져온 결 그림: 밝은 곳 = 묻는 곳
    const src = loadImage(name, onReady);
    if (!src) return null;
    ctx.drawImage(src, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < S * S; i++) {
      const lum = ((d.data[i * 4] as number) + (d.data[i * 4 + 1] as number) + (d.data[i * 4 + 2] as number)) / 3;
      d.data[i * 4 + 3] = Math.round(lum * ((d.data[i * 4 + 3] as number) / 255));
    }
    ctx.putImageData(d, 0, 0);
  }
  grainCache.set(name, c);
  return c;
}

// ─────────────────────────────────────────────────────────── 도장 자리

export interface Dab {
  x: number;
  y: number;
  p: number;
  /** 획 방향 (라디안) */
  dir: number;
}

/** 경로를 따라 간격마다 도장 자리 (필압은 사이를 이어 준다) */
export function placeDabs(points: readonly Point[], step: (p: number) => number): Dab[] {
  const n = points.length;
  if (n === 0) return [];
  const P = (i: number) => points[Math.max(0, Math.min(n - 1, i))] as Point;
  // 촘촘한 중심선 (Catmull-Rom)
  const line: Array<{ x: number; y: number; p: number }> = [{ x: P(0).x, y: P(0).y, p: P(0).p }];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const k = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 0.5));
    for (let j = 1; j <= k; j++) {
      const t = j / k;
      const t2 = t * t;
      const t3 = t2 * t;
      line.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        p: p1.p + (p2.p - p1.p) * t,
      });
    }
  }
  const out: Dab[] = [];
  let carry = 0;
  let dir = 0;
  out.push({ ...(line[0] as { x: number; y: number; p: number }), dir });
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as { x: number; y: number; p: number };
    const b = line[i] as { x: number; y: number; p: number };
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (seg === 0) continue;
    dir = Math.atan2(b.y - a.y, b.x - a.x);
    let d = step(a.p) - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, p: a.p + (b.p - a.p) * t, dir });
      d += step(a.p);
    }
    carry = seg - (d - step(a.p));
  }
  return out;
}

/** 같은 획은 늘 같은 떨림 (다시 그려도 모양이 그대로) */
function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

// ─────────────────────────────────────────────────────────── 그리기

export interface RasterStroke {
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 획 하나를 그림으로. width = 기본 굵기(월드 px), scale = 월드 1px당 화소 수.
 * 재료(가져온 그림)가 아직 안 읽혔으면 null — onReady가 불리면 다시 부른다.
 */
export function renderStampStroke(points: readonly Point[], brush: StampBrush, color: string, width: number, opacity: number, scale: number, seed: number, onReady: () => void): RasterStroke | null {
  if (typeof document === "undefined" || points.length === 0) return null;
  const stamp = tintedStamp(brush, color, onReady);
  if (!stamp) return null;
  const grain = brush.grainDepth > 0 ? grainTile(brush, onReady) : null;
  if (brush.grain && brush.grainDepth > 0 && !grain) return null;

  const size = (p: number) => width * (1 - brush.sizePressure + brush.sizePressure * Math.min(2, p * 2));
  const dabs = placeDabs(points, (p) => Math.max(0.25, size(p) * brush.spacing));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of dabs) {
    minX = Math.min(minX, d.x);
    minY = Math.min(minY, d.y);
    maxX = Math.max(maxX, d.x);
    maxY = Math.max(maxY, d.y);
  }
  const pad = width * 2.2 + 2;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const w = maxX - minX;
  const h = maxY - minY;
  // 너무 큰 그림은 해상도를 낮춘다 (한 변 4096 화소까지)
  const s = Math.min(scale, 4096 / Math.max(w, h));
  const cw = Math.max(1, Math.ceil(w * s));
  const ch = Math.max(1, Math.ceil(h * s));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(s, 0, 0, s, -minX * s, -minY * s);

  const r = rand(seed);
  if (brush.wet && !brush.shape) {
    // 수채화: 물감 한 번 = 끊김 없는 한 덩어리 (도장 구슬이 보이지 않게) — 필압 따라 굵어지는 매끈한 외곽선
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.fill(new Path2D(strokeD(points, { tool: "pen", brush: "brush", width })));
    ctx.globalAlpha = 1;
  } else
  for (const d of dabs) {
    const sz = size(d.p) * (1 - brush.jitter / 2 + brush.jitter * r());
    if (sz <= 0.05) continue;
    const a = brush.flow * (1 - brush.opacityPressure + brush.opacityPressure * Math.min(1, d.p * 2));
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    const rot = brush.rotation === "follow" ? d.dir : brush.rotation === "random" ? r() * Math.PI * 2 : 0;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(stamp, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // 수채화: 젖은 가장자리 — 물감이 가장자리로 밀려 진해진다 (흐린 사본과의 차이만큼 더한다)
  if (brush.wet) {
    const blur = document.createElement("canvas");
    blur.width = cw;
    blur.height = ch;
    const bctx = blur.getContext("2d");
    if (bctx) {
      bctx.filter = `blur(${Math.max(1.5, width * 0.18 * s)}px)`;
      bctx.drawImage(canvas, 0, 0);
      const A = ctx.getImageData(0, 0, cw, ch);
      const B = bctx.getImageData(0, 0, cw, ch);
      for (let i = 3; i < A.data.length; i += 4) {
        const a = A.data[i] as number;
        const edge = Math.max(0, a - (B.data[i] as number));
        // 안쪽은 맑게(옅게), 물감이 밀려난 가장자리는 진하게
        A.data[i] = Math.min(255, a * 0.8 + edge * 2.2);
      }
      ctx.putImageData(A, 0, 0);
    }
  }

  // 종이 결: 결의 알파만큼만 남긴다 (결 깊이만큼 섞어서)
  if (grain) {
    const pat = ctx.createPattern(grain, "repeat");
    if (pat) {
      const k = brush.grainScale / 128;
      pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
      const layer = document.createElement("canvas");
      layer.width = cw;
      layer.height = ch;
      const lctx = layer.getContext("2d");
      if (lctx) {
        lctx.setTransform(s, 0, 0, s, -minX * s, -minY * s);
        lctx.fillStyle = `rgba(0,0,0,${1 - brush.grainDepth})`;
        lctx.fillRect(minX, minY, w, h);
        lctx.fillStyle = pat;
        lctx.globalAlpha = brush.grainDepth;
        lctx.fillRect(minX, minY, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(layer, 0, 0);
        ctx.globalCompositeOperation = "source-over";
      }
    }
  }
  if (opacity < 1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = `rgba(0,0,0,${opacity})`;
    ctx.fillRect(0, 0, cw, ch);
  }
  return { url: canvas.toDataURL("image/png"), x: minX, y: minY, w, h };
}
