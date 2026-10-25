import type { Pt, View } from "./sample";

/**
 * 음함수 F(x, y) = 0 그리기 — marching squares (마스터스펙 v4 §11.3).
 * 격자 꼭짓점의 부호가 바뀌는 칸에서 경계를 찾아 짧은 선분들을 만든다.
 * (x² + y² = 1 처럼 y로 풀 수 없는 식을 위한 경로)
 *
 * 매끈하게 그리려고 세 가지를 더 한다:
 *  - 꼭짓점 값이 정확히 0이면 음수 쪽으로 본다. 곡선이 격자점(정수 좌표 등)을 지날 때
 *    "부호가 바뀌는 변"이 하나뿐이라 그 칸을 버려서 곡선이 끊겨 보이던 문제 (하트 곡선의 틈)
 *  - 곡선이 지나는 칸만 REFINE×REFINE로 더 잘게 나눈다 (전체를 촘촘히 하는 것보다 싸다)
 *  - 변 위의 교점은 직선 보간 대신 이분법으로 F = 0에 붙인다 (F가 3제곱처럼 휘어도 곡선 위에)
 */
const REFINE = 4;
const BISECT = 6;

export function marchingSquares(F: (x: number, y: number) => number, view: View, nx = 128, ny = 128): Pt[][] {
  const fx = nx * REFINE;
  const fy = ny * REFINE;
  const dx = (view.xmax - view.xmin) / fx;
  const dy = (view.ymax - view.ymin) / fy;
  const X = (i: number) => view.xmin + i * dx;
  const Y = (j: number) => view.ymin + j * dy;
  const safe = (x: number, y: number): number => {
    let v: number;
    try {
      v = F(x, y);
    } catch {
      v = NaN;
    }
    return Number.isFinite(v) ? v : NaN;
  };
  // 잘게 나눈 격자의 값 — 필요한 꼭짓점만 계산해 둔다 (같은 좌표는 언제나 같은 식으로 → 이웃 칸과 교점이 정확히 같다)
  const cache = new Map<number, number>();
  const V = (i: number, j: number): number => {
    const key = j * (fx + 1) + i;
    let v = cache.get(key);
    if (v === undefined) {
      v = safe(X(i), Y(j));
      cache.set(key, v);
    }
    return v;
  };
  const pos = (v: number) => v > 0;

  /** (x0,y0)[v0] ~ (x1,y1)[v1] 사이에서 F = 0인 점 */
  const cross = (x0: number, y0: number, v0: number, x1: number, y1: number, v1: number): Pt => {
    let lo = 0;
    let hi = 1;
    let vlo = v0;
    let vhi = v1;
    for (let k = 0; k < BISECT; k++) {
      const m = (lo + hi) / 2;
      const vm = safe(x0 + (x1 - x0) * m, y0 + (y1 - y0) * m);
      if (Number.isNaN(vm)) break;
      if (pos(vm) === pos(vlo)) {
        lo = m;
        vlo = vm;
      } else {
        hi = m;
        vhi = vm;
      }
    }
    // 남은 좁은 구간 안은 직선 보간 (값이 0인 끝점이면 그 점)
    const t = vlo !== vhi ? lo + (hi - lo) * Math.min(1, Math.max(0, vlo / (vlo - vhi))) : (lo + hi) / 2;
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  // 교점을 변마다 한 번만 계산해 이웃 칸이 같은 점을 쓰게 한다 (이어 붙이기가 정확해진다)
  const edgeCache = new Map<string, Pt>();
  const edge = (i0: number, j0: number, i1: number, j1: number): Pt => {
    const k = `${i0},${j0},${i1},${j1}`;
    let p = edgeCache.get(k);
    if (!p) {
      p = cross(X(i0), Y(j0), V(i0, j0), X(i1), Y(j1), V(i1, j1));
      edgeCache.set(k, p);
    }
    return p;
  };

  const segs: Pt[][] = [];
  // 꼭짓점 값이 0이면 양쪽 변의 교점이 같은 점 → 길이 0 선분은 버린다
  const push = (p: Pt, q: Pt) => {
    if (p[0] !== q[0] || p[1] !== q[1]) segs.push([p, q]);
  };
  /** 잘게 나눈 칸 하나 (꼭짓점 인덱스 i,j = 왼쪽 아래) */
  const cell = (i: number, j: number) => {
    const a = V(i, j);
    const b = V(i + 1, j);
    const c = V(i + 1, j + 1);
    const d = V(i, j + 1);
    if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) return;
    const pts: Pt[] = [];
    if (pos(a) !== pos(b)) pts.push(edge(i, j, i + 1, j));
    if (pos(b) !== pos(c)) pts.push(edge(i + 1, j, i + 1, j + 1));
    if (pos(c) !== pos(d)) pts.push(edge(i, j + 1, i + 1, j + 1));
    if (pos(d) !== pos(a)) pts.push(edge(i, j, i, j + 1));
    if (pts.length === 2) push(pts[0] as Pt, pts[1] as Pt);
    else if (pts.length === 4) {
      // 안장점 칸: 중심값으로 어느 쪽을 이을지 고른다
      const center = safe(X(i + 0.5), Y(j + 0.5));
      if (pos(center) === pos(a)) {
        push(pts[0] as Pt, pts[1] as Pt);
        push(pts[2] as Pt, pts[3] as Pt);
      } else {
        push(pts[0] as Pt, pts[3] as Pt);
        push(pts[1] as Pt, pts[2] as Pt);
      }
    }
  };

  for (let J = 0; J < ny; J++) {
    for (let I = 0; I < nx; I++) {
      const i0 = I * REFINE;
      const j0 = J * REFINE;
      const corners = [V(i0, j0), V(i0 + REFINE, j0), V(i0 + REFINE, j0 + REFINE), V(i0, j0 + REFINE)];
      if (corners.some(Number.isNaN)) continue;
      // 큰 칸의 네 귀퉁이 부호가 같으면 곡선이 지나지 않는다고 본다 (예전과 같은 판정)
      const s = pos(corners[0] as number);
      if (corners.every((v) => pos(v) === s)) continue;
      for (let j = j0; j < j0 + REFINE; j++) for (let i = i0; i < i0 + REFINE; i++) cell(i, j);
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
