/**
 * 디자인 토큰 — 단일 진실 (마스터스펙 §12.1).
 *
 * 규약 §2-7: 색·굵기·간격·모션 값은 반드시 이 파일의 토큰을 쓴다.
 * 컴포넌트에 하드코딩된 hex나 px가 보이면 그건 버그다.
 *
 * 이 값들은 두 경로로 소비된다:
 *   1) JS 직접 참조 — SVG 렌더러, three.js 재질, 캔버스 잉크
 *   2) CSS 변수 — themeCssVars()가 만들어 :root에 주입, Tailwind가 참조
 * 두 경로가 같은 상수를 보므로 색이 어긋날 수 없다.
 */
export const theme = {
  color: {
    bg: "#FFFFFF",
    ink: "#1A1A1A",
    sub: "#D4D4D4",
    accent: "#2563EB",
    danger: "#DC2626",
    ok: "#059669",
    /** 선택 채움 */
    selection: "rgba(37,99,235,0.12)",
    /** 활성 그룹 배경 힌트 */
    groupHint: "rgba(37,99,235,0.06)",
    /** 점근선 — 곡선보다 확실히 연하게 (E3) */
    asymptote: "#9CA3AF",
  },
  /** px 스케일. 이 배열 밖의 임의값 금지. */
  space: [0, 4, 8, 12, 16, 24, 32],
  radius: { s: 8, m: 12, sheet: 20 },
  /** 수식 폰트는 KaTeX가 관리한다. 여기서 다루지 않는다. */
  font: { ui: "'Pretendard Variable', Pretendard, system-ui, sans-serif" },
  motion: {
    fast: 150,
    base: 250,
    slow: 400,
    /** easeOutExpo 근사 */
    easeOut: "cubic-bezier(0.16,1,0.3,1)",
    /** OrbitControls의 dampingFactor와 공유 */
    spring: { damping: 0.08 },
  },
  /** 터치 타깃 최소 크기 (px) */
  touch: { minTarget: 44 },
} as const;

/** 선 굵기 — 교과서 시각 언어 (§8.1). 단위 px. */
export const stroke = {
  /** 주선 */
  main: 2,
  /** 보조선·격자 */
  sub: 1,
  /** 점근선 */
  asymptote: 1.5,
  /** 숨은선 대시 패턴 */
  hiddenDash: [4, 4],
  /** 점근선 대시 패턴 */
  asymptoteDash: [6, 4],
} as const;

export type Theme = typeof theme;

/**
 * 토큰을 CSS 커스텀 프로퍼티 맵으로 변환한다 (순수 함수 — DOM 불필요).
 *
 * 순수하게 유지하는 이유: 단위 테스트가 jsdom 없이 돌고,
 * "토큰이 실제로 CSS에 도달했는가"를 렌더링 없이 검증할 수 있다.
 */
export function themeCssVars(t: Theme = theme): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(t.color)) {
    vars[`--sl-color-${kebab(key)}`] = value;
  }
  t.space.forEach((px, i) => {
    vars[`--sl-space-${i}`] = `${px}px`;
  });
  for (const [key, px] of Object.entries(t.radius)) {
    vars[`--sl-radius-${kebab(key)}`] = `${px}px`;
  }
  vars["--sl-font-ui"] = t.font.ui;
  vars["--sl-motion-fast"] = `${t.motion.fast}ms`;
  vars["--sl-motion-base"] = `${t.motion.base}ms`;
  vars["--sl-motion-slow"] = `${t.motion.slow}ms`;
  vars["--sl-motion-ease-out"] = t.motion.easeOut;
  vars["--sl-touch-min"] = `${t.touch.minTarget}px`;

  return vars;
}

/** CSS 변수를 실제 엘리먼트에 주입한다. 앱 부팅 시 1회. */
export function applyThemeVars(
  el: { style: { setProperty(name: string, value: string): void } },
  t: Theme = theme,
): void {
  for (const [name, value] of Object.entries(themeCssVars(t))) {
    el.style.setProperty(name, value);
  }
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
