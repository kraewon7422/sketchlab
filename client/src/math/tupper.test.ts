import { describe, expect, it } from "vitest";
import { buildFromInput } from "./build";
import { parseTupper, TUPPER_K, TUPPER_LATEX, tupperGrid, tupperK } from "./tupper";

describe("투퍼의 자기 참조 공식", () => {
  it("유명한 k는 543자리, 17의 배수", () => {
    expect(TUPPER_K).toHaveLength(543);
    expect(BigInt(TUPPER_K) % 17n).toBe(0n);
  });

  it("그림 ↔ k 왕복 (칸 (x, j) = n의 17x+j번째 비트)", () => {
    const grid = Array.from({ length: 17 }, () => Array.from({ length: 106 }, () => false));
    (grid[0] as boolean[])[0] = true;
    (grid[16] as boolean[])[105] = true;
    (grid[5] as boolean[])[40] = true;
    const k = tupperK(grid);
    expect(tupperGrid(k)).toEqual(grid);
    expect(tupperGrid(TUPPER_K).flat().filter(Boolean).length).toBeGreaterThan(300); // 공식 그림에는 칸이 많이 칠해진다
  });

  it("공식을 그대로 치거나 '투퍼'라고 치면 알아본다 (k=… 로 다른 그림)", () => {
    expect(parseTupper(TUPPER_LATEX)?.k).toBe(TUPPER_K);
    expect(parseTupper("투퍼 공식")?.k).toBe(TUPPER_K);
    expect(parseTupper("tupper k=34")?.k).toBe("34");
    expect(parseTupper("y=x^2")).toBeNull();
    const r = buildFromInput("투퍼 공식");
    if (!r.ok || r.ir.kind !== "plot2d") throw new Error("plot2d 아님");
    expect(r.ir.data.tupper?.k).toBe(TUPPER_K);
  });
});
