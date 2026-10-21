import { describe, expect, it } from "vitest";
import { evalLogic, newElectricState, newLogicState, nodesOf, outputs, stepElectric, terminals, truthTable, wireCurrents, wirePath, type CircuitData } from "./circuit";
import { CIRCUIT_EXAMPLES, circuitFromInput } from "./circuitExamples";

const ex = (name: string) => structuredClone(CIRCUIT_EXAMPLES[name] as CircuitData);
/** 시간을 충분히 흘려 정상 상태로 */
const settle = (d: CircuitData, dt = 1e-3, steps = 200) => {
  const st = newElectricState();
  let r = stepElectric(d, st, dt);
  for (let i = 1; i < steps; i++) r = stepElectric(d, st, dt);
  return r;
};

describe("회로 — 단자·마디", () => {
  it("세로로 돌린 부품은 단자 0이 위", () => {
    expect(terminals({ id: "a", type: "resistor", x: 5, y: 5, rot: 1 })).toEqual([[5, 3], [5, 7]]);
  });
  it("예시의 모든 전선이 실제 단자를 잇고, 꺾인 길은 가로·세로만", () => {
    for (const [name, d] of Object.entries(CIRCUIT_EXAMPLES))
      for (const w of d.wires) {
        const path = wirePath(d, w);
        expect(path.length, `${name} ${w.a}-${w.b}`).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < path.length; i++) expect(path[i]![0] === path[i - 1]![0] || path[i]![1] === path[i - 1]![1]).toBe(true);
      }
  });
  it("직렬 회로는 하나의 고리 (마디 5개)", () => {
    expect(nodesOf(ex("직렬")).count).toBe(5);
  });
});

describe("회로 — 직류", () => {
  it("직렬: I = 6 V / (10 + 20) Ω = 0.2 A, 저항 전압 2 V · 4 V", () => {
    const r = settle(ex("직렬"));
    expect(Math.abs(r.part.A!.i)).toBeCloseTo(0.2, 2);
    expect(Math.abs(r.part.R1!.v)).toBeCloseTo(2, 1);
    expect(Math.abs(r.part.R2!.v)).toBeCloseTo(4, 1);
  });
  it("스위치를 열면 전류 0", () => {
    const d = ex("직렬");
    d.parts.find((p) => p.id === "S")!.on = false;
    expect(Math.abs(settle(d).part.A!.i)).toBeLessThan(1e-6);
  });
  it("병렬: 전구마다 같은 전압, 전체 전류 = 6/10 + 6/20 = 0.9 A", () => {
    const r = settle(ex("병렬"));
    expect(Math.abs(r.part.L1!.v)).toBeCloseTo(6, 1);
    expect(Math.abs(r.part.L2!.v)).toBeCloseTo(6, 1);
    expect(Math.abs(r.part.A!.i)).toBeCloseTo(0.9, 1);
  });
  it("전선 위 전류: 직렬 고리의 모든 전선에 같은 0.2 A", () => {
    const d = ex("직렬");
    const r = settle(d);
    for (const i of wireCurrents(d, r.into)) expect(Math.abs(i)).toBeCloseTo(0.2, 2);
  });
  it("가변저항 위치를 바꾸면 축전기 전압이 바뀐다 (분압)", () => {
    const d = ex("가변저항");
    const vAt = (pos: number) => {
      d.parts.find((p) => p.id === "P")!.pos = pos;
      return Math.abs(settle(d, 0.05, 400).part.V!.v);
    };
    // 위치 0 = 미끄럼이 + 쪽 끝 → 6 V, 위치 1 = − 쪽 끝 → 0 V
    expect(vAt(0)).toBeCloseTo(6, 0);
    expect(vAt(0.5)).toBeCloseTo(3, 0);
  });
});

describe("회로 — 시간에 따라 (축전기·교류)", () => {
  it("RC 충전: τ = RC = 10 kΩ × 100 μF = 1 s 뒤 약 63 %, 5τ 뒤 거의 다", () => {
    const d = ex("RC");
    d.parts.find((p) => p.id === "S")!.on = true;
    const st = newElectricState();
    const dt = 0.002;
    let r = stepElectric(d, st, dt);
    for (let i = 1; i < 500; i++) r = stepElectric(d, st, dt);
    expect(Math.abs(r.part.V!.v) / 6).toBeCloseTo(0.632, 1);
    for (let i = 0; i < 2000; i++) r = stepElectric(d, st, dt);
    expect(Math.abs(r.part.V!.v)).toBeGreaterThan(5.9);
  });
  it("교류: 축전기 전압은 진폭이 전원보다 작고 늦게 따라간다", () => {
    const d = ex("교류");
    const st = newElectricState();
    const dt = 0.002;
    let maxVc = 0;
    for (let i = 0; i < 3000; i++) {
      const r = stepElectric(d, st, dt);
      if (st.t > 2) maxVc = Math.max(maxVc, Math.abs(r.part.V!.v));
    }
    // |Vc| = V·Xc/√(R²+Xc²), Xc = 1/(2π·1·100μ) ≈ 1592 Ω → 5·1592/√(1000²+1592²) ≈ 4.23 V
    expect(maxVc).toBeCloseTo(4.23, 0);
  });
});

