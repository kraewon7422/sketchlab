import type { SceneIR } from "@sketchlab/shared";
import { memo, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { SOLID_NAMES, solidMesh } from "../solid/mesh";
import { drawSolid, fitScale, type View3 } from "../solid/project";
import { sessionStore } from "../store/session";
import { isFresh } from "./Shape2DView";
import { solid, stroke, theme } from "./theme";

/**
 * 입체도형 객체 — 손가락/펜으로 돌려 보는 교과서 겨냥도 (마스터스펙 v4 §12).
 *
 * 회전 컨트롤러 (§12.3): 턴테이블(yaw + pitch, pitch는 ±85°로 제한 — 학생에게 트랙볼보다 직관적).
 * 놓으면 관성으로 미끄러지는데, 감쇠가 **시간 기반**(ω ← ω·e^(−k·dt))이라 60Hz·120Hz 화면에서
 * 손맛이 같다 (프레임마다 고정 비율로 줄이면 120Hz에서 두 배 빨리 멈춘다).
 * 회전하는 동안은 이 컴포넌트 안에서만 다시 그리고, 멈췄을 때 한 번만 스토어에 기록한다(Undo 1회).
 */

type SolidIR = Extract<SceneIR, { kind: "solid3d" }>;
const DEG = Math.PI / 180;
const PITCH_LIMIT = 85 * DEG;
const clampPitch = (p: number) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));

export default memo(function SolidObject({ item, interactive }: { item: ObjectItem; interactive: boolean }): ReactElement | null {
  if (item.ir.kind !== "solid3d") return null;
  return <SolidBox item={item} ir={item.ir} interactive={interactive} />;
});

function SolidBox({ item, ir, interactive }: { item: ObjectItem; ir: SolidIR; interactive: boolean }) {
  const S = item.transform.scale;
  const mesh = useMemo(() => solidMesh(ir.data.solid, ir.data.params), [ir.data.solid, ir.data.params]);
  const scale = useMemo(() => fitScale(mesh, S), [mesh, S]);
  const initial: View3 = ir.data.view ?? { yaw: solid.yawDeg * DEG, pitch: solid.pitchDeg * DEG };
  const [view, setView] = useState<View3>(initial);
  const viewRef = useRef(view);
  viewRef.current = view;
  const fresh = isFresh(item.id);

  // 바깥(Undo 등)에서 IR의 각도가 바뀌면 따라간다
  const irYaw = ir.data.view?.yaw;
  const irPitch = ir.data.view?.pitch;
  useEffect(() => {
    if (irYaw !== undefined && irPitch !== undefined) setView({ yaw: irYaw, pitch: irPitch });
  }, [irYaw, irPitch]);

  const drawing = useMemo(() => drawSolid(mesh, view, scale, S / 2, S / 2), [mesh, view, scale, S]);
  const anim = useRef<number | null>(null);
  const drag = useRef<{ x: number; y: number; t: number; wy: number; wp: number; start: View3 } | null>(null);

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
    if (!current || current.kind !== "object" || current.ir.kind !== "solid3d") return;
    const before: SceneIR = { ...current.ir, data: { ...current.ir.data, view: start } };
    const after: SceneIR = { ...current.ir, data: { ...current.ir.data, view: { ...now } } };
    state.commitObjectIR(item.id, before, after, "입체 회전");
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
        // setView가 반영된 다음 프레임에 기록
        requestAnimationFrame(() => commit(start));
        return;
      }
      anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  const resetView = () => {
    stopAnim();
    const from = viewRef.current;
    const to = { yaw: solid.yawDeg * DEG, pitch: solid.pitchDeg * DEG };
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

  const line = (pts: Array<[number, number]>) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join("");

  return (
    <div
      className={fresh ? "sl-fade-in" : undefined}
      style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: S, pointerEvents: "none" }}
    >
      <svg
        width={S}
        height={S}
        style={{
          display: "block",
          overflow: "visible",
          pointerEvents: interactive ? "auto" : "none",
          touchAction: "none",
          cursor: interactive ? "grab" : undefined,
        }}
        onPointerDown={(e) => {
          stopAnim();
          // 캡처는 던질 수 있다(함정 #30) — 실패해도 회전은 계속돼야 한다
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* 상자 밖으로 나가면 회전이 끊기는 정도 — 치명적이지 않다 */
          }
          drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), wy: 0, wp: 0, start: { ...viewRef.current } };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const now = performance.now();
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          const dt = Math.max(1, now - d.t) / 1000;
          const v = viewRef.current;
          const ny = v.yaw + dx * solid.dragGain;
          const np = clampPitch(v.pitch + dy * solid.dragGain);
          // 각속도: 최근 움직임에 무게를 둔 지수 평균 (마지막 50ms 감각)
          const a = Math.min(1, dt / 0.05);
          d.wy = d.wy * (1 - a) + ((ny - v.yaw) / dt) * a;
          d.wp = d.wp * (1 - a) + ((np - v.pitch) / dt) * a;
          d.x = e.clientX;
          d.y = e.clientY;
          d.t = now;
          setView({ yaw: ny, pitch: np });
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          // 놓기 직전에 멈춰 있었으면 관성 없음
          if (performance.now() - d.t > 80) {
            commit(d.start);
            return;
          }
          inertia(d.wy, d.wp, d.start);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onDoubleClick={resetView}
      >
        <rect x={0} y={0} width={S} height={S} fill="transparent" />
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {drawing.hidden.map((pts, i) => (
            <path
              key={`h${i}`}
              d={line(pts)}
              stroke={theme.color.ink}
              strokeWidth={solid.hiddenWidth}
              strokeDasharray={solid.hiddenDash}
              opacity={0.85}
            />
          ))}
          {drawing.visible.map((pts, i) => (
            <path key={`v${i}`} d={line(pts)} stroke={theme.color.ink} strokeWidth={stroke.main} />
          ))}
        </g>
      </svg>
      <div style={{ textAlign: "center", marginTop: theme.space[1], color: theme.color.ink, fontSize: 15 }}>
        {SOLID_NAMES[ir.data.solid]}
        {interactive && <div style={{ fontSize: 12, color: theme.color.asymptote }}>드래그해서 돌리기 · 두 번 탭하면 처음 각도</div>}
      </div>
    </div>
  );
}
