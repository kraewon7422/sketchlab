import type katexType from "katex";

/**
 * 수식이 화면에서 실제로 차지할 크기 (px) — 글자 수로 어림하면 겹친다
 * (실측: 3원 연립 풀이와 역행렬이 겹침, 반응식 두 줄이 겹침).
 * KaTeX로 화면 밖에 그려 보고 잰다. DOM이 없으면(테스트) 넉넉히 어림한다.
 */
export function measureKatex(katex: typeof katexType, latex: string, fontSize: number, display: boolean): { width: number; height: number } {
  if (typeof document === "undefined") return { width: latex.length * fontSize * 0.62 + 24, height: fontSize * 2 };
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;left:-9999px;top:0;white-space:nowrap;font-size:${fontSize}px`;
  el.innerHTML = katex.renderToString(latex, { throwOnError: false, displayMode: display });
  document.body.appendChild(el);
  const r = { width: Math.ceil(el.offsetWidth) + 8, height: Math.ceil(el.offsetHeight) + 8 };
  el.remove();
  return r;
}
