import { Pause, Play, RotateCcw } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactElement, type ReactNode } from "react";
import type { SceneIR } from "@sketchlab/shared";
import type { ObjectItem } from "../ink/types";
import {
  wireHops,
  connectionCounts,
  cleanupNodes,
  DEFAULTS,
  ELECTRIC_PARTS,
  evalLogic,
  LOGIC_PARTS,
  newElectricState,
  newLogicState,
  nodesOf,
  stepElectric,
  termKey,
  terminals,
  truthTable,
  UNIT,
  wireCurrents,
  wirePath,
  LED_VF,
  type LedColor,
  type CircuitData,
  type ElectricReading,
  type Part,
  type PartType,
} from "../math/circuit";
import { sessionStore } from "../store/session";
import { viewportStore } from "../store/viewport";
import { btn, onBtn } from "./figureKit";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";

/**
 * 회로도 — 부품을 끌어 옮기고, 단자(작은 원)에서 다른 단자로 끌어 전선을 잇는다.
 *   톡: 스위치 켜고 끄기 · 논리 입력 0/1 · 다른 부품은 고르기 (아래에 값 −/+ · 돌리기 · 지우기)
 *   빈 칸에 전선을 놓으면 그 자리에 마디(점)가 생긴다 — 꺾인 길·갈림길을 만들 때
 * 전기: 시간이 흐르며 계산 (축전기 충전·방전, 교류) — 전선 위 점 = 전류 (+ → −), 전구 밝기, 계기 눈금, 시간 그래프
 * 논리: 1인 전선은 빨갛게, 아래에 진리표 (기억 회로는 지금 상태)
 */

type CircuitIR = Extract<SceneIR, { kind: "circuit" }>;

const NAMES: Record<PartType, string> = {
  battery: "전지",
  ac: "교류 전원",
  switch: "스위치",
  resistor: "저항",
  rheostat: "가변저항",
  capacitor: "축전기",
  inductor: "코일",
  bulb: "전구",
  ammeter: "전류계",
  voltmeter: "전압계",
  diode: "다이오드",
  led: "LED",
  zener: "제너 다이오드",
  npn: "NPN 트랜지스터",
  pnp: "PNP 트랜지스터",
  fuse: "퓨즈",
  motor: "모터",
  ground: "접지",
  node: "마디",
  in: "입력",
  out: "출력",
  and: "AND",
  or: "OR",
  not: "NOT",
  nand: "NAND",
  nor: "NOR",
  xor: "XOR",
  xnor: "XNOR",
  dff: "D 플립플롭",
  clock: "클록",
};

/** 값 −/+ 로 고르는 단계 */
const STEPS: Partial<Record<PartType, number[]>> = {
  battery: [1.5, 3, 4.5, 6, 9, 12, 24],
  ac: [1, 2, 5, 10, 20],
  resistor: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000],
  rheostat: [10, 50, 100, 500, 1000, 5000, 10000],
  bulb: [5, 10, 20, 50, 100],
  capacitor: [1, 10, 47, 100, 220, 470, 1000],
  inductor: [10, 50, 100, 500, 1000, 5000],
  zener: [2.7, 3.3, 5.1, 6.2, 9.1, 12],
  npn: [20, 50, 100, 200, 500],
  pnp: [20, 50, 100, 200, 500],
  fuse: [0.1, 0.25, 0.5, 1, 2, 5],
  motor: [2, 5, 10, 20, 50, 100],
};
/** LED 색 */
const LED_HEX: Record<LedColor, string> = { red: "#FF3B30", yellow: "#FFC400", green: "#22C55E", blue: "#2F7BFF", white: "#9EC5FF" };
const LED_NAME: Record<LedColor, string> = { red: "빨강", yellow: "노랑", green: "초록", blue: "파랑", white: "흰색" };
const FREQS = [0.2, 0.5, 1, 2, 5];
/** 부품 크기 단계 */
const PART_SIZES = [0.5, 0.75, 1, 1.5, 2];

const ONE = "#E0483E"; // 논리 1
const ZERO = "#9AA3B2";
const FLOW = "#E2733F";
const METER = ["#2F6DB5", "#3E9B6B", "#8A55C8", "#C0392B", "#D9772B"];

const si = (v: number, unit: string, d = 3) => {
  // 열린 스위치·전압계로 새는 아주 작은 값은 0으로
  if (Math.abs(v) < (unit === "A" ? 1e-7 : 1e-4)) return `0 ${unit}`;
  const a = Math.abs(v);
  if (a !== 0 && a < 1e-3) return `${(v * 1e6).toPrecision(d)} μ${unit}`;
  if (a !== 0 && a < 1) return `${(v * 1e3).toPrecision(d)} m${unit}`;
  if (a >= 1000) return `${(v / 1000).toPrecision(d)} k${unit}`;
  return `${v.toPrecision(d)} ${unit}`;
};
const valueText = (p: Part) => {
  const u = UNIT[p.type];
  if (!u) return "";
  const v = p.value ?? DEFAULTS[p.type] ?? 0;
  if (u === "β") return `β=${v}`;
  return u === "Ω" ? si(v, "Ω", 3).replace(/\.0+ /, " ").replace(" Ω", "Ω") : `${v} ${u}`;
};

export default memo(function CircuitObject({ item, interactive = false }: { item: ObjectItem; interactive?: boolean }): ReactElement | null {
  if (item.ir.kind !== "circuit") return null;
  return <CircuitBox item={item} ir={item.ir} interactive={interactive} />;
});

function current(item: ObjectItem): CircuitIR | null {
  const now = sessionStore.getState().items.find((i) => i.id === item.id);
  return now && now.kind === "object" && now.ir.kind === "circuit" ? now.ir : null;
}

type Drag =
  | { kind: "part"; id: string; x0: number; y0: number; gx: number; gy: number; px: number; py: number; moved: boolean }
  | { kind: "wire"; from: string; x: number; y: number }
  | { kind: "tap"; target: "wire" | "empty"; idx: number; px: number; py: number }
  | { kind: "wireMove"; idx: number; gx: number; gy: number };

