import type { Pt, View } from "./sample";

/**
 * 음함수 F(x, y) = 0 그리기 — marching squares (마스터스펙 v4 §11.3).
 * 격자 꼭짓점의 부호가 바뀌는 칸에서 선형 보간으로 경계를 찾아 짧은 선분들을 만든다.
 * (x² + y² = 1 처럼 y로 풀 수 없는 식을 위한 경로)
 */
export function marchingSquares(F: (x: number, y: number) => number, view: View, nx = 128, ny = 128): Pt[][] {
  const dx = (view.xmax - view.xmin) / nx;
  const dy = (view.ymax - view.ymin) / ny;
  const val: number[] = new Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      let v: number;
      try {
        v = F(view.xmin + i * dx, view.ymin + j * dy);
      } catch {
        v = NaN;
      }
      val[j * (nx + 1) + i] = Number.isFinite(v) ? v : NaN;
    }
  }
  const V = (i: number, j: number) => val[j * (nx + 1) + i] as number;
  const segs: Pt[][] = [];
  const lerp = (x0: number, y0: number, v0: number, x1: number, y1: number, v1: number): Pt => {
    const t = v0 / (v0 - v1);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = view.xmin + i * dx;
      const y0 = view.ymin + j * dy;
      const x1 = x0 + dx;
      const y1 = y0 + dy;
      const a = V(i, j);
      const b = V(i + 1, j);
      const c = V(i + 1, j + 1);
      const d = V(i, j + 1);
      if ([a, b, c, d].some(Number.isNaN)) continue;
      const pts: Pt[] = [];
      if (a * b < 0) pts.push(lerp(x0, y0, a, x1, y0, b));
      if (b * c < 0) pts.push(lerp(x1, y0, b, x1, y1, c));
      if (c * d < 0) pts.push(lerp(x1, y1, c, x0, y1, d));
      if (d * a < 0) pts.push(lerp(x0, y1, d, x0, y0, a));
      if (pts.length === 2) segs.push(pts);
      else if (pts.length === 4) {
        // 안장점 칸: 중심값으로 어느 쪽을 이을지 고른다
        const center = (a + b + c + d) / 4;
        if (center * a > 0) segs.push([pts[0] as Pt, pts[1] as Pt], [pts[2] as Pt, pts[3] as Pt]);
        else segs.push([pts[0] as Pt, pts[3] as Pt], [pts[1] as Pt, pts[2] as Pt]);
      }
    }
  }
  return joinSegments(segs, Math.min(dx, dy) * 1e-6);
}

/** 끝점이 맞닿는 선분들을 긴 꺾은선으로 이어 붙인다 (path가 짧아지고 선 이음새가 사라진다) */
function joinSegments(segs: Pt[][], eps: number): Pt[][] {
  const key = (p: Pt) => `${Math.round(p[0] / eps)}:${Math.round(p[1] / eps)}`;
  const byEnd = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of [s[0] as Pt, s[1] as Pt]) {
      const k = key(p);
      const list = byEnd.get(k) ?? [];
      list.push(i);
      byEnd.set(k, list);
    }
  });
  const used = new Uint8Array(segs.length);
  const out: Pt[][] = [];
  const extend = (line: Pt[], atEnd: boolean) => {
    for (;;) {
      const tip = atEnd ? (line[line.length - 1] as Pt) : (line[0] as Pt);
      const next = (byEnd.get(key(tip)) ?? []).find((i) => !used[i]);
      if (next === undefined) return;
      used[next] = 1;
      const s = segs[next] as Pt[];
      const other = key(s[0] as Pt) === key(tip) ? (s[1] as Pt) : (s[0] as Pt);
      if (atEnd) line.push(other);
      else line.unshift(other);
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [...(segs[i] as Pt[])];
    extend(line, true);
    extend(line, false);
    out.push(line);
  }
  return out;
}
