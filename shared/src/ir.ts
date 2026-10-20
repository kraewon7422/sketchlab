/**
 * Scene IR v4 — 인식기와 렌더러 사이의 유일한 계약 (마스터스펙 v4 §8).
 *
 *   스트로크/이미지/수동입력 → [인식기] → SceneIR → [렌더러] → 화면/내보내기
 *
 * 원칙 (§8.1)
 *  - 좌표는 정규화된 값만. 캔버스 픽셀 금지.
 *    shape2d는 "객체 로컬 좌표": 1 = 객체 transform.scale px, 원점 = transform.(x,y).
 *  - 수식은 LaTeX, 화학은 SMILES가 단일 진실. 파생 좌표는 저장하지 않는다.
 *  - 외부 입력(VLM 응답·사용자 편집·링크 해시)은 경계에서 반드시 parse 한다.
 *  - v3 → v4: 새 필드는 전부 optional 또는 default. 구버전 데이터는 migrate.ts 가 올린다.
 *
 * D1: kind와 data의 짝은 z.discriminatedUnion 으로 스키마 수준에서 강제된다.
 *     평면 유니온이었던 v2에서는 kind:"chem" + shape2d 데이터가 통과했다.
 *
 * ⚠️ 이 스키마는 VLM에게 직접 주지 않는다 (§8.3). 튜플·default 때문에 구조화 출력
 *    스키마로 부적합하다. VLM용 평탄한 "와이어 스키마"는 P3b에서 wire.ts로 따로 만든다.
 */
import { z } from "zod";

export const IR_VERSION = "4.0";

/** 정규화 좌표 [x, y] */
const Vec2 = z.tuple([z.number(), z.number()]);

/** 정규화 3D 좌표 [x, y, z] */
const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

// ─────────────────────────────────────────────────────────── 평면도형

const Shape2D = z.object({
  primitives: z
    .array(
      z.discriminatedUnion("t", [
        z.object({ t: z.literal("line"), a: Vec2, b: Vec2 }),
        z.object({ t: z.literal("circle"), c: Vec2, r: z.number().positive() }),
        z.object({
          t: z.literal("arc"),
          c: Vec2,
          r: z.number().positive(),
          from: z.number(),
          to: z.number(),
        }),
        z.object({
          t: z.literal("polygon"),
          pts: z.array(Vec2).min(3),
          closed: z.boolean(),
        }),
        z.object({ t: z.literal("arrow"), a: Vec2, b: Vec2 }),
        /** 포물선 구간 = 정확히 2차 베지어 (p0 → 제어점 c → p1) */
        z.object({ t: z.literal("parabola"), p0: Vec2, c: Vec2, p1: Vec2 }),
        /** 타원. rot = 장축 방향(라디안) */
        z.object({
          t: z.literal("ellipse"),
          c: Vec2,
          rx: z.number().positive(),
          ry: z.number().positive(),
          rot: z.number(),
        }),
        /**
         * 매끈한 자유 곡선 — 제어점을 지나는 Catmull-Rom 스플라인.
         * 같은 점이 두 번 연속되면 그 자리는 뾰족한 모서리로 그린다.
         */
        z.object({ t: z.literal("curve"), pts: z.array(Vec2).min(2), closed: z.boolean() }),
      ]),
    )
    .min(1),
  /** 선 색 — 색 펜으로 그린 도형은 정리한 뒤에도 그 색 (없으면 기본 잉크색) */
  color: z.string().optional(),
  /** 선 굵기 px (없으면 교과서 기본 굵기) — 형광펜으로 그린 도형을 정리하면 그 굵기 */
  width: z.number().positive().optional(),
  /** 형광펜 모양 (반투명·겹치면 곱하기) */
  highlight: z.boolean().optional(),
  labels: z.array(z.object({ text: z.string(), at: Vec2 })).optional(),
  marks: z
    .array(
      z.object({
        t: z.enum(["rightAngle", "tick", "angleArc"]),
        at: Vec2,
        /** 직각 표시의 두 변 방향(단위벡터). 없으면 렌더러가 그리지 않는다. */
        dirs: z.tuple([Vec2, Vec2]).optional(),
      }),
    )
    .optional(),
});

