/**
 * 정확한 분수 (선형대수용) — 교과서처럼 8/5를 1.6000000001이 아니라 8/5로.
 * bigint라 소거를 여러 번 해도 넘치지 않는다.
 */
export interface Frac {
  n: bigint;
  d: bigint;
}

const abs = (a: bigint) => (a < 0n ? -a : a);
function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

export function frac(n: bigint | number, d: bigint | number = 1n): Frac {
  let N = BigInt(n);
  let D = BigInt(d);
  if (D === 0n) throw new Error("0으로 나눌 수 없어요");
  if (D < 0n) {
    N = -N;
    D = -D;
  }
  const g = gcd(N, D);
  return { n: N / g, d: D / g };
}

export const ZERO = frac(0);
export const ONE = frac(1);
export const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
export const div = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);
export const neg = (a: Frac) => frac(-a.n, a.d);
export const isZero = (a: Frac) => a.n === 0n;
export const eq = (a: Frac, b: Frac) => a.n === b.n && a.d === b.d;
export const toNumber = (a: Frac) => Number(a.n) / Number(a.d);

/**
 * 소수 → 분수. 계산기로 얻은 계수(0.3333333333)도 1/3로 돌아온다.
 * 연분수로 분모 maxDen 이하에서 가장 가까운 분수를 찾고, 오차가 tol보다 크면 null.
 */
export function fromNumber(x: number, maxDen = 10000, tol = 1e-9): Frac | null {
  if (!Number.isFinite(x)) return null;
  if (Number.isInteger(x)) return frac(x);
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let v = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(v);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > maxDen) break;
    if (Math.abs(x - h1 / k1) < tol * Math.max(1, Math.abs(x))) return frac(h1, k1);
    const r = v - a;
    if (r < 1e-15) break;
    v = 1 / r;
  }
  return null;
}

/** LaTeX: 3, -\frac{8}{5} */
export function texFrac(a: Frac): string {
  if (a.d === 1n) return a.n.toString();
  const sign = a.n < 0n ? "-" : "";
  return `${sign}\\frac{${abs(a.n)}}{${a.d}}`;
}

/** 글자: 3, -8/5 (그래프 점 이름표) */
export function textFrac(a: Frac): string {
  const s = a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`;
  return s.replace("-", "−");
}