function CircuitBox({ item, ir, interactive }: { item: ObjectItem; ir: CircuitIR; interactive: boolean }): ReactElement {
  const W = item.transform.scale;
  const data = ir.data;
  const fresh = isFresh(item.id);
  const cs = W / (data.w + 1);
  const H = cs * (data.h + 1);
  const X = (gx: number) => (gx + 0.5) * cs;
  const Y = (gy: number) => (gy + 0.5) * cs;

  const [sel, setSel] = useState<{ part?: string; wire?: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  const commit = (next: CircuitData, label: string) => {
    const now = current(item);
    // 지운 뒤 아무것도 이어지지 않은 마디·끊긴 전선은 치운다 (점이 남지 않게)
    if (now) sessionStore.getState().commitObjectIR(item.id, now, { ...now, data: cleanupNodes(next) }, label);
  };
  const patchPart = (id: string, patch: Partial<Part>, label: string) => commit({ ...data, parts: data.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }, label);

  // 끄는 중인 부품은 그 자리에 미리 보인다 (놓을 때 한 번 기록)
  const view: CircuitData = useMemo(() => {
    // 끄는 중인 전선은 지나는 점을 바꿔 미리 보여 준다
    if (drag?.kind === "wireMove") return { ...data, wires: data.wires.map((w, i) => (i === drag.idx ? { ...w, via: [drag.gx, drag.gy] as [number, number] } : w)) };
    if (drag?.kind !== "part" || !drag.moved) return data;
    return { ...data, parts: data.parts.map((p) => (p.id === drag.id ? { ...p, x: drag.gx, y: drag.gy } : p)) };
  }, [data, drag]);

  // ───────── 전기: 시간이 흐르며 계산
  const electric = data.mode === "electric";
  const dynamic = electric && data.parts.some((p) => p.type === "capacitor" || p.type === "inductor" || p.type === "ac");
  const [running, setRunning] = useState(true);
  const simRef = useRef(newElectricState());
  const phaseRef = useRef<number[]>([]);
  /** 모터 축 각도 (도) */
  const spinRef = useRef<Record<string, number>>({});
  const histRef = useRef<Array<{ t: number; v: number[] }>>([]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [reading, setReading] = useState<{ r: ElectricReading; wires: number[] } | null>(null);
  const meters = useMemo(() => view.parts.filter((p) => p.type === "voltmeter" || p.type === "ammeter" || p.type === "ac"), [view]);
  const metersRef = useRef(meters);
  metersRef.current = meters;

  useEffect(() => {
    if (!electric) return;
    let raf = 0;
    let last = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const frameDt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const d = viewRef.current;
      let r: ElectricReading | null = null;
      if (running) {
        const n = 8;
        for (let i = 0; i < n; i++) r = stepElectric(d, simRef.current, frameDt / n || 1e-3);
      } else r = stepElectric(d, { ...simRef.current, vc: { ...simRef.current.vc }, il: { ...simRef.current.il }, sw: { ...simRef.current.sw }, broken: { ...simRef.current.broken } }, 1e-3);
      if (r) {
        const wires = wireCurrents(d, r.into);
        const ph = phaseRef.current;
        wires.forEach((i, k) => {
          const a = Math.abs(i);
          const speed = a < 1e-7 ? 0 : Math.sign(i) * Math.min(80, 20 * Math.log10(1 + a * 1e4));
          ph[k] = ((ph[k] ?? 0) + (running ? speed * frameDt : 0)) % 1000;
        });
        if (running)
          for (const p of d.parts) {
            if (p.type !== "motor") continue;
            // 전류가 클수록 빨리 돈다 (방향도 전류를 따라)
            const i = r.part[p.id]?.i ?? 0;
            spinRef.current[p.id] = ((spinRef.current[p.id] ?? 0) + Math.max(-1080, Math.min(1080, i * 1500)) * frameDt) % 360;
          }
        if (running) {
          const reads = r;
          const t = simRef.current.t;
          const hist = histRef.current;
          hist.push({ t, v: metersRef.current.map((p) => (p.type === "ammeter" ? (reads.part[p.id]?.i ?? 0) : p.type === "ac" ? (reads.part[p.id]?.v ?? 0) : (reads.part[p.id]?.v ?? 0))) });
          while (hist.length > 2 && (hist[0] as { t: number }).t < t - 6) hist.shift();
        }
        // 화면은 두 번에 한 번 (30 fps)
        // 화면을 옮기는 중에는 회로 그림을 다시 그리지 않는다 (계산은 계속 — 멈추면 바로 따라잡는다)
        if (frame++ % 2 === 0 && !viewportStore.getState().moving) setReading({ r, wires });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [electric, running]);

  const resetSim = () => {
    simRef.current = newElectricState();
    histRef.current = [];
  };

  // ───────── 논리: 바뀔 때마다 계산 (래치·플립플롭은 지난 상태를 기억)
  const logicRef = useRef(newLogicState());
  const clocks = !electric && data.parts.some((p) => p.type === "clock");
  const [clockT, setClockT] = useState(0);
  useEffect(() => {
    if (!clocks) return;
    const t0 = performance.now();
    const id = setInterval(() => setClockT((performance.now() - t0) / 1000), 50);
    return () => clearInterval(id);
  }, [clocks]);
  const logic = useMemo(() => (electric ? null : evalLogic(view, logicRef.current, clockT)), [electric, view, clockT]);
  const nodeMap = useMemo(() => nodesOf(view).nodeOf, [view]);
  const netOf = (ref: string) => (logic ? (logic.net[nodeMap.get(ref) ?? -1] ?? 0) : 0);
  const table = useMemo(() => (electric ? null : truthTable(data)), [electric, data]);

  // ───────── 손으로 만지기
  const toGrid = (e: RPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    return { px, py, gx: px / cs - 0.5, gy: py / cs - 0.5 };
  };
  const nearestTerm = (gx: number, gy: number, except?: string): string | null => {
    let best: string | null = null;
    let bd = 0.7;
    for (const p of view.parts)
      terminals(p).forEach(([tx, ty], k) => {
        const key = termKey(p.id, k);
        const d = Math.hypot(tx - gx, ty - gy);
        if (key !== except && d < bd) {
          bd = d;
          best = key;
        }
      });
    return best;
  };
  const clampX = (x: number) => Math.max(0, Math.min(data.w, x));
  const clampY = (y: number) => Math.max(0, Math.min(data.h, y));

  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const g = toGrid(e);
    const el = (e.target as Element).closest("[data-term],[data-part],[data-wire]");
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 합성 이벤트 */
    }
    e.stopPropagation();
    if (el?.hasAttribute("data-term")) {
      setDrag({ kind: "wire", from: el.getAttribute("data-term") as string, x: g.px, y: g.py });
      return;
    }
    if (el?.hasAttribute("data-part")) {
      const id = el.getAttribute("data-part") as string;
      const p = data.parts.find((q) => q.id === id);
      if (p) setDrag({ kind: "part", id, x0: g.gx - p.x, y0: g.gy - p.y, gx: p.x, gy: p.y, px: g.px, py: g.py, moved: false });
      return;
    }
    if (el?.hasAttribute("data-wire")) {
      setDrag({ kind: "tap", target: "wire", idx: Number(el.getAttribute("data-wire")), px: g.px, py: g.py });
      return;
    }
    setDrag({ kind: "tap", target: "empty", idx: -1, px: g.px, py: g.py });
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const g = toGrid(e);
    if (d.kind === "wire") setDrag({ ...d, x: g.px, y: g.py });
    else if (d.kind === "tap" && d.target === "wire" && Math.hypot(g.px - d.px, g.py - d.py) > 6) setDrag({ kind: "wireMove", idx: d.idx, gx: clampX(Math.round(g.gx)), gy: clampY(Math.round(g.gy)) });
    else if (d.kind === "wireMove") setDrag({ ...d, gx: clampX(Math.round(g.gx)), gy: clampY(Math.round(g.gy)) });
    else if (d.kind === "part") {
      const moved = d.moved || Math.hypot(g.px - d.px, g.py - d.py) > 5;
      setDrag({ ...d, gx: clampX(Math.round(g.gx - d.x0)), gy: clampY(Math.round(g.gy - d.y0)), moved });
    }
  };
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    setDrag(null);
    if (!d) return;
    const g = toGrid(e);
    if (d.kind === "wireMove") {
      // 전선 옮기기: 놓은 격자 점을 지나게
      const w = data.wires[d.idx];
      if (w) commit({ ...data, wires: data.wires.map((x, i) => (i === d.idx ? { ...x, via: [d.gx, d.gy] as [number, number] } : x)) }, "전선 옮기기");
      setSel({ wire: d.idx });
      return;
    }
    if (d.kind === "part") {
      const p = data.parts.find((q) => q.id === d.id);
      if (!p) return;
      if (d.moved) {
        if (p.x !== d.gx || p.y !== d.gy) patchPart(p.id, { x: d.gx, y: d.gy }, `${NAMES[p.type]} 옮기기`);
        setSel({ part: p.id });
        return;
      }
      // 톡: 스위치·입력은 켜고 끄기, 나머지는 고르기
      if (p.type === "switch" || p.type === "in") {
        patchPart(p.id, { on: !p.on }, p.type === "switch" ? "스위치" : "입력 바꾸기");
        setSel({ part: p.id });
      } else setSel((s) => (s?.part === p.id ? null : { part: p.id }));
      return;
    }
    if (d.kind === "wire") {
      const to = nearestTerm(g.gx, g.gy, d.from);
      if (to) {
        if (!data.wires.some((w) => (w.a === d.from && w.b === to) || (w.a === to && w.b === d.from))) commit({ ...data, wires: [...data.wires, { a: d.from, b: to }] }, "전선 잇기");
        return;
      }
      // 빈 칸 → 그 자리에 마디를 만들고 잇는다 (단자에서 조금이라도 끌었을 때만)
      const gx = clampX(Math.round(g.gx));
      const gy = clampY(Math.round(g.gy));
      const [fid, fk] = d.from.split(":");
      const fp = data.parts.find((q) => q.id === fid);
      const ft = fp ? terminals(fp)[Number(fk)] : undefined;
      if (ft && (ft[0] !== gx || ft[1] !== gy)) {
        const id = newId(data, "node");
        commit({ ...data, parts: [...data.parts, { id, type: "node", x: gx, y: gy }], wires: [...data.wires, { a: d.from, b: `${id}:0` }] }, "전선 잇기");
      }
      return;
    }
    if (Math.hypot(g.px - d.px, g.py - d.py) > 6) return;
    setSel(d.target === "wire" ? { wire: d.idx } : null);
  };

  const selPart = sel?.part ? data.parts.find((p) => p.id === sel.part) : undefined;
  const selWire = sel?.wire !== undefined ? data.wires[sel.wire] : undefined;

  /** 회로도 전체를 크게·작게 (칸 수는 그대로, 칸이 커진다) */
  const zoomDiagram = (k: number) => {
    const now = sessionStore.getState().items.find((i) => i.id === item.id);
    if (!now) return;
    const next = Math.min(1600, Math.max(160, item.transform.scale * k));
    sessionStore.getState().commitScale([item.id], next / item.transform.scale, item.transform.x, item.transform.y, sessionStore.getState().items);
  };
  /** 판(격자) 넓히기·줄이기 — 칸 크기는 그대로, 부품이 들어갈 자리가 늘고 준다 */
  const used = data.parts.reduce((m, p) => {
    for (const [tx, ty] of terminals(p)) {
      m.x = Math.max(m.x, Math.ceil(tx));
      m.y = Math.max(m.y, Math.ceil(ty));
    }
    m.x = Math.max(m.x, p.x + 1);
    m.y = Math.max(m.y, p.y + 1);
    return m;
  }, { x: 4, y: 3 });
  const canShrink = data.w - 2 >= Math.max(6, used.x) && data.h - 2 >= Math.max(4, used.y);
  const resizeBoard = (d: number) => {
    const now = current(item);
    if (!now) return;
    const w = Math.min(78, Math.max(Math.max(6, used.x), data.w + d));
    const h = Math.min(58, Math.max(Math.max(4, used.y), data.h + d));
    if (w === data.w && h === data.h) return;
    const scale = cs * (w + 1);
    const grow = cs * (h - data.h);
    const b = item.bbox;
    sessionStore.getState().resizeObject(item.id, { ...now, data: { ...now.data, w, h } }, scale, { minX: b.minX, minY: b.minY, maxX: b.minX + scale, maxY: b.maxY + grow }, d > 0 ? "판 넓히기" : "판 줄이기");
  };

  const removePart = (id: string) => {
    commit({ ...data, parts: data.parts.filter((p) => p.id !== id), wires: data.wires.filter((w) => !w.a.startsWith(`${id}:`) && !w.b.startsWith(`${id}:`)) }, "부품 지우기");
    setSel(null);
  };
  const addPart = (type: PartType) => {
    const id = newId(data, type);
    const spot = freeCell(data, type);
    const part: Part = { id, type, x: spot[0], y: spot[1], ...(DEFAULTS[type] !== undefined ? { value: DEFAULTS[type] } : {}), ...(type === "rheostat" ? { pos: 0.5 } : {}), ...(type === "ac" || type === "clock" ? { freq: 1 } : {}), ...(type === "led" ? { color: "red" as const } : {}), ...(type === "in" || type === "out" ? { label: nextLabel(data, type) } : {}) };
    commit({ ...data, parts: [...data.parts, part] }, `${NAMES[type]} 더하기`);
    setSel({ part: id });
  };

  // 자리 상자를 실제 높이에 (부품을 고르면 아래 단추 줄이 생긴다)
  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const b = item.bbox;
    if (Math.abs(b.maxY - b.minY - h) > 2) sessionStore.getState().fitObjectBox(item.id, { minX: item.transform.x, minY: item.transform.y, maxX: item.transform.x + W, maxY: item.transform.y + h });
  });

  // ───────── 그리기
  const r = reading?.r;
  const wires = view.wires.map((w, i) => ({ w, i, pts: wirePath(view, w) }));
  // 실제 회로도 규칙: 이어지지 않고 겹치는 전선은 가로 전선에 반원 다리, 마디 점은 세 갈래 이상만
  const hops = wireHops(view, wires.map((x) => x.pts));
  const counts = connectionCounts(view);
  const hopR = 0.32;
  const wireD = (pts: Array<[number, number]>, cross: Array<[number, number]> | undefined) => {
    let d = "";
    pts.forEach(([x, y], k) => {
      if (k === 0) {
        d += `M${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
        return;
      }
      const [px, py] = pts[k - 1] as [number, number];
      if (py === y && cross?.length) {
        // 이 가로 구간 위의 교차점마다 위로 둥근 다리
        const dir = Math.sign(x - px);
        const on = cross.filter(([cx, cy]) => cy === y && (cx - px) * dir > 0 && (x - cx) * dir > 0).sort((a, b) => (a[0] - b[0]) * dir);
        for (const [cx] of on) {
          d += `L${X(cx - dir * hopR).toFixed(1)},${Y(y).toFixed(1)}`;
          d += `A${(hopR * cs).toFixed(1)},${(hopR * cs).toFixed(1)} 0 0 ${dir > 0 ? 1 : 0} ${X(cx + dir * hopR).toFixed(1)},${Y(y).toFixed(1)}`;
        }
      }
      d += `L${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
    });
    return d;
  };
  const strokeW = Math.max(1.6, cs * 0.09);
  const selColor = theme.color.accent;

  return (
    <div ref={boxRef} data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: W, pointerEvents: "none" }}>
      <svg
        width={W}
        height={H}
        style={{ display: "block", overflow: "visible", pointerEvents: interactive ? "auto" : "none", touchAction: interactive ? "none" : undefined, borderRadius: 8, background: "#FBFCFD" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        {/* 격자 점 (만질 때만) */}
        {interactive && (
          <g fill="#D5DAE1">
            {Array.from({ length: (data.w + 1) * (data.h + 1) }, (_, k) => (
              <circle key={k} cx={X(k % (data.w + 1))} cy={Y(Math.floor(k / (data.w + 1)))} r={0.9} />
            ))}
          </g>
        )}
        {/* 전선 */}
        {wires.map(({ w, i, pts }) => {
          const d = wireD(pts as Array<[number, number]>, hops.get(i));
          const on = !electric && netOf(w.a) === 1;
          const isSel = sel?.wire === i;
          const flow = electric && reading ? (reading.wires[i] ?? 0) : 0;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={isSel ? selColor : on ? ONE : electric ? theme.color.ink : ZERO} strokeWidth={isSel ? strokeW + 1.2 : strokeW} strokeLinejoin="round" strokeLinecap="round" />
              {electric && Math.abs(flow) > 1e-7 && (
                <path d={d} fill="none" stroke={FLOW} strokeWidth={strokeW + 2.4} strokeLinecap="round" strokeDasharray={`0.1 ${(cs * 0.6).toFixed(1)}`} strokeDashoffset={-(phaseRef.current[i] ?? 0)} />
              )}
              {interactive && <path data-wire={i} d={d} fill="none" stroke="transparent" strokeWidth={Math.max(12, cs * 0.6)} style={{ cursor: "pointer" }} />}
            </g>
          );
        })}
        {/* 부품 */}
        {view.parts.map((p) => {
          const isSel = selPart?.id === p.id;
          const pr = r?.part[p.id];
          const glow = p.type === "bulb" && pr ? Math.min(1, Math.sqrt(Math.abs(pr.p) / 3.6)) : 0;
          const lv = !electric ? partLogic(p, netOf) : null;
          const fx: Fx = { lit: p.type === "led" && pr && !r?.broken[p.id] ? Math.min(1, Math.max(0, pr.i) / 0.02) : 0, broken: !!r?.broken[p.id], spin: spinRef.current[p.id] ?? 0 };
          return (
            <g key={p.id}>
              <g transform={`translate(${X(p.x)},${Y(p.y)}) rotate(${(p.rot ?? 0) * 90}) scale(${cs * (p.size ?? 1)})`}>
                {glow > 0.02 && <circle r={1.25} fill="#FFD84A" opacity={0.25 + 0.6 * glow} />}
                {fx.lit > 0.02 && <circle r={1.15} fill={LED_HEX[p.color ?? "red"]} opacity={0.15 + 0.45 * fx.lit} />}
                {p.type === "node" ? (
                  (counts.get(termKey(p.id, 0)) ?? 0) >= 3 ? (
                    <Symbol p={p} on={!!p.on} lv={lv} color={isSel ? selColor : theme.color.ink} glow={glow} />
                  ) : interactive ? (
                    <circle r={0.12} fill={isSel ? selColor : theme.color.asymptote} opacity={isSel ? 1 : 0.35} />
                  ) : null
                ) : (
                  <Symbol p={p} on={!!p.on} lv={lv} color={isSel ? selColor : theme.color.ink} glow={glow} fx={fx} />
                )}
                {interactive && <rect data-part={p.id} x={p.type === "node" ? -0.5 : -1.5} y={p.type === "node" ? -0.5 : bodyHalf(p.type) * -1} width={p.type === "node" ? 1 : 3} height={p.type === "node" ? 1 : bodyHalf(p.type) * 2} fill="transparent" style={{ cursor: "grab" }} />}
              </g>
              <PartText p={p} X={X} Y={Y} cs={cs * (p.size ?? 1)} reading={pr} lv={lv} />
            </g>
          );
        })}
        {/* 단자 (만질 때만 — 여기서 끌어 전선을 잇는다) */}
        {interactive &&
          view.parts.map((p) =>
            terminals(p).map(([tx, ty], k) => (
              <g key={`${p.id}:${k}`}>
                {p.type !== "node" && (counts.get(termKey(p.id, k)) ?? 0) === 0 && <circle cx={X(tx)} cy={Y(ty)} r={Math.max(2.5, cs * 0.13)} fill="#fff" stroke={theme.color.asymptote} strokeWidth={1} />}
                <circle data-term={termKey(p.id, k)} cx={X(tx)} cy={Y(ty)} r={Math.max(9, cs * 0.42)} fill="transparent" style={{ cursor: "crosshair" }} />
              </g>
            )),
          )}
        {/* 잇는 중인 전선 */}
        {drag?.kind === "wire" &&
          (() => {
            const [id, k] = drag.from.split(":");
            const p = view.parts.find((q) => q.id === id);
            const t = p ? terminals(p)[Number(k)] : undefined;
            if (!t) return null;
            return <line x1={X(t[0])} y1={Y(t[1])} x2={drag.x} y2={drag.y} stroke={selColor} strokeWidth={2} strokeDasharray="5 4" />;
          })()}
      </svg>

      {/* 시간 그래프 — 축전기·코일·교류가 있을 때 */}
      {electric && dynamic && meters.length > 0 && <Scope hist={histRef.current} meters={meters} W={W} />}

      {/* 논리: 진리표 */}
      {!electric && <LogicTable data={data} table={table} oscillating={logic?.oscillating ?? false} />}

      {/* 설명 줄 */}
      <div style={{ textAlign: "center", fontSize: 12.5, color: theme.color.asymptote, marginTop: 4, wordBreak: "keep-all", lineHeight: 1.5 }}>
        {electric ? <ElectricSummary data={data} r={r} selPart={selPart} /> : "1인 전선은 빨갛게 — 입력을 톡 해 0·1을 바꿔 보세요"}
      </div>

      {interactive && (
        <div data-export-skip style={{ marginTop: 6, display: "grid", gap: 6, pointerEvents: "auto" }}>
          {/* 고른 것 */}
          {selPart && (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 6 }}>
              <b style={{ fontSize: 13, color: theme.color.ink }}>{selPart.label ?? NAMES[selPart.type]}</b>
              {STEPS[selPart.type] && (
                <ValueStep
                  value={selPart.value ?? DEFAULTS[selPart.type] ?? 1}
                  steps={STEPS[selPart.type] as number[]}
                  show={valueText(selPart)}
                  onChange={(v) => patchPart(selPart.id, { value: v }, `${NAMES[selPart.type]} 값`)}
                />
              )}
              {(selPart.type === "ac" || selPart.type === "clock") && <ValueStep value={selPart.freq ?? 1} steps={FREQS} show={`${selPart.freq ?? 1} Hz`} onChange={(v) => patchPart(selPart.id, { freq: v }, "주파수")} />}
              {selPart.type === "led" &&
                (Object.keys(LED_HEX) as LedColor[]).map((c) => (
                  <button key={c} type="button" aria-label={`${LED_NAME[c]} LED`} title={`${LED_NAME[c]} · 문턱 ${LED_VF[c]} V`} onClick={() => patchPart(selPart.id, { color: c }, "LED 색")} style={{ ...btn, padding: 0, width: 26, minWidth: 26, display: "inline-grid", placeItems: "center", outline: (selPart.color ?? "red") === c ? `2px solid ${theme.color.accent}` : undefined }}>
                    <span style={{ width: 14, height: 14, borderRadius: 7, background: LED_HEX[c], border: "1px solid #0002" }} />
                  </button>
                ))}
              {r?.broken[selPart.id] && (
                <button
                  type="button"
                  style={onBtn}
                  onClick={() => {
                    delete simRef.current.broken[selPart.id];
                    setReading(null);
                  }}
                >
                  새것으로 갈기
                </button>
              )}
              {(selPart.type === "switch" || selPart.type === "in") && (
                <button type="button" style={selPart.on ? onBtn : btn} onClick={() => patchPart(selPart.id, { on: !selPart.on }, selPart.type === "switch" ? "스위치" : "입력 바꾸기")}>
                  {selPart.type === "switch" ? (selPart.on ? "닫힘 (켜짐)" : "열림 (꺼짐)") : selPart.on ? "1" : "0"}
                </button>
              )}
              {selPart.type !== "node" && (
                <ValueStep value={selPart.size ?? 1} steps={PART_SIZES} show={`크기 ${Math.round((selPart.size ?? 1) * 100)}%`} onChange={(v) => patchPart(selPart.id, { size: v }, "부품 크기")} />
              )}
              {selPart.type !== "node" && (
                <button type="button" style={btn} onClick={() => patchPart(selPart.id, { rot: ((selPart.rot ?? 0) + 1) % 4 }, "돌리기")}>
                  ↻ 돌리기
                </button>
              )}
              <button type="button" style={btn} onClick={() => removePart(selPart.id)}>
                지우기
              </button>
            </div>
          )}
          {selPart?.type === "rheostat" && (
            <label style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", fontSize: 12.5, color: theme.color.ink }}>
              미끄럼
              <input
                type="range"
                aria-label="가변저항 미끄럼 위치"
                min={0}
                max={1}
                step={0.01}
                value={selPart.pos ?? 0.5}
                onChange={(e) => {
                  const now = current(item);
                  if (now) sessionStore.getState().previewObjectIR(item.id, { ...now, data: { ...now.data, parts: now.data.parts.map((q) => (q.id === selPart.id ? { ...q, pos: Number(e.target.value) } : q)) } });
                }}
                onPointerUp={(e) => patchPart(selPart.id, { pos: Number(e.currentTarget.value) }, "가변저항")}
                onKeyUp={(e) => patchPart(selPart.id, { pos: Number(e.currentTarget.value) }, "가변저항")}
                style={{ width: "100%", accentColor: theme.color.accent, touchAction: "pan-x" }}
              />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round((selPart.pos ?? 0.5) * 100)}%</span>
            </label>
          )}
          {selWire && (
            <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  commit({ ...data, wires: data.wires.filter((_, k) => k !== sel?.wire) }, "전선 지우기");
                  setSel(null);
                }}
              >
                전선 지우기
              </button>
              {selWire.via && (
                <button
                  type="button"
                  style={btn}
                  onClick={() => commit({ ...data, wires: data.wires.map((w, k) => (k === sel?.wire ? { a: w.a, b: w.b } : w)) }, "전선 곧게")}
                >
                  전선 곧게
                </button>
              )}
              <span style={{ fontSize: 12, color: theme.color.asymptote, alignSelf: "center" }}>전선을 끌면 옮겨져요</span>
            </div>
          )}
          {/* 부품 더하기 */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 5 }}>
            {(electric ? ELECTRIC_PARTS : LOGIC_PARTS).map((t) => (
              <button key={t} type="button" style={{ ...btn, fontSize: 12, padding: "2px 8px" }} onClick={() => addPart(t)}>
                + {NAMES[t]}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
            {electric && (
              <>
                <button type="button" style={btn} onClick={() => setRunning((v) => !v)}>
                  {running ? <Pause size={14} /> : <Play size={14} />} {running ? "멈춤" : "흐르게"}
                </button>
                {dynamic && (
                  <button type="button" style={btn} onClick={resetSim}>
                    <RotateCcw size={14} /> 처음부터 (방전)
                  </button>
                )}
              </>
            )}
            <button type="button" style={btn} onClick={() => zoomDiagram(1 / 1.2)} aria-label="회로도 작게">
              회로도 작게
            </button>
            <button type="button" style={btn} onClick={() => zoomDiagram(1.2)} aria-label="회로도 크게">
              회로도 크게
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 6, fontSize: 12.5, color: theme.color.ink }}>
            판 크기
            <button type="button" style={btn} disabled={!canShrink} onClick={() => resizeBoard(-2)} aria-label="판 줄이기">
              − 줄이기
            </button>
            <span style={{ fontVariantNumeric: "tabular-nums", color: theme.color.asymptote }}>
              {data.w}×{data.h}칸
            </span>
            <button type="button" style={btn} disabled={data.w >= 78 || data.h >= 58} onClick={() => resizeBoard(2)} aria-label="판 넓히기">
              + 넓히기
            </button>
            <button
              type="button"
              style={btn}
              onClick={() => {
                commit({ ...data, parts: [], wires: [] }, "회로 비우기");
                resetSim();
                setSel(null);
              }}
            >
              모두 지우기
            </button>
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: theme.color.asymptote, wordBreak: "keep-all" }}>부품은 끌어서 옮기고, 작은 원(단자)에서 다른 단자로 끌면 전선이 이어져요</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── 부품 그림 (격자 칸 단위, 단자 0이 왼쪽)

