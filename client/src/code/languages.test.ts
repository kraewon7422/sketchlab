import { describe, expect, it } from "vitest";
import { CODE_EXAMPLES } from "../ui/CodePanel";
import { adaptForJscpp, needsOnline, runC } from "./cRun";
import { adaptJava, readReply } from "./online";
import { rStdinPrelude } from "./rRun";

const text = (items: ReturnType<typeof runC>["items"]) => items.map((i) => (i.t === "text" ? i.text : "")).join("");

describe("C·C++ (기기 안, JSCPP)", () => {
  it("C 머리말·main(void)을 JSCPP가 아는 모양으로", () => {
    expect(adaptForJscpp("#include <stdio.h>\n#include <math.h>\nint main(void) {}")).toBe("#include <cstdio>\n#include <cmath>\nint main() {}");
  });

  it("C 예시가 모두 돈다", () => {
    const out = CODE_EXAMPLES.c.map(([, src]) => runC(src));
    expect(out.every((r) => !r.unsupported && r.items.every((i) => i.t !== "text" || !i.error))).toBe(true);
    expect(text(out[0]!.items)).toContain("안녕, C!");
    expect(text(out[1]!.items)).toContain("5050");
    expect(text(out[2]!.items)).toContain("9");
  });

  it("C++ 기본 예시가 돈다 (cout·재귀)", () => {
    const hello = runC(CODE_EXAMPLES.cpp[0]![1]);
    expect(text(hello.items)).toContain("안녕, C++!");
    const fact = runC(CODE_EXAMPLES.cpp[1]![1]);
    expect(text(fact.items)).toContain("10! = 3628800");
  });

  it("vector 같은 것은 기기 안에서 못 하니 온라인으로 넘긴다", () => {
    expect(needsOnline("#include <vector>\nint main(){}")).toBe("vector");
    expect(runC(CODE_EXAMPLES.cpp[2]![1]).unsupported).toBe("vector");
  });

  it("실행 오류는 빨간 글로", () => {
    const r = runC("#include <cstdio>\nint main() { printf(\"a\"); int x = 1 / 0; return 0; }");
    expect(r.items.some((i) => i.t === "text" && i.error) || r.unsupported).toBeTruthy();
  });
});

describe("프로그램 입력 (stdin)", () => {
  it("C: scanf로 숫자·한글 단어를 읽는다", () => {
    const r = runC('#include <stdio.h>\nint main(void) {\n  int a, b;\n  char name[32];\n  scanf("%d %d", &a, &b);\n  scanf("%s", name);\n  printf("%d %s\\n", a + b, name);\n  return 0;\n}', "3 4\n민지\n");
    expect(text(r.items)).toBe("7 민지\n");
  });
  it("C++: cin으로 읽는다", () => {
    const r = runC("#include <iostream>\nusing namespace std;\nint main() { int n; cin >> n; cout << n * n << endl; return 0; }", "12\n");
    expect(text(r.items)).toContain("144");
  });
  it("R: readline()이 읽을 줄을 미리 넣는다", () => {
    const pre = rStdinPrelude('5\n"따옴표"\n');
    expect(pre).toContain('.sl_in <- c("5", "\\"따옴표\\"")');
    expect(pre).toContain("readline <- function");
  });
});

describe("Java·온라인 (Wandbox)", () => {
  it("public class → class (파일 이름과 상관없이 돌게)", () => {
    expect(adaptJava("public class Main {}\npublic final class B {}")).toBe("class Main {}\nfinal class B {}");
  });

  it("답 읽기: 출력·컴파일 오류·서버가 바쁠 때", () => {
    expect(readReply({ status: "0", program_output: "42\n" })).toEqual([{ t: "text", text: "42\n" }]);
    const err = readReply({ status: "1", compiler_error: "Main.java:3: error: ';' expected" });
    expect(err[0]).toMatchObject({ error: true });
    expect(readReply({ status: "126", compiler_error: "Error: OCI runtime error: crun: clone: Resource temporarily unavailable" })[0]).toMatchObject({ error: true, text: expect.stringContaining("바빠요") });
  });
});

describe("예시가 다 있다", () => {
  it("일곱 언어 모두 예시가 있다", () => {
    for (const l of ["python", "js", "r", "c", "cpp", "java", "html"] as const) expect(CODE_EXAMPLES[l].length).toBeGreaterThan(1);
  });
});
