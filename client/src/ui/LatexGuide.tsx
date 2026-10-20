import katex from "katex";
import { ChevronDown } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";
import { theme } from "../render/theme";

/**
 * ƒ 입력의 "작성법" — 접었다 펴는 LaTeX(KaTeX) 쓰는 법.
 * 줄을 톡 치면 그 예시가 입력창에 들어간다 (바로 추가하지 않고 고쳐 쓸 수 있게).
 * 모든 예시는 guide.test.ts가 실제로 그려지는지 확인한다.
 */

export interface GuideRow {
  /** 무엇 */
  what: string;
  /** 입력창에 칠 것 */
  code: string;
  /** 보충 설명 (평문으로 쳐도 되는 것 등) */
  tip?: string;
}

export const GUIDE: Array<{ title: string; rows: GuideRow[] }> = [
  {
    title: "그래프 — y= 로 시작하거나 x만 있는 식",
    rows: [
      { what: "거듭제곱", code: "y=x^2-3", tip: "두 글자 이상은 중괄호: x^{10}" },
      { what: "분수", code: "y=\\frac{1}{x-1}", tip: "1/(x-1) 로 쳐도 돼요" },
      { what: "루트", code: "y=\\sqrt{x}", tip: "sqrt(x) · 세제곱근 \\sqrt[3]{x}" },
      { what: "삼각함수", code: "y=2\\sin(3x)", tip: "sin(x), cos, tan · π는 pi" },
      { what: "로그", code: "y=\\log_2 x", tip: "자연로그 \\ln x" },
      { what: "지수", code: "y=e^{-x}" },
      { what: "절댓값", code: "y=|x-1|" },
      { what: "계수 슬라이더", code: "y=ax^2+b", tip: "한 글자 계수(a, b, k…)는 슬라이더가 생겨요" },
      { what: "원·곡선", code: "x^2+y^2=4", tip: "x와 y가 둘 다 있는 식" },
      { what: "극좌표", code: "r=2\\cos(3\\theta)", tip: "θ는 \\theta" },
      { what: "정적분 (넓이)", code: "\\int_0^2 x^2\\,dx" },
    ],
  },
  {
    title: "방정식·행렬",
    rows: [
      { what: "연립방정식", code: "2x+3y=7, x-y=1", tip: "식을 쉼표로 나눠요 · 3원도 돼요" },
      { what: "행렬", code: "[[1,2],[3,4]]", tip: "행마다 [ ] · 행렬식·계수가 같이 나와요" },
      { what: "역행렬", code: "inv [[2,1],[1,3]]", tip: "det · rref · rank · T 도 돼요" },
      { what: "행렬의 곱", code: "[[1,2],[3,4]]*[[0,1],[1,0]]" },
    ],
  },
  {
    title: "공간좌표",
    rows: [{ what: "점 찍기", code: "A(2,3,4), B(-1,2,0)", tip: "이름(좌표)을 쉼표로" }],
  },
  {
    title: "부등식·확률·집합",
    rows: [
      { what: "부등식 영역", code: "y>x^2", tip: "< 는 점선, ≤ 는 실선 경계 · 1<x+y<3 처럼 이어 써도 돼요" },
      { what: "정규분포", code: "N(170,6^2), P(164<X<182)", tip: "N(평균, 표준편차^2) · 뒤에 P(…)를 쓰면 그 확률을 칠해요" },
      { what: "이항분포", code: "B(10,0.3), P(X\\le 3)", tip: "B(시행 횟수, 확률) · Po(λ) 포아송, U(a,b) 균등" },
      { what: "벤 다이어그램", code: "(A\\cup B)\\cap C", tip: "\\cap ∩ · \\cup ∪ · A-B · A^c 여집합" },
      { what: "투퍼 공식", code: "투퍼 공식", tip: "그래프가 식 자기 모양이 되는 공식 · k=… 로 다른 그림" },
    ],
  },
  {
    title: "식만 쓰기 (그래프 없이)",
    rows: [
      { what: "합 (시그마)", code: "\\sum_{k=1}^{n} k=\\frac{n(n+1)}{2}" },
      { what: "극한", code: "\\lim_{x\\to 0}\\frac{\\sin x}{x}=1" },
      { what: "근의 공식", code: "x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}" },
      { what: "부등식", code: "a^2+b^2\\ge 2ab" },
      { what: "곱·나누기", code: "3\\times 4\\div 2=6" },
      { what: "벡터·선분", code: "\\vec{a}\\cdot\\vec{b}=|\\vec{a}||\\vec{b}|\\cos\\theta" },
      { what: "그리스 문자", code: "\\alpha+\\beta=\\pi" },
    ],
  },
];

