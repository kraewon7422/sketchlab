import { describe, expect, it } from "vitest";
import { simplifyRDP } from "../../ink/simplify";
import type { Point, Stroke } from "../../ink/types";
import { createStroke } from "../../store/session";
import { unionBBoxes } from "../../ink/geometry";
import { classifyStroke, recognizeTier0, refinePolygon } from "./classify";
import { interiorAngle, type V } from "./fit";

/**
 * Tier 0 Acceptance (v4 §20 P2): 5도형 × 시도 중 80% 이상 정답.
 *
 * 손그림 흉내: 이상적인 경로에 저주파 흔들림(도형 크기의 ~2.5%) + 고주파 떨림(±0.7px),
 * 임의 시작점·회전·크기, 닫힌 도형은 끝이 ±6% 남거나 겹친다.
 * 마지막에 앱과 똑같이 RDP(0.6px)로 단순화해서 "저장된 획" 상태로 넣는다.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Path = (t: number) => V;

function handDraw(path: Path, size: number, rand: () => number, opts: { closed: boolean }): Point[] {
  const amp = size * 0.025;
  const waves = [0, 1, 2].map(() => ({
    fx: 1 + rand() * 3,
    fy: 1 + rand() * 3,
    px: rand() * Math.PI * 2,
    py: rand() * Math.PI * 2,
  }));
  const gap = opts.closed ? (rand() * 2 - 1) * 0.06 : 0; // + 겹침 / − 덜 닫힘
  const start = opts.closed ? rand() : 0;
  const steps = 160;
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = (i / steps) * (1 + gap);
    const t = (start + u) % 1;
    const base = path(opts.closed ? t : u);
    let dx = 0;
    let dy = 0;
    for (const w of waves) {
      dx += (amp / 3) * Math.sin(2 * Math.PI * w.fx * u + w.px);
      dy += (amp / 3) * Math.sin(2 * Math.PI * w.fy * u + w.py);
    }
    pts.push({
      x: base.x + dx + (rand() - 0.5) * 1.4,
      y: base.y + dy + (rand() - 0.5) * 1.4,
      p: 0.5,
      t: i * 8,
    });
  }
  return simplifyRDP(pts, 0.6);
}

function polygonPath(vertices: readonly V[]): Path {
  const n = vertices.length;
  const lens = vertices.map((v, i) => {
    const w = vertices[(i + 1) % n] as V;
    return Math.hypot(w.x - v.x, w.y - v.y);
  });
  const total = lens.reduce((s, l) => s + l, 0);
  return (t) => {
    let d = (((t % 1) + 1) % 1) * total;
    for (let i = 0; i < n; i++) {
      const l = lens[i] as number;
      if (d <= l || i === n - 1) {
        const a = vertices[i] as V;
        const b = vertices[(i + 1) % n] as V;
        const f = l === 0 ? 0 : d / l;
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
      d -= l;
    }
    return vertices[0] as V;
  };
}

function rotate(p: V, c: V, a: number): V {
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos };
}

const C = { x: 400, y: 300 };

function strokesOf(...paths: Point[][]): Stroke[] {
  return paths.map((pts, i) => createStroke(pts, 1000 + i * 300));
}

function run(strokes: Stroke[]) {
  return recognizeTier0(strokes, unionBBoxes(strokes.map((s) => s.bbox)));
}

function primitiveKinds(strokes: Stroke[]): string {
  const r = run(strokes);
  if (!r || r.ir.kind !== "shape2d") return "none";
  return r.ir.data.primitives
    .map((p) => (p.t === "polygon" ? `polygon${p.pts.length}${p.closed ? "" : "open"}` : p.t))
    .sort()
    .join("+");
}

// ─────────────────────────────────────────── 생성기

const gen = {
  triangle(rand: () => number): Stroke[] {
    const r = 60 + rand() * 120;
    const rot = rand() * Math.PI * 2;
    const angles = [0, (2 * Math.PI) / 3 + (rand() - 0.5) * 0.8, (4 * Math.PI) / 3 + (rand() - 0.5) * 0.8];
    const verts = angles.map((a) => ({ x: C.x + r * Math.cos(a + rot), y: C.y + r * Math.sin(a + rot) }));
    return strokesOf(handDraw(polygonPath(verts), 2 * r, rand, { closed: true }));
  },
  rectangle(rand: () => number): Stroke[] {
    const w = 80 + rand() * 200;
    const h = w * (0.45 + rand() * 0.4);
    const rot = rand() * Math.PI;
    const verts = [
      { x: C.x - w / 2, y: C.y - h / 2 },
      { x: C.x + w / 2, y: C.y - h / 2 },
      { x: C.x + w / 2, y: C.y + h / 2 },
      { x: C.x - w / 2, y: C.y + h / 2 },
    ].map((p) => rotate(p, C, rot));
    return strokesOf(handDraw(polygonPath(verts), w, rand, { closed: true }));
  },
  circle(rand: () => number): Stroke[] {
    const r = 40 + rand() * 140;
    return strokesOf(
      handDraw((t) => ({ x: C.x + r * Math.cos(2 * Math.PI * t), y: C.y + r * Math.sin(2 * Math.PI * t) }), 2 * r, rand, {
        closed: true,
      }),
    );
  },
  line(rand: () => number): Stroke[] {
    const len = 80 + rand() * 300;
    const a = rand() * Math.PI * 2;
    const p0 = { x: C.x - (Math.cos(a) * len) / 2, y: C.y - (Math.sin(a) * len) / 2 };
    const p1 = { x: C.x + (Math.cos(a) * len) / 2, y: C.y + (Math.sin(a) * len) / 2 };
    return strokesOf(
      handDraw((t) => ({ x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t }), len, rand, { closed: false }),
    );
  },
  arrow(rand: () => number): Stroke[] {
    const len = 120 + rand() * 250;
    const a = rand() * Math.PI * 2;
    const tail = { x: C.x - (Math.cos(a) * len) / 2, y: C.y - (Math.sin(a) * len) / 2 };
    const tip = { x: C.x + (Math.cos(a) * len) / 2, y: C.y + (Math.sin(a) * len) / 2 };
    const wing = len * (0.12 + rand() * 0.08);
    const spread = (25 + rand() * 15) * (Math.PI / 180);
    const back = a + Math.PI;
    const w1 = { x: tip.x + wing * Math.cos(back - spread), y: tip.y + wing * Math.sin(back - spread) };
    const w2 = { x: tip.x + wing * Math.cos(back + spread), y: tip.y + wing * Math.sin(back + spread) };
    const shaft = handDraw((t) => ({ x: tail.x + (tip.x - tail.x) * t, y: tail.y + (tip.y - tail.y) * t }), len, rand, {
      closed: false,
    });
    // polygonPath는 닫힌 경로다. [w1,tip,w2,tip]의 앞 절반이 정확히 w1→tip→w2 (V자 화살촉).
    const vPath = polygonPath([w1, tip, w2, tip]);
    const v = handDraw((t) => vPath(t * 0.5), wing * 2, rand, { closed: false });
    return strokesOf(shaft, v);
  },
  parabola(rand: () => number): Stroke[] {
    // U자 포물선 v = h·(2u/w)², 임의 회전
    const w = 120 + rand() * 200;
    const h = w * (0.4 + rand() * 0.8);
    const rot = rand() * Math.PI * 2;
    const path: Path = (t) => {
      const u = (t - 0.5) * w;
      const v = h * (2 * u / w) ** 2 - h / 2;
      return rotate({ x: C.x + u, y: C.y + v }, C, rot);
    };
    return strokesOf(handDraw(path, Math.max(w, h), rand, { closed: false }));
  },
  ellipse(rand: () => number): Stroke[] {
    const rx = 80 + rand() * 100;
    const ry = rx * (0.4 + rand() * 0.35);
    const rot = rand() * Math.PI;
    const path: Path = (t) => {
      const a = 2 * Math.PI * t;
      return rotate({ x: C.x + rx * Math.cos(a), y: C.y + ry * Math.sin(a) }, C, rot);
    };
    return strokesOf(handDraw(path, 2 * rx, rand, { closed: true }));
  },
};

const EXPECTED: Record<keyof typeof gen, string> = {
  triangle: "polygon3",
  rectangle: "polygon4",
  circle: "circle",
  line: "line",
  arrow: "arrow",
  parabola: "parabola",
  ellipse: "ellipse",
};

/** 열린 꺾은선을 따라가는 경로 (글씨 흉내용) */
function openPath(verts: readonly V[]): Path {
  const lens = verts.slice(1).map((v, i) => Math.hypot(v.x - (verts[i] as V).x, v.y - (verts[i] as V).y));
  const total = lens.reduce((a, b) => a + b, 0);
  return (t) => {
    let d = Math.min(1, Math.max(0, t)) * total;
    for (let i = 0; i < lens.length; i++) {
      const l = lens[i] as number;
      if (d <= l || i === lens.length - 1) {
        const a = verts[i] as V;
        const b = verts[i + 1] as V;
        const f = l === 0 ? 0 : Math.min(1, d / l);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
      d -= l;
    }
    return verts[verts.length - 1] as V;
  };
}

/** 작은 손글씨 "2x=" (획 5개, 글자 높이 ~30px) */
function handwriting(rand: () => number): Stroke[] {
  const ox = 200 + rand() * 300;
  const oy = 200 + rand() * 200;
  const s = 0.8 + rand() * 0.5;
  const P = (x: number, y: number): V => ({ x: ox + x * s, y: oy + y * s });
  const two = openPath([
    ...Array.from({ length: 9 }, (_, i) => {
      const a = Math.PI + (i / 8) * Math.PI * 1.2;
      return P(10 * Math.cos(a), -6 + 9 * Math.sin(a));
    }),
    P(-10, 16),
    P(11, 16),
  ]);
  const seg = (a: V, b: V) => openPath([a, b]);
  return strokesOf(
    handDraw(two, 30 * s, rand, { closed: false }),
    handDraw(seg(P(22, -2), P(40, 16)), 25 * s, rand, { closed: false }),
    handDraw(seg(P(40, -2), P(22, 16)), 25 * s, rand, { closed: false }),
    handDraw(seg(P(50, 2), P(66, 2)), 16 * s, rand, { closed: false }),
    handDraw(seg(P(50, 10), P(66, 10)), 16 * s, rand, { closed: false }),
  );
}

describe("Tier 0 Acceptance — 7도형 손그림 인식률 ≥ 80%", () => {
  const TRIALS = 40;
  for (const name of Object.keys(gen) as Array<keyof typeof gen>) {
    it(`${name}: ${TRIALS}회 중 80% 이상 정답`, () => {
      const rand = mulberry32(0xc0ffee + name.length * 7919);
      const misses: string[] = [];
      for (let i = 0; i < TRIALS; i++) {
        const got = primitiveKinds(gen[name](rand));
        if (got !== EXPECTED[name]) misses.push(got);
      }
      const rate = (TRIALS - misses.length) / TRIALS;
      expect(rate, `오답: ${misses.join(", ")}`).toBeGreaterThanOrEqual(0.8);
    });
  }

  it("글씨 보호: 작은 손글씨 그룹(\"2x=\") 200개 중 도형으로 바뀌는 것은 2% 이하", () => {
    let leaked = 0;
    for (let i = 0; i < 200; i++) {
      if (run(handwriting(mulberry32(9000 + i))) !== null) leaked++;
    }
    expect(leaked).toBeLessThanOrEqual(4);
  });
});

describe("스냅 규칙", () => {
  it("기울여 그린 사각형은 기울기를 보존한 직사각형이 된다 (축 정렬 강제 금지)", () => {
    const rand = mulberry32(42);
    const rot = (30 * Math.PI) / 180;
    const verts = [
      { x: C.x - 100, y: C.y - 50 },
      { x: C.x + 100, y: C.y - 50 },
      { x: C.x + 100, y: C.y + 50 },
      { x: C.x - 100, y: C.y + 50 },
    ].map((p) => rotate(p, C, rot));
    const strokes = strokesOf(handDraw(polygonPath(verts), 200, rand, { closed: true }));
    const r = run(strokes);
    if (!r || r.ir.kind !== "shape2d") throw new Error("인식 실패");
    const poly = r.ir.data.primitives[0];
    if (poly?.t !== "polygon") throw new Error("다각형이 아님");
    const pts = poly.pts.map(([x, y]) => ({ x, y }));
    for (let i = 0; i < 4; i++) expect(interiorAngle(pts, i)).toBeCloseTo(90, 5);
    // 가장 긴 변의 방향이 30° (또는 210°) 근처
    const edges = [0, 1, 2, 3].map((i) => {
      const a = pts[i] as V;
      const b = pts[(i + 1) % 4] as V;
      return { len: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x) };
    });
    const longest = edges.reduce((p, q) => (q.len > p.len ? q : p));
    const deg = (((longest.ang * 180) / Math.PI) % 180 + 180) % 180;
    expect(Math.abs(deg - 30)).toBeLessThan(4);
  });

  it("세 변이 거의 같은 삼각형은 정삼각형으로 스냅된다", () => {
    const verts = [0, 1, 2].map((i) => ({
      x: C.x + 100 * Math.cos(0.3 + (i * 2 * Math.PI) / 3) + (i === 1 ? 4 : 0),
      y: C.y + 100 * Math.sin(0.3 + (i * 2 * Math.PI) / 3),
    }));
    const { pts } = refinePolygon(verts);
    const sides = [0, 1, 2].map((i) => {
      const a = pts[i] as V;
      const b = pts[(i + 1) % 3] as V;
      return Math.hypot(b.x - a.x, b.y - a.y);
    });
    expect(Math.max(...sides) - Math.min(...sides)).toBeLessThan(1e-6);
  });

  it("직각삼각형에는 직각 표시가 붙는다", () => {
    const { marks } = refinePolygon([
      { x: 0, y: 0 },
      { x: 200, y: 3 },
      { x: 0, y: 120 },
    ]);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.at).toEqual({ x: 0, y: 0 });
  });

  it("직각 표시가 붙은 삼각형은 실제로 정확히 90°가 된다 (긴 변은 그대로)", () => {
    const input = [
      { x: 0, y: 0 },
      { x: 200, y: 3 },
      { x: 0, y: 120 },
    ];
    const { pts } = refinePolygon(input);
    expect(interiorAngle(pts, 0)).toBeCloseTo(90, 9);
    expect(pts[1]).toEqual(input[1]); // 긴 변 끝점 보존
    const short = pts[2] as V;
    expect(Math.hypot(short.x, short.y)).toBeCloseTo(120, 9); // 짧은 변 길이 보존
  });

  it("선분 세 개로 나눠 그린 삼각형도 하나의 삼각형이 된다", () => {
    const rand = mulberry32(7);
    const A = { x: 300, y: 400 };
    const B = { x: 520, y: 410 };
    const D = { x: 380, y: 220 };
    const seg = (p: V, q: V) =>
      handDraw((t) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }), 200, rand, { closed: false });
    expect(primitiveKinds(strokesOf(seg(A, B), seg(B, D), seg(D, A)))).toBe("polygon3");
  });

  it("큰 S자 곡선은 지그재그가 아니라 모양 그대로 매끈한 곡선이 된다 (원래 선에서 6px 이내)", () => {
    const ideal = (t: number) => ({ x: C.x + 60 * Math.sin(2 * Math.PI * t), y: C.y - 100 + 200 * t });
    const strokes = strokesOf(handDraw(ideal, 200, mulberry32(9), { closed: false }));
    const r = run(strokes);
    if (!r || r.ir.kind !== "shape2d") throw new Error("인식 실패");
    const curve = r.ir.data.primitives[0];
    if (curve?.t !== "curve") throw new Error(`curve가 아님: ${curve?.t}`);
    const dense = Array.from({ length: 400 }, (_, i) => ideal(i / 399));
    for (const [lx, ly] of curve.pts) {
      const x = r.transform.x + lx * r.transform.scale;
      const y = r.transform.y + ly * r.transform.scale;
      const d = Math.min(...dense.map((q) => Math.hypot(q.x - x, q.y - y)));
      expect(d).toBeLessThan(6);
    }
  });

  it("기울어진 포물선은 기울기를 유지한 정확한 포물선, 거의 대칭이면 정확히 대칭", () => {
    const rot = (35 * Math.PI) / 180;
    const path: Path = (t) => {
      const u = (t - 0.5) * 200;
      return rotate({ x: C.x + u, y: C.y + 160 * (u / 100) ** 2 }, C, rot);
    };
    const r = run(strokesOf(handDraw(path, 200, mulberry32(21), { closed: false })));
    if (!r || r.ir.kind !== "shape2d") throw new Error("인식 실패");
    const pb = r.ir.data.primitives[0];
    if (pb?.t !== "parabola") throw new Error(`parabola가 아님: ${pb?.t}`);
    // 대칭: 제어점에서 두 끝점까지 거리가 같다
    const d0 = Math.hypot(pb.p0[0] - pb.c[0], pb.p0[1] - pb.c[1]);
    const d1 = Math.hypot(pb.p1[0] - pb.c[0], pb.p1[1] - pb.c[1]);
    expect(Math.abs(d0 - d1) / Math.max(d0, d1)).toBeLessThan(1e-6);
    // 축 방향(꼭짓점→제어점의 반대 = 끝점 중점→제어점)이 원래 축(회전된 +y) 근처
    const mid = [(pb.p0[0] + pb.p1[0]) / 2, (pb.p0[1] + pb.p1[1]) / 2];
    const axis = Math.atan2(mid[1]! - pb.c[1], mid[0]! - pb.c[0]);
    const expected = Math.PI / 2 + rot;
    const diff = Math.abs(((axis - expected + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
    expect((diff * 180) / Math.PI).toBeLessThan(5);
  });

  it("타원은 장단축비와 기울기를 유지한다", () => {
    const rot = (20 * Math.PI) / 180;
    const path: Path = (t) => rotate({ x: C.x + 150 * Math.cos(2 * Math.PI * t), y: C.y + 75 * Math.sin(2 * Math.PI * t) }, C, rot);
    const r = run(strokesOf(handDraw(path, 300, mulberry32(31), { closed: true })));
    if (!r || r.ir.kind !== "shape2d") throw new Error("인식 실패");
    const e = r.ir.data.primitives[0];
    if (e?.t !== "ellipse") throw new Error(`ellipse가 아님: ${e?.t}`);
    expect(e.rx / e.ry).toBeGreaterThan(1.75);
    expect(e.rx / e.ry).toBeLessThan(2.25);
    const deg = ((((e.rot * 180) / Math.PI) % 180) + 180) % 180;
    expect(Math.abs(deg - 20)).toBeLessThan(5);
  });

  it("원·타원·다각형이 아닌 닫힌 모양(D자)은 닫힌 매끈한 곡선 — 모서리는 뾰족하게 유지", () => {
    const dShape: Path = (t) => {
      // 왼쪽은 직선, 오른쪽은 반원 → 위아래에 모서리 2개
      if (t < 0.3) return { x: C.x - 80, y: C.y + 120 - (t / 0.3) * 240 };
      const a = -Math.PI / 2 + ((t - 0.3) / 0.7) * Math.PI;
      return { x: C.x - 80 + 120 * Math.cos(a), y: C.y + 120 * Math.sin(a) };
    };
    const r = run(strokesOf(handDraw(dShape, 240, mulberry32(41), { closed: true })));
    if (!r || r.ir.kind !== "shape2d") throw new Error("인식 실패");
    const cv = r.ir.data.primitives[0];
    if (cv?.t !== "curve") throw new Error(`curve가 아님: ${cv?.t}`);
    const dup = cv.pts.filter((p, i) => i > 0 && p[0] === cv.pts[i - 1]![0] && p[1] === cv.pts[i - 1]![1]).length;
    expect(dup).toBeGreaterThanOrEqual(1); // 모서리 표기(같은 점 두 번)
  });

  it("흔들려서 V로 안 읽히는 작은 화살촉도 몸통 끝에 있으면 화살표가 된다", () => {
    const tail = { x: 100, y: 400 };
    const tip = { x: 400, y: 340 };
    const shaft = handDraw((t) => ({ x: tail.x + (tip.x - tail.x) * t, y: tail.y + (tip.y - tail.y) * t }), 300, mulberry32(5), {
      closed: false,
    });
    // 촉 근처의 꼬불꼬불한 작은 덩어리 (몸통 쪽으로 젖혀짐)
    const head: Point[] = Array.from({ length: 30 }, (_, k) => {
      const t = k / 29;
      const back = { x: tip.x - 28 * Math.abs(1 - 2 * t), y: tip.y + (t < 0.5 ? -14 : 14) * Math.abs(1 - 2 * t) };
      return { x: back.x + 4 * Math.sin(k * 1.7), y: back.y + 4 * Math.cos(k * 2.3), p: 0.5, t: k * 8 };
    });
    expect(primitiveKinds(strokesOf(shaft, head))).toBe("arrow");
  });

  it("몸통 끝이 아닌 곳의 낙서는 화살촉이 아니다 — 선분 + 곡선으로 따로 남는다", () => {
    const shaft = handDraw((t) => ({ x: 100 + 300 * t, y: 400 }), 300, mulberry32(6), { closed: false });
    const doodle: Point[] = Array.from({ length: 30 }, (_, k) => ({
      x: 250 + 14 * Math.sin(k * 0.9),
      y: 380 + 10 * Math.cos(k * 1.3),
      p: 0.5,
      t: k * 8,
    }));
    expect(primitiveKinds(strokesOf(shaft, doodle))).toBe("curve+line");
  });

  it("반원 호는 arc로 인식되고 각도는 증가 방향으로 저장된다", () => {
    const rand = mulberry32(11);
    const pts = handDraw(
      (t) => ({ x: C.x + 120 * Math.cos(Math.PI * t), y: C.y + 120 * Math.sin(Math.PI * t) }),
      240,
      rand,
      { closed: false },
    );
    const shape = classifyStroke(pts);
    expect(shape?.kind).toBe("arc");
    if (shape?.kind !== "arc") return;
    expect(shape.to).toBeGreaterThan(shape.from);
    expect(((shape.to - shape.from) * 180) / Math.PI).toBeGreaterThan(150);
  });

  it("너무 작은 획(점)은 인식하지 않는다", () => {
    expect(classifyStroke([{ x: 0, y: 0 }, { x: 3, y: 2 }])).toBeNull();
  });

  it("결과 IR은 스키마를 통과하고 좌표는 0~1 근처로 정규화된다", async () => {
    const { SceneIRSchema } = await import("@sketchlab/shared");
    const rand = mulberry32(3);
    const r = run(gen.rectangle(rand));
    if (!r) throw new Error("인식 실패");
    expect(SceneIRSchema.safeParse(r.ir).success).toBe(true);
    if (r.ir.kind !== "shape2d") throw new Error("kind");
    for (const p of r.ir.data.primitives) {
      if (p.t !== "polygon") continue;
      for (const [x, y] of p.pts) {
        expect(x).toBeGreaterThan(-0.2);
        expect(x).toBeLessThan(1.2);
        expect(y).toBeGreaterThan(-0.2);
        expect(y).toBeLessThan(1.2);
      }
    }
  });
});
