import { describe, expect, it } from "vitest";
import {
  EMPTY_BBOX,
  bboxContainsPoint,
  bboxIntersects,
  bboxOfPoints,
  distanceToPolyline,
  distanceToSegment,
  inflateBBox,
  signedArea,
  unionBBoxes,
} from "./geometry";
import type { Point } from "./types";

const pt = (x: number, y: number): Point => ({ x, y, p: 0.5, t: 0 });

describe("bboxOfPoints", () => {
  it("빈 배열은 EMPTY_BBOX", () => {
    expect(bboxOfPoints([])).toEqual(EMPTY_BBOX);
  });

  it("점 하나는 폭·높이 0인 상자", () => {
    expect(bboxOfPoints([pt(3, 7)])).toEqual({ minX: 3, minY: 7, maxX: 3, maxY: 7 });
  });

  it("음수 좌표를 포함한 범위를 정확히 감싼다", () => {
    expect(bboxOfPoints([pt(-5, 2), pt(4, -3), pt(0, 0)])).toEqual({
      minX: -5,
      minY: -3,
      maxX: 4,
      maxY: 2,
    });
  });
});

describe("inflateBBox", () => {
  it("비율만큼 각 축을 넓힌다", () => {
    const b = inflateBBox({ minX: 0, minY: 0, maxX: 10, maxY: 20 }, 0.2);
    expect(b).toEqual({ minX: -2, minY: -4, maxX: 12, maxY: 24 });
  });

  it("납작한 상자도 minPad로 부풀린다 (수직선 그룹핑이 실패하던 원인)", () => {
    // 완전한 수직선: 폭 0 → 비율만 쓰면 아무리 부풀려도 폭이 0이다.
    const line = { minX: 5, minY: 0, maxX: 5, maxY: 100 };
    const inflated = inflateBBox(line, 0.2, 8);
    expect(inflated.minX).toBe(-3);
    expect(inflated.maxX).toBe(13);
    expect(inflated.maxY).toBe(120);
  });
});

describe("bboxIntersects", () => {
  const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

  it("겹치면 참", () => {
    expect(bboxIntersects(a, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true);
  });

  it("경계가 닿기만 해도 참", () => {
    expect(bboxIntersects(a, { minX: 10, minY: 10, maxX: 20, maxY: 20 })).toBe(true);
  });

  it("떨어져 있으면 거짓", () => {
    expect(bboxIntersects(a, { minX: 11, minY: 0, maxX: 20, maxY: 10 })).toBe(false);
  });

  it("한 축만 겹쳐도 거짓", () => {
    expect(bboxIntersects(a, { minX: 5, minY: 50, maxX: 15, maxY: 60 })).toBe(false);
  });
});

describe("unionBBoxes / bboxContainsPoint", () => {
  it("여러 상자를 전부 감싼다", () => {
    expect(
      unionBBoxes([
        { minX: 0, minY: 0, maxX: 1, maxY: 1 },
        { minX: 5, minY: -2, maxX: 6, maxY: 3 },
      ]),
    ).toEqual({ minX: 0, minY: -2, maxX: 6, maxY: 3 });
  });

  it("빈 목록은 EMPTY_BBOX", () => {
    expect(unionBBoxes([])).toEqual(EMPTY_BBOX);
  });

  it("경계 위의 점도 포함으로 본다", () => {
    expect(bboxContainsPoint({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 10, 0)).toBe(true);
    expect(bboxContainsPoint({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 10.1, 0)).toBe(false);
  });
});

describe("distanceToSegment", () => {
  it("선분 위의 점은 거리 0", () => {
    expect(distanceToSegment(5, 0, 0, 0, 10, 0)).toBe(0);
  });

  it("수직 거리를 잰다", () => {
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
  });

  it("선분 밖으로 벗어나면 끝점까지의 거리 (무한직선이 아니다)", () => {
    expect(distanceToSegment(-4, 0, 0, 0, 10, 0)).toBe(4);
    expect(distanceToSegment(14, 0, 0, 0, 10, 0)).toBe(4);
  });

  it("길이 0인 선분에서 0으로 나누지 않는다 (펜을 멈추면 실제로 생긴다)", () => {
    const d = distanceToSegment(3, 4, 0, 0, 0, 0);
    expect(d).toBe(5);
    expect(Number.isFinite(d)).toBe(true);
  });
});

describe("distanceToPolyline", () => {
  const line = [pt(0, 0), pt(10, 0), pt(10, 10)];

  it("가장 가까운 선분을 고른다", () => {
    expect(distanceToPolyline(10, 5, line)).toBe(0);
    expect(distanceToPolyline(12, 5, line)).toBe(2);
  });

  it("점이 하나면 그 점까지의 거리", () => {
    expect(distanceToPolyline(3, 4, [pt(0, 0)])).toBe(5);
  });

  it("빈 폴리라인은 무한대 (조용히 0을 돌려주면 지우개가 오작동한다)", () => {
    expect(distanceToPolyline(0, 0, [])).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("signedArea", () => {
  it("반시계 방향은 양수", () => {
    expect(signedArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBe(12);
  });

  it("시계 방향은 음수 — 감김 방향 통일 판정의 근거", () => {
    expect(signedArea([{ x: 0, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 0 }, { x: 0, y: 0 }])).toBe(-12);
  });
});
