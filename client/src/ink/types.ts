import type { SceneIR } from "@sketchlab/shared";

/**
 * 잉크와 씬 모델의 자료형 (마스터스펙 §5.1).
 *
 * 좌표는 "월드 좌표" — 현재는 캔버스 CSS 픽셀과 1:1이다.
 * 화면 좌표 ↔ 월드 좌표 변환은 오직 geometry.ts의 toWorld() 한 곳에서만 한다.
 * 나중에 팬·줌이 붙어도 그 함수만 바꾸면 되도록 입구를 하나로 좁혀 둔 것이다.
 */

export interface Point {
  x: number;
  y: number;
  /** 필압 0~1. 필압을 지원하지 않는 입력은 0.5로 들어온다. */
  p: number;
  /** 스트로크 시작 기준 상대 시각(ms). 그룹핑 판정에 쓴다. */
  t: number;
}

/** 축 정렬 경계 상자. min/max 형태여야 합집합·교집합 계산이 단순하다. */
export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Stroke {
  id: string;
  points: Point[];
  bbox: BBox;
  /** 스트로크가 끝난 벽시계 시각(ms). 그룹핑의 2초 판정에 쓴다. */
  endedAt: number;
  /** 펜 또는 형광펜 (형광펜은 반투명·넓은 획, 도형 인식 대상이 아니다) */
  tool: "pen" | "highlighter";
  /** 색 (없으면 기본 잉크색 — 예전에 저장된 획) */
  color?: string;
  /** 기본 굵기 px (없으면 ink.width) */
  width?: number;
}

export interface InkItem {
  id: string;
  kind: "ink";
  strokes: Stroke[];
  bbox: BBox;
}

export interface ObjectItem {
  id: string;
  kind: "object";
  ir: SceneIR;
  bbox: BBox;
  /** 재인식·되돌리기용 원본. 절대 변형하지 않는다 (§5.1). */
  sourceStrokes: Stroke[];
  transform: { x: number; y: number; scale: number };
}

export type CanvasItem = InkItem | ObjectItem;
