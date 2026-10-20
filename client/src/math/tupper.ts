/**
 * 투퍼의 자기 참조 공식 (Tupper's self-referential formula)
 *
 *   1/2 < ⌊ mod( ⌊y/17⌋ · 2^(−17⌊x⌋ − mod(⌊y⌋, 17)), 2 ) ⌋
 *
 * 0 ≤ x < 106, k ≤ y < k+17 범위의 그래프가 그림이 된다. k가 543자리라 보통 숫자로는 계산할 수 없어
 * BigInt로 직접 푼다: n = k/17 일 때 (x, k+j) 칸은 n의 (17x + j)번째 비트.
 * 아래 TUPPER_K는 공식 자기 자신의 모양이 나오는 유명한 k (그려서 확인함).
 * 화면 배치는 사용자 사진(삼성노트 그래프)과 같게: x는 105 → 0 (왼쪽부터), y는 k부터 아래로.
 */
export const TUPPER_K =
  "960939379918958884971672962127852754715004339660129306651505519271702802395266424689642842174350718121267153782770623355993237280874144307891325963941337723487857735749823926629715517173716995165232890538221612403238855866184013235585136048828693337902491454229288667081096184496091705183454067827731551705405381627380967602565625016981482083418783163849115590225610003652351370343874461848378737238198224849863465033159410054974700593138339226497249461751545728366702369745461014655997933798537483143786841806593422227898388722980000748404719";

export const TUPPER_W = 106;
export const TUPPER_H = 17;

/** 공식의 LaTeX (그래프 아래 이름) */
export const TUPPER_LATEX = String.raw`\frac{1}{2}<\left\lfloor\operatorname{mod}\left(\left\lfloor\frac{y}{17}\right\rfloor2^{-17\lfloor x\rfloor-\operatorname{mod}(\lfloor y\rfloor,17)},2\right)\right\rfloor`;

/** 칸 (x, k+j)가 칠해지는가 — 17의 배수가 아닌 k는 k보다 작은 가장 가까운 17의 배수 기준 */
export function tupperGrid(k: string): boolean[][] {
  const n = BigInt(k) / 17n;
  return Array.from({ length: TUPPER_H }, (_, j) => Array.from({ length: TUPPER_W }, (_, x) => ((n >> BigInt(17 * x + j)) & 1n) === 1n));
}

/** 그림(칸들) → k (사용자가 직접 그린 106×17 그림의 k를 구할 때) */
export function tupperK(grid: readonly (readonly boolean[])[]): string {
  let n = 0n;
  for (let x = 0; x < TUPPER_W; x++) for (let j = 0; j < TUPPER_H; j++) if (grid[j]?.[x]) n |= 1n << BigInt(17 * x + j);
  return (n * 17n).toString();
}

/** 입력이 투퍼 공식(또는 "투퍼"·"tupper")인가. k=… 가 있으면 그 k */
export function parseTupper(input: string): { k: string } | null {
  const compact = input.replace(/\s+/g, "");
  const named = /투퍼|tupper/i.test(compact);
  const formula = /mod/.test(compact) && /17/.test(compact) && /2\^\{?-17/.test(compact) && /lfloor|⌊|floor/.test(compact);
  if (!named && !formula) return null;
  const k = /k=(\d{1,2000})/.exec(compact)?.[1];
  return { k: k ?? TUPPER_K };
}