// ─────────────────────────────────────────────────────────── 입체도형

/**
 * 카탈로그 (v4 §8.2 — M7). 일반 2D→3D 재구성은 범위 밖이고,
 * "카탈로그 중 무엇 + 비율"만 인식한다는 방식은 그대로다. 목록만 교과 기준으로 늘렸다.
 */
export const SOLID_KINDS = [
  // 정다면체 5종 + 직육면체
  "cube",
  "box",
  "tetrahedron",
  "octahedron",
  "dodecahedron",
  "icosahedron",
  // n각기둥·n각뿔·n각뿔대 (params.n)
  "prism",
  "pyramid",
  "frustum",
  // 회전체
  "cylinder",
  "cone",
  "conicalFrustum",
  "sphere",
  "hemisphere",
] as const;

const Solid3D = z.object({
  solid: z.enum(SOLID_KINDS),
  /** 예: {n:6, r:1, h:2, r2:0.5} */
  params: z.record(z.string(), z.number()),
  /** 교과서 선화가 기본. shaded는 면에 은은한 음영 */
  style: z.enum(["line", "shaded"]).default("line"),
  showEdges: z.boolean().default(true),
  showHiddenEdges: z.boolean().default(true),
  /** 단면 렌더는 P8 백로그 (E6). 필드만 예약해 둔다. */
  crossSection: z.object({ normal: Vec3, offset: z.number() }).optional(),
  labels: z.array(z.object({ text: z.string(), vertex: z.number().int() })).optional(),
  /** 보는 각도 (라디안). 돌려 놓은 그대로 저장·내보내기 된다 */
  view: z.object({ yaw: z.number(), pitch: z.number() }).optional(),
});

// ─────────────────────────────────────────────────────────── 공간좌표 (v4 M1)

