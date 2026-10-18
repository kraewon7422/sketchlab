import { describe, expect, it } from "vitest";
import { bboxOfPoints } from "./geometry";
import { shouldJoinGroup } from "./grouping";
import { createPalmRejector, type PointerSample } from "./palmRejection";
import type { Point, Stroke } from "./types";

const sample = (over: Partial<PointerSample> = {}): PointerSample => ({
  pointerType: "touch",
  width: 20,
  height: 20,
  isPrimary: true,
  ...over,
});

describe("팜 리젝션", () => {
  it("펜은 항상 통과한다", () => {
    const r = createPalmRejector();
    expect(r.evaluate(sample({ pointerType: "pen", width: 1, height: 1 }))).toBe("ok");
  });

  it("마우스는 항상 통과한다 (데스크톱 개발·사용)", () => {
    const r = createPalmRejector();
    expect(r.evaluate(sample({ pointerType: "mouse" }))).toBe("ok");
  });

  it("펜을 쓴 적 없는 기기에서는 손가락으로 그릴 수 있다", () => {
    const r = createPalmRejector();
    expect(r.evaluate(sample({ pointerType: "touch", width: 22 }))).toBe("ok");
  });

  it("펜을 한 번 쓰면 그 뒤 손가락은 그리지 않는다 (§12.2 펜 감지 시 손가락은 팬)", () => {
    const r = createPalmRejector();
    r.evaluate(sample({ pointerType: "pen" }));

    expect(r.isPenMode()).toBe(true);
    expect(r.evaluate(sample({ pointerType: "touch", width: 15 }))).toBe("touch-while-pen-mode");
  });

  it("펜이 없어도 접촉면이 넓으면 손바닥으로 거른다", () => {
    const r = createPalmRejector();
    expect(r.evaluate(sample({ width: 80, height: 60 }))).toBe("contact-too-large");
    expect(r.evaluate(sample({ width: 10, height: 90 }))).toBe("contact-too-large");
  });

  it("보조 포인터(멀티터치 두 번째 손가락)는 그리지 않는다", () => {
    const r = createPalmRejector();
    expect(r.evaluate(sample({ isPrimary: false }))).toBe("not-primary");
  });

  it("펜이 보조 포인터로 들어와도 펜 모드는 켜진다", () => {
    // 손바닥이 먼저 닿아 primary를 차지하고 펜이 두 번째로 들어오는 실제 상황
    const r = createPalmRejector();
    r.evaluate(sample({ pointerType: "pen", isPrimary: false }));
    expect(r.isPenMode()).toBe(true);
  });

  it("reset하면 펜 모드가 풀린다", () => {
    const r = createPalmRejector();
    r.evaluate(sample({ pointerType: "pen" }));
    r.reset();
    expect(r.isPenMode()).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────── 그룹핑

function strokeAt(x: number, y: number, w: number, h: number, endedAt: number): Stroke {
  const points: Point[] = [
    { x, y, p: 0.5, t: 0 },
    { x: x + w, y: y + h, p: 0.5, t: 10 },
  ];
  return {
    id: `s-${x}-${y}-${endedAt}`,
    points,
    bbox: bboxOfPoints(points),
    endedAt,
    tool: "pen",
  };
}

describe("자동 그룹핑", () => {
  it("가깝고 빠르게 이어 그리면 같은 그룹", () => {
    const a = strokeAt(0, 0, 30, 30, 1000);
    const b = strokeAt(35, 0, 30, 30, 1300);
    expect(shouldJoinGroup(a, b)).toBe(true);
  });

  it("2초 넘게 쉬면 다른 그룹", () => {
    const a = strokeAt(0, 0, 30, 30, 1000);
    const b = strokeAt(35, 0, 30, 30, 3500);
    expect(shouldJoinGroup(a, b)).toBe(false);
  });

  it("멀리 떨어져 있으면 다른 그룹 (P1 Acceptance)", () => {
    const a = strokeAt(0, 0, 30, 30, 1000);
    const b = strokeAt(400, 300, 30, 30, 1200);
    expect(shouldJoinGroup(a, b)).toBe(false);
  });

  it("세로획처럼 폭이 0인 글자도 옆 글자와 이어진다 (minPad 없으면 실패하는 케이스)", () => {
    // "1" 처럼 완전한 수직선 두 개가 나란히
    const one = strokeAt(100, 0, 0, 40, 1000);
    const l = strokeAt(112, 0, 0, 40, 1200);
    expect(shouldJoinGroup(one, l)).toBe(true);
  });

  it("손글씨 H: 28px 떨어진 두 세로획(높이 40)과 가로획이 한 그룹 (H₂O가 갈라지던 버그)", () => {
    const left = strokeAt(300, 300, 0, 40, 1000);
    const right = strokeAt(328, 300, 0, 40, 1200);
    const bar = strokeAt(300, 320, 28, 0, 1400);
    expect(shouldJoinGroup(left, right)).toBe(true);
    expect(shouldJoinGroup(right, bar)).toBe(true);
  });

  it("가는 획이라도 글자 크기보다 훨씬 멀면 다른 그룹", () => {
    const a = strokeAt(0, 0, 0, 40, 1000);
    const b = strokeAt(60, 0, 0, 40, 1200);
    expect(shouldJoinGroup(a, b)).toBe(false);
  });

  it("둥근 도형은 예전처럼: 원 두 개가 50px 떨어지면 따로", () => {
    const a = strokeAt(0, 0, 60, 60, 1000);
    const b = strokeAt(110, 0, 60, 60, 1200);
    expect(shouldJoinGroup(a, b)).toBe(false);
  });

  it("경계 조건: 정확히 2초는 새 그룹", () => {
    const a = strokeAt(0, 0, 30, 30, 1000);
    const b = strokeAt(10, 10, 30, 30, 3000);
    expect(shouldJoinGroup(a, b)).toBe(false);
  });

  it("시각이 거꾸로 들어오면 잇지 않는다", () => {
    const a = strokeAt(0, 0, 30, 30, 2000);
    const b = strokeAt(10, 10, 30, 30, 1000);
    expect(shouldJoinGroup(a, b)).toBe(false);
  });

  it("옵션으로 임계값을 조절할 수 있다", () => {
    const a = strokeAt(0, 0, 30, 30, 1000);
    const b = strokeAt(35, 0, 30, 30, 3500);
    expect(shouldJoinGroup(a, b, { maxGapMs: 5000 })).toBe(true);
  });
});
