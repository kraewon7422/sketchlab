/**
 * 축 눈금 — 교과서 규범 (마스터스펙 v4 §11.2).
 *
 *  - 기본: "nice number" 간격 1·2·5×10^k
 *  - 삼각함수: π/2 간격, 라벨 −π, −π/2, π/2, π, 3π/2 … (교과서 표기)
 *  - 원점 0은 눈금 라벨 대신 "O"를 따로 쓴다 → 눈금 목록에서 0은 뺀다
 */

export function niceStep(span: number, targetTicks = 8): number {
  if (!(span > 0)) return 1;
  const raw = span / targetTicks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const nice = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return nice * mag;
}

export interface Tick {
  value: number;
  label: string;
}

/** 부동소수 찌꺼기 없이 보이게 (0.30000000000000004 → "0.3"), 음수는 진짜 마이너스 기호 */
export function formatNumber(v: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const s = Math.abs(v).toFixed(Math.min(decimals, 6)).replace(/\.?0+$/, (m) => (m.includes(".") ? "" : m));
  return v < 0 ? `−${s}` : s;
}

export function numberTicks(min: number, max: number, step = niceStep(max - min)): Tick[] {
  const out: Tick[] = [];
  const start = Math.ceil(min / step);
  const end = Math.floor(max / step);
  for (let k = start; k <= end; k++) {
    if (k === 0) continue;
    const v = k * step;
    out.push({ value: v, label: formatNumber(v, step) });
  }
  return out;
}

/** k × (π/2) 라벨: 1 → "π/2", 2 → "π", 3 → "3π/2", −2 → "−π", 4 → "2π" */
export function piLabel(halfMultiples: number): string {
  const sign = halfMultiples < 0 ? "−" : "";
  const k = Math.abs(halfMultiples);
  if (k % 2 === 0) {
    const n = k / 2;
    return `${sign}${n === 1 ? "" : n}π`;
  }
  return `${sign}${k === 1 ? "" : k}π/2`;
}

/** π 눈금. 범위가 넓으면 π 간격, 아주 넓으면 2π 간격으로 성기게 */
export function piTicks(min: number, max: number): Tick[] {
  const half = Math.PI / 2;
  const span = (max - min) / half;
  const every = span <= 14 ? 1 : span <= 28 ? 2 : 4;
  const out: Tick[] = [];
  for (let k = Math.ceil(min / half); k <= Math.floor(max / half); k++) {
    if (k === 0 || k % every !== 0) continue;
    out.push({ value: k * half, label: piLabel(k) });
  }
  return out;
}

/**
 * 삼각함수 그래프인가 — x가 오직 sin/cos/tan 등의 인자 안에서만 쓰이면 π 눈금이 교과서 표기다.
 * (x² + sin x 처럼 다항 항이 섞이면 정수 눈금이 맞다.) MathJSON 트리를 받는다.
 */
const TRIG = new Set(["Sin", "Cos", "Tan", "Cot", "Sec", "Csc"]);
export function isTrigOnly(json: unknown, variable = "x"): boolean {
  let sawTrig = false;
  const walk = (node: unknown, insideTrig: boolean): boolean => {
    if (node === variable) return insideTrig;
    if (!Array.isArray(node)) return true;
    const [head, ...args] = node as unknown[];
    const trig = typeof head === "string" && TRIG.has(head);
    if (trig) sawTrig = true;
    return args.every((a) => walk(a, insideTrig || trig));
  };
  return walk(json, false) && sawTrig;
}