/** 계수 슬라이더 (v4 M2). 한 글자 계수만 — x,y,t 등은 분류기가 미리 거른다. */
const Param = z.object({
  name: z.string().regex(/^[a-zA-Z]$/),
  value: z.number(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
});

const Space3D = z.object({
  /** 각 축 [-range, range] */
  view: z.object({
    range: z.number().positive().default(5),
    /** 축마다 따로 정한 범위 [−a, a] (축 패널). 없으면 셋 다 range */
    axes: z.object({ x: z.number().positive(), y: z.number().positive(), z: z.number().positive() }).optional(),
  }),
  points: z.array(z.object({ at: Vec3, label: z.string().optional() })).optional(),
  vectors: z
    .array(z.object({ from: Vec3, to: Vec3, label: z.string().optional() }))
    .optional(),
  segments: z.array(z.object({ a: Vec3, b: Vec3 })).optional(),
  lines: z
    .array(z.object({ point: Vec3, dir: Vec3, label: z.string().optional() }))
    .optional(),
  /** n·x = d */
  planes: z
    .array(z.object({ normal: Vec3, d: z.number(), label: z.string().optional() }))
    .optional(),
  /** z = f(x,y). v3의 plot3d를 흡수했다 */
  surfaces: z.array(z.object({ latex: z.string() })).optional(),
  /**
   * 좌표 속 입체 — 구·원기둥(축에 나란한)·평행육면체(세 벡터 a, b, c가 o에서).
   * 식(x²+y²+z²=9 등)에서 알아본 것. 평행육면체는 부피 |a·(b×c)|를 캡션에 쓴다.
   */
  shapes: z
    .array(
      z.discriminatedUnion("t", [
        z.object({ t: z.literal("sphere"), c: Vec3, r: z.number().positive() }),
        z.object({ t: z.literal("cylinder"), axis: z.enum(["x", "y", "z"]), c: Vec3, r: z.number().positive() }),
        z.object({ t: z.literal("parallelepiped"), o: Vec3, a: Vec3, b: Vec3, c: Vec3 }),
      ]),
    )
    .optional(),
  /** 그림 아래 식 (LaTeX) — 입력한 식·부피 계산 */
  caption: z.string().optional(),
  /** 곡면 식의 계수 슬라이더 (z = a·sin(bx) 의 a, b) */
  params: z.array(Param).max(4).optional(),
  /** 점에서 각 좌표평면으로 점선 수선 — 교과서 공간좌표 그림의 핵심 */
  showProjections: z.boolean().default(false),
  /** 보는 각도 (라디안) */
  view3: z.object({ yaw: z.number(), pitch: z.number() }).optional(),
});

// ─────────────────────────────────────────────────────────── 평면좌표·그래프

const Plot2D = z.object({
  functions: z
    .array(
      z.object({
        /** 단일 진실. 별도의 expr 필드를 두지 않는다. */
        latex: z.string(),
        /** inequality: 부등식 영역 (y > x², x²+y² ≤ 4, 1 < x+y < 3, ⌊x⌋ …) — 참인 곳을 칠한다 */
        kind: z.enum(["explicit", "parametric", "implicit", "polar", "inequality"]),
        domain: z.tuple([z.number(), z.number()]).optional(),
        color: z.string().optional(),
      }),
    )
    // 차트(막대·산점도)만 있는 그림은 함수가 없을 수 있다
    .min(0),
  view: z.object({
    xmin: z.number(),
    xmax: z.number(),
    ymin: z.number(),
    ymax: z.number(),
    /** E4: 과학 그래프의 축 이름. LaTeX 허용 ("시간 $t$ (s)") */
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    /** E1: 기본 1:1. 원이 원으로, y=x가 45°로 보여야 한다. */
    aspect: z.enum(["equal", "auto"]).default("equal"),
    /** v4: π 눈금을 명시할 수 있다. auto면 렌더러가 삼각함수를 감지한다 (E2). */
    xTicks: z.enum(["auto", "pi"]).default("auto"),
  }),
  grid: z.boolean().default(false),
  /** 축·눈금·축 이름을 그릴지 (끄면 곡선만) */
  showAxes: z.boolean().default(true),
  /** 그래프 아래 식(이름)을 보여 줄지 */
  showCaption: z.boolean().default(true),
  points: z.array(z.object({ at: Vec2, label: z.string().optional() })).optional(),
  params: z.array(Param).max(4).optional(),
  /** 넓이 음영 (v4 M3) */
  shade: z
    .array(
      z.object({
        /** functions 인덱스 */
        fn: z.number().int().min(0),
        from: z.number(),
        to: z.number(),
        /** x축과의 사이, 또는 다른 함수(인덱스)와의 사이 */
        against: z.union([z.literal("axis"), z.number().int().min(0)]).default("axis"),
        showValue: z.boolean().default(true),
      }),
    )
    .optional(),
  annotations: z.array(z.enum(["roots", "yIntercept", "extrema"])).optional(),
  /** 그래프 아래에 보여 줄 원래 식 (LaTeX). 정적분처럼 그린 함수와 입력 식이 다를 때 쓴다. */
  caption: z.string().optional(),
  /** 막대 — 이산 확률분포(이항·포아송)와 막대그래프. on = 강조(구하는 확률의 범위) */
  bars: z.array(z.object({ x: z.number(), h: z.number(), on: z.boolean().optional(), label: z.string().optional() })).optional(),
  /** 막대 폭 (x 단위, 기본 0.8) */
  barWidth: z.number().positive().optional(),
  /** 자료 점·꺾은선 (산점도·꺾은선그래프) */
  series: z.array(z.object({ pts: z.array(Vec2), line: z.boolean(), color: z.string().optional(), label: z.string().optional() })).optional(),
  /** x축을 숫자 대신 이름으로 (막대그래프: x = 1, 2, 3 … 자리에 이 이름) */
  xCategories: z.array(z.string()).optional(),
  /** 투퍼의 자기 참조 공식 — k(아주 큰 정수, 17의 배수)부터 17줄 × 106칸 그림 */
  tupper: z.object({ k: z.string().regex(/^\d+$/) }).optional(),
  /**
   * 확률분포 그래프의 분포 (막대를 톡 · 음영 끝을 끌면 확률을 다시 계산한다).
   * p: normal [μ, σ] · binomial [n, p] · poisson [λ] · uniform [a, b] · exponential [λ]
   */
  dist: z
    .object({
      kind: z.enum(["normal", "binomial", "poisson", "uniform", "exponential"]),
      p: z.array(z.number()).min(1).max(2),
      latex: z.string(),
    })
    .optional(),
  /** 코드로 계산하는 유명한 곡선 (제타 임계선·푸리에 사각파·테일러 sin) — 계수 N은 params 슬라이더 */
  special: z
    .array(z.object({ name: z.enum(["zetaCritical", "fourierSquare", "taylorSin"]), color: z.string().optional() }))
    .max(3)
    .optional(),
});

// ─────────────────────────────────────────────────────────── 수식·화학

const Formula = z.object({
  latex: z.string().min(1),
  /** 정적분·시그마 등 수치값 "≈" 병기 */
  evaluate: z.boolean().default(false),
  /** 글자 크기 px — 손글씨에서 온 수식은 손글씨 크기에 맞춘다 (없으면 기본) */
  fontSize: z.number().positive().optional(),
  /** 한 줄(글 속) 모양으로 — 없으면 fontSize가 있을 때만 한 줄 (예전 저장본과 같게) */
  inline: z.boolean().optional(),
});

const Chem = z.object({
  /** 단일 진실. 원자 좌표는 저장하지 않는다 (렌더러가 매번 배치). */
  smiles: z.string().min(1),
  /** skeletal: 골격식 / full: 완전 구조식(모든 원자·H) / kekule: 고리 이중결합 명시 */
  style: z.enum(["skeletal", "full", "kekule"]).default("skeletal"),
  /** 벤젠 고리 안 원 표기 */
  aromaticCircle: z.boolean().default(false),
  /** E7: "벤젠 (benzene)" 같은 관용명 캡션 */
  commonName: z.string().optional(),
  highlights: z.array(z.number().int()).optional(),
});

/** 화학 반응식 — mhchem `\ce{...}` 의 안쪽 문자열 */
const ChemEquation = z.object({ ce: z.string().min(1), fontSize: z.number().positive().optional(), inline: z.boolean().optional() });

/** 글 상자 — 손글씨를 알아본 글자(P3b) 또는 직접 친 글 (서식 있는 글은 html) */
const Text = z.object({
  /** 글자만 (검색·AI·내보내기 대체용). html이 있으면 html이 보이는 모습의 기준 */
  text: z.string().min(1),
  /** 서식 있는 글 — 앱이 정제한 HTML (굵게·색·형광·크기·목록·정렬) */
  html: z.string().optional(),
  /** 글 상자 폭 px (줄바꿈 기준) */
  width: z.number().positive().optional(),
  fontSize: z.number().positive().optional(),
  /** 쓴 펜의 색 */
  color: z.string().optional(),
});

/**
 * 마스킹 테이프 — 아래 그림을 가린다 (외우기·문제 풀기용). 톡 치면 벗겨졌다 붙었다.
 * 원점(transform.x,y) = 테이프 한쪽 끝의 가운데, angle 방향으로 len, 폭 width (둘 다 × transform.scale).
 */
const Tape = z.object({
  len: z.number().positive(),
  width: z.number().positive(),
  /** 라디안 */
  angle: z.number(),
  color: z.string(),
  /**
   * 자유 테이프: 그은 길을 따라 붙인 테이프의 중심선 (로컬 좌표 × transform.scale, 원점 = transform.x,y).
   * 있으면 len·angle 대신 이 길로 그린다. 없으면 곧은 테이프 (예전 테이프).
   */
  pts: z.array(Vec2).min(2).optional(),
  /** 무늬 (없으면 사선 — 무늬 고르기 전에 붙인 테이프) */
  pattern: z.enum(["plain", "stripes", "dots", "grid"]).optional(),
  /** 벗겨 둔 상태 (속이 비쳐 보인다) */
  revealed: z.boolean().default(false),
});

/**
 * 사진·그림 (이미지 올리기, PDF 쪽 배경). src = 앱이 줄여 넣은 data URL (기기 안에만 저장).
 * 크기 = w·h × transform.scale (px). 손글씨 아래에 그린다 — 그 위에 필기할 수 있게.
 */
const Image = z.object({
  /** 그림 파일 id (media 저장소) — 새 형식. 예전 쪽은 src(data URL)였다가 처음 열 때 옮겨진다 */
  mediaId: z.string().min(1).max(80).optional(),
  src: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).optional(),
  w: z.number().positive(),
  h: z.number().positive(),
  /** 원래 파일 이름 (보여 주기·검색용) */
  name: z.string().optional(),
});