function bodyHalf(type: PartType): number {
  return type === "dff" || type === "npn" || type === "pnp" ? 1.8 : type === "and" || type === "or" || type === "nand" || type === "nor" || type === "xor" || type === "xnor" ? 1.4 : 1;
}

/** 시뮬레이션이 보여 주는 모습: LED 밝기 0~1, 탄 부품, 모터 각도 */
type Fx = { lit: number; broken: boolean; spin: number };
const NO_FX: Fx = { lit: 0, broken: false, spin: 0 };

/** 선분 위 화살촉 (끝 tip, 방향 (ux, uy)) */
function arrowHead(tx: number, ty: number, ux: number, uy: number, color: string): ReactElement {
  const L = Math.hypot(ux, uy) || 1;
  const [dx, dy] = [ux / L, uy / L];
  const bx = tx - dx * 0.42;
  const by = ty - dy * 0.42;
  return <path d={`M${tx},${ty}L${bx - dy * 0.2},${by + dx * 0.2}L${bx + dy * 0.2},${by - dx * 0.2}Z`} fill={color} stroke="none" />;
}

function partLogic(p: Part, netOf: (ref: string) => number): number[] {
  return terminals(p).map((_, k) => netOf(termKey(p.id, k)));
}

function Symbol({ p, on, lv, color, glow, fx = NO_FX }: { p: Part; on: boolean; lv: number[] | null; color: string; glow: number; fx?: Fx }): ReactElement {
  const s = { fill: "none", stroke: color, strokeWidth: 2, vectorEffect: "non-scaling-stroke" as const, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const lead = (x1: number, x2: number, y = 0, v?: number) => <line x1={x1} y1={y} x2={x2} y2={y} {...s} stroke={v === 1 ? ONE : v === 0 ? ZERO : color} />;
  const zig = (a: number, b: number) => {
    const n = 6;
    let d = `M${a},0`;
    for (let i = 0; i < n; i++) d += `L${a + ((b - a) * (i + 0.5)) / n},${i % 2 ? 0.42 : -0.42}`;
    return <path d={`${d}L${b},0`} {...s} />;
  };
  const bubble = (x: number) => <circle cx={x} cy={0} r={0.16} {...s} fill="#fff" />;
  switch (p.type) {
    case "battery":
      return (
        <g>
          {lead(-2, -0.22)}
          {lead(0.22, 2)}
          <line x1={-0.22} y1={-0.95} x2={-0.22} y2={0.95} {...s} />
          <line x1={0.22} y1={-0.5} x2={0.22} y2={0.5} {...s} strokeWidth={4} />
          <path d="M-0.95,-0.75h0.4M-0.75,-0.95v0.4" {...s} strokeWidth={1.4} />
        </g>
      );
    case "ac":
      return (
        <g>
          {lead(-2, -0.9)}
          {lead(0.9, 2)}
          <circle r={0.9} {...s} fill="#fff" />
          <path d="M-0.55,0 C-0.4,-0.55 -0.15,-0.55 0,0 S0.4,0.55 0.55,0" {...s} />
        </g>
      );
    case "switch":
      return (
        <g>
          {lead(-2, -0.9)}
          {lead(0.9, 2)}
          <line x1={-0.9} y1={0} x2={on ? 0.9 : 0.7} y2={on ? 0 : -0.8} {...s} />
          <circle cx={-0.9} r={0.13} fill={color} />
          <circle cx={0.9} r={0.13} fill={color} />
        </g>
      );
    case "resistor":
      return (
        <g>
          {lead(-2, -1.2)}
          {lead(1.2, 2)}
          {zig(-1.2, 1.2)}
        </g>
      );
    case "rheostat": {
      const wx = -1.2 + 2.4 * (p.pos ?? 0.5);
      return (
        <g>
          {lead(-2, -1.2)}
          {lead(1.2, 2)}
          {zig(-1.2, 1.2)}
          <path d={`M0,-2V-1.25H${wx}V-0.5`} {...s} stroke={theme.color.accent} />
          <path d={`M${wx - 0.2},-0.78L${wx},-0.48L${wx + 0.2},-0.78`} {...s} stroke={theme.color.accent} />
        </g>
      );
    }
    case "capacitor":
      return (
        <g>
          {lead(-2, -0.22)}
          {lead(0.22, 2)}
          <line x1={-0.22} y1={-0.85} x2={-0.22} y2={0.85} {...s} />
          <line x1={0.22} y1={-0.85} x2={0.22} y2={0.85} {...s} />
        </g>
      );
    case "inductor":
      return (
        <g>
          {lead(-2, -1.2)}
          {lead(1.2, 2)}
          <path d="M-1.2,0 a0.3,0.3 0 0 1 0.6,0 a0.3,0.3 0 0 1 0.6,0 a0.3,0.3 0 0 1 0.6,0 a0.3,0.3 0 0 1 0.6,0" {...s} />
        </g>
      );
    case "bulb":
      return (
        <g>
          {lead(-2, -0.75)}
          {lead(0.75, 2)}
          <circle r={0.75} {...s} fill={glow > 0.02 ? "#FFF3B0" : "#fff"} />
          <path d="M-0.53,-0.53L0.53,0.53M-0.53,0.53L0.53,-0.53" {...s} />
        </g>
      );
    case "ammeter":
    case "voltmeter":
      return (
        <g>
          {lead(-2, -0.8)}
          {lead(0.8, 2)}
          <circle r={0.8} {...s} fill="#fff" />
        </g>
      );
    case "diode":
    case "led":
    case "zener": {
      // 삼각형(양극, 단자 0) → 막대(음극, 단자 1): 화살 쪽으로만 전류가 흐른다
      const hex = LED_HEX[p.color ?? "red"];
      const tri = p.type !== "led" ? color : fx.broken ? "#555" : fx.lit > 0.02 ? hex : "#fff";
      return (
        <g>
          {lead(-2, -0.5)}
          {lead(0.5, 2)}
          <path d="M-0.5,-0.6L0.5,0L-0.5,0.6Z" {...s} fill={tri} />
          {p.type === "zener" ? <path d="M0.25,-0.8L0.5,-0.6V0.6L0.75,0.8" {...s} /> : <line x1={0.5} y1={-0.65} x2={0.5} y2={0.65} {...s} />}
          {p.type === "led" && (
            <g>
              <path d="M0,-0.75L0.45,-1.2M0.45,-0.55L0.9,-1" {...s} stroke={fx.lit > 0.02 ? hex : color} strokeWidth={1.4} />
              {arrowHead(0.55, -1.3, 1, -1, fx.lit > 0.02 ? hex : color)}
              {arrowHead(1, -1.1, 1, -1, fx.lit > 0.02 ? hex : color)}
            </g>
          )}
          {fx.broken && <path d="M-0.45,-0.45L0.45,0.45M-0.45,0.45L0.45,-0.45" {...s} stroke="#C0392B" strokeWidth={2.4} />}
        </g>
      );
    }
    case "npn":
    case "pnp": {
      // B(왼쪽) · C(위) · E(아래, 화살) — NPN은 화살이 밖으로, PNP는 안으로
      const npn = p.type === "npn";
      return (
        <g>
          <circle cx={0.25} r={1.35} {...s} fill="#fff" />
          {lead(-2, -0.45)}
          <line x1={-0.45} y1={-0.85} x2={-0.45} y2={0.85} {...s} strokeWidth={3.2} />
          <path d="M-0.45,-0.35L1,-1.15V-2" {...s} />
          <path d="M-0.45,0.35L1,1.15V2" {...s} />
          {npn ? arrowHead(0.8, 1.04, 1.45, 0.8, color) : arrowHead(-0.2, 0.49, -1.45, -0.8, color)}
        </g>
      );
    }
    case "fuse":
      return (
        <g>
          {lead(-2, -0.9)}
          {lead(0.9, 2)}
          <rect x={-0.9} y={-0.35} width={1.8} height={0.7} rx={0.12} {...s} fill="#fff" />
          {fx.broken ? <path d="M-0.9,0H-0.25L-0.1,-0.2M0.9,0H0.25L0.1,0.2" {...s} stroke="#C0392B" /> : <line x1={-0.9} y1={0} x2={0.9} y2={0} {...s} />}
        </g>
      );
    case "motor":
      return (
        <g>
          {lead(-2, -0.9)}
          {lead(0.9, 2)}
          <circle r={0.9} {...s} fill="#fff" />
          <g transform={`rotate(${fx.spin.toFixed(1)})`}>
            <path d="M0,-0.68A0.68,0.68 0 0 1 0.68,0" {...s} stroke={theme.color.accent} strokeWidth={1.4} />
            {arrowHead(0.68, 0.12, 0, 1, theme.color.accent)}
          </g>
        </g>
      );
    case "ground":
      return (
        <g>
          <line x1={0} y1={-1} x2={0} y2={0} {...s} />
          <path d="M-0.7,0H0.7M-0.45,0.28H0.45M-0.2,0.56H0.2" {...s} />
        </g>
      );
    case "clock": {
      const hi = lv?.[0] === 1;
      return (
        <g>
          {lead(0.6, 2, 0, lv?.[0])}
          <rect x={-0.6} y={-0.6} width={1.2} height={1.2} rx={0.15} {...s} fill={hi ? ONE : "#fff"} stroke={hi ? ONE : color} />
          <path d="M-0.42,0.25H-0.2V-0.25H0.05V0.25H0.28V-0.25H0.42" {...s} stroke={hi ? "#fff" : color} strokeWidth={1.4} />
        </g>
      );
    }
    case "node":
      return <circle r={0.17} fill={lv ? (lv[0] === 1 ? ONE : ZERO) : color} />;
    case "in":
      return (
        <g>
          {lead(0.6, 2, 0, lv?.[0])}
          <rect x={-0.6} y={-0.6} width={1.2} height={1.2} rx={0.15} {...s} fill={on ? ONE : "#fff"} stroke={on ? ONE : color} />
        </g>
      );
    case "out":
      return (
        <g>
          {lead(-2, -0.6, 0, lv?.[0])}
          <circle r={0.6} {...s} fill={lv?.[0] === 1 ? ONE : "#fff"} stroke={lv?.[0] === 1 ? ONE : color} />
          {lv?.[0] === 1 && <circle r={0.95} fill={ONE} opacity={0.18} />}
        </g>
      );
    case "not":
      return (
        <g>
          {lead(-2, -1, 0, lv?.[0])}
          {lead(1.2, 2, 0, lv?.[1])}
          <path d="M-1,-0.9L0.9,0L-1,0.9Z" {...s} fill="#fff" />
          {bubble(1.05)}
        </g>
      );
    case "and":
    case "nand":
    case "or":
    case "nor":
    case "xor":
    case "xnor": {
      const isOr = p.type === "or" || p.type === "nor" || p.type === "xor" || p.type === "xnor";
      const neg = p.type === "nand" || p.type === "nor" || p.type === "xnor";
      const end = isOr ? 1.4 : 1.3;
      return (
        <g>
          {lead(-2, -0.9, -1, lv?.[0])}
          {lead(-2, -0.9, 1, lv?.[1])}
          {lead(neg ? end + 0.3 : end, 2, 0, lv?.[2])}
          {isOr ? <path d="M-1.2,-1.3Q-0.6,0 -1.2,1.3Q0.6,1.3 1.4,0Q0.6,-1.3 -1.2,-1.3Z" {...s} fill="#fff" /> : <path d="M-1.1,-1.3H0A1.3,1.3 0 0 1 0,1.3H-1.1Z" {...s} fill="#fff" />}
          {(p.type === "xor" || p.type === "xnor") && <path d="M-1.5,-1.3Q-0.9,0 -1.5,1.3" {...s} />}
          {neg && bubble(end + 0.15)}
        </g>
      );
    }
    case "dff":
      return (
        <g>
          {lead(-2, -1.3, -1, lv?.[0])}
          {lead(-2, -1.3, 1, lv?.[1])}
          {lead(1.3, 2, -1, lv?.[2])}
          {lead(1.3, 2, 1, lv?.[3])}
          <rect x={-1.3} y={-1.8} width={2.6} height={3.6} rx={0.1} {...s} fill="#fff" />
          <path d="M-1.3,0.7L-0.95,1L-1.3,1.3" {...s} />
        </g>
      );
    default:
      return <g />;
  }
}

/** 돌아가지 않는 글자 — 이름·값·계기 눈금 */
function PartText({ p, X, Y, cs, reading, lv }: { p: Part; X: (g: number) => number; Y: (g: number) => number; cs: number; reading?: { i: number; v: number; p: number }; lv: number[] | null }): ReactElement | null {
  const vertical = (p.rot ?? 0) % 2 === 1;
  const fs = Math.max(10, Math.min(14, cs * 0.55));
  const cx = X(p.x);
  const cy = Y(p.y);
  const text = (x: number, y: number, s: ReactNode, anchor: "start" | "middle" | "end" = "middle", fill: string = theme.color.ink, weight = 400, size = fs) => (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" fontSize={size} fill={fill} fontWeight={weight} style={{ pointerEvents: "none", userSelect: "none" }}>
      {s}
    </text>
  );
  // 이름·값은 부품 옆 (가로 부품은 위, 세로 부품은 오른쪽)
  const side = (s: ReactNode, fill?: string) => (vertical ? text(cx + cs * 1.15, cy, s, "start", fill) : text(cx, cy - cs * 1.2, s, "middle", fill));
  const meter = (letter: string) => (
    <>
      {text(cx, cy, letter, "middle", theme.color.ink, 700, fs * 1.05)}
      {reading && (vertical ? text(cx + cs * 1.05, cy, si(letter === "A" ? Math.abs(reading.i) : Math.abs(reading.v), letter), "start", "#2F6DB5", 600) : text(cx, cy + cs * 1.25, si(letter === "A" ? Math.abs(reading.i) : Math.abs(reading.v), letter), "middle", "#2F6DB5", 600))}
      {p.label && (vertical ? text(cx + cs * 1.05, cy - cs * 1.4, p.label, "middle", theme.color.asymptote) : text(cx, cy - cs * 1.2, p.label, "middle", theme.color.asymptote))}
    </>
  );
  switch (p.type) {
    case "ammeter":
      return meter("A");
    case "voltmeter":
      return meter("V");
    case "rheostat": {
      // 미끄럼 단자의 반대쪽에 (가로: 아래, 세로: 미끄럼이 오른쪽이면 왼쪽)
      const r = ((p.rot ?? 0) % 4 + 4) % 4;
      const s = p.label ? `${p.label} ${valueText(p)}` : valueText(p);
      const c = theme.color.asymptote;
      return r === 0 ? text(cx, cy + cs * 1.2, s, "middle", c) : r === 1 ? text(cx - cs * 1.15, cy, s, "end", c) : r === 2 ? text(cx, cy - cs * 1.2, s, "middle", c) : text(cx + cs * 1.15, cy, s, "start", c);
    }
    case "battery":
    case "resistor":
    case "capacitor":
    case "inductor":
    case "bulb":
    case "zener":
    case "fuse":
      return side(p.label ? `${p.label} ${valueText(p)}` : valueText(p), theme.color.asymptote);
    case "diode":
      return p.label ? side(p.label, theme.color.asymptote) : null;
    case "led": {
      // 빛 화살표 바깥쪽에
      const s = p.label ?? `${LED_NAME[p.color ?? "red"]} LED`;
      return vertical ? text(cx + cs * 1.7, cy, s, "start", theme.color.asymptote) : text(cx, cy - cs * 1.8, s, "middle", theme.color.asymptote);
    }
    case "motor":
      return (
        <>
          {text(cx, cy, "M", "middle", theme.color.ink, 700, fs * 1.05)}
          {side(p.label ? `${p.label} ${valueText(p)}` : valueText(p), theme.color.asymptote)}
        </>
      );
    case "npn":
    case "pnp": {
      // 단자 이름 B·C·E (단자와 가운데 사이), 종류·β는 아래
      const g = terminals(p);
      const gx = (cx - cs * 0.5) / cs;
      const gy = (cy - cs * 0.5) / cs;
      const unit = cs / (p.size ?? 1);
      return (
        <>
          {["B", "C", "E"].map((l, k) => {
            const [tx, ty] = g[k] as [number, number];
            return <g key={l}>{text(cx + (tx - gx) * unit * 0.78 + cs * 0.28, cy + (ty - gy) * unit * 0.78 - cs * 0.22, l, "middle", theme.color.asymptote, 600, fs * 0.7)}</g>;
          })}
          {text(cx - cs * 1.5, cy + cs * 1.9, `${p.type === "npn" ? "NPN" : "PNP"} ${valueText(p)}`, "middle", theme.color.asymptote, 400, fs * 0.8)}
        </>
      );
    }
    case "clock":
      return text(cx - cs * 0.85, cy, `${p.label ?? "CLK"} ${p.freq ?? 1}Hz`, "end", theme.color.ink, 600, fs * 0.85);
    case "ac":
      return side(`${valueText(p)} · ${p.freq ?? 1} Hz`, theme.color.asymptote);
    case "in":
      return (
        <>
          {text(cx, cy, p.on ? "1" : "0", "middle", p.on ? "#fff" : theme.color.ink, 700)}
          {p.label && text(cx - cs * 0.85, cy, p.label, "end", theme.color.ink, 600)}
        </>
      );
    case "out":
      return (
        <>
          {text(cx, cy, String(lv?.[0] ?? 0), "middle", lv?.[0] === 1 ? "#fff" : theme.color.ink, 700)}
          {p.label && text(cx + cs * 1.05, cy, p.label, "start", theme.color.ink, 600)}
        </>
      );
    case "and":
    case "or":
    case "nand":
    case "nor":
    case "xor":
    case "xnor":
    case "not":
      return text(cx + (p.type === "not" ? -cs * 0.3 : 0), cy + (vertical ? 0 : 0), NAMES[p.type], "middle", theme.color.asymptote, 600, fs * 0.72);
    case "dff": {
      if (vertical) return text(cx, cy, "D FF", "middle", theme.color.asymptote, 600, fs * 0.8);
      const f = fs * 0.78;
      return (
        <>
          {text(cx - cs * 1.05, cy - cs, "D", "start", theme.color.ink, 600, f)}
          {text(cx - cs * 0.85, cy + cs, "CLK", "start", theme.color.ink, 600, f * 0.85)}
          {text(cx + cs * 1.05, cy - cs, "Q", "end", theme.color.ink, 600, f)}
          {text(cx + cs * 1.05, cy + cs, "Q̄", "end", theme.color.ink, 600, f)}
        </>
      );
    }
    default:
      return null;
  }
}

function ValueStep({ value, steps, show, onChange }: { value: number; steps: number[]; show: string; onChange: (v: number) => void }): ReactElement {
  // 지금 값에 가장 가까운 단계에서 한 칸씩
  let k = 0;
  steps.forEach((s, i) => {
    if (Math.abs(Math.log(s / value)) < Math.abs(Math.log((steps[k] as number) / value))) k = i;
  });
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: theme.color.ink }}>
      <button type="button" aria-label="값 줄이기" disabled={k <= 0} onClick={() => onChange(steps[k - 1] as number)} style={{ ...btn, padding: 0, opacity: k <= 0 ? 0.4 : 1 }}>
        −
      </button>
      <b style={{ minWidth: 52, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{show}</b>
      <button type="button" aria-label="값 늘리기" disabled={k >= steps.length - 1} onClick={() => onChange(steps[k + 1] as number)} style={{ ...btn, padding: 0, opacity: k >= steps.length - 1 ? 0.4 : 1 }}>
        +
      </button>
    </span>
  );
}