describe("회로 — 논리", () => {
  const table = (name: string) => truthTable(ex(name))!.rows.map((r) => r.join(""));
  it("기본 게이트 진리표", () => {
    expect(table("AND")).toEqual(["000", "010", "100", "111"]);
    expect(table("OR")).toEqual(["000", "011", "101", "111"]);
    expect(table("NAND")).toEqual(["001", "011", "101", "110"]);
    expect(table("NOR")).toEqual(["001", "010", "100", "110"]);
    expect(table("XOR")).toEqual(["000", "011", "101", "110"]);
    expect(table("NOT")).toEqual(["01", "10"]);
  });
  it("반가산기: 합 = A xor B, 올림 = A and B", () => {
    const t = truthTable(ex("반가산기"))!;
    expect(t.inputs).toEqual(["A", "B"]);
    expect(t.outputs).toEqual(["C (올림)", "S (합)"]);
    expect(t.rows.map((r) => r.join(""))).toEqual(["0000", "0101", "1001", "1110"]);
  });
  it("전가산기: A + B + Cin = 2·Cout + S", () => {
    const t = truthTable(ex("전가산기"))!;
    const ia = t.inputs.indexOf("A");
    const ib = t.inputs.indexOf("B");
    const ic = t.inputs.indexOf("Cin");
    const os = t.outputs.indexOf("S (합)");
    const oc = t.outputs.indexOf("Cout");
    expect(t.rows).toHaveLength(8);
    for (const r of t.rows) {
      const sum = r[ia]! + r[ib]! + r[ic]!;
      expect(2 * r[3 + oc]! + r[3 + os]!).toBe(sum);
    }
  });
  it("SR 래치는 기억한다: S로 켜고 S를 떼도 Q = 1, R로 지우면 0", () => {
    const d = ex("SR 래치");
    const st = newLogicState();
    const set = (id: string, on: boolean) => (d.parts.find((p) => p.id === id)!.on = on);
    const q = () => outputs(d, evalLogic(d, st).net).Q;
    q();
    set("S", true);
    expect(q()).toBe(1);
    set("S", false);
    expect(q()).toBe(1); // 기억
    set("R", true);
    expect(q()).toBe(0);
    set("R", false);
    expect(q()).toBe(0);
    expect(truthTable(d)).toBeNull(); // 기억 소자는 진리표 대신 지금 상태
  });
  it("처음 켠 래치는 헛돌지 않고 자리 잡는다, 자기 자신을 뒤집는 NOT 고리는 발진", () => {
    expect(evalLogic(ex("SR 래치"), newLogicState()).oscillating).toBe(false);
    const ring: CircuitData = { mode: "logic", w: 10, h: 6, parts: [{ id: "G", type: "not", x: 4, y: 2 }, { id: "n", type: "node", x: 4, y: 5 }], wires: [{ a: "G:1", b: "n:0" }, { a: "G:0", b: "n:0" }] };
    expect(evalLogic(ring, newLogicState()).oscillating).toBe(true);
  });
  it("D 플립플롭: CLK이 0→1일 때만 D를 저장", () => {
    const d = ex("D 플립플롭");
    const st = newLogicState();
    const set = (id: string, on: boolean) => (d.parts.find((p) => p.id === id)!.on = on);
    const q = () => outputs(d, evalLogic(d, st).net).Q;
    set("D", true);
    expect(q()).toBe(0); // 아직 시계 없음
    set("K", true);
    expect(q()).toBe(1); // 올라가는 순간 저장
    set("D", false);
    expect(q()).toBe(1); // CLK이 1인 동안은 그대로
    set("K", false);
    expect(q()).toBe(1);
    set("K", true);
    expect(q()).toBe(0);
  });
  it("입력 글로 예시 고르기", () => {
    expect(circuitFromInput("전가산기")?.mode).toBe("logic");
    expect(circuitFromInput("RC 회로")?.parts.some((p) => p.type === "capacitor")).toBe(true);
    expect(circuitFromInput("y=x^2")).toBeNull();
  });
});
