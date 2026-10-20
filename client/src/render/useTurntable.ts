import type { SceneIR } from "@sketchlab/shared";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { View3 } from "../solid/project";
import { sessionStore } from "../store/session";
import { solid } from "./theme";

/**
 * 3D 객체 회전 컨트롤러 (마스터스펙 v4 §12.3) — 입체도형·공간좌표가 같이 쓴다.
 *
 *  - 턴테이블: 드래그 가로 = yaw, 세로 = pitch(±85°로 제한 — 뒤집히면 학생이 헷갈린다)
 *  - 놓으면 관성: ω ← ω·e^(−k·dt) **시간 기반** — 60Hz·120Hz에서 같은 손맛
 *  - 두 번 탭: 기본 시점으로 부드럽게 (easeInOutCubic)
 *  - 짧게 톡: 선택 (복사·저장 메뉴)
 *  - 도는 동안은 이 컴포넌트만 다시 그리고, 멈추면 한 번만 기록 (Undo 1회)
 */

const DEG = Math.PI / 180;
const PITCH_LIMIT = 85 * DEG;
export const clampPitch = (p: number) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

interface Drag {
  x: number;
  y: number;
  t: number;
  wy: number;
  wp: number;
  start: View3;
  sx: number;
  sy: number;
  t0: number;
}

export function useTurntable(item: { id: string }, irView: View3 | undefined, defaultView: View3) {
  const [view, setView] = useState<View3>(irView ?? defaultView);
  const viewRef = useRef(view);
  viewRef.current = view;
  const anim = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);

  // 바깥(Undo 등)에서 IR의 각도가 바뀌면 따라간다
  const yaw = irView?.yaw;
  const pitch = irView?.pitch;
  useEffect(() => {
    if (yaw !== undefined && pitch !== undefined) setView({ yaw, pitch });
  }, [yaw, pitch]);

  const stopAnim = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };
  useEffect(() => stopAnim, []);

  const commit = (start: View3) => {
    const now = viewRef.current;
    if (Math.abs(now.yaw - start.yaw) < 1e-4 && Math.abs(now.pitch - start.pitch) < 1e-4) return;
    const state = sessionStore.getState();
    const current = state.items.find((i) => i.id === item.id);
    if (!current || current.kind !== "object") return;
    // 각도 필드 이름: 입체는 view, 공간좌표는 view3 (공간좌표의 view는 축 범위라서)
    let before: SceneIR;
    let after: SceneIR;
    if (current.ir.kind === "solid3d") {
      before = { ...current.ir, data: { ...current.ir.data, view: start } };
      after = { ...current.ir, data: { ...current.ir.data, view: { ...now } } };
    } else if (current.ir.kind === "tensor") {
      before = { ...current.ir, data: { ...current.ir.data, view: start } };
      after = { ...current.ir, data: { ...current.ir.data, view: { ...now } } };
    } else if (current.ir.kind === "topology") {
      before = { ...current.ir, data: { ...current.ir.data, view: start } };
      after = { ...current.ir, data: { ...current.ir.data, view: { ...now } } };
    } else if (current.ir.kind === "space3d") {
      before = { ...current.ir, data: { ...current.ir.data, view3: start } };
      after = { ...current.ir, data: { ...current.ir.data, view3: { ...now } } };
    } else {
      return;
    }
    state.commitObjectIR(item.id, before, after, "3D 회전");
  };

  const inertia = (wy0: number, wp0: number, start: View3) => {
    let wy = wy0;
    let wp = wp0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const v = viewRef.current;
      setView({ yaw: v.yaw + wy * dt, pitch: clampPitch(v.pitch + wp * dt) });
      const k = Math.exp(-solid.inertiaDecay * dt);
      wy *= k;
      wp *= k;
      if (Math.hypot(wy, wp) < 0.05) {
        anim.current = null;
        requestAnimationFrame(() => commit(start)); // setView가 반영된 다음 프레임에 기록
        return;
      }
      anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  const resetView = () => {
    stopAnim();
    const from = viewRef.current;
    const to = defaultView;
    // 가장 가까운 쪽으로 돌아가게 yaw 차이를 (−π, π]로
    let dy = (to.yaw - from.yaw) % (2 * Math.PI);
    if (dy > Math.PI) dy -= 2 * Math.PI;
    if (dy <= -Math.PI) dy += 2 * Math.PI;
    const t0 = performance.now();
    const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
    const step = (t: number) => {
      const u = Math.min(1, (t - t0) / solid.resetMs);
      const e = ease(u);
      setView({ yaw: from.yaw + dy * e, pitch: from.pitch + (to.pitch - from.pitch) * e });
      if (u < 1) anim.current = requestAnimationFrame(step);
      else {
        anim.current = null;
        requestAnimationFrame(() => commit(from));
      }
    };
    anim.current = requestAnimationFrame(step);
  };

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => {
      stopAnim();
      // 캡처는 던질 수 있다(함정 #30) — 실패해도 회전은 계속돼야 한다
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 상자 밖으로 나가면 회전이 끊기는 정도 — 치명적이지 않다 */
      }
      const now = performance.now();
      drag.current = { x: e.clientX, y: e.clientY, t: now, wy: 0, wp: 0, start: { ...viewRef.current }, sx: e.clientX, sy: e.clientY, t0: now };
    },
    onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      if (!d) return;
      const now = performance.now();
      const dt = Math.max(1, now - d.t) / 1000;
      const v = viewRef.current;
      const ny = v.yaw + (e.clientX - d.x) * solid.dragGain;
      const np = clampPitch(v.pitch + (e.clientY - d.y) * solid.dragGain);
      // 각속도: 최근 움직임에 무게를 둔 지수 평균 (마지막 50ms 감각)
      const a = Math.min(1, dt / 0.05);
      d.wy = d.wy * (1 - a) + ((ny - v.yaw) / dt) * a;
      d.wp = d.wp * (1 - a) + ((np - v.pitch) / dt) * a;
      d.x = e.clientX;
      d.y = e.clientY;
      d.t = now;
      setView({ yaw: ny, pitch: np });
    },
    onPointerUp: () => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (Math.hypot(d.x - d.sx, d.y - d.sy) < 6 && performance.now() - d.t0 < 350) {
        sessionStore.getState().setSelection([item.id]);
        return;
      }
      if (performance.now() - d.t > 80) {
        commit(d.start); // 놓기 직전에 멈춰 있었으면 관성 없음
        return;
      }
      inertia(d.wy, d.wp, d.start);
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onDoubleClick: resetView,
  };

  return { view, handlers };
}

export function defaultSolidView(): View3 {
  return { yaw: solid.yawDeg * DEG, pitch: solid.pitchDeg * DEG };
}