/** 표 — 붙여넣은 자료·엑셀·CSV (첫 줄이 제목이면 header) */
const Table = z.object({
  rows: z.array(z.array(z.string().max(200)).max(20)).min(1).max(300),
  header: z.boolean(),
});

/** 벤 다이어그램 — 집합 식(∩ ∪ − Δ ᶜ)의 영역을 칠한다 (식은 앱이 정리한 기호 문자열) */
const Venn = z.object({
  sets: z.array(z.string().regex(/^[A-Z]$/)).min(1).max(3),
  expr: z.string().min(1).max(200),
  /** 전체집합 이름 (기본 U) */
  universe: z.string().optional(),
});

/** 3D 텐서 — 숫자 칸 dims[0]×dims[1]×dims[2]를 쌓은 블록. slice가 있으면 그 단면만 진하게 */
const Tensor = z.object({
  dims: z.tuple([z.number().int().min(1).max(5), z.number().int().min(1).max(5), z.number().int().min(1).max(5)]),
  /** 칸 값 (i, j, k 순서로 펼친 것: (i·d1 + j)·d2 + k) */
  values: z.array(z.number()).max(125),
  slice: z.object({ axis: z.number().int().min(0).max(2), index: z.number().int().min(0) }).optional(),
  view: z.object({ yaw: z.number(), pitch: z.number() }).optional(),
});