function ElectricSummary({ data, r, selPart }: { data: CircuitData; r?: ElectricReading; selPart?: Part }): ReactElement {
  const b = (x: ReactNode) => <b style={{ color: theme.color.ink }}>{x}</b>;
  if (selPart && r && r.broken[selPart.id])
    return <span style={{ color: "#C0392B" }}>{selPart.type === "fuse" ? `퓨즈가 끊어졌어요 — ${valueText(selPart)}보다 큰 전류가 흘러서 회로를 지켰어요` : selPart.type === "led" ? "LED가 타 버렸어요 — 저항을 함께 이어 전류를 줄여 주세요 (보통 20 mA)" : "다이오드가 타 버렸어요 — 전류가 너무 컸어요"} · 새것으로 갈아 보세요</span>;
  if (selPart && r?.part[selPart.id] && (selPart.type === "npn" || selPart.type === "pnp")) {
    const pr = r.part[selPart.id] as { i: number; v: number };
    const m = r.mode[selPart.id] ?? 0;
    return (
      <span>
        베이스 전류 {b(si(Math.abs(r.ib[selPart.id] ?? 0), "A"))} · 컬렉터 전류 {b(si(Math.abs(pr.i), "A"))} · {m === 0 ? "차단 — 베이스에 전류가 없어 꺼져 있어요" : m === 1 ? `활성 — 컬렉터 전류 = β × 베이스 전류 (증폭)` : "포화 — 스위치처럼 완전히 켜졌어요"}
      </span>
    );
  }
  if (selPart && r?.part[selPart.id] && (selPart.type === "diode" || selPart.type === "led" || selPart.type === "zener")) {
    const pr = r.part[selPart.id] as { i: number; v: number };
    const m = r.mode[selPart.id] ?? 0;
    const vf = selPart.type === "led" ? LED_VF[selPart.color ?? "red"] : 0.7;
    return (
      <span>
        전압 {b(si(Math.abs(pr.v), "V"))} · 전류 {b(si(Math.abs(pr.i), "A"))} · {m === 1 ? "켜짐 — 순방향 (삼각형 → 막대 쪽으로 흘러요)" : m === 2 ? `항복 — 거꾸로 걸린 전압을 ${valueText(selPart)}로 붙잡아요` : `꺼짐 — 역방향이거나 문턱 전압 ${vf} V보다 낮아요`}
      </span>
    );
  }
  if (selPart && r?.part[selPart.id] && selPart.type !== "node") {
    const pr = r.part[selPart.id] as { i: number; v: number; p: number };
    return (
      <span>
        {selPart.label ?? NAMES[selPart.type]}: 전압 <b style={{ color: theme.color.ink }}>{si(Math.abs(pr.v), "V")}</b> · 전류 <b style={{ color: theme.color.ink }}>{si(Math.abs(pr.i), "A")}</b>
        {selPart.type !== "voltmeter" && selPart.type !== "ammeter" && selPart.type !== "switch" && (
          <>
            {" "}
            · 전력 <b style={{ color: theme.color.ink }}>{si(Math.abs(pr.p), "W")}</b>
          </>
        )}
      </span>
    );
  }
  const caps = data.parts.filter((p) => p.type === "capacitor");
  const rs = data.parts.filter((p) => p.type === "resistor");
  const hasAc = data.parts.some((p) => p.type === "ac");
  if (caps.length === 1 && rs.length === 1 && !hasAc) {
    const tau = (rs[0]?.value ?? 10) * (caps[0]?.value ?? 100) * 1e-6;
    return (
      <span>
        시간 상수 τ = RC = <b style={{ color: theme.color.ink }}>{tau < 1 ? `${(tau * 1000).toPrecision(3)} ms` : `${tau.toPrecision(3)} s`}</b> — τ마다 남은 차이의 63 %가 채워져요 · 주황 점 = 전류 (+ → −)
      </span>
    );
  }
  if (r && Object.keys(r.broken).length > 0) return <span style={{ color: "#C0392B" }}>탄 부품이 있어요 (빨간 ×) — 톡 해서 이유를 보고 새것으로 갈아 보세요</span>;
  return <span>{hasAc ? "교류: 전류의 방향이 계속 바뀌어요" : "직류"} · 주황 점 = 전류의 방향 (+ → −) · 부품을 톡 하면 전압·전류</span>;
}

