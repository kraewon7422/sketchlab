/**
 * 위상수학 (6단계) — 도넛 ↔ 머그잔 연속 변형. "구멍이 하나"라는 성질은 그대로인 채 모양만 바뀐다.
 *
 * 부호 거리 함수(SDF)로 모양을 정의하고 광선 진행(ray marching)으로 그린다 (WebGL·라이브러리 없이 CPU로).
 *   t = 0  도넛: 바닥에 누운 고리 (반지름 R = 1, 굵기 r = 0.42)
 *   t → 1  고리는 작아지며 세워져 손잡이가 되고, 옆에서 몸통이 자라나 위가 파인다 (컵의 속은 구멍이 아니라 오목한 곳)
 * 둘을 부드러운 합집합(smooth union)으로 붙여 이음매 없이 이어진다.
 *
 * 좌표: y 위, x 오른쪽, z 보는 사람 쪽 (solid/project.ts의 rotate와 같은 그리기 좌표계).
 */

export interface View3 {
  yaw: number;
  pitch: number;
}

type V = [number, number, number];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0~1을 부드럽게 (시작·끝이 천천히) */
const ease = (t: number) => t * t * (3 - 2 * t);

function smoothUnion(a: number, b: number, k: number): number {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return lerp(b, a, h) - k * h * (1 - h);
}

/** 위로 열린 컵 몸통 (속이 파인 원기둥) — 반지름 R, 높이 2H, 벽 두께 w */
function cupBody(p: V, R: number, H: number, w: number, hollow: number): number {
  const q = Math.hypot(p[0], p[2]);
  const outer = Math.max(q - R, Math.abs(p[1]) - H);
  // 속: 바닥 두께만큼 위에서부터, 깊이는 hollow(0~1)에 따라
  const depth = (2 * H - w) * hollow;
  if (depth <= 1e-4) return outer - 0.06;
  const innerTop = H + 0.5;
  const innerBottom = H - depth;
  const cy = (innerTop + innerBottom) / 2;
  const inner = Math.max(q - (R - w), Math.abs(p[1] - cy) - (innerTop - innerBottom) / 2);
  return Math.max(outer, -inner) - 0.06;
}

/** 이 t에서의 모양 → 거리 함수 */
export function shapeAt(tRaw: number): (p: V) => number {
  const t = Math.max(0, Math.min(1, tRaw));
  const s = ease(t);
  // 고리 → 손잡이: 가운데 (0,0,0)→(0.62,0.05,0), R 1→0.42, r 0.42→0.12, 눕힌 고리를 x축 둘레로 세운다
  const cx = lerp(0, 0.62, s);
  const cyy = lerp(0, 0.05, s);
  const R = lerp(1.0, 0.42, s);
  const r = lerp(0.42, 0.12, s);
  const tilt = (Math.PI / 2) * s;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  // 몸통: 고리 왼쪽에서 자라난다 (t 0.15부터), 속은 t 0.55부터 파인다
  const grow = ease(Math.max(0, Math.min(1, (t - 0.12) / 0.6)));
  const hollow = ease(Math.max(0, Math.min(1, (t - 0.55) / 0.45)));
  const bx = -0.32;
  return (p) => {
    // 고리 (기울인 좌표에서 y축이 고리의 축)
    const x = p[0] - cx;
    const y = p[1] - cyy;
    const z = p[2];
    const ry = y * ct - z * st;
    const rz = y * st + z * ct;
    const torus = Math.hypot(Math.hypot(x, rz) - R, ry) - r;
    if (grow < 0.01) return torus;
    const k = 0.78 * grow;
    const q: V = [(p[0] - bx) / k, p[1] / k, p[2] / k];
    const body = cupBody(q, 0.78, 0.82, 0.13, hollow) * k;
    return smoothUnion(torus, body, 0.12);
  };
}

