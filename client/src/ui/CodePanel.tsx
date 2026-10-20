import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { useState, type ReactElement } from "react";
import { markFresh } from "../render/Shape2DView";
import { theme } from "../render/theme";
import { sessionStore } from "../store/session";
import { freeSpot, type Area } from "./placement";

/**
 * ƒ의 "코드" — 코드 블록(실행 셀) 넣기. 언어를 고르고, 빈 셀이나 예시로 시작한다.
 * 넣은 뒤에는 셀 안에서 고치고 ▶ 실행 (Shift+Enter).
 */

type Lang = "js" | "python";

const EXAMPLES: Record<Lang, Array<[string, string]>> = {
  js: [
    ["피보나치", "function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2) }\nprint([...Array(12).keys()].map(fib))"],
    ["그래프", "const xs = [...Array(60).keys()].map((i) => i / 6)\nplot(xs, xs.map(Math.sin), \"line\", \"sin x\")"],
    ["표", "table([[\"x\", \"x²\", \"x³\"], ...[1, 2, 3, 4, 5].map((x) => [x, x ** 2, x ** 3])])"],
    ["소수 찾기", "const primes = []\nfor (let n = 2; primes.length < 20; n++) if (primes.every((p) => n % p)) primes.push(n)\nprimes"],
  ],
  python: [
    ["안녕", "print(\"안녕, 파이썬!\")\nsum(range(1, 101))"],
    ["그래프", "import math\nxs = [i / 6 for i in range(60)]\nplot(xs, [math.sin(x) for x in xs], label=\"sin x\")"],
    ["표", "table([[x, x**2, x**3] for x in range(1, 6)], header=[\"x\", \"x²\", \"x³\"])"],
    ["numpy", "import numpy as np\na = np.arange(12).reshape(3, 4)\nprint(a)\na.sum(axis=0)"],
  ],
};

export function CodePanel({ area, onClose }: { area: Area; onClose: () => void }): ReactElement {
  const [lang, setLang] = useState<Lang>("python");

  const insert = (source: string) => {
    const count = sessionStore.getState().items.filter((i) => i.kind === "object" && i.ir.kind === "code").length;
    const w = Math.min(520, area.width - theme.space[6] * 2);
    const h = 100 + Math.max(3, source.split("\n").length) * 20;
    const { x, y } = freeSpot(w, h, area);
    const ir: SceneIR = { version: IR_VERSION, kind: "code", source: "manual", confidence: 1, data: { name: `셀 ${count + 1}`, lang, source } };
    const id = sessionStore.getState().addObject(ir, { x, y, scale: w }, { minX: x, minY: y, maxX: x + w, maxY: y + h });
    markFresh(id);
    onClose();
  };

  const chip = {
    minHeight: 36,
    padding: `${theme.space[1]}px ${theme.space[3]}px`,
    border: `1px solid ${theme.color.sub}`,
    borderRadius: 999,
    background: theme.color.bg,
    color: theme.color.ink,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  } as const;

  return (
    <div style={{ display: "grid", gap: theme.space[3], wordBreak: "keep-all" }}>
      <div role="radiogroup" aria-label="언어" style={{ display: "flex", gap: theme.space[2] }}>
        {(["python", "js"] as const).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            onClick={() => setLang(l)}
            style={{ ...chip, borderColor: lang === l ? theme.color.accent : theme.color.sub, background: lang === l ? theme.color.selection : theme.color.bg, color: lang === l ? theme.color.accent : theme.color.ink, fontWeight: lang === l ? 600 : 400 }}
          >
            {l === "python" ? "Python" : "JavaScript"}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: theme.color.asymptote }}>
        <b style={{ color: theme.color.ink }}>print</b> 글 · <b style={{ color: theme.color.ink }}>table</b> 표 · <b style={{ color: theme.color.ink }}>plot</b>(x, y) 그래프를 쓸 수 있어요. 같은 노트의 셀끼리 변수를 나눠 쓰고, Shift+Enter로 실행해요.
        {lang === "python" && " 파이썬은 처음 실행할 때 몇 초 준비해요. numpy 같은 꾸러미는 처음 import할 때 인터넷에서 받아요."}
      </div>
      <button
        type="button"
        onClick={() => insert("")}
        style={{ height: theme.touch.minTarget, border: "none", borderRadius: 12, background: theme.color.accent, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
      >
        빈 {lang === "python" ? "Python" : "JavaScript"} 셀 넣기
      </button>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.color.ink, marginBottom: theme.space[2] }}>예시로 시작</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: theme.space[2] }}>
          {EXAMPLES[lang].map(([label, src]) => (
            <button key={label} type="button" onClick={() => insert(src)} style={chip}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const CODE_EXAMPLES = EXAMPLES;
