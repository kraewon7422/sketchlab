import { beforeEach, describe, expect, it } from "vitest";
import type { InkItem, Point } from "../ink/types";
import { __resetSession, createStroke, sessionStore } from "./session";

const s = () => sessionStore.getState();

/** (x,y)에서 (x+w, y+h)로 긋는 획을 만든다. */
function stroke(x: number, y: number, w: number, h: number, endedAt: number) {
  const points: Point[] = [
    { x, y, p: 0.5, t: 0 },
    { x: x + w / 2, y: y + h / 2, p: 0.6, t: 8 },
    { x: x + w, y: y + h, p: 0.5, t: 16 },
  ];
  return createStroke(points, endedAt);
}

const inkItems = (): InkItem[] =>
  s().items.filter((i): i is InkItem => i.kind === "ink");

beforeEach(() => {
  __resetSession();
});

describe("스트로크 추가와 그룹핑", () => {
  it("첫 획이 새 그룹을 만들고 활성 그룹이 된다", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));

    expect(s().items).toHaveLength(1);
    expect(inkItems()[0]?.strokes).toHaveLength(1);
    expect(s().activeGroupId).toBe(s().items[0]?.id);
  });

  it("가깝고 빠른 두 번째 획은 같은 그룹에 붙는다", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    s().addStroke(stroke(25, 0, 20, 20, 1400));

    expect(s().items).toHaveLength(1);
    expect(inkItems()[0]?.strokes).toHaveLength(2);
  });

  it("멀리 떨어진 획은 새 그룹이 된다 (P1 Acceptance)", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    s().addStroke(stroke(500, 400, 20, 20, 1200));

    expect(s().items).toHaveLength(2);
    expect(s().activeGroupId).toBe(s().items[1]?.id);
  });

  it("그룹 bbox가 속한 획 전체를 감싼다", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    s().addStroke(stroke(25, 5, 20, 20, 1200));

    const bbox = inkItems()[0]?.bbox;
    expect(bbox).toEqual({ minX: 0, minY: 0, maxX: 45, maxY: 25 });
  });
});

describe("되돌리기 / 다시 실행", () => {
  it("획 추가를 되돌린다", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    expect(s().items).toHaveLength(1);

    s().undo();
    expect(s().items).toHaveLength(0);

    s().redo();
    expect(s().items).toHaveLength(1);
  });

  it("같은 그룹에 붙은 획도 한 단계씩 되돌린다", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    s().addStroke(stroke(25, 0, 20, 20, 1200));
    expect(inkItems()[0]?.strokes).toHaveLength(2);

    s().undo();
    expect(inkItems()[0]?.strokes).toHaveLength(1);
    expect(s().items).toHaveLength(1);
  });

  it("되돌린 뒤 새로 그리면 다시 실행은 무효가 된다", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    s().undo();
    expect(s().history.redo).toHaveLength(1);

    s().addStroke(stroke(200, 200, 20, 20, 5000));
    expect(s().history.redo).toHaveLength(0);
  });

  it("빈 상태에서 undo/redo를 눌러도 죽지 않는다", () => {
    expect(() => {
      s().undo();
      s().redo();
    }).not.toThrow();
    expect(s().items).toHaveLength(0);
  });

  it("여러 단계를 순서대로 되돌리고 되살린다", () => {
    s().addStroke(stroke(0, 0, 10, 10, 1000));
    s().addStroke(stroke(300, 0, 10, 10, 4000));
    s().addStroke(stroke(600, 0, 10, 10, 7000));
    expect(s().items).toHaveLength(3);

    s().undo();
    s().undo();
    expect(s().items).toHaveLength(1);

    s().redo();
    expect(s().items).toHaveLength(2);
    expect(s().items[1]?.bbox.minX).toBe(300);
  });

  it("선택 변경은 되돌리기 이력에 쌓이지 않는다", () => {
    s().addStroke(stroke(0, 0, 10, 10, 1000));
    const before = s().history.undo.length;

    s().setSelection(["x"]);
    expect(s().history.undo).toHaveLength(before);
  });
});

describe("지우개", () => {
  it("닿은 획만 지운다", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    s().addStroke(stroke(500, 400, 20, 20, 9000));

    const removed = s().eraseAt(10, 10, 8);

    expect(removed).toBe(1);
    expect(s().items).toHaveLength(1);
    expect(s().items[0]?.bbox.minX).toBe(500);
  });

  it("아무것도 안 닿으면 상태도 이력도 그대로다", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    const historyBefore = s().history.undo.length;
    const itemsBefore = s().items;

    const removed = s().eraseAt(900, 900, 8);

    expect(removed).toBe(0);
    expect(s().history.undo).toHaveLength(historyBefore);
    expect(s().items).toBe(itemsBefore);
  });

  it("그룹의 일부만 지우면 남은 획으로 bbox를 다시 계산한다", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    s().addStroke(stroke(25, 0, 20, 20, 1200));
    expect(inkItems()[0]?.bbox.maxX).toBe(45);

    s().eraseAt(45, 20, 6);

    expect(inkItems()[0]?.strokes).toHaveLength(1);
    expect(inkItems()[0]?.bbox.maxX).toBe(20);
  });

  it("마지막 획이 지워지면 활성 그룹을 비운다 (다음 획이 유령 그룹에 붙는 것 방지)", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    s().eraseAt(10, 10, 8);

    expect(s().items).toHaveLength(0);
    expect(s().activeGroupId).toBeNull();
  });

  it("지우개도 되돌릴 수 있다", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    s().eraseAt(10, 10, 8);
    expect(s().items).toHaveLength(0);

    s().undo();
    expect(s().items).toHaveLength(1);
    expect(inkItems()[0]?.strokes).toHaveLength(1);
  });
});

describe("hydrate (새로고침 복원)", () => {
  it("복원한 내용은 되돌리기 이력에 남기지 않는다 (§5.3 단방향)", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    const saved = s().items;

    __resetSession();
    s().hydrate(saved);

    expect(s().items).toHaveLength(1);
    expect(s().history.undo).toHaveLength(0);
    expect(s().history.redo).toHaveLength(0);
  });

  it("복원 직후 그린 획은 새 그룹으로 시작한다", () => {
    s().addStroke(stroke(0, 0, 20, 20, 1000));
    const saved = s().items;

    __resetSession();
    s().hydrate(saved);
    s().addStroke(stroke(22, 0, 20, 20, 1100));

    expect(s().items).toHaveLength(2);
  });
});

describe("이력 상한", () => {
  it("100단계를 넘으면 오래된 것부터 버린다", () => {
    for (let i = 0; i < 130; i++) {
      s().addStroke(stroke(i * 100, 0, 10, 10, i * 5000));
    }
    expect(s().history.undo.length).toBeLessThanOrEqual(100);
    expect(s().items).toHaveLength(130);
  });
});
