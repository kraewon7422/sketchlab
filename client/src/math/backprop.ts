/**
 * 신경망 학습 (역전파) — 그림 속 신경망을 진짜로 학습시킨다.
 *   은닉층 tanh, 출력층 시그모이드 σ, 오차 L = ½ Σ (ŷ − t)² (예시 평균)
 *   순전파: a⁽ˡ⁾ = f(W⁽ˡ⁾ a⁽ˡ⁻¹⁾ + b⁽ˡ⁾)
 *   역전파: 출력 δ = (ŷ − t)·σ′,  은닉 δ⁽ˡ⁾ = (W⁽ˡ⁺¹⁾ᵀ δ⁽ˡ⁺¹⁾)·tanh′   (연쇄 법칙)
 *   기울기: ∂L/∂W⁽ˡ⁾ = δ⁽ˡ⁾ a⁽ˡ⁻¹⁾ᵀ,  ∂L/∂b⁽ˡ⁾ = δ⁽ˡ⁾   →  w ← w − η ∂L/∂w
 * 예시(데이터)는 정해진 "선생님 규칙"으로 만든다 — 같은 층 구조면 언제나 같은 문제.
 */

export interface Net {
  layers: number[];
  /** W[l][j][i] — 층 l의 i번 뉴런 → 층 l+1의 j번 뉴런 */
  W: number[][][];
  b: number[][];
}
export interface Sample {
  x: number[];
  t: number[];
}
export interface Pass {
  /** 층마다 활성값 (a[0] = 입력) */
  a: number[][];
  /** 층마다 δ = ∂L/∂z (a[0] 자리는 빈 배열) */
  delta: number[][];
  /** gW[l][j][i] = ∂L/∂W */
  gW: number[][][];
  loss: number;
}

/** 씨앗으로 정해지는 난수 (mulberry32) */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

export function initNet(layers: number[], seed = 7): Net {
  const r = rng(seed);
  const W: number[][][] = [];
  const b: number[][] = [];
  for (let l = 1; l < layers.length; l++) {
    const nIn = layers[l - 1] as number;
    const nOut = layers[l] as number;
    // 자비에 초기화: 크기 ~ 1/√입력 수
    const s = Math.sqrt(3 / nIn);
    W.push(Array.from({ length: nOut }, () => Array.from({ length: nIn }, () => (r() * 2 - 1) * s)));
    b.push(new Array<number>(nOut).fill(0));
  }
  return { layers: [...layers], W, b };
}

/** 예시 n개: 입력 −1~1, 목표 = σ(3·c·x) (c는 정해진 "선생님" 가중치) — 배울 수 있는 문제 */
export function makeData(layers: number[], n = 6, seed = 11): Sample[] {
  const r = rng(seed);
  const nIn = layers[0] as number;
  const nOut = layers[layers.length - 1] as number;
  const c = Array.from({ length: nOut }, () => Array.from({ length: nIn }, () => r() * 2 - 1));
  return Array.from({ length: n }, () => {
    const x = Array.from({ length: nIn }, () => Math.round((r() * 2 - 1) * 100) / 100);
    const t = c.map((row) => Math.round(sigmoid(3 * row.reduce((s, w, i) => s + w * (x[i] as number), 0)) * 100) / 100);
    return { x, t };
  });
}

export function forward(net: Net, x: number[]): number[][] {
  const a: number[][] = [x];
  const L = net.W.length;
  for (let l = 0; l < L; l++) {
    const prev = a[l] as number[];
    const out = (net.W[l] as number[][]).map((row, j) => {
      const z = row.reduce((s, w, i) => s + w * (prev[i] as number), (net.b[l] as number[])[j] as number);
      return l === L - 1 ? sigmoid(z) : Math.tanh(z);
    });
    a.push(out);
  }
  return a;
}

/** 예시 하나의 순전파 + 역전파 */
export function backprop(net: Net, s: Sample): Pass {
  const a = forward(net, s.x);
  const L = net.W.length;
  const delta: number[][] = Array.from({ length: L + 1 }, () => []);
  const y = a[L] as number[];
  delta[L] = y.map((v, j) => (v - (s.t[j] as number)) * v * (1 - v));
  for (let l = L - 1; l >= 1; l--) {
    const next = delta[l + 1] as number[];
    const Wn = net.W[l] as number[][];
    delta[l] = (a[l] as number[]).map((v, i) => next.reduce((acc, d, j) => acc + d * ((Wn[j] as number[])[i] as number), 0) * (1 - v * v));
  }
  const gW = net.W.map((Wl, l) => Wl.map((row, j) => row.map((_, i) => ((delta[l + 1] as number[])[j] as number) * ((a[l] as number[])[i] as number))));
  const loss = 0.5 * y.reduce((acc, v, j) => acc + (v - (s.t[j] as number)) ** 2, 0);
  return { a, delta, gW, loss };
}

export function lossOf(net: Net, data: Sample[]): number {
  return data.reduce((acc, s) => {
    const y = forward(net, s.x)[net.W.length] as number[];
    return acc + 0.5 * y.reduce((q, v, j) => q + (v - (s.t[j] as number)) ** 2, 0);
  }, 0) / Math.max(1, data.length);
}

/** 예시 전체 평균 기울기로 한 걸음 — 새 신경망을 돌려준다 (원래 것은 그대로) */
export function trainStep(net: Net, data: Sample[], lr: number): Net {
  const gW = net.W.map((Wl) => Wl.map((row) => row.map(() => 0)));
  const gb = net.b.map((bl) => bl.map(() => 0));
  for (const s of data) {
    const p = backprop(net, s);
    p.gW.forEach((Wl, l) => Wl.forEach((row, j) => row.forEach((g, i) => ((gW[l] as number[][])[j] as number[])[i]! += g / data.length)));
    p.delta.slice(1).forEach((d, l) => d.forEach((g, j) => ((gb[l] as number[])[j]! += g / data.length)));
  }
  return {
    layers: net.layers,
    W: net.W.map((Wl, l) => Wl.map((row, j) => row.map((w, i) => w - lr * (((gW[l] as number[][])[j] as number[])[i] as number)))),
    b: net.b.map((bl, l) => bl.map((v, j) => v - lr * ((gb[l] as number[])[j] as number))),
  };
}
