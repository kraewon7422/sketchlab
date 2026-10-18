import type { Fn, View } from "./sample";

/**
 * 보기 범위 정하기 — 교과서 규범 "축 단위 비율 1:1" (마스터스펙 v4 §11.2 a).
 *
 * x 범위는 정해 두고(기본 −5~5, 삼각함수 −2π~2π), y 범위는 그래프 상자 비율에 맞춰
 * **같은 길이 = 같은 픽셀**이 되게 정한다. 그래야 원이 원으로, y = x가 45°로 보인다.
 * y의 위치는 "곡선의 가운데 부분이 가장 많이 보이는 곳": x 범위 가운데 절반에서 함수값의
 * 중앙값을 중심으로 삼고, x축(y = 0)이 가까우면 보이게 끌어온다.
 */

export interface FitOptions {
  /** 그래프 상자 높이/폭 */
  aspect: number;
  xmin?: number;
  xmax?: number;
}

export function fitView(fns: readonly Fn[], options: FitOptions): View {
  const xmin = options.xmin ?? -5;
  const xmax = options.xmax ?? 5;
  const xspan = xmax - xmin;
  const yspan = xspan * options.aspect;

  const ys: number[] = [];
  for (const f of fns) {
    for (let i = 0; i <= 200; i++) {
      const x = xmin + xspan * (0.25 + (0.5 * i) / 200);
      let y: number;
      try {
        y = f(x);
      } catch {
        continue;
      }
      if (Number.isFinite(y)) ys.push(y);
    }
  }
  let center = 0;
  if (ys.length > 0) {
    ys.sort((a, b) => a - b);
    center = ys[Math.floor(ys.length / 2)] as number;
  }
  // x축이 화면 밖이지만 가까우면(반 화면 이내) 보이도록 옮긴다
  let ymin = center - yspan / 2;
  let ymax = center + yspan / 2;
  if (ymin > 0 && ymin < yspan * 0.5) {
    ymax -= ymin - yspan * 0.1;
    ymin = yspan * 0.1;
    ymin = ymax - yspan;
  } else if (ymax < 0 && ymax > -yspan * 0.5) {
    ymin += -ymax - yspan * 0.1;
    ymax = ymin + yspan;
  }
  // 깔끔한 값으로 (0.5 단위)
  const shift = Math.round(ymin * 2) / 2 - ymin;
  return { xmin, xmax, ymin: ymin + shift, ymax: ymax + shift };
}

/** 그래프 상자 안 x,y → 상자 로컬 px (y 위쪽이 +) */
export function toBox(view: View, w: number, h: number) {
  const sx = w / (view.xmax - view.xmin);
  const sy = h / (view.ymax - view.ymin);
  return {
    x: (x: number) => (x - view.xmin) * sx,
    y: (y: number) => (view.ymax - y) * sy,
    sx,
    sy,
  };
}