/** 계기·교류 전원의 최근 6초 그래프 (값마다 따로 크기를 맞춘다) */
function Scope({ hist, meters, W }: { hist: Array<{ t: number; v: number[] }>; meters: Part[]; W: number }): ReactElement | null {
  const H = 96;
  if (hist.length < 2) return <div style={{ height: H + 22 }} />;
  const t1 = (hist[hist.length - 1] as { t: number }).t;
  const t0 = t1 - 6;
  const x = (t: number) => ((t - t0) / 6) * (W - 8) + 4;
  return (
    <div style={{ marginTop: 6 }}>
      <svg width={W} height={H} style={{ display: "block", background: "#FAFBFC", borderRadius: 8 }}>
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#E1E5EA" />
        {meters.map((m, k) => {
          const vals = hist.map((h) => h.v[k] ?? 0);
          // 크기 맞춤에 바닥을 둔다 — 0 근처의 잡음이 크게 보이지 않게
          const peak = Math.max(m.type === "ammeter" ? 1e-4 : 0.05, ...vals.map(Math.abs));
          const y = (v: number) => H / 2 - (v / peak) * (H / 2 - 8);
          return <polyline key={m.id} points={hist.map((h, i) => `${x(h.t).toFixed(1)},${y(vals[i] as number).toFixed(1)}`).join(" ")} fill="none" stroke={m.type === "ac" ? ZERO : (METER[k % METER.length] as string)} strokeWidth={m.type === "ac" ? 1.4 : 2} strokeDasharray={m.type === "ac" ? "4 3" : undefined} />;
        })}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "2px 12px", fontSize: 11.5, color: theme.color.asymptote, marginTop: 2 }}>
        {meters.map((m, k) => (
          <span key={m.id} style={{ color: m.type === "ac" ? ZERO : METER[k % METER.length] }}>
            ━ {m.type === "ac" ? "전원 전압" : `${m.label ?? NAMES[m.type]} ${m.type === "ammeter" ? "전류" : "전압"}`}
          </span>
        ))}
        <span>· 최근 6초</span>
      </div>
    </div>
  );
}

