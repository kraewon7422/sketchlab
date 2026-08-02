import { describe, expect, it } from "vitest";
import { signedArea } from "./geometry";
import { dotOutline, segmentOutline, strokeOutline, strokeOutlinePath, subpathsToPathData } from "./outline";
import { simplifyRDP } from "./simplify";
import type { Point } from "./types";

const pt = (x: number, y: number, p = 0.5, t = 0): Point => ({ x, y, p, t });

describe("simplifyRDP", () => {
  it("직선 위의 중간 점을 전부 걷어낸다", () => {
    const line = [pt(0, 0), pt(1, 0), pt(2, 0), pt(3, 0), pt(10, 0)];
    expect(simplifyRDP(line, 0.5)).toEqual([pt(0, 0), pt(10, 0)]);
  });

  it("의미 있는 꺾임은 남긴다", () => {
    const corner = [pt(0, 0), pt(5, 0), pt(5, 5)];
    const out = simplifyRDP(corner, 0.5);
    expect(out).toHaveLength(3);
    expect(out[1]).toEqual(pt(5, 0));
  });

  it("항상 양 끝점을 보존한다", () => {
    const pts = Array.from({ length: 50 }, (_, i) => pt(i, Math.sin(i / 5) * 10));
    const out = simplifyRDP(pts, 2);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
    expect(out.length).toBeLessThan(pts.length);
  });

  it("점이 2개 이하면 그대로 돌려준다", () => {
    expect(simplifyRDP([pt(0, 0)], 1)).toHaveLength(1);
    expect(simplifyRDP([], 1)).toHaveLength(0);
  });

  it("원본 배열을 변형하지 않는다 (원본 불변 — §12.4)", () => {
    const pts = [pt(0, 0), pt(1, 5), pt(2, 0)];
    const snapshot = JSON.stringify(pts);
    simplifyRDP(pts, 0.1);
    expect(JSON.stringify(pts)).toBe(snapshot);
  });

  it("아주 긴 획에서도 스택이 터지지 않는다 (재귀 대신 명시적 스택)", () => {
    // 최악 형태: 매 점이 직전 구간의 최대 오차점이 되도록 계단식으로 배치
    const pts = Array.from({ length: 20000 }, (_, i) => pt(i, i % 2 === 0 ? 0 : 1000));
    expect(() => simplifyRDP(pts, 0.5)).not.toThrow();
  });
});

describe("strokeOutline — 감김 방향 불변식", () => {
  it("모든 서브패스가 같은 방향으로 감긴다 (섞이면 획에 구멍이 뚫린다)", () => {
    const zigzag = [pt(0, 0), pt(20, 0), pt(20, 20), pt(0, 20), pt(0, 40)];
    const subs = strokeOutline(zigzag, { baseWidth: 4 });

    expect(subs.length).toBeGreaterThan(0);
    for (const sub of subs) {
      expect(signedArea(sub)).toBeGreaterThan(0);
    }
  });

  it("획이 완전히 되돌아와도 방향이 유지된다 (진행 방향 반전 케이스)", () => {
    // 오른쪽으로 갔다가 정확히 되돌아오는 획 — 사다리꼴 방향이 뒤집히는 지점
    const backAndForth = [pt(0, 0), pt(30, 0), pt(0, 0.001)];
    for (const sub of strokeOutline(backAndForth, { baseWidth: 6 })) {
      expect(signedArea(sub)).toBeGreaterThan(0);
    }
  });
});

