/**
 * Scene IR — 인식기와 렌더러 사이의 유일한 계약.
 *
 *   스트로크 → [인식기] → SceneIR → [렌더러] → 화면/내보내기
 *
 * 원칙 (마스터스펙 §6.2)
 *  - 좌표는 정규화된 값만. 캔버스 픽셀 금지.
 *  - 수식은 LaTeX, 화학은 SMILES가 단일 진실. 파생 좌표는 저장하지 않는다.
 *  - 외부 입력(VLM 응답·사용자 편집)은 경계에서 반드시 parse 한다.
 *
 * D1: kind와 data의 짝은 z.discriminatedUnion 으로 스키마 수준에서 강제된다.
 *     평면 유니온이었던 v2에서는 kind:"chem" + shape2d 데이터가 통과했다.
 */
import { z } from "zod";

/** 정규화 좌표 [x, y] */
const Vec2 = z.tuple([z.number(), z.number()]);

/** 정규화 3D 좌표 [x, y, z] */
const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

// ─────────────────────────────────────────────────────────── 평면도형

const Shape2D = z.object({
  primitives: z.array(
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
    ]),
  ),
  labels: z.array(z.object({ text: z.string(), at: Vec2 })).optional(),
  marks: z
    .array(
      z.object({
        t: z.enum(["rightAngle", "tick", "angleArc"]),
        at: Vec2,
      }),
    )
    .optional(),
});

// ─────────────────────────────────────────────────────────── 입체도형

/** 카탈로그 8종. 일반 2D→3D 재구성은 범위 밖 (§7.4) */
export const SOLID_KINDS = [
  "cube",
  "box",
  "cylinder",
  "cone",
  "sphere",
  "prism",
  "pyramid",
  "tetrahedron",
] as const;

const Solid3D = z.object({
  solid: z.enum(SOLID_KINDS),
  params: z.record(z.string(), z.number()),
  showEdges: z.boolean().default(true),
  showHiddenEdges: z.boolean().default(true),
  /** 단면 렌더는 P8 백로그 (E6). 필드만 예약해 둔다. */
  crossSection: z
    .object({ normal: Vec3, offset: z.number() })
    .optional(),
  labels: z
    .array(z.object({ text: z.string(), vertex: z.number().int() }))
    .optional(),
});

// ─────────────────────────────────────────────────────────── 좌표·그래프

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
  }),
  grid: z.boolean().default(false),
  points: z
    .array(z.object({ at: Vec2, label: z.string().optional() }))
    .optional(),
});

const Plot3D = z.object({
  surfaces: z
    .array(z.object({ latex: z.string(), kind: z.literal("explicit") }))
    .min(1),
  view: z.object({
    xmin: z.number(),
    xmax: z.number(),
    ymin: z.number(),
    ymax: z.number(),
    zmin: z.number(),
    zmax: z.number(),
  }),
  resolution: z.number().int().min(16).max(96).default(48),
});

// ─────────────────────────────────────────────────────────── 수식·화학

const Formula = z.object({ latex: z.string().min(1) });

const Chem = z.object({
  /** 단일 진실. 원자 좌표는 저장하지 않는다 (렌더러가 매번 배치). */
  smiles: z.string().min(1),
  display: z.enum(["skeletal", "kekule"]).default("skeletal"),
  /** E7: "벤젠 (benzene)" 같은 관용명 캡션 */
  commonName: z.string().optional(),
  highlights: z.array(z.number().int()).optional(),
});

// ─────────────────────────────────────────────────────────── 조립

const meta = {
  version: z.literal("3.0"),
  confidence: z.number().min(0).max(1),
  source: z.enum(["local", "vlm"]),
};

export const SceneIRSchema = z.discriminatedUnion("kind", [
  z.object({ ...meta, kind: z.literal("shape2d"), data: Shape2D }),
  z.object({ ...meta, kind: z.literal("solid3d"), data: Solid3D }),
  z.object({ ...meta, kind: z.literal("plot2d"), data: Plot2D }),
  z.object({ ...meta, kind: z.literal("plot3d"), data: Plot3D }),
  z.object({ ...meta, kind: z.literal("formula"), data: Formula }),
  z.object({ ...meta, kind: z.literal("chem"), data: Chem }),
]);

/**
 * alternatives를 SceneIR 안에 재귀로 넣지 않고 바깥에서 감싼다.
 * 재귀 스키마는 Tool Use용 JSON Schema 변환을 불안정하게 만든다 (D1).
 */
export const RecognizeResultSchema = z.object({
  best: SceneIRSchema,
  alternatives: z.array(SceneIRSchema).max(2).optional(),
});

export type SceneIR = z.infer<typeof SceneIRSchema>;
export type SceneKind = SceneIR["kind"];
export type RecognizeResult = z.infer<typeof RecognizeResultSchema>;
export type SolidKind = (typeof SOLID_KINDS)[number];

/** kind별 data 타입을 뽑아내는 헬퍼. 렌더러 분기에서 사용. */
export type SceneDataOf<K extends SceneKind> = Extract<
  SceneIR,
  { kind: K }
>["data"];
