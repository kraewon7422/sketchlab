import type { SceneIR } from "@sketchlab/shared";
import { Pause, Play } from "lucide-react";
import { memo, useEffect, useRef, useState, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { renderTopology, stageName } from "../math/topology";
import type { View3 } from "../solid/project";
import { sessionStore } from "../store/session";
import { isFresh } from "./Shape2DView";
import { theme } from "./theme";
import { useTurntable } from "./useTurntable";

/**
 * 위상수학: 도넛 ↔ 머그잔. 그림은 math/topology.ts가 화소로 그린다 (CPU 광선 진행).
 * 돌리거나 움직이는 동안은 작게(빠르게) 그리고, 멈추면 선명하게 다시 그린다.
 * 그림은 <svg><image>(data URL)로 넣어서 쪽 내보내기에도 그대로 들어간다.
 */

type TopoIR = Extract<SceneIR, { kind: "topology" }>;
const DEG = Math.PI / 180;
const DEFAULT_VIEW: View3 = { yaw: 20 * DEG, pitch: 28 * DEG };
const ANIM_MS = 2600;

export default memo(function TopologyObject({ item, interactive }: { item: ObjectItem; interactive: boolean }): ReactElement | null {
  if (item.ir.kind !== "topology") return null;
  return <TopologyBox item={item} ir={item.ir} interactive={interactive} />;
});

function useRendered(t: number, view: View3, size: number): string | null {
  const [href, setHref] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const draw = (px: number) => {
      const c = (canvas.current ??= document.createElement("canvas"));
      c.width = px;
      c.height = px;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(px, px);
      img.data.set(renderTopology(t, view, px, px));
      ctx.putImageData(img, 0, 0);
      setHref(c.toDataURL("image/png"));
    };
    // 먼저 작게 바로 (재생·돌리기 중에는 매 프레임 바뀌어서, 미루면 한 번도 못 그린다), 잠깐 멈추면 선명하게
    draw(96);
    const full = Math.round(Math.min(340, size * Math.min(2, window.devicePixelRatio || 1)));
    const timer = setTimeout(() => draw(full), 140);
    return () => clearTimeout(timer);
  }, [t, view, size]);
  return href;
}

function TopologyBox({ item, ir, interactive }: { item: ObjectItem; ir: TopoIR; interactive: boolean }) {
  const S = item.transform.scale;
  const { view, handlers } = useTurntable(item, ir.data.view, DEFAULT_VIEW);
  const t = ir.data.t;
  const href = useRendered(t, view, S);
  const fresh = isFresh(item.id);
  const before = useRef<TopoIR | null>(null);
  const anim = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const current = (): TopoIR => {
    const now = sessionStore.getState().items.find((i) => i.id === item.id);
    return now && now.kind === "object" && now.ir.kind === "topology" ? now.ir : ir;
  };
  const preview = (v: number) => {
    before.current ??= current();
    const base = current();
    sessionStore.getState().previewObjectIR(item.id, { ...base, data: { ...base.data, t: v } });
  };
  const commit = () => {
    const start = before.current;
    before.current = null;
    const now = current();
    if (start && now.data.t !== start.data.t) sessionStore.getState().commitObjectIR(item.id, start, now, "도넛 ↔ 컵");
  };
  const stop = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
    setPlaying(false);
  };
  useEffect(() => () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
  }, []);

  const play = () => {
    if (anim.current !== null) {
      stop();
      commit();
      return;
    }
    const from = current().data.t;
    const to = from > 0.5 ? 0 : 1;
    const t0 = performance.now();
    const dur = ANIM_MS * Math.abs(to - from);
    setPlaying(true);
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / Math.max(dur, 1));
      preview(from + (to - from) * u);
      if (u < 1) anim.current = requestAnimationFrame(step);
      else {
        anim.current = null;
        setPlaying(false);
        commit();
      }
    };
    anim.current = requestAnimationFrame(step);
  };

  return (
    <div data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: S, pointerEvents: "none" }}>
      <svg
        width={S}
        height={S}
        style={{ display: "block", overflow: "visible", pointerEvents: interactive ? "auto" : "none", touchAction: "none", cursor: interactive ? "grab" : undefined }}
        {...handlers}
      >
        <rect x={0} y={0} width={S} height={S} fill="transparent" />
        {href && <image href={href} x={0} y={0} width={S} height={S} style={{ imageRendering: "auto" }} />}
      </svg>
      <div style={{ textAlign: "center", color: theme.color.ink, fontSize: 14.5, marginTop: 2, wordBreak: "keep-all" }}>{stageName(t)}</div>
      {interactive && (
        <div data-export-skip style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto", alignItems: "center", gap: 8, pointerEvents: "auto", marginTop: 4 }}>
          <button
            type="button"
            aria-label={playing ? "멈추기" : "움직여 보기"}
            onClick={play}
            style={{ width: 36, height: 36, borderRadius: 999, border: "none", background: theme.color.accent, color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <span style={{ fontSize: 13, color: theme.color.asymptote }}>도넛</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={t}
            aria-label="도넛에서 컵까지"
            style={{ width: "100%", accentColor: theme.color.accent, touchAction: "pan-x" }}
            onPointerDown={() => {
              stop();
              before.current ??= current();
            }}
            onInput={(e) => preview(Number((e.target as HTMLInputElement).value))}
            onChange={() => {
              /* 기록은 놓을 때 (Undo 1단계) */
            }}
            onPointerUp={commit}
            onPointerCancel={commit}
            onKeyUp={commit}
          />
          <span style={{ fontSize: 13, color: theme.color.asymptote }}>컵</span>
        </div>
      )}
    </div>
  );
}
