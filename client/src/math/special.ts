/**
 * 특수 곡선 — 식(LaTeX) 하나로 쓰기 어려운 유명한 곡선을 코드로 계산한다 (그래프 IR의 special).
 *
 *   zetaCritical   |ζ(½ + it)|   리만 제타 함수의 임계선 — 0이 되는 곳(영점)이 리만 가설의 그 영점들
 *   fourierSquare  사각파의 푸리에 급수 (4/π) Σ sin((2k−1)x)/(2k−1), 항 N개 — 깁스 현상
 *   taylorSin      sin x의 테일러 다항식 Σ (−1)ᵏ x²ᵏ⁺¹/(2k+1)!, 항 N개
 */

export type SpecialName = "zetaCritical" | "fourierSquare" | "taylorSin";

type C = [number, number];
const cdiv = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
/** n^(−s) = e^(−s ln n) */
const npow = (n: number, s: C): C => {
  const l = Math.log(n);
  const mag = Math.exp(-s[0] * l);
  return [mag * Math.cos(-s[1] * l), mag * Math.sin(-s[1] * l)];
};

/** Borwein 계수 (교대 급수 가속) — n이 정해지면 한 번만 */
const borweinCache = new Map<number, number[]>();
function borwein(n: number): number[] {
  const hit = borweinCache.get(n);
  if (hit) return hit;
  const d: number[] = [];
  let sum = 0;
  // d_k = n Σ_{i=0..k} (n+i−1)! 4^i / ((n−i)! (2i)!)
  const fact = (m: number) => {
    let r = 1;
    for (let i = 2; i <= m; i++) r *= i;
    return r;
  };
  for (let k = 0; k <= n; k++) {
    sum += (n * fact(n + k - 1) * 4 ** k) / (fact(n - k) * fact(2 * k));
    d.push(sum);
  }
  borweinCache.set(n, d);
  return d;
}

/**
 * ζ(s) (복소수) — 디리클레 에타 함수 η(s) = Σ (−1)ⁿ⁻¹ n⁻ˢ 를 Borwein 방법으로 빠르게 더하고 ζ = η / (1 − 2¹⁻ˢ).
 * 임계선에서 |t| ≤ 60 정도까지 그래프에 충분히 정확하다.
 */
export function zeta(s: C, n = 60): C {
  const d = borwein(n);
  const dn = d[n] as number;
  let eta: C = [0, 0];
  for (let k = 0; k < n; k++) {
    const sign = k % 2 === 0 ? 1 : -1;
    const w = (sign * (dn - (d[k] as number))) / dn;
    const p = npow(k + 1, s);
    eta = [eta[0] + w * p[0], eta[1] + w * p[1]];
  }
  // 1 − 2^(1−s)
  const two = npow(2, [s[0] - 1, s[1]]); // 2^(−(s−1))
  return cdiv(eta, [1 - two[0], -two[1]]);
}

export function special(name: SpecialName, x: number, params: Record<string, number>): number {
  const N = Math.max(1, Math.min(200, Math.round(params["N"] ?? 5)));
  switch (name) {
    case "zetaCritical": {
      const z = zeta([0.5, x]);
      return Math.hypot(z[0], z[1]);
    }
    case "fourierSquare": {
      let s = 0;
      for (let k = 1; k <= N; k++) s += Math.sin((2 * k - 1) * x) / (2 * k - 1);
      return (4 / Math.PI) * s;
    }
    case "taylorSin": {
      let s = 0;
      let term = x; // x^(2k+1)/(2k+1)!
      for (let k = 0; k < N; k++) {
        s += term;
        term *= (-x * x) / ((2 * k + 2) * (2 * k + 3));
      }
      return s;
    }
  }
}

export const SPECIAL_LATEX: Record<SpecialName, string> = {
  zetaCritical: "y=\\left|\\zeta\\left(\\tfrac12+ix\\right)\\right|",
  fourierSquare: "y=\\frac{4}{\\pi}\\sum_{k=1}^{N}\\frac{\\sin((2k-1)x)}{2k-1}",
  taylorSin: "y=\\sum_{k=0}^{N-1}\\frac{(-1)^k x^{2k+1}}{(2k+1)!}",
};

/** 입력 이름 → 특수 곡선 */
export function parseSpecial(input: string): SpecialName | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(리만\s*)?제타\s*(함수\s*)?(임계선|영점)|^riemann\s*(zeta|z)|^zeta\s*critical/.test(s)) return "zetaCritical";
  if (/^(푸리에\s*(급수\s*)?(사각파)?|사각파\s*푸리에)$|^fourier(\s*(series|square))*$/.test(s)) return "fourierSquare";
  if (/^(테일러\s*(급수\s*)?(sin|사인)?|sin\s*테일러)$|^taylor(\s*(series|sin))*$/.test(s)) return "taylorSin";
  return null;
}
