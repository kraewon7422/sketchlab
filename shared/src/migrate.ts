/**
 * IR 버전 마이그레이션 (마스터스펙 v4 §7.2).
 *
 * IndexedDB에 저장된 객체나 예전에 만든 "다시 열기 링크"는 구버전 IR일 수 있다.
 * 경계에서 parse 하기 **직전에** 여기서 최신 버전 모양으로 올린다.
 *
 * 규칙
 *  - 입력은 unknown 이다. 모양을 믿지 않는다. 모르는 버전은 손대지 않고 그대로 돌려주고,
 *    판정은 SceneIRSchema.safeParse 에 맡긴다 (실패하면 호출측이 에러로 처리).
 *  - 입력 객체를 변형하지 않는다 — 새 객체를 만든다.
 *
 * v3 → v4 변경
 *  - version "3.0" → "4.0"
 *  - kind "plot3d" → "space3d" (surfaces 흡수, view → 대칭 범위)
 *  - chem.display ("skeletal" | "kekule") → chem.style
 */
import { IR_VERSION, SceneIRSchema, type SceneIR } from "./ir";

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function migrateIR(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  if (raw["version"] === IR_VERSION) return raw;
  if (raw["version"] !== "3.0") return raw;

  const data = isObject(raw["data"]) ? raw["data"] : {};
  const out: Json = { ...raw, version: IR_VERSION };

  if (raw["kind"] === "plot3d") {
    out["kind"] = "space3d";
    const view = isObject(data["view"]) ? data["view"] : {};
    const extents = ["xmin", "xmax", "ymin", "ymax", "zmin", "zmax"]
      .map((k) => view[k])
      .filter((v): v is number => typeof v === "number")
      .map(Math.abs);
    const surfaces = Array.isArray(data["surfaces"])
      ? data["surfaces"]
          .filter(isObject)
          .map((s) => ({ latex: s["latex"] }))
      : [];
    out["data"] = {
      view: { range: extents.length > 0 ? Math.max(...extents) : 5 },
      surfaces,
    };
  } else if (raw["kind"] === "chem") {
    const { display, ...rest } = data;
    out["data"] = { ...rest, style: display === "kekule" ? "kekule" : "skeletal" };
  }

  return out;
}

/** 마이그레이션 + 검증을 한 번에. 실패하면 null — 호출측은 반드시 에러를 기록한다. */
export function parseStoredIR(raw: unknown): SceneIR | null {
  const result = SceneIRSchema.safeParse(migrateIR(raw));
  return result.success ? result.data : null;
}
