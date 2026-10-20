import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { sessionStore } from "./session";

const code = (name: string): SceneIR => ({ version: IR_VERSION, kind: "code", source: "manual", confidence: 1, data: { name, lang: "js", source: "" } });
const box = (x: number, y: number, w: number, h: number) => ({ minX: x, minY: y, maxX: x + w, maxY: y + h });

describe("코드 셀이 커지면 아래 것을 내린다", () => {
  beforeEach(() => sessionStore.getState().hydrate([]));

  it("바로 아래(같은 세로줄)만 겹치지 않게 내리고, 옆줄·위는 그대로 · 이력 없음", () => {
    const s = sessionStore.getState();
    const a = s.addObject(code("a"), { x: 0, y: 0, scale: 300 }, box(0, 0, 300, 100));
    const b = s.addObject(code("b"), { x: 0, y: 120, scale: 300 }, box(0, 120, 300, 100));
    const c = s.addObject(code("c"), { x: 0, y: 240, scale: 300 }, box(0, 240, 300, 100));
    const side = s.addObject(code("옆"), { x: 400, y: 120, scale: 300 }, box(400, 120, 300, 100));
    const undoBefore = sessionStore.getState().history.undo.length;
    sessionStore.getState().fitObjectBox(a, box(0, 0, 300, 180));
    const get = (id: string) => sessionStore.getState().items.find((i) => i.id === id);
    expect(get(a)?.bbox.maxY).toBe(180);
    expect(get(b)?.bbox.minY).toBe(196); // 180 + 간격 16
    expect(get(c)?.bbox.minY).toBe(316); // 함께 내려가 사이가 그대로
    expect(get(side)?.bbox.minY).toBe(120);
    const bItem = get(b);
    expect(bItem?.kind === "object" && bItem.transform.y).toBe(196);
    expect(sessionStore.getState().history.undo.length).toBe(undoBefore);
  });

  it("작아지거나 겹치지 않으면 아무것도 안 움직인다", () => {
    const s = sessionStore.getState();
    const a = s.addObject(code("a"), { x: 0, y: 0, scale: 300 }, box(0, 0, 300, 100));
    const b = s.addObject(code("b"), { x: 0, y: 200, scale: 300 }, box(0, 200, 300, 100));
    sessionStore.getState().fitObjectBox(a, box(0, 0, 300, 150));
    expect(sessionStore.getState().items.find((i) => i.id === b)?.bbox.minY).toBe(200);
  });
});
