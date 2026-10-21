import type { Fn, SampleResult, View } from "./sample";

/**
 * 점근선 검출 (마스터스펙 v4 §11.2 c) — "극한 개념이 코드가 되는 지점".
 *
 * 수직: 샘플러가 남긴 "진짜 끊김" 중, 한쪽 값이라도 화면 밖으로 발산하는 곳.
 *       (계단 함수처럼 화면 안에서 끊기거나, √x 처럼 정의역 경계에서 유한한 값이면 점근선이 아니다)
 * 수평: x → ±∞ 에서 함수값이 상수로 수렴하는 곳 (먼 곳 두 점에서 값이 같고, 화면 끝과는 다름).
 *       상수 함수 자체(y = 3)는 점근선이 아니다.
 */

export interface Asymptotes {
  vertical: number[];
  horizontal: number[];
}

function snap(x: number, tol: number): number {
  // π/12 배수 또는 1/12 배수에 가까우면 그 값으로 (tan의 π/2, 1/x의 0 등이 정확히 찍히게)
  for (const unit of [Math.PI / 12, 1 / 12]) {
    const k = Math.round(x / unit);
    if (Math.abs(x - k * unit) < tol) return k * unit || 0; // −0 방지
  }
  return x;
}

export function findAsymptotes(f: Fn, view: View, sampled: SampleResult): Asymptotes {
  const yspan = view.ymax - view.ymin;
  const xspan = view.xmax - view.xmin;
  const outside = (y: number) => Number.isFinite(y) && (y > view.ymax + 0.1 * yspan || y < view.ymin - 0.1 * yspan);

  const vertical: number[] = [];
  for (const b of sampled.breaks) {
    if (!(outside(b.left) || outside(b.right))) continue;
    // 양쪽 값이 있고 화면 높이보다 작게 뛰면 계단(가우스 기호 등) — 점근선은 한쪽이 끝없이 커진다
    if (Number.isFinite(b.left) && Number.isFinite(b.right) && Math.abs(b.left - b.right) < yspan) continue;
    const x = snap(b.x, xspan * 2e-3);
    if (!vertical.some((v) => Math.abs(v - x) < xspan * 1e-3)) vertical.push(x);
  }

  const horizontal: number[] = [];
  const val = (x: number) => {
    try {
      const y = f(x);
      return Number.isFinite(y) ? y : NaN;
    } catch {
      return NaN;
    }
  };
  for (const dir of [1, -1]) {
    const edge = dir > 0 ? view.xmax : view.xmin;
    const far1 = edge + dir * xspan * 50;
    const far2 = edge + dir * xspan * 500;
    const a = val(far1);
    const b = val(far2);
    const e = val(edge);
    if ([a, b, e].some(Number.isNaN)) continue;
    const converged = Math.abs(a - b) < yspan * 2e-3;
    const approaching = Math.abs(e - b) > yspan * 1e-3; // 화면 끝에선 아직 다르다 → 상수 함수 제외
    const inView = b > view.ymin - 0.05 * yspan && b < view.ymax + 0.05 * yspan;
    if (!converged || !approaching || !inView) continue;
    const c = (Math.abs(b - Math.round(b)) < yspan * 2e-3 ? Math.round(b) : b) || 0;
    if (!horizontal.some((h) => Math.abs(h - c) < yspan * 1e-3)) horizontal.push(c);
  }

  return { vertical, horizontal };
}
