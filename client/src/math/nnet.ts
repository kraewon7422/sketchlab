/**
 * 신경망 그림 (6단계) — "신경망 3-4-4-2" → 층마다 뉴런을 세로로 세우고 이웃 층끼리 모두 잇는다.
 * 뉴런이 많은 층(9개 이상)은 위 3개 · ⋮ · 아래 3개만 그리고 개수를 적는다.
 */

export function parseNNet(input: string): number[] | null {
  const m = /^\s*(?:신경망|neural\s*net(?:work)?|nn)\s*:?\s*(\d{1,2}(?:\s*[-,→>x×]\s*\d{1,2}){1,7})\s*$/i.exec(input);
  if (!m) return null;
  const layers = (m[1] as string).split(/[-,→>x×]/).map((v) => Number(v.trim()));
  return layers.every((n) => n >= 1 && n <= 16) ? layers : null;
}

export const SHOW_MAX = 8;

/** 실제로 그릴 뉴런 (많으면 앞 3 · 뒤 3, 가운데는 ⋮) — 각 원소는 뉴런 번호(0부터), null = ⋮ */
export function shownNeurons(n: number): Array<number | null> {
  if (n <= SHOW_MAX) return Array.from({ length: n }, (_, i) => i);
  return [0, 1, 2, null, n - 3, n - 2, n - 1];
}

export function layerName(i: number, count: number): string {
  if (i === 0) return "입력층";
  if (i === count - 1) return "출력층";
  return count > 3 ? `은닉층 ${i}` : "은닉층";
}

/** 가중치(연결) 수 + 편향 수 = 학습할 값의 수 */
export function paramCount(layers: readonly number[]): { weights: number; biases: number } {
  let weights = 0;
  let biases = 0;
  for (let i = 1; i < layers.length; i++) {
    weights += (layers[i - 1] as number) * (layers[i] as number);
    biases += layers[i] as number;
  }
  return { weights, biases };
}
