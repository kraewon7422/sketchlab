import type { CodeOutput } from "@sketchlab/shared";

/**
 * 온라인 실행 (Wandbox — 무료 공개 컴파일러, 키 없음). Java, 그리고 기기 안 실행기가 못 하는 C·C++.
 * 코드는 wandbox.org로 보내진다 (그 밖의 곳·사람에게는 가지 않는다). 인터넷이 필요하다.
 * 서버가 바쁠 때가 있어 그럴 땐 "잠시 뒤 다시"라고 알려 준다.
 */
export type OnlineLang = "java" | "c" | "cpp";
const COMPILER: Record<OnlineLang, string> = { java: "openjdk-jdk-22+36", c: "gcc-13.2.0-c", cpp: "gcc-13.2.0" };
const URL_ = "https://wandbox.org/api/compile.json";
const TIMEOUT_MS = 30_000;

interface WandboxReply {
  status?: string;
  compiler_error?: string;
  compiler_message?: string;
  program_output?: string;
  program_error?: string;
}

/** Wandbox 답 → 결과 조각 (순수 함수, 테스트용) */
export function readReply(r: WandboxReply): CodeOutput[] {
  const busy = /OCI runtime|Resource temporarily unavailable/i.test(`${r.compiler_error ?? ""}${r.program_error ?? ""}`);
  if (busy) return [{ t: "text", text: "온라인 실행기(Wandbox)가 지금 바빠요 — 잠시 뒤 다시 ▶를 눌러 주세요", error: true }];
  const items: CodeOutput[] = [];
  if (r.compiler_error) items.push({ t: "text", text: r.compiler_error.slice(0, 6000), error: true });
  if (r.program_output) items.push({ t: "text", text: r.program_output.slice(0, 19900) });
  if (r.program_error) items.push({ t: "text", text: r.program_error.slice(0, 6000), error: true });
  if (r.status && r.status !== "0" && !r.compiler_error) items.push({ t: "text", text: `프로그램이 ${r.status}(으)로 끝났어요`, error: true });
  return items;
}

/** Java는 파일 이름이 정해져 있어 public class를 그냥 class로 (Main이든 무엇이든 돌게) */
export const adaptJava = (code: string): string => code.replace(/\bpublic\s+(final\s+)?class\s+/g, (_, f: string | undefined) => `${f ?? ""}class `);

export async function runOnline(lang: OnlineLang, code: string, stdin = ""): Promise<{ items: CodeOutput[]; ms: number }> {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL_, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiler: COMPILER[lang],
        code: lang === "java" ? adaptJava(code) : code,
        stdin,
        // Java: 소스·출력을 UTF-8로 (안 하면 한글이 ??로 나온다)
        "compiler-option-raw": lang === "cpp" ? "-std=c++17" : lang === "java" ? "-encoding\nUTF-8" : "",
        "runtime-option-raw": lang === "java" ? "-Dfile.encoding=UTF-8\n-Dstdout.encoding=UTF-8\n-Dstderr.encoding=UTF-8" : "",
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { items: [{ t: "text", text: `온라인 실행기가 답하지 않아요 (HTTP ${res.status}) — 잠시 뒤 다시`, error: true }], ms: performance.now() - t0 };
    return { items: readReply((await res.json()) as WandboxReply), ms: performance.now() - t0 };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      items: [{ t: "text", text: aborted ? "30초 안에 온라인 실행기의 답이 없어요 — 잠시 뒤 다시" : "인터넷에 연결되어 있는지 확인해 주세요 (Java는 온라인으로 실행해요)", error: true }],
      ms: performance.now() - t0,
    };
  } finally {
    clearTimeout(timer);
  }
}