/** 자주 쓰는 기호 — 표로만 보여 준다 */
export const SYMBOLS: string[] = ["\\le", "\\ge", "\\ne", "\\pm", "\\times", "\\div", "\\cdot", "\\infty", "\\theta", "\\pi", "\\angle", "\\triangle", "\\overline{AB}", "\\to"];

const render = (latex: string) => katex.renderToString(latex, { throwOnError: false, displayMode: false });

export function LatexGuide({ onPick }: { onPick: (code: string) => void }): ReactElement {
  const [open, setOpen] = useState(false);
  const html = useMemo(() => (open ? GUIDE.map((g) => g.rows.map((r) => render(r.code))) : []), [open]);
  const symbols = useMemo(() => (open ? SYMBOLS.map(render) : []), [open]);

  return (
    <div style={{ marginTop: theme.space[3], border: `1px solid ${theme.color.sub}`, borderRadius: theme.radius.s }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          minHeight: 40,
          display: "flex",
          alignItems: "center",
          gap: theme.space[2],
          padding: `0 ${theme.space[3]}px`,
          border: "none",
          background: "transparent",
          color: theme.color.ink,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ flex: 1 }}>작성법 — LaTeX(KaTeX)로 식 쓰기</span>
        <ChevronDown size={18} strokeWidth={1.6} style={{ transform: open ? "rotate(180deg)" : undefined, transition: `transform ${theme.motion.fast}ms` }} />
      </button>
      {open && (
        <div style={{ padding: `0 ${theme.space[3]}px ${theme.space[3]}px`, fontSize: 13 }}>
          <p style={{ margin: `0 0 ${theme.space[2]}px`, color: theme.color.asymptote }}>
            명령은 \ 로 시작하고, 묶을 것은 {"{ }"} 로 감싸요. 줄을 톡 치면 입력창에 들어가요.
          </p>
          {GUIDE.map((g, gi) => (
            <div key={g.title} style={{ marginTop: theme.space[3] }}>
              <div style={{ fontWeight: 600, marginBottom: theme.space[1] }}>{g.title}</div>
              {g.rows.map((r, ri) => (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => onPick(r.code)}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "88px 1fr",
                    alignItems: "center",
                    gap: theme.space[2],
                    padding: `${theme.space[1]}px 0`,
                    border: "none",
                    borderTop: ri === 0 ? "none" : `1px solid ${theme.color.selection}`,
                    background: "transparent",
                    color: theme.color.ink,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ color: theme.color.asymptote }}>{r.what}</span>
                  <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                    <code style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12.5, overflowWrap: "anywhere" }}>{r.code}</code>
                    <span style={{ overflowX: "auto", overflowY: "hidden", padding: "3px 0" }} dangerouslySetInnerHTML={{ __html: html[gi]?.[ri] ?? "" }} />
                    {r.tip && <span style={{ fontSize: 11.5, color: theme.color.asymptote }}>{r.tip}</span>}
                  </span>
                </button>
              ))}
            </div>
          ))}
          <div style={{ marginTop: theme.space[3], fontWeight: 600 }}>자주 쓰는 기호</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 4, marginTop: theme.space[1] }}>
            {SYMBOLS.map((code, i) => (
              <span key={code} style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "2px 6px", background: theme.color.selection, borderRadius: 4 }}>
                <code style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12 }}>{code}</code>
                <span dangerouslySetInnerHTML={{ __html: symbols[i] ?? "" }} />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
