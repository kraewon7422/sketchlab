import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { useState, type ReactElement } from "react";
import { markFresh } from "../render/Shape2DView";
import { theme } from "../render/theme";
import { sessionStore } from "../store/session";
import { freeSpot, type Area } from "./placement";

/**
 * ƒ의 "코드" — 코드 블록(실행 셀) 넣기. 언어를 고르고, 빈 셀이나 예시로 시작한다.
 * 넣은 뒤에는 셀 안에서 고치고 ▶ 실행 (Shift+Enter).
 *   기기 안: Python · JavaScript · R · C · C++ (C·C++은 기본 문법 — vector·string 등은 자동으로 온라인) · HTML(미니 웹 페이지)
 *   온라인:  Java (Wandbox, 인터넷 필요)
 */

type Lang = "python" | "js" | "r" | "c" | "cpp" | "java" | "html";
const LANGS: Array<[Lang, string]> = [
  ["python", "Python"],
  ["js", "JavaScript"],
  ["r", "R"],
  ["c", "C"],
  ["cpp", "C++"],
  ["java", "Java"],
  ["html", "HTML"],
];

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
  r: [
    ["안녕", "print(\"안녕, R!\")\nsum(1:100)"],
    ["요약 통계", "x <- c(3, 7, 2, 9, 4, 6)\nsummary(x)\nsd(x)"],
    ["그래프", "x <- seq(-pi, pi, length.out = 100)\nplot(x, sin(x), type = \"l\", col = \"blue\", main = \"sin x\")"],
    ["회귀", "x <- 1:10\ny <- 2 * x + 1 + c(0.3, -0.2, 0.1, 0.4, -0.5, 0.2, -0.1, 0.3, -0.4, 0.2)\nfit <- lm(y ~ x)\ncoef(fit)\nplot(x, y); abline(fit, col = \"red\")"],
  ],
  c: [
    ["안녕", "#include <stdio.h>\n\nint main(void) {\n  printf(\"안녕, C!\\n\");\n  return 0;\n}"],
    ["반복문", "#include <stdio.h>\n\nint main(void) {\n  int sum = 0;\n  for (int i = 1; i <= 100; i++) sum += i;\n  printf(\"1부터 100까지 합 = %d\\n\", sum);\n  return 0;\n}"],
    ["배열·함수", "#include <stdio.h>\n\nint max(int a[], int n) {\n  int m = a[0];\n  for (int i = 1; i < n; i++) if (a[i] > m) m = a[i];\n  return m;\n}\n\nint main(void) {\n  int a[] = {3, 9, 2, 7, 5};\n  printf(\"가장 큰 수: %d\\n\", max(a, 5));\n  return 0;\n}"],
  ],
  cpp: [
    ["안녕", "#include <iostream>\nusing namespace std;\n\nint main() {\n  cout << \"안녕, C++!\" << endl;\n  return 0;\n}"],
    ["팩토리얼", "#include <iostream>\nusing namespace std;\n\nlong long fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }\n\nint main() {\n  for (int i = 1; i <= 10; i++) cout << i << \"! = \" << fact(i) << endl;\n  return 0;\n}"],
    ["vector (온라인)", "#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n  vector<int> v = {5, 2, 9, 1, 7};\n  sort(v.begin(), v.end());\n  for (int x : v) cout << x << ' ';\n  cout << endl;\n}"],
  ],
  java: [
    ["안녕", "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"안녕, Java!\");\n  }\n}"],
    ["반복문", "public class Main {\n  public static void main(String[] args) {\n    int sum = 0;\n    for (int i = 1; i <= 100; i++) sum += i;\n    System.out.println(\"합 = \" + sum);\n  }\n}"],
    ["클래스", "class Circle {\n  double r;\n  Circle(double r) { this.r = r; }\n  double area() { return Math.PI * r * r; }\n}\n\npublic class Main {\n  public static void main(String[] args) {\n    System.out.printf(\"넓이 = %.2f%n\", new Circle(3).area());\n  }\n}"],
  ],
  html: [
    ["단추", "<button onclick=\"n++; out.textContent = n\">눌러 보기</button>\n<p>누른 횟수: <b id=\"out\">0</b></p>\n<script>let n = 0</script>"],
    ["그림 (canvas)", "<canvas id=\"c\" width=\"300\" height=\"180\"></canvas>\n<script>\nconst g = c.getContext(\"2d\")\nfor (let i = 0; i < 12; i++) {\n  g.fillStyle = `hsl(${i * 30} 80% 60%)`\n  g.beginPath(); g.arc(25 + i * 23, 90 + 40 * Math.sin(i), 18, 0, 7); g.fill()\n}\n</script>"],
    ["움직이는 글자", "<style>\nh1 { animation: s 2s infinite alternate; font-family: sans-serif }\n@keyframes s { to { color: tomato; letter-spacing: 8px } }\n</style>\n<h1>안녕, HTML!</h1>"],
  ],
};

const NOTE: Record<Lang, string> = {
  python: "print 글 · table 표 · plot(x, y) 그래프. 같은 노트의 셀끼리 변수를 나눠 써요. 처음 실행할 때 몇 초 준비해요 (numpy 같은 꾸러미는 처음 import할 때 받아요).",
  js: "print 글 · table 표 · plot(x, y) 그래프. 같은 노트의 셀끼리 변수를 나눠 써요.",
  r: "기기 안에서 R이 돌아요 (처음 한 번 약 20 MB를 받아요). plot()은 그림으로 붙어요. 같은 노트의 R 셀끼리 변수를 나눠 써요.",
  c: "기기 안에서 돌아요 (printf·배열·함수·포인터 등 기본). 기기 안 실행기가 모르는 것은 자동으로 온라인(Wandbox)에서 컴파일해요.",
  cpp: "기기 안에서 돌아요 (cout·함수·배열 등 기본). vector·string·algorithm 같은 것은 자동으로 온라인(Wandbox)에서 컴파일해요.",
  java: "Java는 온라인(Wandbox, 무료 공개 컴파일러)에서 컴파일해요 — 인터넷이 필요하고, 코드가 wandbox.org로 보내져요. 서버가 바쁘면 잠시 뒤 다시 눌러 주세요.",
  html: "▶ 보기를 누르면 셀 아래에 작은 웹 페이지로 보여요 (안전한 칸 안에서만 — 노트나 저장소에 손대지 못해요).",
};

export function CodePanel({ area, onClose }: { area: Area; onClose: () => void }): ReactElement {
  const [lang, setLang] = useState<Lang>("python");
  const name = LANGS.find(([l]) => l === lang)?.[1] ?? lang;

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
      <div role="radiogroup" aria-label="언어" style={{ display: "flex", flexWrap: "wrap", gap: theme.space[2] }}>
        {LANGS.map(([l, label]) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            onClick={() => setLang(l)}
            style={{ ...chip, borderColor: lang === l ? theme.color.accent : theme.color.sub, background: lang === l ? theme.color.selection : theme.color.bg, color: lang === l ? theme.color.accent : theme.color.ink, fontWeight: lang === l ? 600 : 400 }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: theme.color.asymptote }}>{NOTE[lang]} Shift+Enter로도 실행해요.</div>
      <button
        type="button"
        onClick={() => insert("")}
        style={{ height: theme.touch.minTarget, border: "none", borderRadius: 12, background: theme.color.accent, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer" }}
      >
        빈 {name} 셀 넣기
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
