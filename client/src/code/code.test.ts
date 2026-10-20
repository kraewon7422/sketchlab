import { CodeOutputItem } from "@sketchlab/shared";
import { loadPyodide, type PyodideInterface } from "pyodide";
import { beforeAll, describe, expect, it } from "vitest";
import { runJs } from "./jsRun";
import { normalizeTable, shareTopLevel } from "./output";
import { runPy, trimTraceback } from "./pyRun";

const texts = (items: Awaited<ReturnType<typeof runJs>>) => items.filter((i) => i.t === "text").map((i) => (i.t === "text" ? i.text : ""));

describe("JavaScript 셀", () => {
  it("print · 마지막 식의 값", async () => {
    // 줄 끝 ; — 없으면 JS는 print(…)[1,2,3] 로 읽는다 (JS 문법 그대로)
    const out = await runJs('print("안녕", 1+1);\n[1,2,3].map(x => x*x)');
    expect(texts(out)).toEqual(["안녕 2\n[1, 4, 9]"]);
  });

  it("셀끼리 변수 공유 (맨 앞 let·const도)", async () => {
    await runJs("const n = 10\nlet xs = [1,2]\nfunction sq(x) { return x*x }");
    expect(texts(await runJs("sq(n) + xs.length"))).toEqual(["102"]);
  });

  it("오류는 따로 빨갛게, 앞의 출력은 남는다", async () => {
    const out = await runJs('print("앞")\nnoSuchThing()');
    expect(out[0]).toEqual({ t: "text", text: "앞" });
    expect(out[1]).toMatchObject({ t: "text", error: true });
    expect(texts(out)[1]).toContain("ReferenceError");
  });

  it("table · plot → 저장 형식(IR)에 맞는 결과", async () => {
    const out = await runJs('table([{이름:"a", 점수:3},{이름:"b", 점수:5}])\nplot([1,2,3],[1,4,9],"scatter","제곱")\nplot([3,1,2])');
    expect(out[0]).toEqual({ t: "table", rows: [["이름", "점수"], ["a", "3"], ["b", "5"]] });
    expect(out[1]).toMatchObject({ t: "chart", kind: "scatter", label: "제곱" });
    expect(out[2]).toMatchObject({ t: "chart", kind: "line", xs: [0, 1, 2], ys: [3, 1, 2] });
    for (const o of out) expect(CodeOutputItem.safeParse(o).success).toBe(true);
  });

  it("async 결과도 기다린다", async () => {
    expect(texts(await runJs("(async () => 7 * 6)()"))).toEqual(["42"]);
  });

  it("console.log가 셀 밖으로 새지 않는다 (실행 뒤 원래대로)", async () => {
    const before = console.log;
    await runJs("console.log(1)");
    expect(console.log).toBe(before);
  });

  it("들여쓴 let은 그대로 (블록 안 변수)", () => {
    expect(shareTopLevel("let a = 1\nif (1) {\n  let b = 2\n}")).toBe("var a = 1\nif (1) {\n  let b = 2\n}");
  });

  it("너무 긴 출력은 잘라서 저장 한도를 지킨다", async () => {
    const out = await runJs('for (let i = 0; i < 5000; i++) print("가나다라마바사아자차")');
    const total = texts(out).join("").length;
    expect(total).toBeLessThanOrEqual(20100);
    for (const o of out) expect(CodeOutputItem.safeParse(o).success).toBe(true);
  });

  it("표 모양 바꾸기", () => {
    expect(normalizeTable([1, 2])).toEqual([["1"], ["2"]]);
    expect(normalizeTable("x")).toBeNull();
  });
});

describe("Python 셀 (Pyodide)", () => {
  let py: PyodideInterface;
  beforeAll(async () => {
    py = await loadPyodide();
  }, 60_000);

  it("print · 마지막 식(repr) · 셀끼리 변수", async () => {
    const a = await runPy(py, 'x = 21\nprint("안녕", x)');
    expect(texts(a)).toEqual(["안녕 21"]);
    expect(texts(await runPy(py, "x * 2"))).toEqual(["42"]);
    expect(texts(await runPy(py, "[i*i for i in range(4)]"))).toEqual(["[0, 1, 4, 9]"]);
    expect(texts(await runPy(py, "'글자'"))).toEqual(["'글자'"]);
  });

  it("오류는 셀 줄 번호와 오류 이름만", async () => {
    const out = await runPy(py, "y = 1\n1/0");
    expect(out[0]).toMatchObject({ t: "text", error: true });
    expect(texts(out)[0]).toContain("ZeroDivisionError");
    expect(texts(out)[0]).toContain("셀");
  });

  it("table · plot", async () => {
    const out = await runPy(py, 'table([[1,2],[3,4]], header=["a","b"])\nplot([1,2,3], [2,4,6], kind="bar", label="두 배")');
    expect(out[0]).toEqual({ t: "table", rows: [["a", "b"], ["1", "2"], ["3", "4"]] });
    expect(out[1]).toMatchObject({ t: "chart", kind: "bar", xs: [1, 2, 3], ys: [2, 4, 6], label: "두 배" });
  });

  it("traceback 다듬기", () => {
    const msg = 'Traceback (most recent call last):\n  File "/lib/python.zip/_pyodide/_base.py", line 1\n  File "<exec>", line 2, in <module>\nZeroDivisionError: division by zero';
    expect(trimTraceback(msg)).toBe('  셀, line 2, in <module>\nZeroDivisionError: division by zero');
  });
});
