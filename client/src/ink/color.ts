/**
 * 색 변환 — 팔레트의 색상(H)·채도(S)·밝기(L) 슬라이더 ↔ 저장하는 #RRGGBB.
 * 저장은 hex 하나로 통일한다 (SVG·내보내기·비교가 단순).
 */

export interface Hsl {
  /** 0~360 */
  h: number;
  /** 0~100 */
  s: number;
  /** 0~100 */
  l: number;
}

export function hslToHex({ h, s, l }: Hsl): string {
  const S = Math.min(100, Math.max(0, s)) / 100;
  const L = Math.min(100, Math.max(0, l)) / 100;
  const H = ((h % 360) + 360) % 360;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => {
    const k = (n + H / 30) % 12;
    const c = L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

export function hexToHsl(hex: string): Hsl {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 10 };
  const n = parseInt(m[1] as string, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** 무지개 12색 (색상환을 30°씩) — 펜은 진하게, 형광펜은 밝게 */
export function rainbow(s: number, l: number): string[] {
  return Array.from({ length: 12 }, (_, i) => hslToHex({ h: i * 30, s, l }));
}