describe("strokeOutline — 형태", () => {
  it("점 하나는 원 하나(점 찍기)로 나온다", () => {
    const subs = strokeOutline([pt(5, 5)], { baseWidth: 4 });
    expect(subs).toHaveLength(1);
    expect(subs[0]?.length).toBeGreaterThanOrEqual(8);
  });

  it("빈 입력은 빈 결과 (던지지 않는다)", () => {
    expect(strokeOutline([], { baseWidth: 4 })).toEqual([]);
    expect(strokeOutlinePath([], { baseWidth: 4 })).toBe("");
  });

  it("필압이 높을수록 획이 굵다", () => {
    const thin = strokeOutline([pt(0, 0, 0.1), pt(10, 0, 0.1)], { baseWidth: 10 });
    const thick = strokeOutline([pt(0, 0, 1), pt(10, 0, 1)], { baseWidth: 10 });

    const widthOf = (subs: Array<Array<{ x: number; y: number }>>): number => {
      const quad = subs[0] ?? [];
      const ys = quad.map((p) => p.y);
      return Math.max(...ys) - Math.min(...ys);
    };

    expect(widthOf(thick)).toBeGreaterThan(widthOf(thin));
  });

  it("같은 자리에 멈춰 있던 점에서 0으로 나누지 않는다", () => {
    const stalled = [pt(3, 3), pt(3, 3), pt(3, 3)];
    const subs = strokeOutline(stalled, { baseWidth: 4 });
    for (const sub of subs) {
      for (const p of sub) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
      }
    }
  });
});

describe("증분 생성 (그리는 중)", () => {
  it("조각도 완성본과 같은 감김 방향을 지킨다", () => {
    // 방향이 어긋나면 그리는 도중에만 획 가운데가 뚫려 보인다.
    for (const [a, b] of [
      [pt(0, 0), pt(10, 0)],
      [pt(10, 0), pt(0, 0)],
      [pt(0, 0), pt(0, 10)],
      [pt(5, 5), pt(-5, -5)],
    ] as const) {
      for (const sub of segmentOutline(a, b, { baseWidth: 4 })) {
        expect(signedArea(sub)).toBeGreaterThan(0);
      }
    }
    for (const sub of dotOutline(pt(1, 1), { baseWidth: 4 })) {
      expect(signedArea(sub)).toBeGreaterThan(0);
    }
  });

  it("같은 자리에 머무른 구간은 사다리꼴 없이 캡만 낸다", () => {
    const subs = segmentOutline(pt(4, 4), pt(4, 4), { baseWidth: 4 });
    expect(subs).toHaveLength(1);
  });

  it("조각을 이어 붙인 결과가 완성본과 같은 영역을 덮는다", () => {
    // 증분 경로와 완성 경로가 서로 다른 그림이 되면, 손을 떼는 순간 획이 튄다.
    const path = [pt(0, 0), pt(10, 0), pt(10, 10)];
    const opts = { baseWidth: 4 };

    let incremental = subpathsToPathData(dotOutline(path[0]!, opts));
    for (let i = 0; i < path.length - 1; i++) {
      incremental += subpathsToPathData(segmentOutline(path[i]!, path[i + 1]!, opts));
    }

    const bounds = (d: string): { minX: number; maxX: number } => {
      const nums = [...d.matchAll(/M|L|Z|(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)]
        .filter((m) => m[1] !== undefined)
        .map((m) => Number(m[1]));
      return { minX: Math.min(...nums), maxX: Math.max(...nums) };
    };

    const inc = bounds(incremental);
    const full = bounds(strokeOutlinePath(path, opts));
    expect(inc.minX).toBeCloseTo(full.minX, 1);
    expect(inc.maxX).toBeCloseTo(full.maxX, 1);
  });
});

describe("subpathsToPathData", () => {
  it("각 서브패스를 M…L…Z 로 닫는다", () => {
    const d = subpathsToPathData([
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
    ]);
    expect(d).toBe("M0,0L1,0L1,1Z");
  });

  it("점이 3개 미만인 서브패스는 버린다 (면적이 없어 그려지지 않는다)", () => {
    expect(subpathsToPathData([[{ x: 0, y: 0 }, { x: 1, y: 1 }]])).toBe("");
  });

  it("좌표를 소수점 2자리로 줄인다", () => {
    const d = subpathsToPathData([
      [{ x: 0.123456, y: 1.987654 }, { x: 2, y: 0 }, { x: 0, y: 2 }],
    ]);
    expect(d).toContain("0.12,1.99");
  });

  it("NaN 없는 유효한 path를 만든다", () => {
    const d = strokeOutlinePath([pt(0, 0), pt(10, 5), pt(20, 0)], { baseWidth: 3 });
    expect(d).not.toContain("NaN");
    expect(d.startsWith("M")).toBe(true);
  });
});