function LogicTable({ data, table, oscillating }: { data: CircuitData; table: ReturnType<typeof truthTable>; oscillating: boolean }): ReactElement | null {
  const clock = data.parts.find((p) => p.type === "clock");
  if (clock && !oscillating) return <div style={{ textAlign: "center", fontSize: 12.5, color: theme.color.ink, marginTop: 6, wordBreak: "keep-all" }}>클록이 1초에 {clock.freq ?? 1}번 0 → 1 → 0으로 바뀌어요 — 플립플롭의 CLK에 이으면 박자마다 값을 저장해요</div>;
  if (oscillating) return <div style={{ textAlign: "center", fontSize: 12.5, color: ONE, marginTop: 6 }}>값이 계속 바뀌어요 (발진) — 출력이 자기 입력으로 바로 돌아오는 고리가 있어요</div>;
  if (!table) {
    if (!data.parts.some((p) => p.type === "in") || !data.parts.some((p) => p.type === "out")) return null;
    return <div style={{ textAlign: "center", fontSize: 12.5, color: theme.color.ink, marginTop: 6, wordBreak: "keep-all" }}>기억 회로 — 같은 입력이라도 <b>그전 상태</b>에 따라 출력이 달라요 (입력을 떼도 값이 남아요)</div>;
  }
  const ins = data.parts.filter((p) => p.type === "in").sort((a, b) => (a.label ?? a.id).localeCompare(b.label ?? b.id));
  const nowRow = ins.reduce((m, p) => m * 2 + (p.on ? 1 : 0), 0);
  const cell = { padding: "2px 8px", textAlign: "center", borderBottom: "1px solid #EEF0F3", fontVariantNumeric: "tabular-nums" } as const;
  return (
    <table style={{ margin: "6px auto 0", borderCollapse: "collapse", fontSize: 12.5, color: theme.color.ink }}>
      <thead>
        <tr>
          {table.inputs.map((n) => (
            <th key={n} style={{ ...cell, fontWeight: 600 }}>
              {n}
            </th>
          ))}
          {table.outputs.map((n, k) => (
            <th key={n} style={{ ...cell, fontWeight: 600, color: ONE, borderLeft: k === 0 ? "1px solid #C9CED6" : undefined }}>
              {n}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, i) => (
          <tr key={i} style={{ background: i === nowRow ? "#FDECEA" : undefined }}>
            {row.map((v, k) => (
              <td key={k} style={{ ...cell, borderLeft: k === table.inputs.length ? "1px solid #C9CED6" : undefined, fontWeight: k >= table.inputs.length ? 700 : 400 }}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────── 새 부품 자리

function newId(data: CircuitData, type: PartType): string {
  const base = type === "node" ? "n" : type;
  for (let k = 1; ; k++) if (!data.parts.some((p) => p.id === `${base}${k}`)) return `${base}${k}`;
}

function nextLabel(data: CircuitData, type: "in" | "out"): string {
  const pool = type === "in" ? ["A", "B", "C", "D", "E", "F"] : ["Y", "Z", "Q", "S", "W"];
  return pool.find((l) => !data.parts.some((p) => p.label === l)) ?? (type === "in" ? "X" : "O");
}

/** 다른 부품과 겹치지 않는 칸 (가운데부터) */
function freeCell(data: CircuitData, type: PartType): [number, number] {
  const taken = new Set<string>();
  for (const p of data.parts) for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) taken.add(`${p.x + dx},${p.y + dy}`);
  const cx = Math.round(data.w / 2);
  const cy = Math.round(data.h / 2);
  const reach = type === "node" ? 0 : 2;
  for (let ring = 0; ring < Math.max(data.w, data.h); ring++)
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x - reach < 0 || x + reach > data.w || y < 1 || y > data.h - 1) continue;
        let ok = true;
        for (let ex = -reach; ex <= reach && ok; ex++) for (let ey = -1; ey <= 1 && ok; ey++) if (taken.has(`${x + ex},${y + ey}`)) ok = false;
        if (ok) return [x, y];
      }
  return [cx, cy];
}
