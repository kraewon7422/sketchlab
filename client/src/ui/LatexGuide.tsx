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
  /** 입력창에 칠 것 (없으면 설명만 — 코드 셀·검산처럼 ƒ 입력이 아닌 것) */
  code?: string;
  /** 보충 설명 (평문으로 쳐도 되는 것 등) */
  tip?: string;
  /** 식이 아닌 것 — KaTeX로 그리지 않고 글자 그대로 */
  plain?: boolean;
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
    rows: [
      { what: "점 찍기", code: "A(2,3,4), B(-1,2,0)", tip: "이름(좌표)을 쉼표로" },
      { what: "곡면", code: "z=x^2-y^2", tip: "z = (x, y의 식) · 드래그해서 돌려 봐요" },
      { what: "구", code: "(x-1)^2+y^2+z^2=4", tip: "중심·반지름을 식에서 읽어요 · 펼친 식도 돼요" },
      { what: "평면", code: "x+2y+z=4", tip: "쉼표로 구와 함께: x^2+y^2+z^2=9, z=1" },
      { what: "원기둥", code: "공간 x^2+y^2=4", tip: "z가 없는 식은 앞에 '공간'을 붙여요" },
      { what: "평행육면체", code: "평행육면체 (2,0,0),(1,2,0),(0,1,2)", tip: "세 벡터 a, b, c · 부피 |a·(b×c)|가 같이 나와요" },
    ],
  },
  {
    title: "텐서·위상·신경망",
    rows: [
      { what: "3D 텐서", code: "텐서 2x3x4", tip: "값을 넣으려면 3겹 괄호 [[[1,2],[3,4]],[[5,6],[7,8]]]" },
      { what: "도넛 ↔ 컵", code: "도넛 컵", tip: "구멍이 하나인 모양은 위상수학에서 같아요 · 재생 단추" },
      { what: "신경망", code: "신경망 3-4-4-2", tip: "층마다 뉴런 수를 - 로 이어요 (층 2~8개, 층마다 16개까지)" },
    ],
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

/** 식이 아닌 특별한 것 — 무엇을 치고, 그다음 어떻게 만지는지 */
export const SPECIAL_GUIDE: Array<{ title: string; rows: GuideRow[] }> = [
  {
    title: "직접 만져 보는 그림",
    rows: [
      { plain: true, what: "3D 텐서", code: "텐서 2x3x4", tip: "칸을 톡 → 값 쓰기 · 겹·행·열 −/+로 크기 바꾸기 · 겹·행·열 단추로 단면 · 드래그로 돌리기" },
      { plain: true, what: "도넛 ↔ 컵", code: "도넛 컵", tip: "재생 단추나 슬라이더로 변형 · 드래그로 돌리기" },
      { plain: true, what: "구멍 수 (종수)", code: "종수 2", tip: "구멍 −/+ (0 = 구, 1 = 도넛 … 4)" },
      { plain: true, what: "신경망", code: "신경망 3-4-2", tip: "층마다 뉴런 −/+ · 은닉층 더하기·빼기 · 뉴런을 톡 하면 그 연결만" },
      { plain: true, what: "벤 직접 칠하기", code: "벤 3", tip: "영역을 톡 → 칠하기·지우기, 아래 식은 저절로 · 집합 2개 ↔ 3개" },
      { plain: true, what: "확률 막대 고르기", code: "B(10,0.3)", tip: "막대를 톡톡 → 고른 막대의 확률 합 · 정규분포는 축 위 동그라미를 끌어 구간" },
      { plain: true, what: "3D 손잡이", code: "평행육면체 (2,0,0),(1,2,0),(0,1,2)", tip: "파란 동그라미(벡터 끝·점·구의 중심과 반지름·평면)를 끌어 옮기기 · 빈 곳을 끌면 돌리기" },
      { plain: true, what: "그래프 따라가기", code: "y=x^2", tip: "곡선을 누른 채 끌면 그 점의 좌표" },
    ],
  },
  {
    title: "이름으로 부르는 함수·곡선·그림",
    rows: [
      { plain: true, what: "컴퓨터 함수", code: "y=relu(x)", tip: "sigmoid · relu · leakyrelu · tanh · softplus · gelu · swish · step · sign" },
      { plain: true, what: "해석 함수", code: "y=zeta(x)", tip: "zeta(리만 제타) · gamma(감마) · erf(오차함수)" },
      { plain: true, what: "유명한 곡선", code: "푸리에 급수", tip: "리만 제타 임계선 · 테일러 sin — 항의 수 N은 슬라이더" },
      { plain: true, what: "프랙탈", code: "만델브로 집합", tip: "톡 하면 확대 · [톡 = 줄리아 c]로 바꾸면 끌어서 줄리아 집합 · 코흐·시에르핀스키(혼돈 게임)·황금 나선은 단계 −/+ 와 수치" },
      { plain: true, what: "위상수학 모양", code: "뫼비우스 띠", tip: "드래그로 돌리기 · 반 꼬임 수 −/+ (홀수면 면 하나) · 세잎 매듭은 p·q로 토러스 매듭 · 클라인 병" },
      { plain: true, what: "로렌츠 끌개", code: "로렌츠 끌개", tip: "σ·ρ·β 슬라이더 — ρ < 1 원점, ρ < 24.74 고정점, 그 위는 혼돈 · [나비 효과] 두 길 · [그려지는 모습]" },
      { plain: true, what: "로지스틱 사상", code: "로지스틱 사상", tip: "옆으로 끌면 r 구간 확대 · 톡/슬라이더로 r → 주기·랴푸노프 지수 λ·xₙ 그래프" },
      { plain: true, what: "오일러 공식", code: "오일러 공식", tip: "점을 끌거나 θ 슬라이더 (θ = 180°에서 e^(iπ) + 1 = 0)" },
      { plain: true, what: "설명 접기", tip: "그림 이름을 톡 하면 밑 설명이 접히고 펴진다 (다시 톡)" },
      { plain: true, what: "라이프 게임", code: "라이프 게임", tip: "칸 톡 · 재생/멈춤 · 속도 · 한 세대 · 무작위 · 글라이더 총" },
    ],
  },
  {
    title: "ƒ 입력이 아닌 것",
    rows: [
      { plain: true, what: "코드 셀", tip: "ƒ의 '코드' 탭 → Python·JavaScript 셀 · Shift+Enter로 실행 · print·table·plot · 셀끼리 변수 공유" },
      { plain: true, what: "검산", tip: "올가미로 풀이를 골라 [검산] → 줄마다 ✓·✗ (손글씨는 AI 설정이 있을 때)" },
      { plain: true, what: "비슷한 문제", tip: "문제를 골라 [비슷한 문제] (AI 설정) · 답은 테이프 아래, 앱이 답을 확인" },
      { plain: true, what: "노트에서 찾기", tip: "노트 이름 옆 🔍 · 적분·행렬 같은 말도 찾고, AI로 말로 물어보기" },
    ],
  },
];

/** 자주 쓰는 기호 — 표로만 보여 준다 */
export const SYMBOLS: string[] = ["\\le", "\\ge", "\\ne", "\\pm", "\\times", "\\div", "\\cdot", "\\infty", "\\theta", "\\pi", "\\angle", "\\triangle", "\\overline{AB}", "\\to"];

const render = (latex: string) => katex.renderToString(latex, { throwOnError: false, displayMode: false });

export function LatexGuide({ onPick }: { onPick: (code: string) => void }): ReactElement {
  const [open, setOpen] = useState(false);
  const html = useMemo(() => (open ? GUIDE.map((g) => g.rows.map((r) => (r.code && !r.plain ? render(r.code) : ""))) : []), [open]);
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
        <span style={{ flex: 1 }}>작성법 — 식 쓰기 (KaTeX) · 특별한 것 쓰는 법</span>
        <ChevronDown size={18} strokeWidth={1.6} style={{ transform: open ? "rotate(180deg)" : undefined, transition: `transform ${theme.motion.fast}ms` }} />
      </button>
      {open && (
        <div style={{ padding: `0 ${theme.space[3]}px ${theme.space[3]}px`, fontSize: 13 }}>
          <p style={{ margin: `0 0 ${theme.space[2]}px`, color: theme.color.asymptote }}>
            명령은 \ 로 시작하고, 묶을 것은 {"{ }"} 로 감싸요. 줄을 톡 치면 입력창에 들어가요.
          </p>
          {GUIDE.map((g, gi) => (
            <Group key={g.title} title={g.title} rows={g.rows} html={html[gi] ?? []} onPick={onPick} />
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
          <div style={{ marginTop: theme.space[4], paddingTop: theme.space[2], borderTop: `1px solid ${theme.color.sub}`, fontWeight: 700 }}>특별한 것 쓰는 법 (식이 아닌 그림·기능)</div>
          {SPECIAL_GUIDE.map((g) => (
            <Group key={g.title} title={g.title} rows={g.rows} html={[]} onPick={onPick} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 작성법 한 묶음 — 줄을 톡 치면 입력창에 (칠 것이 없는 줄은 설명만) */
function Group({ title, rows, html, onPick }: { title: string; rows: GuideRow[]; html: string[]; onPick: (code: string) => void }) {
  return (
    <div style={{ marginTop: theme.space[3] }}>
      <div style={{ fontWeight: 600, marginBottom: theme.space[1] }}>{title}</div>
      {rows.map((r, ri) => {
        const inner = (
          <>
            <span style={{ color: theme.color.asymptote }}>{r.what}</span>
            <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
              {r.code && <code style={{ fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12.5, overflowWrap: "anywhere" }}>{r.code}</code>}
              {html[ri] && <span style={{ overflowX: "auto", overflowY: "hidden", padding: "3px 0" }} dangerouslySetInnerHTML={{ __html: html[ri] }} />}
              {r.tip && <span style={{ fontSize: 11.5, color: theme.color.asymptote, overflowWrap: "anywhere" }}>{r.tip}</span>}
            </span>
          </>
        );
        const style = {
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
          wordBreak: "keep-all",
        } as const;
        const code = r.code;
        return code ? (
          <button key={r.what} type="button" onClick={() => onPick(code)} style={{ ...style, cursor: "pointer" }}>
            {inner}
          </button>
        ) : (
          <div key={r.what} style={style}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
