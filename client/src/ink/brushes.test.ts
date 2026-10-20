import { describe, expect, it } from "vitest";
import { isLineDrawn, strokeAttrs, strokeD } from "./brushes";
import type { Point } from "./types";

/** 외곽선 path의 높이·폭 (좌표만 대충 모아서) */
function extent(d: string): { w: number; h: number } {
  // 끝 둥근 캡(A 명령)의 반지름·플래그는 좌표가 아니다 — 빼고 x,y 짝만
  const pairs = [...d.replace(/A[^MLQZ]*/g, " ").matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)];
  const xs = pairs.map((m) => Number(m[1]));
  const ys = pairs.map((m) => Number(m[2]));
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
const line = (x0: number, y0: number, x1: number, y1: number, p = 0.5): Point[] =>
  Array.from({ length: 20 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / 19, y: y0 + ((y1 - y0) * i) / 19, p, t: i * 8 }));

describe("펜 종류·선 모양", () => {
  it("예전 획(종류 없음)은 볼펜과 똑같이 그린다", () => {
    const pts = line(0, 0, 100, 0);
    expect(strokeD(pts, { tool: "pen", width: 3 })).toBe(strokeD(pts, { tool: "pen", width: 3, brush: "ballpoint", line: "solid" }));
  });

  it("캘리그래피: 펜촉 방향(↗)과 같은 방향의 획은 가늘고, 수직 방향의 획은 굵다", () => {
    const thin = extent(strokeD(line(0, 100, 100, 0), { tool: "pen", width: 4, brush: "calligraphy" }));
    const thick = extent(strokeD(line(0, 0, 100, 100), { tool: "pen", width: 4, brush: "calligraphy" }));
    // 두 획 모두 길이 같은 대각선 — 외곽 상자 크기 차이 = 굵기 차이
    expect(thick.w + thick.h).toBeGreaterThan(thin.w + thin.h + 6);
  });

  it("사각 촉 형광펜: 가로획은 굵고 세로획은 가늘다", () => {
    const h = extent(strokeD(line(0, 0, 200, 0), { tool: "highlighter", width: 20, brush: "chisel" }));
    const v = extent(strokeD(line(0, 0, 0, 200), { tool: "highlighter", width: 20, brush: "chisel" }));
    expect(h.h).toBeGreaterThan(v.w * 2);
  });

  it("만년필·붓은 필압에 따라 굵기가 크게 바뀐다", () => {
    for (const brush of ["fountain", "brush"] as const) {
      const soft = extent(strokeD(line(0, 0, 200, 0, 0.1), { tool: "pen", width: 4, brush })).h;
      const hard = extent(strokeD(line(0, 0, 200, 0, 0.9), { tool: "pen", width: 4, brush })).h;
      expect(hard).toBeGreaterThan(soft * 2.5);
    }
  });

  it("파선·점선은 중심선을 굵기만큼 긋는다 (칠하지 않는다)", () => {
    const look = { tool: "pen" as const, width: 3, line: "dashed" as const, color: "#123456" };
    expect(isLineDrawn(look)).toBe(true);
    const a = strokeAttrs(look);
    expect(a.fill).toBe("none");
    expect(a.stroke).toBe("#123456");
    expect(a.strokeDasharray).toBeTruthy();
    expect(strokeAttrs({ ...look, line: "dotted" }).strokeDasharray?.startsWith("0 ")).toBe(true);
    // 형광펜에는 선 모양이 없다
    expect(isLineDrawn({ tool: "highlighter", line: "dashed" })).toBe(false);
  });

  it("형광펜 투명도는 획에 저장한 값", () => {
    expect(strokeAttrs({ tool: "highlighter", opacity: 0.6 }).opacity).toBe(0.6);
  });
});
