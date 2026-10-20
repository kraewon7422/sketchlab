/**
 * 3D 텐서 (6단계) — 숫자 칸을 쌓은 블록 그림.
 *
 *   텐서 2x3x4                  → 2×3×4 칸에 1, 2, 3, … (모양만 보고 싶을 때)
 *   [[[1,2],[3,4]],[[5,6],[7,8]]] → 3겹 괄호 = 그 값 그대로 (모든 줄 길이가 같아야)
 *
 * 칸 (i, j, k): i = 겹(앞→뒤), j = 행(위→아래), k = 열(왼→오). 값은 (i·d1 + j)·d2 + k 자리에.
 */

export type Dims = [number, number, number];
const MAX = 5;

export function parseTensor(input: string): { dims: Dims; values: number[] } | null {
  const s = input.trim();
  const shape = /^(?:텐서|tensor)\s*:?\s*(\d)\s*[x×*,]\s*(\d)\s*[x×*,]\s*(\d)$/i.exec(s);
  if (shape) {
    const dims = shape.slice(1, 4).map(Number) as Dims;
    if (dims.some((d) => d < 1 || d > MAX)) return null;
    return { dims, values: Array.from({ length: dims[0] * dims[1] * dims[2] }, (_, i) => i + 1) };
  }
  const body = s.replace(/^(?:텐서|tensor)\s*:?\s*/i, "");
  if (!body.startsWith("[[[")) return null;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  const d0 = data.length;
  const d1 = Array.isArray(data[0]) ? data[0].length : 0;
  const d2 = Array.isArray(data[0]?.[0]) ? data[0][0].length : 0;
  if (![d0, d1, d2].every((d) => d >= 1 && d <= MAX)) return null;
  const values: number[] = [];
  for (const layer of data) {
    if (!Array.isArray(layer) || layer.length !== d1) return null;
    for (const row of layer) {
      if (!Array.isArray(row) || row.length !== d2 || !row.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
      values.push(...(row as number[]));
    }
  }
  return { dims: [d0, d1, d2], values };
}

export const cellIndex = (dims: Dims, i: number, j: number, k: number): number => (i * dims[1] + j) * dims[2] + k;

/** 단면 하나 → 행렬 (axis 0: T[i,:,:], 1: T[:,j,:], 2: T[:,:,k]) */
export function sliceMatrix(dims: Dims, values: readonly number[], axis: number, index: number): number[][] {
  const at = (i: number, j: number, k: number) => values[cellIndex(dims, i, j, k)] ?? 0;
  const range = (n: number) => Array.from({ length: n }, (_, x) => x);
  if (axis === 0) return range(dims[1]).map((j) => range(dims[2]).map((k) => at(index, j, k)));
  if (axis === 1) return range(dims[0]).map((i) => range(dims[2]).map((k) => at(i, index, k)));
  return range(dims[0]).map((i) => range(dims[1]).map((j) => at(i, j, index)));
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100)).replace("-", "−");

/** 단면 행렬의 LaTeX (T_{1,:,:} = ( … )) — 칸 번호는 1부터 */
export function sliceLatex(dims: Dims, values: readonly number[], axis: number, index: number): string {
  const m = sliceMatrix(dims, values, axis, index);
  const sub = [0, 1, 2].map((a) => (a === axis ? String(index + 1) : ":")).join(",");
  return `T_{${sub}}=\\begin{pmatrix}${m.map((r) => r.map(num).join("&")).join("\\\\")}\\end{pmatrix}`;
}

export const formatCell = num;

/** 크기 바꾸기 — 남는 칸의 값은 그대로, 새 칸은 0 (각 축 1~5) */
export function resizeTensor(dims: Dims, values: readonly number[], next: Dims): { dims: Dims; values: number[] } {
  const d = next.map((n) => Math.max(1, Math.min(MAX, Math.round(n)))) as Dims;
  const out: number[] = [];
  for (let i = 0; i < d[0]; i++)
    for (let j = 0; j < d[1]; j++)
      for (let k = 0; k < d[2]; k++) out.push(i < dims[0] && j < dims[1] && k < dims[2] ? (values[cellIndex(dims, i, j, k)] ?? 0) : 0);
  return { dims: d, values: out };
}
