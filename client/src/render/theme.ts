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
  /**
   * 반응형 3단계 기준 폭 (px, v4 §15.2).
   * 갤럭시 탭 분할 화면 ≈ 600~900, 팝업 창·폰 < 480.
   */
  layout: { wide: 900, compact: 480 },
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

/** 손글씨 잉크 관련 값. 렌더링 굵기(stroke)와 구분해 둔다. */
export const ink = {
  /** 필압 0.5(=필압 미지원 입력) 기준 획 굵기 px */
  width: 2.6,
  /** 획 단위 지우개의 반경 px. 터치 최소 타깃보다 작아야 정밀하게 지워진다. */
  eraserRadius: 14,
  /**
   * 획을 확정할 때 적용하는 RDP 임계값 px.
   * 크게 잡으면 글씨가 각지고, 0에 가까우면 path가 비대해진다.
   */
  simplifyEpsilon: 0.6,
  /** 활성 그룹 하이라이트가 획에서 떨어지는 여백 px */
  groupHintPad: 8,
  /**
   * 그리고 멈추기 스냅 (v4 §9.1): 획 끝에서 펜을 이 시간(ms) 동안 거의 움직이지 않으면
   * 그 획 하나만 바로 도형으로 바꾼다. 삼성노트·아이패드의 "그리고 멈추기"와 같은 손동작.
   */
  holdMs: 550,
  /** 멈춤 판정 허용 흔들림 px */
  holdTolerance: 5,
  /** 멈춤 스냅을 허용하는 최소 획 길이 px — 점·짧은 획 오작동 방지 */
  holdMinLength: 30,
  /** S Pen 호버 커서 반지름 px */
  hoverRadius: 4,
  /** 탭 판정: 이동 px 미만 + 시간 ms 미만이면 그리기가 아니라 탭(객체 선택) */
  tapMaxMove: 6,
  tapMaxMs: 350,
  /** 탭으로 객체를 고를 때 bbox 바깥 여유 px */
  tapSlop: 8,
} as const;

/** 펜 팔레트 — 자주 쓰는 색 + 무지개·색상/채도/밝기로 아무 색이나, 굵기는 슬라이더 */
export const penOpts = {
  colors: ["#1A1A1A", "#2563EB", "#DC2626", "#16A34A", "#EA580C", "#7C3AED"],
  colorNames: ["검정", "파랑", "빨강", "초록", "주황", "보라"],
  highlightColors: ["#FACC15", "#4ADE80", "#F472B6", "#60A5FA"],
  highlightNames: ["노랑", "연두", "분홍", "하늘"],
  /** 굵기 슬라이더 범위 px (필압 0.5 기준) */
  penWidth: { min: 0.8, max: 12, default: 2.6 },
  highlightWidth: { min: 6, max: 48, default: 18 },
  /** 무지개 줄의 채도·밝기 — 펜은 진하게, 형광펜은 밝게 */
  rainbowPen: { s: 80, l: 42 },
  rainbowHighlight: { s: 90, l: 62 },
  /** 형광펜은 반투명 + 곱하기 합성: 아래 글씨가 비쳐 보인다 */
  highlightOpacity: 0.38,
  /** 흔들림 보정 기본값 (0~1) — 속도 적응이 있어 빨리 쓸 때는 어차피 꺼진다 */
  defaultSmoothing: 0.25,
  /** 지우개 반지름 슬라이더 (화면 px) */
  eraserSize: { min: 4, max: 60, default: 14 },
  /** 보정 100%일 때 "줄" 길이 (화면 px) — 이보다 작은 떨림은 선에 안 나타난다 */
  stabilizeMaxPx: 9,
} as const;

/** 페이지 배경 (노트 속지) — 글씨를 방해하지 않게 아주 옅게. 단위 월드 px */
export const pageBg = {
  ruledGap: 34,
  ruledLine: "#C9D7EA",
  /** 줄 노트 왼쪽 여백선 */
  marginX: 72,
  marginLine: "#F2B8B5",
  gridGap: 24,
  gridLine: "#E3E9F1",
  /** 그래프 용지: 작은 칸 · 큰 칸(5칸마다) */
  graphMinor: 10,
  graphMajor: 50,
  graphMinorLine: "#E8EEF6",
  graphMajorLine: "#C7D5E8",
  dotGap: 24,
  dot: "#C5CFDB",
} as const;

