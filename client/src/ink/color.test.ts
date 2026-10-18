import { describe, expect, it } from "vitest";
import { hexToHsl, hslToHex, rainbow } from "./color";

describe("색 변환 (HSL ↔ hex)", () => {
  it("기본색", () => {
    expect(hslToHex({ h: 0, s: 100, l: 50 })).toBe("#FF0000");
    expect(hslToHex({ h: 120, s: 100, l: 50 })).toBe("#00FF00");
    expect(hslToHex({ h: 240, s: 100, l: 50 })).toBe("#0000FF");
    expect(hslToHex({ h: 0, s: 0, l: 0 })).toBe("#000000");
    expect(hslToHex({ h: 0, s: 0, l: 100 })).toBe("#FFFFFF");
  });

  it("왕복해도 같은 색 (반올림 오차 1 이내)", () => {
    for (const hex of ["#2563EB", "#DC2626", "#16A34A", "#FACC15", "#7C3AED", "#1A1A1A"]) {
      const back = hslToHex(hexToHsl(hex));
      const diff = [1, 3, 5].map((i) => Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16)));
      expect(Math.max(...diff), hex).toBeLessThanOrEqual(3);
    }
  });

  it("무지개는 12가지 서로 다른 색", () => {
    expect(new Set(rainbow(80, 45)).size).toBe(12);
  });

  it("잘못된 값은 거의 검정", () => {
    expect(hexToHsl("blue").l).toBeLessThan(20);
  });
});
