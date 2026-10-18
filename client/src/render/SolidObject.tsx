import type { SceneIR } from "@sketchlab/shared";
import { memo, useMemo, type ReactElement } from "react";
import type { ObjectItem } from "../ink/types";
import { SOLID_NAMES, solidMesh } from "../solid/mesh";
import { drawSolid, fitScale } from "../solid/project";
import { isFresh } from "./Shape2DView";
import { solid, stroke, theme } from "./theme";
import { defaultSolidView, useTurntable } from "./useTurntable";

/**
 * 입체도형 객체 — 손가락/펜으로 돌려 보는 교과서 겨냥도 (마스터스펙 v4 §12).
 * 회전 조작은 useTurntable (공간좌표와 공유). 그리기는 solid/project.ts의 정확한 숨은선 선화.
 */

type SolidIR = Extract<SceneIR, { kind: "solid3d" }>;

export default memo(function SolidObject({ item, interactive }: { item: ObjectItem; interactive: boolean }): ReactElement | null {
  if (item.ir.kind !== "solid3d") return null;
  return <SolidBox item={item} ir={item.ir} interactive={interactive} />;
});

export function line(pts: ReadonlyArray<readonly [number, number]>): string {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
}

function SolidBox({ item, ir, interactive }: { item: ObjectItem; ir: SolidIR; interactive: boolean }) {
  const S = item.transform.scale;
  const mesh = useMemo(() => solidMesh(ir.data.solid, ir.data.params), [ir.data.solid, ir.data.params]);
  const scale = useMemo(() => fitScale(mesh, S), [mesh, S]);
  const { view, handlers } = useTurntable(item, ir.data.view, defaultSolidView());
  const drawing = useMemo(() => drawSolid(mesh, view, scale, S / 2, S / 2), [mesh, view, scale, S]);
  const fresh = isFresh(item.id);

  return (
    <div
      data-overlay-id={item.id}
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
        {...handlers}
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
        {interactive && (
          <div data-export-skip style={{ fontSize: 12, color: theme.color.asymptote }}>
            드래그해서 돌리기 · 두 번 탭하면 처음 각도
          </div>
        )}
      </div>
    </div>
  );
}
