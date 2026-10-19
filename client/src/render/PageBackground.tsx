import type { ReactElement } from "react";
import type { Background } from "../store/pages";
import { pageBg } from "./theme";

/**
 * 노트 속지 — 줄·모눈·그래프 용지·점. 월드 좌표의 무늬라 이동·확대하면 글씨와 같이 움직인다.
 * 아주 넓은 사각형 하나에 무늬를 채운다 (무늬 칸은 브라우저가 알아서 반복해 그린다).
 */
const SPAN = 40000;

export function PageBackground({ kind }: { kind: Background }): ReactElement | null {
  if (kind === "blank") return null;
  const id = `sl-bg-${kind}`;
  let pattern: ReactElement;
  switch (kind) {
    case "ruled":
      pattern = (
        <pattern id={id} width={SPAN} height={pageBg.ruledGap} patternUnits="userSpaceOnUse">
          <line x1={0} y1={pageBg.ruledGap - 0.5} x2={SPAN} y2={pageBg.ruledGap - 0.5} stroke={pageBg.ruledLine} strokeWidth={1} />
        </pattern>
      );
      break;
    case "grid":
      pattern = (
        <pattern id={id} width={pageBg.gridGap} height={pageBg.gridGap} patternUnits="userSpaceOnUse">
          <path d={`M${pageBg.gridGap} 0V${pageBg.gridGap}H0`} fill="none" stroke={pageBg.gridLine} strokeWidth={1} />
        </pattern>
      );
      break;
    case "graph": {
      const m = pageBg.graphMinor;
      const M = pageBg.graphMajor;
      pattern = (
        <pattern id={id} width={M} height={M} patternUnits="userSpaceOnUse">
          {Array.from({ length: M / m }, (_, i) => (
            <g key={i}>
              <line x1={i * m} y1={0} x2={i * m} y2={M} stroke={pageBg.graphMinorLine} strokeWidth={0.8} />
              <line x1={0} y1={i * m} x2={M} y2={i * m} stroke={pageBg.graphMinorLine} strokeWidth={0.8} />
            </g>
          ))}
          <path d={`M0 0H${M}M0 0V${M}`} fill="none" stroke={pageBg.graphMajorLine} strokeWidth={1.1} />
        </pattern>
      );
      break;
    }
    case "dots":
      pattern = (
        <pattern id={id} width={pageBg.dotGap} height={pageBg.dotGap} patternUnits="userSpaceOnUse">
          <circle cx={pageBg.dotGap / 2} cy={pageBg.dotGap / 2} r={1.3} fill={pageBg.dot} />
        </pattern>
      );
      break;
  }
  return (
    <g pointerEvents="none" data-page-bg>
      <defs>{pattern}</defs>
      <rect x={-SPAN / 2} y={-SPAN / 2} width={SPAN} height={SPAN} fill={`url(#${id})`} />
      {kind === "ruled" && <line x1={pageBg.marginX} y1={-SPAN / 2} x2={pageBg.marginX} y2={SPAN / 2} stroke={pageBg.marginLine} strokeWidth={1} />}
    </g>
  );
}
