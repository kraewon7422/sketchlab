import { Circle, Crosshair, MoveUpRight, Slash, Square, Triangle } from "lucide-react";
import type { ReactElement } from "react";
import { SHAPE_KINDS, type ShapeKind } from "../ink/shapes";
import { theme } from "../render/theme";
import { penStore, usePen } from "../store/pen";

/**
 * 도형 도구 패널 — 끌어서 정확한 직선·화살표·사각형·원·삼각형·좌표축.
 * 색은 지금 펜 색. "반듯하게"를 켜면(또는 Shift) 정사각형·정원·45° 직선.
 */
const ICONS: Record<ShapeKind, typeof Slash> = { line: Slash, arrow: MoveUpRight, rect: Square, ellipse: Circle, triangle: Triangle, axes: Crosshair };

export function ShapeOptions(): ReactElement {
  const kind = usePen((s) => s.shapeKind);
  const square = usePen((s) => s.shapeSquare);
  return (
    <div style={{ display: "grid", gap: theme.space[3] }}>
      <strong style={{ fontSize: 14 }}>도형</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {SHAPE_KINDS.map(([k, label]) => {
          const Icon = ICONS[k];
          const on = kind === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => penStore.getState().set({ shapeKind: k })}
              style={{
                height: 58,
                display: "grid",
                placeItems: "center",
                gap: 2,
                border: `1px solid ${on ? theme.color.accent : theme.color.sub}`,
                borderRadius: theme.radius.s,
                background: on ? theme.color.selection : theme.color.bg,
                color: on ? theme.color.accent : theme.color.ink,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <Icon size={20} strokeWidth={1.6} />
              {label}
            </button>
          );
        })}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: theme.space[2], fontSize: 14 }}>
        <input type="checkbox" checked={square} onChange={(e) => penStore.getState().set({ shapeSquare: e.target.checked })} style={{ width: 18, height: 18, accentColor: theme.color.accent }} />
        반듯하게 (정사각형·정원·45°)
      </label>
      <span style={{ fontSize: 12, color: theme.color.asymptote, marginTop: -theme.space[2] }}>펜 색으로 그려요 · 키보드에서는 Shift를 누른 채</span>
    </div>
  );
}
