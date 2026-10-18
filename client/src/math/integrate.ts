import type { Fn } from "./sample";

/**
 * 정적분 수치 계산 — 기호 적분(Compute Engine)이 실패했을 때의 폴백 (마스터스펙 v4 §11.5).
 * 합성 심프슨 1/3 법, n = 512 (짝수). 구간 안에 정의되지 않는 점이 있으면 NaN.
 */
export function simpson(f: Fn, a: number, b: number, n = 512): number {
  if (a === b) return 0;
  const m = n % 2 === 0 ? n : n + 1;
  const h = (b - a) / m;
  let sum = 0;
  for (let i = 0; i <= m; i++) {
    const y = f(a + i * h);
    if (!Number.isFinite(y)) return NaN;
    sum += y * (i === 0 || i === m ? 1 : i % 2 === 1 ? 4 : 2);
  }
  return (sum * h) / 3;
}