/** 캔버스 이동·확대 (v4 §12.2) — 두 손가락 핀치, 마우스 휠, Ctrl+휠. */
export const viewport = {
  minZoom: 0.5,
  maxZoom: 6,
  /** 손을 뗄 때 이 안쪽이면 100%로 맞춘다 (노트 앱처럼) */
  snapToOne: 0.07,
  /** 휠 한 단위(deltaY 1)당 확대 비율 지수 */
  wheelZoom: 0.0015,
} as const;

/** 그래프 객체 (§11). 단위 월드 px. */
export const plot = {
  /** 기본 그래프 폭 — 화면이 좁으면 줄인다 */
  width: 420,
  /** 높이/폭 */
  aspect: 0.75,
  /** 눈금 표시 길이 */
  tick: 4,
  /** 축 끝 화살촉 */
  arrow: 7,
  /** 눈금 라벨 글자 크기 */
  labelSize: 11,
  /** 여러 함수일 때 색 순서 — 첫째는 잉크색 */
  palette: ["#1A1A1A", "#2563EB", "#DC2626", "#059669"],
  /** 넓이 음영 */
  shade: "rgba(37,99,235,0.14)",
  shadeNegative: "rgba(220,38,38,0.12)",
} as const;

/** 노트로 내보내기 (§14). */
export const exportOpts = {
  /** PNG 배율 — 노트에서 확대해도 선명하게 */
  scale: 3,
  /** 여백 = 객체 크기의 이 비율 (최소 8px) */
  padding: 0.06,
  /** 흰 배경이 기본 — 투명이면 다크 모드 노트에서 검은 선이 안 보인다 */
  background: "white" as "white" | "transparent",
} as const;

/** 입체도형 객체 (§12). */
export const solid = {
  /** 그림 상자 한 변 px */
  size: 280,
  /** 기본 시점 (도) — 교과서 겨냥도처럼 약간 왼쪽 위에서 */
  yawDeg: -35,
  pitchDeg: 22,
  /** 숨은선: 실선보다 가늘고 점선 */
  hiddenWidth: 1.3,
  hiddenDash: "5 4",
  /** 드래그 1px당 회전 (라디안) */
  dragGain: 0.011,
  /** 관성 감쇠 (1/초) — 시간 기반이라 60Hz·120Hz에서 같은 손맛 */
  inertiaDecay: 4.5,
  /** 시점 복귀 애니메이션 ms */
  resetMs: 600,
} as const;

/** 화학 구조식 (§13). 교과서 골격식 관행: 결합선 같은 굵기, 원소 기호는 고딕. */
export const chem = {
  /** 결합 하나의 길이 px */
  bond: 36,
  lineWidth: 1.6,
  /** 이중·삼중 결합 선 간격 (결합 길이 비율) */
  multiGap: 0.2,
  /** 고리 안쪽 이중선을 양 끝에서 줄이는 비율 */
  innerTrim: 0.16,
  /** 원소 기호 글자 크기 (결합 길이 비율) */
  fontScale: 0.48,
  /** 기호가 있는 원자에서 결합선을 끊는 반지름 (결합 길이 비율) */
  labelGap: 0.3,
  /** 방향족 고리 안 원 = 고리 안쪽 거리 × 이 값 */
  circleRatio: 0.62,
  font: "Helvetica, Arial, 'Noto Sans KR', sans-serif",
} as const;

/** 인식된 평면도형 그리기 값 (§11.1 교과서 시각 언어). 단위 월드 px. */
export const shape = {
  /** 화살촉 길이 */
  arrowHead: 12,
  /** 화살촉 반각 (도) */
  arrowSpreadDeg: 24,
  /** 직각 표시 한 변 */
  rightAngle: 10,
  /** 객체 히트 판정 여유 (지우개) */
  hitPad: 6,
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
