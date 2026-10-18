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
});

// ─────────────────────────────────────────────────────────── 공간좌표 (v4 M1)

const Space3D = z.object({
  /** 각 축 [-range, range] */
  view: z.object({ range: z.number().positive().default(5) }),
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
  /** 점에서 각 좌표평면으로 점선 수선 — 교과서 공간좌표 그림의 핵심 */
  showProjections: z.boolean().default(false),
});

// ─────────────────────────────────────────────────────────── 평면좌표·그래프

/** 계수 슬라이더 (v4 M2). 한 글자 계수만 — x,y,t 등은 분류기가 미리 거른다. */
const Param = z.object({
  name: z.string().regex(/^[a-zA-Z]$/),
  value: z.number(),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
});

const Plot2D = z.object({
  functions: z
    .array(
      z.object({
        /** 단일 진실. 별도의 expr 필드를 두지 않는다. */
        latex: z.string(),
        kind: z.enum(["explicit", "parametric", "implicit", "polar"]),
        domain: z.tuple([z.number(), z.number()]).optional(),
        color: z.string().optional(),
      }),
    )
    .min(1),
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
});

// ─────────────────────────────────────────────────────────── 수식·화학

const Formula = z.object({
  latex: z.string().min(1),
  /** 정적분·시그마 등 수치값 "≈" 병기 */
  evaluate: z.boolean().default(false),
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
const ChemEquation = z.object({ ce: z.string().min(1) });

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
