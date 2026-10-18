import { debugLog } from "../debug";
import { markFresh } from "../render/Shape2DView";
import { sessionStore } from "../store/session";
import { recognizeTier0 } from "./tier0/classify";

/**
 * 인식 진입점 (v4 §9). 지금은 Tier 0(로컬 기하)만 있다.
 * P3b에서 "Tier 0 실패 → Tier 1(VLM)" 분기가 이 함수 안에 붙는다 — 호출측(FAB·멈춤 스냅)은 바뀌지 않는다.
 */
export type RecognizeOutcome =
  | { ok: true; objectId: string; ms: number }
  | { ok: false; reason: "not-found" | "no-match" };

export function recognizeGroup(inkId: string): RecognizeOutcome {
  const state = sessionStore.getState();
  const item = state.items.find((i) => i.id === inkId);
  if (!item || item.kind !== "ink") return { ok: false, reason: "not-found" };

  const started = performance.now();
  const result = recognizeTier0(item.strokes, item.bbox);
  const ms = performance.now() - started;

  if (!result) {
    debugLog.info("tier0", `도형으로 인식 못함 (${ms.toFixed(1)}ms, 획 ${item.strokes.length}개)`);
    return { ok: false, reason: "no-match" };
  }

  const objectId = state.replaceWithObject(inkId, result.ir, result.transform);
  if (!objectId) return { ok: false, reason: "not-found" };

  markFresh(objectId);
  const kinds = result.ir.kind === "shape2d" ? result.ir.data.primitives.map((p) => p.t).join("+") : result.ir.kind;
  debugLog.info("tier0", `인식: ${kinds} (${ms.toFixed(1)}ms, 신뢰도 ${result.ir.confidence.toFixed(2)})`);
  return { ok: true, objectId, ms };
}