/** 위상수학: 도넛 ↔ 머그잔 연속 변형 (t = 0 도넛, 1 컵) */
const Topology = z.object({
  t: z.number().min(0).max(1),
  view: z.object({ yaw: z.number(), pitch: z.number() }).optional(),
});

/** 신경망 그림 — 층마다 뉴런 수 (입력층 … 출력층) */
const NNet = z.object({
  layers: z.array(z.number().int().min(1).max(16)).min(2).max(8),
  /** 뉴런 이름(x₁ … , y₁ …)과 층 이름을 쓸지 */
  showLabels: z.boolean().default(true),
});

export const FIGURE_NAMES = ["mobius", "klein", "trefoil", "genus", "mandelbrot", "koch", "sierpinski", "golden", "lorenz", "life", "logistic", "euler"] as const;

/**
 * 유명한 그림 (수학·과학·컴퓨터) — 이름 하나로 그리고, 그림마다 직접 바꿀 수 있는 값이 있다.
 *   n: 종수(구멍 수)·프랙탈 단계  · t: 오일러 원의 각 θ  · view: 돌려 본 각도
 *   zoom: 만델브로 집합의 보는 곳 (가운데 cx + i·cy, 너비 s)  · cells: 라이프 게임의 산 칸 [행, 열]
 */
const Figure = z.object({
  name: z.enum(FIGURE_NAMES),
  n: z.number().int().min(0).max(12).optional(),
  t: z.number().optional(),
  view: z.object({ yaw: z.number(), pitch: z.number() }).optional(),
  zoom: z.object({ cx: z.number(), cy: z.number(), s: z.number().positive() }).optional(),
  cells: z.array(z.tuple([z.number().int(), z.number().int()])).max(2500).optional(),
  gen: z.number().int().min(0).optional(),
});

