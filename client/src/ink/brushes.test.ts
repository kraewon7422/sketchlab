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
    // 획에 수직인 방향으로 잰 두께 (가운데 부분만 — 양 끝의 펜촉 자국은 빼고)
    const across = (d: string, along: [number, number], c: [number, number]) => {
      const pts = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
      const [ux, uy] = along;
      const mid = pts.filter(([x, y]) => Math.abs((x - c[0]) * ux + (y - c[1]) * uy) < 30);
      const off = mid.map(([x, y]) => (x - c[0]) * -uy + (y - c[1]) * ux);
      return Math.max(...off) - Math.min(...off);
    };
    const k = Math.SQRT1_2;
    const thin = across(strokeD(line(0, 100, 100, 0), { tool: "pen", width: 4, brush: "calligraphy" }), [k, -k], [50, 50]);
    const thick = across(strokeD(line(0, 0, 100, 100), { tool: "pen", width: 4, brush: "calligraphy" }), [k, k], [50, 50]);
    expect(thick).toBeGreaterThan(thin * 4);
  });

  it("사각 촉 형광펜: 가로획은 굵고 세로획은 가늘다", () => {
    const h = extent(strokeD(line(0, 0, 200, 0), { tool: "highlighter", width: 20, brush: "chisel" }));
    const v = extent(strokeD(line(0, 0, 0, 200), { tool: "highlighter", width: 20, brush: "chisel" }));
    expect(h.h).toBeGreaterThan(v.w * 2);
  });

  it("삼성노트처럼: 만년필은 필압에 살짝, 펜은 늘 같은 굵기", () => {
    const h = (brush: "fountain" | "ballpoint", p: number) => extent(strokeD(line(0, 0, 200, 0, p), { tool: "pen", width: 4, brush })).h;
    expect(h("fountain", 0.9)).toBeGreaterThan(h("fountain", 0.1) * 1.4);
    expect(h("ballpoint", 0.9)).toBeCloseTo(h("ballpoint", 0.1), 1);
  });

  it("끝이 가는 선: 끝 쪽이 가늘어진다", () => {
    const full = strokeD(line(0, 0, 200, 0, 0.5), { tool: "pen", width: 6, brush: "ballpoint" });
    const taper = strokeD(line(0, 0, 200, 0, 0.5), { tool: "pen", width: 6, brush: "ballpoint", line: "taper" });
    // 끝(x ≥ 180)의 위아래 폭
    const endH = (d: string) => {
      const ys = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].filter((m) => Number(m[1]) >= 185).map((m) => Number(m[2]));
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(endH(taper)).toBeLessThan(endH(full) * 0.6);
  });

  it("연필·브러시는 종이에 고정된 결(가리개) + 연필은 고른 투명도", () => {
    const pencil = strokeAttrs({ tool: "pen", brush: "pencil", opacity: 0.65 });
    expect(pencil.mask).toBe("url(#sl-pencil-mask)");
    expect(pencil.opacity).toBe(0.65);
    expect(strokeAttrs({ tool: "pen", brush: "brush", width: 20 }).mask).toBe("url(#sl-brush-mask)");
    expect(strokeAttrs({ tool: "pen", brush: "ballpoint" }).mask).toBeUndefined();
  });

  it("캘리그래피: 납작한 펜촉 — 필압과 상관없이 같은 굵기, 둥근 마개 없음", () => {
    const soft = strokeD(line(0, 0, 0, 200, 0.1), { tool: "pen", width: 4, brush: "calligraphy" });
    const hard = strokeD(line(0, 0, 0, 200, 0.9), { tool: "pen", width: 4, brush: "calligraphy" });
    expect(soft).toBe(hard);
    expect(soft).not.toContain("A"); // 원호(둥근 끝)가 없다
  });

  it("브러시·만년필: 세게 누르면 굵게, 살살 대면 가늘게", () => {
    for (const brush of ["brush", "fountain"] as const) {
      const soft = extent(strokeD(line(0, 0, 200, 0, 0.1), { tool: "pen", width: 6, brush })).h;
      const hard = extent(strokeD(line(0, 0, 200, 0, 0.9), { tool: "pen", width: 6, brush })).h;
      expect(hard).toBeGreaterThan(soft * 3);
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
