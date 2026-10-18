import { SOLID_KINDS } from "@sketchlab/shared";
import { describe, expect, it } from "vitest";
import { solidMesh } from "./mesh";
import { drawSolid, type View3 } from "./project";

const deg = (d: number) => (d * Math.PI) / 180;
const iso: View3 = { yaw: deg(-35), pitch: deg(25) };

describe("교과서 숨은선 — 정확한 가시성", () => {
  it("정육면체(등각 시점): 실선 모서리 9개, 숨은선 3개 (v4 P4 Acceptance)", () => {
    const d = drawSolid(solidMesh("cube"), iso, 100, 0, 0);
    expect(d.stats.visibleEdges).toBe(9);
    expect(d.stats.hiddenEdges).toBe(3);
  });

  it("정육면체 숨은선 3개는 한 꼭짓점에서 만나 하나 또는 몇 개의 이어진 선이 된다", () => {
    const d = drawSolid(solidMesh("cube"), iso, 100, 0, 0);
    const pts = d.hidden.flat().length;
    expect(d.hidden.length).toBeLessThanOrEqual(2);
    expect(pts).toBeGreaterThanOrEqual(4);
  });

  it("원기둥: 옆면 윤곽선(모선) 정확히 2개 + 아래 테두리 뒤쪽은 점선", () => {
    const d = drawSolid(solidMesh("cylinder"), iso, 100, 0, 0);
    expect(d.stats.silhouetteEdges).toBe(2);
    expect(d.stats.hiddenEdges).toBeGreaterThan(0);
  });

  it("원뿔: 윤곽선 2개가 꼭짓점에서 만난다", () => {
    const d = drawSolid(solidMesh("cone"), iso, 100, 0, 0);
    expect(d.stats.silhouetteEdges).toBe(2);
  });

  it("구: 외곽선은 닫힌 고리 하나 + 적도는 앞 반 실선 / 뒤 반 점선", () => {
    const d = drawSolid(solidMesh("sphere"), iso, 100, 0, 0);
    const outline = d.visible.find((l) => {
      const a = l[0] as [number, number];
      const b = l[l.length - 1] as [number, number];
      return l.length > 40 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9;
    });
    expect(outline).toBeDefined();
    expect(d.hidden.length).toBeGreaterThanOrEqual(1);
  });

  it("정다면체의 모서리 수가 맞다 (4·12·30·30 + 옆에서 보면 숨은선 포함 총합)", () => {
    const total = (k: "tetrahedron" | "octahedron" | "dodecahedron" | "icosahedron") => {
      const d = drawSolid(solidMesh(k), iso, 100, 0, 0);
      return d.stats.visibleEdges + d.stats.hiddenEdges;
    };
    expect(total("tetrahedron")).toBe(6);
    expect(total("octahedron")).toBe(12);
    expect(total("dodecahedron")).toBe(30);
    expect(total("icosahedron")).toBe(30);
  });

  it("카탈로그 14종 전부 메시가 닫혀 있다 (모든 모서리에 면 2개)", () => {
    for (const k of SOLID_KINDS) {
      const mesh = solidMesh(k);
      const count = new Map<string, number>();
      for (const f of mesh.faces) {
        for (let i = 0; i < f.v.length; i++) {
          const a = f.v[i] as number;
          const b = f.v[(i + 1) % f.v.length] as number;
          const key = `${Math.min(a, b)}|${Math.max(a, b)}`;
          count.set(key, (count.get(key) ?? 0) + 1);
        }
      }
      expect([...count.values()].every((c) => c === 2), k).toBe(true);
    }
  });

  it("바깥 법선: 위에서 보면 윗면이 보이고 아랫면이 안 보인다 (각기둥)", () => {
    const top = drawSolid(solidMesh("prism"), { yaw: 0.3, pitch: deg(40) }, 100, 0, 0);
    const bottom = drawSolid(solidMesh("prism"), { yaw: 0.3, pitch: deg(-40) }, 100, 0, 0);
    // 삼각기둥: 9개 모서리. 위에서 보든 아래에서 보든 숨은선은 1~2개
    expect(top.stats.visibleEdges + top.stats.hiddenEdges).toBe(9);
    expect(top.stats.hiddenEdges).toBeGreaterThanOrEqual(1);
    expect(bottom.stats.hiddenEdges).toBeGreaterThanOrEqual(1);
  });

  it("회전 프레임 계산이 가볍다 (구 1000프레임 < 1.5초)", () => {
    const mesh = solidMesh("sphere");
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) drawSolid(mesh, { yaw: i * 0.01, pitch: 0.4 }, 100, 0, 0);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
