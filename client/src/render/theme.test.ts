import { describe, expect, it } from "vitest";
import { applyThemeVars, theme, themeCssVars } from "./theme";

describe("디자인 토큰 → CSS 변수", () => {
  const vars = themeCssVars();

  it("모든 색 토큰이 CSS 변수로 나온다 (누락 = 하드코딩 유혹)", () => {
    for (const key of Object.keys(theme.color)) {
      const name = `--sl-color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      expect(vars[name], `${key} 토큰이 CSS로 전달되지 않음`).toBeDefined();
    }
  });

  it("camelCase 토큰을 kebab-case 변수명으로 바꾼다", () => {
    expect(vars["--sl-color-group-hint"]).toBe(theme.color.groupHint);
    expect(vars["--sl-radius-sheet"]).toBe("20px");
  });

  it("space 스케일 전체를 px 단위로 노출한다", () => {
    expect(vars["--sl-space-0"]).toBe("0px");
    expect(vars["--sl-space-6"]).toBe("32px");
    expect(Object.keys(vars).filter((k) => k.startsWith("--sl-space-"))).toHaveLength(
      theme.space.length,
    );
  });

  it("모션·터치 토큰에 단위가 붙는다", () => {
    expect(vars["--sl-motion-base"]).toBe("250ms");
    expect(vars["--sl-touch-min"]).toBe("44px");
    expect(vars["--sl-motion-ease-out"]).toBe(theme.motion.easeOut);
  });
});

describe("applyThemeVars", () => {
  it("주어진 엘리먼트에 변수를 전부 써넣는다", () => {
    const written = new Map<string, string>();
    const fake = { style: { setProperty: (n: string, v: string) => void written.set(n, v) } };

    applyThemeVars(fake);

    const expected = themeCssVars();
    expect(written.size).toBe(Object.keys(expected).length);
    expect(written.get("--sl-color-ink")).toBe(theme.color.ink);
  });
});