/** 코드 셀이 낸 결과 한 조각 — 글(print)·표(table)·그래프(plot) */
export const CodeOutputItem = z.discriminatedUnion("t", [
  z.object({ t: z.literal("text"), text: z.string().max(20000), error: z.boolean().optional() }),
  z.object({ t: z.literal("table"), rows: z.array(z.array(z.string().max(200)).max(20)).max(60) }),
  z.object({
    t: z.literal("chart"),
    kind: z.enum(["line", "scatter", "bar"]),
    xs: z.array(z.number()).max(5000),
    ys: z.array(z.number()).max(5000),
    label: z.string().max(80).optional(),
  }),
]);
export type CodeOutput = z.infer<typeof CodeOutputItem>;

/**
 * 코드 블록 (7단계) — 이름 붙은 실행 셀 (주피터처럼). 같은 노트의 셀끼리 변수를 나눠 쓴다.
 * 폭 = transform.scale px. 마지막 실행 결과도 함께 저장한다 (다시 열면 그대로 보이게).
 */
const Code = z.object({
  name: z.string().max(40),
  lang: z.enum(["js", "python"]),
  source: z.string().max(20000),
  output: z
    .object({
      items: z.array(CodeOutputItem).max(60),
      /** 걸린 시간 (ms) */
      ms: z.number().min(0),
      ranAt: z.number(),
    })
    .optional(),
});

// ─────────────────────────────────────────────────────────── 조립

const meta = {
  version: z.literal(IR_VERSION),
  confidence: z.number().min(0).max(1),
  /** local = Tier 0, vlm = Tier 1, manual = 수동 입력 (v4) */
  source: z.enum(["local", "vlm", "manual"]),
};

export const SceneIRSchema = z.discriminatedUnion("kind", [
  z.object({ ...meta, kind: z.literal("shape2d"), data: Shape2D }),
  z.object({ ...meta, kind: z.literal("solid3d"), data: Solid3D }),
  z.object({ ...meta, kind: z.literal("plot2d"), data: Plot2D }),
  z.object({ ...meta, kind: z.literal("space3d"), data: Space3D }),
  z.object({ ...meta, kind: z.literal("formula"), data: Formula }),
  z.object({ ...meta, kind: z.literal("chem"), data: Chem }),
  z.object({ ...meta, kind: z.literal("chemEq"), data: ChemEquation }),
  z.object({ ...meta, kind: z.literal("text"), data: Text }),
  z.object({ ...meta, kind: z.literal("tape"), data: Tape }),
  z.object({ ...meta, kind: z.literal("image"), data: Image }),
  z.object({ ...meta, kind: z.literal("venn"), data: Venn }),
  z.object({ ...meta, kind: z.literal("table"), data: Table }),
  z.object({ ...meta, kind: z.literal("tensor"), data: Tensor }),
  z.object({ ...meta, kind: z.literal("topology"), data: Topology }),
  z.object({ ...meta, kind: z.literal("nnet"), data: NNet }),
  z.object({ ...meta, kind: z.literal("code"), data: Code }),
  z.object({ ...meta, kind: z.literal("figure"), data: Figure }),
]);

/**
 * alternatives를 SceneIR 안에 재귀로 넣지 않고 바깥에서 감싼다.
 * 재귀 스키마는 JSON Schema 변환을 불안정하게 만든다 (D1).
 */
export const RecognizeResultSchema = z.object({
  best: SceneIRSchema,
  alternatives: z.array(SceneIRSchema).max(2).optional(),
});

export type SceneIR = z.infer<typeof SceneIRSchema>;
/** parse 전 입력 형태 — default가 붙는 필드는 생략 가능하다. 인식기가 IR을 만들 때 쓴다. */
export type SceneIRInput = z.input<typeof SceneIRSchema>;
export type SceneKind = SceneIR["kind"];
export type RecognizeResult = z.infer<typeof RecognizeResultSchema>;
export type SolidKind = (typeof SOLID_KINDS)[number];

/** kind별 data 타입을 뽑아내는 헬퍼. 렌더러 분기에서 사용. */
export type SceneDataOf<K extends SceneKind> = Extract<SceneIR, { kind: K }>["data"];

export type Shape2DData = SceneDataOf<"shape2d">;
export type Shape2DPrimitive = Shape2DData["primitives"][number];
export type Shape2DMark = NonNullable<Shape2DData["marks"]>[number];
