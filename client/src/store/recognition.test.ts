import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { CanvasItem, Point } from "../ink/types";
import { reviveItems } from "./persistence";
import { __resetSession, createStroke, sessionStore } from "./session";

const s = () => sessionStore.getState();

function line(x0: number, y0: number, x1: number, y1: number, endedAt: number) {
  const pts: Point[] = Array.from({ length: 11 }, (_, i) => ({
    x: x0 + ((x1 - x0) * i) / 10,
    y: y0 + ((y1 - y0) * i) / 10,
    p: 0.5,
    t: i * 8,
  }));
  return createStroke(pts, endedAt);
}

/** 로컬 좌표 (0,0)-(1,0) 선분 = 월드 (100,100)-(300,100) */
const lineIR: SceneIR = {
  version: IR_VERSION,
  kind: "shape2d",
  source: "local",
  confidence: 0.9,
  data: { primitives: [{ t: "line", a: [0, 0], b: [1, 0] }] },
};
const tf = { x: 100, y: 100, scale: 200 };

beforeEach(() => __resetSession());

describe("인식 적용 (in-place 교체)", () => {
  it("잉크 그룹이 같은 자리에서 객체로 바뀌고, 원본 획은 보존된다", () => {
    s().addStroke(line(0, 0, 10, 10, 1000));
    const target = s().addStroke(line(100, 100, 300, 100, 9000));
    const before = s().items.find((i) => i.id === target);

    const objectId = s().replaceWithObject(target, lineIR, tf);

    expect(objectId).not.toBeNull();
    expect(s().items).toHaveLength(2);
    const obj = s().items[1];
    expect(obj?.kind).toBe("object");
    if (obj?.kind !== "object" || before?.kind !== "ink") throw new Error("kind");
    expect(obj.sourceStrokes).toBe(before.strokes);
    expect(s().items[0]?.kind).toBe("ink"); // 다른 그룹은 그대로
    expect(s().activeGroupId).toBeNull();
  });

  it("되돌리기 한 번이면 원래 잉크로 돌아온다", () => {
    const target = s().addStroke(line(100, 100, 300, 100, 1000));
    s().replaceWithObject(target, lineIR, tf);
    s().undo();
    expect(s().items[0]?.kind).toBe("ink");
    expect(s().items[0]?.id).toBe(target);
  });

  it("없는 그룹이나 이미 객체인 항목에는 아무 일도 없다 (이력도 안 쌓임)", () => {
    expect(s().replaceWithObject("nope", lineIR, tf)).toBeNull();
    const target = s().addStroke(line(100, 100, 300, 100, 1000));
    const objectId = s().replaceWithObject(target, lineIR, tf) as string;
    const undoDepth = s().history.undo.length;
    expect(s().replaceWithObject(objectId, lineIR, tf)).toBeNull();
    expect(s().history.undo.length).toBe(undoDepth);
  });

  it("newGroup이면 가까운 직전 획과 묶이지 않는다 (그리고 멈추기 스냅용)", () => {
    const a = s().addStroke(line(0, 0, 50, 0, 1000));
    const b = s().addStroke(line(10, 5, 60, 5, 1200), { newGroup: true });
    expect(b).not.toBe(a);
    expect(s().items).toHaveLength(2);
    const c = s().addStroke(line(10, 8, 60, 8, 1300));
    expect(c).toBe(b); // 그다음 획은 다시 자동 그룹핑
  });
});

describe("지우개가 객체도 지운다", () => {
  it("선 위를 지우면 객체가 통째로 사라지고, 멀리서는 안 지워진다", () => {
    const target = s().addStroke(line(100, 100, 300, 100, 1000));
    s().replaceWithObject(target, lineIR, tf);

    expect(s().eraseAt(200, 160, 14)).toBe(0);
    expect(s().items).toHaveLength(1);

    expect(s().eraseAt(200, 105, 14)).toBe(1);
    expect(s().items).toHaveLength(0);

    s().undo();
    expect(s().items[0]?.kind).toBe("object");
  });

  it("그래프·화학 구조식은 지우개로 지워지지 않는다 (선택 메뉴의 삭제로만)", () => {
    const meta = { version: "4.0" as const, confidence: 1, source: "manual" as const };
    const box = { minX: 0, minY: 0, maxX: 300, maxY: 300 };
    s().addObject(
      { ...meta, kind: "plot2d", data: { functions: [{ latex: "x^2", kind: "explicit" }], view: { xmin: -5, xmax: 5, ymin: -5, ymax: 5, aspect: "equal", xTicks: "auto" }, grid: false, showAxes: true, showCaption: true } },
      { x: 0, y: 0, scale: 300 },
      box,
    );
    s().addObject({ ...meta, kind: "chem", data: { smiles: "c1ccccc1", style: "skeletal", aromaticCircle: false } }, { x: 0, y: 0, scale: 36 }, box);
    expect(s().eraseAt(150, 150, 14)).toBe(0);
    expect(s().items).toHaveLength(2);
  });
});

describe("저장소 복원 시 IR 검증", () => {
  const stroke = line(0, 0, 10, 10, 1000);
  const object = (ir: unknown): CanvasItem =>
    ({
      id: "obj-1",
      kind: "object",
      ir,
      bbox: stroke.bbox,
      sourceStrokes: [stroke],
      transform: tf,
    }) as CanvasItem;

  it("v3로 저장된 객체는 v4로 올라온다", () => {
    const [item] = reviveItems([object({ ...lineIR, version: "3.0" })]);
    if (item?.kind !== "object") throw new Error("객체가 아님");
    expect(item.ir.version).toBe("4.0");
  });

  it("깨진 IR은 버리지 않고 원본 잉크로 되돌린다", () => {
    const [item] = reviveItems([object({ kind: "shape2d", data: {} })]);
    expect(item?.kind).toBe("ink");
    if (item?.kind !== "ink") return;
    expect(item.strokes).toHaveLength(1);
  });
});