/** 보는 좌표 → 세계 좌표 (rotate의 역) */
function unrotate(p: V, v: View3): V {
  const cp = Math.cos(v.pitch);
  const sp = Math.sin(v.pitch);
  const y1 = p[1] * cp + p[2] * sp;
  const z1 = -p[1] * sp + p[2] * cp;
  const cy = Math.cos(v.yaw);
  const sy = Math.sin(v.yaw);
  return [p[0] * cy - z1 * sy, y1, p[0] * sy + z1 * cy];
}

const COLOR_DONUT: V = [222, 160, 96];
const COLOR_MUG: V = [96, 146, 214];

/**
 * w×h 화소의 RGBA (배경 투명). 화면 [−half, half]² 를 평행 투영으로 본다.
 * 광선마다 최대 64걸음 — 300×300도 수십 ms.
 */
export function renderTopology(t: number, view: View3, w: number, h: number, half = 1.75): Uint8ClampedArray {
  const sdf = shapeAt(t);
  const out = new Uint8ClampedArray(w * h * 4);
  const dir = unrotate([0, 0, -1], view);
  const light = (() => {
    const l: V = [-0.45, 0.8, 0.55];
    const n = Math.hypot(...l);
    return [l[0] / n, l[1] / n, l[2] / n] as V;
  })();
  const base: V = [0, 1, 2].map((i) => lerp(COLOR_DONUT[i] as number, COLOR_MUG[i] as number, ease(t))) as V;
  const e = 0.002;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const u = ((px + 0.5) / w) * 2 * half - half;
      const v = half - ((py + 0.5) / h) * 2 * half;
      const o = unrotate([u, v * (h / w), 3.2], view);
      let d = 0;
      let hit = false;
      let p: V = o;
      for (let step = 0; step < 64; step++) {
        p = [o[0] + dir[0] * d, o[1] + dir[1] * d, o[2] + dir[2] * d];
        const dist = sdf(p);
        if (dist < 0.0015) {
          hit = true;
          break;
        }
        d += dist * 0.9;
        if (d > 6.5) break;
      }
      if (!hit) continue;
      // 법선 (사면체 4점 차분)
      const a = sdf([p[0] + e, p[1] - e, p[2] - e]);
      const b = sdf([p[0] - e, p[1] - e, p[2] + e]);
      const c = sdf([p[0] - e, p[1] + e, p[2] - e]);
      const dd = sdf([p[0] + e, p[1] + e, p[2] + e]);
      const n: V = [a - b - c + dd, -a - b + c + dd, -a + b - c + dd];
      const nl = Math.hypot(...n) || 1;
      const nx = n[0] / nl;
      const ny = n[1] / nl;
      const nz = n[2] / nl;
      const diff = Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
      // 반사광 (보는 방향의 반대 = −dir)
      const hx = light[0] - dir[0];
      const hy = light[1] - dir[1];
      const hz = light[2] - dir[2];
      const hl = Math.hypot(hx, hy, hz) || 1;
      const spec = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl) ** 40;
      const rim = (1 - Math.abs(nx * dir[0] + ny * dir[1] + nz * dir[2])) ** 3 * 0.25;
      const shade = 0.32 + 0.68 * diff;
      const i = (py * w + px) * 4;
      out[i] = base[0] * shade + 255 * (spec * 0.55 + rim * 0.4);
      out[i + 1] = base[1] * shade + 255 * (spec * 0.55 + rim * 0.4);
      out[i + 2] = base[2] * shade + 255 * (spec * 0.55 + rim * 0.4);
      out[i + 3] = 255;
    }
  }
  return out;
}

/** 이 단계의 이름 (그림 아래 글) */
export function stageName(t: number): string {
  if (t < 0.08) return "도넛 (구멍 1개)";
  if (t > 0.92) return "머그잔 (손잡이 구멍 1개)";
  return "늘이고 구부리는 중 — 찢거나 붙이지 않는다";
}
