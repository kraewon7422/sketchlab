import { describe, expect, it } from "vitest";
import { buildFromInput } from "./build";
import { paramCount, parseNNet, shownNeurons } from "./nnet";
import { parseTensor, sliceLatex, sliceMatrix } from "./tensor";
import { renderTopology, shapeAt } from "./topology";

describe("3D 텐서", () => {
  it("모양만: 텐서 2x3x4 → 1부터 차례로", () => {
    const t = parseTensor("텐서 2x3x4");
    expect(t?.dims).toEqual([2, 3, 4]);
    expect(t?.values).toHaveLength(24);
    expect(t?.values[23]).toBe(24);
  });

  it("3겹 괄호는 값 그대로, 줄 길이가 다르면 거절", () => {
    expect(parseTensor("[[[1,2],[3,4]],[[5,6],[7,8]]]")).toEqual({ dims: [2, 2, 2], values: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(parseTensor("[[[1,2],[3]],[[5,6],[7,8]]]")).toBeNull();
    expect(parseTensor("텐서 2x9x1")).toBeNull();
  });

  it("단면: 축마다 맞는 행렬", () => {
    const t = parseTensor("[[[1,2],[3,4]],[[5,6],[7,8]]]");
    if (!t) throw new Error("no tensor");
    expect(sliceMatrix(t.dims, t.values, 0, 1)).toEqual([
      [5, 6],
      [7, 8],
    ]);
    expect(sliceMatrix(t.dims, t.values, 1, 0)).toEqual([
      [1, 2],
      [5, 6],
    ]);
    expect(sliceMatrix(t.dims, t.values, 2, 1)).toEqual([
      [2, 4],
      [6, 8],
    ]);
    expect(sliceLatex(t.dims, t.values, 2, 1)).toContain("T_{:,:,2}");
  });

  it("행렬 [[…]]은 그대로 행렬 (텐서로 가로채지 않는다)", () => {
    const r = buildFromInput("[[2,1],[1,3]]");
    expect(r.ok && r.ir.kind).toBe("formula");
    const t = buildFromInput("텐서 2x2x2");
    expect(t.ok && t.ir.kind).toBe("tensor");
  });
});

describe("신경망", () => {
  it("층 수 읽기", () => {
    expect(parseNNet("신경망 3-4-4-2")).toEqual([3, 4, 4, 2]);
    expect(parseNNet("nn 2,3,1")).toEqual([2, 3, 1]);
    expect(parseNNet("신경망 3")).toBeNull();
    expect(parseNNet("신경망 3-40")).toBeNull();
  });

  it("많은 층은 줄여 그린다 · 학습할 값의 수", () => {
    expect(shownNeurons(4)).toEqual([0, 1, 2, 3]);
    expect(shownNeurons(12)).toEqual([0, 1, 2, null, 9, 10, 11]);
    expect(paramCount([3, 4, 2])).toEqual({ weights: 3 * 4 + 4 * 2, biases: 6 });
  });

  it("입력 → IR", () => {
    const r = buildFromInput("신경망 3-4-2");
    expect(r.ok && r.ir.kind).toBe("nnet");
  });
});

describe("위상수학: 도넛 ↔ 머그잔", () => {
  it("도넛: 고리 위는 안, 가운데 구멍은 밖", () => {
    const f = shapeAt(0);
    expect(f([1, 0, 0])).toBeLessThan(0);
    expect(f([0, 0, 0])).toBeGreaterThan(0);
  });

  it("머그잔: 손잡이 구멍은 그대로 밖, 컵 속은 파였고, 벽은 안", () => {
    const f = shapeAt(1);
    expect(f([0.62, 0.05, 0])).toBeGreaterThan(0); // 손잡이 구멍
    expect(f([-0.32, 0.4, 0])).toBeGreaterThan(0); // 컵 속
    expect(f([0.24, 0, 0])).toBeLessThan(0); // 몸통 벽
    expect(f([-0.32, -0.55, 0])).toBeLessThan(0); // 바닥
  });

  it("그림: 위에서 본 도넛은 가운데가 비어 있다", () => {
    const w = 41;
    const img = renderTopology(0, { yaw: 0, pitch: 1.45 }, w, w);
    const alpha = (x: number, y: number) => img[(y * w + x) * 4 + 3];
    expect(alpha(20, 20)).toBe(0);
    let filled = 0;
    for (let i = 3; i < img.length; i += 4) if (img[i]) filled++;
    expect(filled).toBeGreaterThan(w * w * 0.2);
  });

  it("입력 → IR", () => {
    for (const s of ["도넛 컵", "위상수학", "donut cup"]) {
      const r = buildFromInput(s);
      expect(r.ok && r.ir.kind).toBe("topology");
    }
  });
});
