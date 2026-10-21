import { describe, expect, it } from "vitest";
import { backprop, forward, initNet, lossOf, makeData, trainStep } from "./backprop";

describe("역전파", () => {
  it("기울기가 수치 미분과 같다 (연쇄 법칙 확인)", () => {
    const net = initNet([3, 4, 4, 2], 3);
    const s = makeData([3, 4, 4, 2], 1)[0]!;
    const p = backprop(net, s);
    const lossAt = () => {
      const y = forward(net, s.x)[3]!;
      return 0.5 * y.reduce((q, v, j) => q + (v - s.t[j]!) ** 2, 0);
    };
    const h = 1e-6;
    for (const [l, j, i] of [
      [0, 1, 2],
      [1, 3, 0],
      [2, 1, 3],
    ] as const) {
      const w0 = net.W[l]![j]![i]!;
      net.W[l]![j]![i] = w0 + h;
      const up = lossAt();
      net.W[l]![j]![i] = w0 - h;
      const down = lossAt();
      net.W[l]![j]![i] = w0;
      expect(p.gW[l]![j]![i]!).toBeCloseTo((up - down) / (2 * h), 6);
    }
  });
  it("학습하면 오차가 줄어든다", () => {
    const layers = [3, 4, 4, 2];
    const data = makeData(layers);
    let net = initNet(layers);
    const before = lossOf(net, data);
    for (let k = 0; k < 300; k++) net = trainStep(net, data, 1);
    expect(lossOf(net, data)).toBeLessThan(before * 0.3);
  });
  it("같은 층 구조면 같은 문제·같은 출발점", () => {
    expect(makeData([2, 3, 1])).toEqual(makeData([2, 3, 1]));
    expect(initNet([2, 3, 1]).W).toEqual(initNet([2, 3, 1]).W);
  });
});
