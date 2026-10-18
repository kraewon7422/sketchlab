import { describe, expect, it } from "vitest";
import { smoothStrokePath } from "./smoothOutline";
import type { Point } from "./types";

const pt = (x: number, y: number, p = 0.5): Point => ({ x, y, p, t: 0 });
const subpaths = (d: string) => (d.match(/M/g) ?? []).length;

/** path d 안의 모든 좌표 쌍 (명령 문자 제거) — 대략적인 범위 검사용 */
function coords(d: string): Array<[number, number]> {
  const nums = d
    .replace(/A[^A-Z]*?(?=[A-Z]|$)/g, "") // 원호 인자(반지름·플래그)는 좌표가 아니다
    .match(/-?\d+(\.\d+)?/g)
    ?.map(Number) ?? [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i] as number, nums[i + 1] as number]);
  return out;
}

describe("smoothStrokePath — 잉크 선명도 v2", () => {
  it("일반 획은 외곽선 하나(서브패스 1개) — 이음새가 없어 가장자리가 흐려지지 않는다", () => {
    const pts = Array.from({ length: 40 }, (_, i) => pt(i * 5, 50 + 20 * Math.sin(i / 6), 0.4 + (i % 5) * 0.05));
    expect(subpaths(smoothStrokePath(pts, { baseWidth: 2.6 }))).toBe(1);
  });

  it("양 끝은 진짜 원호(A 명령) 캡", () => {
    const d = smoothStrokePath([pt(0, 0), pt(100, 0)], { baseWidth: 4 });
    expect((d.match(/A/g) ?? []).length).toBe(2);
  });

  it("점 하나는 원 하나", () => {
    const d = smoothStrokePath([pt(10, 10)], { baseWidth: 4 });
    expect(subpaths(d)).toBe(1);
    expect(d).toContain("a");
  });

  it("외곽선은 중심선에서 굵기 이상 벗어나지 않는다 (보간 오버슈트 없음)", () => {
    // 간격이 들쭉날쭉한 입력 — 균일 Catmull-Rom이면 여기서 튀어나간다
    const pts = [pt(0, 0), pt(1, 0), pt(100, 0), pt(101, 1), pt(101, 100)];
    const d = smoothStrokePath(pts, { baseWidth: 4 });
    for (const [x, y] of coords(d)) {
      expect(x).toBeGreaterThan(-4);
      expect(x).toBeLessThan(105);
      expect(y).toBeGreaterThan(-4);
      expect(y).toBeLessThan(104);
    }
  });

  it("되돌아오는 급한 꺾임(V)에서는 조각을 나눈다 — 꼬인 외곽선의 구멍 방지", () => {
    const pts = [...Array.from({ length: 20 }, (_, i) => pt(i * 5, i * 5)), ...Array.from({ length: 20 }, (_, i) => pt(95 - i * 5, 95 - i * 4))];
    expect(subpaths(smoothStrokePath(pts, { baseWidth: 3 }))).toBeGreaterThanOrEqual(2);
  });

  it("같은 자리를 계속 누른 점(정지)이 있어도 NaN이 나오지 않는다", () => {
    const pts = [pt(0, 0), pt(0, 0), pt(0, 0), pt(10, 0), pt(10, 0), pt(20, 5)];
    expect(smoothStrokePath(pts, { baseWidth: 3 })).not.toMatch(/NaN|Infinity/);
  });

  it("긴 획(3000점)도 매 프레임 다시 만들 수 있을 만큼 빠르다", () => {
    const pts = Array.from({ length: 3000 }, (_, i) => pt(i * 0.8, 200 + 50 * Math.sin(i / 40)));
    smoothStrokePath(pts, { baseWidth: 2.6 }); // warm-up
    // 가장 빠른 5회 중 1회로 잰다 — CI 러너가 다른 테스트(RDKit WASM 로딩)로 바쁠 때의 일시 지연은 코드 속도가 아니다
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      smoothStrokePath(pts, { baseWidth: 2.6 });
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(25);
  });
});
