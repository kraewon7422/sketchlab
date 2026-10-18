import { describe, expect, it } from "vitest";
import { parseJsonLoose } from "./client";

describe("AI 답에서 JSON 꺼내기", () => {
  it("그대로인 JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });
  it("코드 펜스로 감싼 JSON", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("앞뒤에 말이 붙은 JSON", () => {
    expect(parseJsonLoose('Here you go: {"kind":"chem"} hope it helps')).toEqual({ kind: "chem" });
  });
  it("JSON이 아니면 null", () => {
    expect(parseJsonLoose("benzene")).toBeNull();
  });
});
