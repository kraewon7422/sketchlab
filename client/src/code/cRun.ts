import JSCPP from "JSCPP";
import type { CodeOutput } from "@sketchlab/shared";

/**
 * C·C++을 기기 안에서 (JSCPP — C++ 해석기, 작업자 안에서 돈다).
 * 되는 것: iostream·cstdio(printf)·cmath·cstring·cstdlib·ctime·iomanip·cctype, 함수·배열·포인터·구조체 기본.
 * 안 되는 것(vector·string·algorithm 등)은 unsupported로 알려 → kernel이 온라인(Wandbox)으로 다시 돌린다.
 */

/** C 머리말을 JSCPP가 아는 이름으로 (stdio.h → cstdio …), int main(void) → int main() */
export function adaptForJscpp(code: string): string {
  const map: Record<string, string> = { "stdio.h": "cstdio", "math.h": "cmath", "stdlib.h": "cstdlib", "string.h": "cstring", "ctype.h": "cctype", "time.h": "ctime" };
  return code
    .replace(/#include\s*<([a-z]+\.h)>/g, (m, h: string) => (map[h] ? `#include <${map[h]}>` : m))
    .replace(/\bmain\s*\(\s*void\s*\)/g, "main()");
}

/**
 * JSCPP의 char는 1바이트라 한글 같은 글자를 문자열에 넣으면 넘친다 →
 * 실행 전에 ASCII 표시(DEL + 36진수 코드 + DEL)로 바꾸고, 출력에서 다시 글자로.
 * 또 JSCPP는 문자열 안의 ", " 뒤 빈칸을 먹는다 ("a, C" → "a,C") → 문자열 안의 빈칸도 같은 표시로 숨긴다.
 */
const mark = (ch: string) => `\x7f${(ch.codePointAt(0) ?? 63).toString(36)}\x7f`;
export const hideUnicode = (code: string): string =>
  code
    .replace(/"(?:[^"\\\n]|\\.)*"/g, (lit) => lit.replace(/ /g, mark))
    .replace(/[\u0080-\u{10ffff}]/gu, mark);
export const showUnicode = (out: string): string => out.replace(/\x7f([0-9a-z]+)\x7f/g, (_, c: string) => String.fromCodePoint(parseInt(c, 36)));

const KNOWN = new Set(["iostream", "cstdio", "cmath", "cstring", "cstdlib", "ctime", "iomanip", "cctype"]);

/** 기기 안 실행기가 못 하는 코드인가 (모르는 머리말) */
export function needsOnline(code: string): string | null {
  for (const m of code.matchAll(/#include\s*<([\w./]+)>/g)) {
    const h = m[1] as string;
    if (!KNOWN.has(h)) return h;
  }
  return null;
}

export function runC(code: string): { items: CodeOutput[]; unsupported?: string } {
  const missing = needsOnline(adaptForJscpp(code));
  if (missing) return { items: [], unsupported: missing };
  let out = "";
  try {
    const exit = JSCPP.run(hideUnicode(adaptForJscpp(code)), "", { stdio: { write: (s: string) => (out += s) } });
    out = showUnicode(out);
    const items: CodeOutput[] = [];
    if (out) items.push({ t: "text", text: out.slice(0, 19900) });
    if (exit !== 0) items.push({ t: "text", text: `프로그램이 ${exit}(으)로 끝났어요`, error: true });
    return { items };
  } catch (e) {
    const msg = showUnicode(e instanceof Error ? e.message : String(e));
    out = showUnicode(out);
    // 해석기가 모르는 문법·함수 → 온라인으로
    if (/not (yet )?(supported|implemented)|unknown type|cannot find|undefined is not|is not defined/i.test(msg)) return { items: [], unsupported: msg.slice(0, 120) };
    const items: CodeOutput[] = [];
    if (out) items.push({ t: "text", text: out.slice(0, 19900) });
    items.push({ t: "text", text: msg.slice(0, 2000), error: true });
    return { items };
  }
}
