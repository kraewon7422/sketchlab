import { debugLog } from "../debug";
import { markFresh } from "../render/Shape2DView";
import { penOpts } from "../render/theme";
import { sessionStore } from "../store/session";
import { recognizeTier0 } from "./tier0/classify";

/**
 * 인식 진입점 (v4 §9). 지금은 Tier 0(로컬 기하)만 있다.
 * P3b에서 "Tier 0 실패 → Tier 1(VLM)" 분기가 이 함수 안에 붙는다 — 호출측(FAB·멈춤 스냅)은 바뀌지 않는다.
 */
export type RecognizeOutcome =
  | { ok: true; objectId: string; ms: number }
  /** highlight-no-match: 형광펜 자국인데 도형이 아니다 — 글자 인식(AI)으로 넘기지 않는다 */
  | { ok: false; reason: "not-found" | "no-match" | "highlight-no-match" };

export function recognizeGroup(inkId: string): RecognizeOutcome {
  const state = sessionStore.getState();
  const item = state.items.find((i) => i.id === inkId);
  if (!item || item.kind !== "ink") return { ok: false, reason: "not-found" };

  const started = performance.now();
  const result = recognizeTier0(item.strokes, item.bbox);
  const ms = performance.now() - started;
  // 형광펜 묶음은 형광펜 도형으로만 정리한다 (그래프·글자로 바꾸지 않는다)
  const highlight = item.strokes.every((s) => s.tool === "highlighter");

  if (!result || (highlight && result.ir.kind !== "shape2d")) {
    debugLog.info("tier0", `도형으로 인식 못함 (${ms.toFixed(1)}ms, 획 ${item.strokes.length}개)`);
    return { ok: false, reason: highlight ? "highlight-no-match" : "no-match" };
  }

  // 한 가지 색 펜으로만 그렸으면 정리한 도형도 그 색
  const colors = new Set(item.strokes.map((s) => s.color ?? ""));
  const color = colors.size === 1 ? [...colors][0] : "";
  let ir = color && result.ir.kind === "shape2d" ? { ...result.ir, data: { ...result.ir.data, color } } : result.ir;
  if (highlight && ir.kind === "shape2d") {
    // 형광펜 굵기 그대로 (여러 획이면 평균), 반투명
    const width = item.strokes.reduce((sum, s) => sum + (s.width ?? penOpts.highlightWidth.default), 0) / item.strokes.length;
    ir = { ...ir, data: { ...ir.data, width, highlight: true } };
  }

  const objectId = state.replaceWithObject(inkId, ir, result.transform);
  if (!objectId) return { ok: false, reason: "not-found" };

  markFresh(objectId);
  const kinds = result.ir.kind === "shape2d" ? result.ir.data.primitives.map((p) => p.t).join("+") : result.ir.kind;
  debugLog.info("tier0", `인식: ${kinds} (${ms.toFixed(1)}ms, 신뢰도 ${result.ir.confidence.toFixed(2)})`);
  return { ok: true, objectId, ms };
}
