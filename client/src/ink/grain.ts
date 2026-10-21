/**
 * 종이 결 (paper grain) — 연필·브러시 질감.
 *
 * 그림 앱(Procreate "texturized grain", Corel Painter paper grain)처럼 결은 **종이에 고정**돼 있고,
 * 획은 그 결 중 도드라진 곳에만 흑연·물감이 묻는다. 결을 획마다·확대할 때마다 새로 만들지 않으므로
 * (예전 feTurbulence 필터처럼) 지글거리지 않고, 겹쳐 칠해도 같은 결이 보인다.
 *
 * 결 그림은 한 번만 만든다 (캔버스 → PNG data URL). 64 월드 px 칸에 깔아 SVG <mask>로 쓴다.
 *   연필: 가는 결 — 약 70 %만 묻고 나머지는 종이가 비친다 (밝은 점이 흩어진 흑연 느낌)
 *   브러시: 굵은 결 — 약 92 %가 묻어 거의 칠해지고 가장자리·옅은 곳만 거칠다
 */

const SIZE = 128;

/** 같은 씨앗 = 같은 결 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 결 값 0~1 (SIZE×SIZE, 가장자리가 이어지는 타일) — 잡음을 살짝 흐려 종이 섬유처럼, 가로로 조금 길게.
 * coverage: 흑연이 묻는 비율, softness: 묻는 곳과 안 묻는 곳 사이의 부드러움
 */
export function grainValues(seed: number, coverage: number, softness: number, stretch = 1.6): Float32Array {
  const r = rng(seed);
  const raw = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < raw.length; i++) raw[i] = r();
  // 타일이 이어지게 감싸서 흐리기 (가로 반경이 더 길다 = 종이 섬유 방향)
  const rx = Math.round(1 * stretch);
  const ry = 1;
  const blur = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -ry; dy <= ry; dy++)
        for (let dx = -rx; dx <= rx; dx++) {
          s += raw[((y + dy + SIZE) % SIZE) * SIZE + ((x + dx + SIZE) % SIZE)] as number;
          n++;
        }
      blur[y * SIZE + x] = s / n;
    }
  // 문턱: 위에서 coverage 만큼 묻도록 (값을 정렬해 기준을 찾는다)
  const sorted = Float32Array.from(blur).sort();
  const cut = sorted[Math.floor((1 - coverage) * (sorted.length - 1))] as number;
  const span = (sorted[sorted.length - 1] as number) - (sorted[0] as number) || 1;
  const out = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < out.length; i++) {
    const v = ((blur[i] as number) - cut) / (span * softness);
    out[i] = Math.max(0, Math.min(1, 0.5 + v));
  }
  return out;
}

function grainDataUrl(seed: number, coverage: number, softness: number): string {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(SIZE, SIZE);
  const v = grainValues(seed, coverage, softness);
  for (let i = 0; i < v.length; i++) {
    const g = Math.round((v[i] as number) * 255);
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = g;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

/** 결을 까는 칸 크기 (월드 px) — 128 화소를 이 크기에: 연필 결 한 알 ≈ 0.4 px */
const TILE = { pencil: 40, brush: 160 };

let cached: string | null = null;

/** <defs> 안에 넣을 결 무늬·가리개 (연필 sl-pencil-mask, 브러시 sl-brush-mask) */
export function grainDefs(): string {
  if (cached !== null) return cached;
  const pencil = grainDataUrl(11, 0.8, 0.45);
  const brush = grainDataUrl(29, 0.995, 0.15);
  if (!pencil || !brush) return (cached = "");
  const def = (id: string, url: string, tile: number) =>
    `<pattern id="${id}-g" patternUnits="userSpaceOnUse" width="${tile}" height="${tile}">` +
    `<image href="${url}" width="${tile}" height="${tile}" preserveAspectRatio="none"/></pattern>` +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">` +
    `<rect x="-100000" y="-100000" width="200000" height="200000" fill="url(#${id}-g)"/></mask>`;
  cached = def("sl-pencil-mask", pencil, TILE.pencil) + def("sl-brush-mask", brush, TILE.brush);
  return cached;
}
