import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetForTest, clearEntries, debugLog, getEntries, subscribe } from "./debug";

beforeEach(() => {
  __resetForTest();
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("debug 수집소", () => {
  it("기록한 항목을 순서대로 보관한다", () => {
    debugLog.info("ink", "첫 스트로크");
    debugLog.error("tier0", "분류 실패");

    const entries = getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.source).toBe("ink");
    expect(entries[1]?.level).toBe("error");
  });

  it("변경 시 새 배열 참조를 준다 (useSyncExternalStore 계약)", () => {
    const before = getEntries();
    debugLog.info("x", "y");
    expect(getEntries()).not.toBe(before);
  });

  it("구독자에게 알리고, 해제하면 더 이상 알리지 않는다", () => {
    let calls = 0;
    const unsubscribe = subscribe(() => void calls++);

    debugLog.info("a", "1");
    expect(calls).toBe(1);

    unsubscribe();
    debugLog.info("a", "2");
    expect(calls).toBe(1);
  });

  it("Error 객체의 스택을 detail로 남긴다", () => {
    debugLog.error("export", "복사 실패", new Error("클립보드 거부"));
    expect(getEntries()[0]?.detail).toContain("클립보드 거부");
  });

  it("순환 참조가 있어도 던지지 않는다", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;

    expect(() => debugLog.warn("x", "순환", cyclic)).not.toThrow();
    expect(getEntries()).toHaveLength(1);
  });

  it("200개를 넘으면 오래된 것부터 버린다", () => {
    for (let i = 0; i < 250; i++) debugLog.info("loop", `#${i}`);

    const entries = getEntries();
    expect(entries).toHaveLength(200);
    expect(entries[0]?.message).toBe("#50");
    expect(entries[199]?.message).toBe("#249");
  });

  it("clearEntries가 비우고 알린다", () => {
    let calls = 0;
    subscribe(() => void calls++);
    debugLog.info("a", "1");

    clearEntries();

    expect(getEntries()).toHaveLength(0);
    expect(calls).toBe(2);
  });
});
