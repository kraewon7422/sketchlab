import type { SceneIR } from "@sketchlab/shared";
import { memo, useEffect, useState, type ReactElement } from "react";
import { layoutMolecule, type AtomLabel, type ChemDrawing } from "../chem/layout";
import { loadRDKit, moleculeJson } from "../chem/rdkit";
import type { ObjectItem } from "../ink/types";
import { isFresh } from "./Shape2DView";
import { chem, theme } from "./theme";

/**
 * 화학 구조식 객체 (마스터스펙 v4 §13) — 교과서 골격식.
 * 배치는 RDKit(lazy WASM), 선·기호는 우리 손으로 그린다 (앱의 다른 그림과 같은 선 굵기·색).
 */

type ChemIR = Extract<SceneIR, { kind: "chem" }>;

/** 같은 분자를 다시 계산하지 않게 (Undo·선택 때마다 다시 그려진다) */
const cache = new Map<string, Promise<ChemDrawing>>();

export function chemDrawing(data: ChemIR["data"], bond: number): Promise<ChemDrawing> {
  const full = data.style === "full";
  const k = `${data.smiles}|${full}|${data.aromaticCircle}|${bond}`;
  let p = cache.get(k);
  if (!p) {
    p = loadRDKit().then((rd) => {
      const json = moleculeJson(rd, data.smiles, full);
      if (!json) throw new Error(`구조식을 읽지 못했어요: ${data.smiles}`);
      return layoutMolecule(json, { ...chem, bond, showCarbons: full, aromaticCircle: data.aromaticCircle });
    });
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return p;
}

export default memo(function ChemObject({ item }: { item: ObjectItem }): ReactElement | null {
  if (item.ir.kind !== "chem") return null;
  return <ChemBox item={item} ir={item.ir} />;
});

function Label({ l, size }: { l: AtomLabel; size: number }) {
  const h = l.hydrogens > 0 ? "H" : "";
  const count = l.hydrogens > 1 ? String(l.hydrogens) : "";
  const subSize = size * 0.7;
  // 원소 기호의 가운데가 원자 자리에 오도록: 기호를 가운데 정렬, 수소는 그 옆에 이어 붙인다
  const symW = size * 0.62 * l.symbol.length;
  const charge = l.charge && (
    <tspan fontSize={subSize} dy={-size * 0.45}>
      {l.charge}
    </tspan>
  );
  return (
    <g>
      <text x={l.at[0]} y={l.at[1] + size * 0.36} textAnchor="middle">
        {l.symbol}
        {!h && charge}
      </text>
      {h && !l.hLeft && (
        <text x={l.at[0] + symW / 2} y={l.at[1] + size * 0.36} textAnchor="start">
          H
          {count && (
            <tspan fontSize={subSize} dy={size * 0.25}>
              {count}
            </tspan>
          )}
          {charge && (
            <tspan fontSize={subSize} dy={count ? -size * 0.7 : -size * 0.45}>
              {l.charge}
            </tspan>
          )}
        </text>
      )}
      {h && l.hLeft && (
        <text x={l.at[0] - symW / 2} y={l.at[1] + size * 0.36} textAnchor="end">
          H
          {count && (
            <tspan fontSize={subSize} dy={size * 0.25}>
              {count}
            </tspan>
          )}
        </text>
      )}
    </g>
  );
}

function ChemBox({ item, ir }: { item: ObjectItem; ir: ChemIR }) {
  const bond = item.transform.scale;
  const [state, setState] = useState<{ drawing: ChemDrawing | null; error: string | null }>({ drawing: null, error: null });
  const fresh = isFresh(item.id);

  useEffect(() => {
    let alive = true;
    chemDrawing(ir.data, bond).then(
      (drawing) => alive && setState({ drawing, error: null }),
      (e: unknown) => alive && setState({ drawing: null, error: e instanceof Error ? e.message : "구조식을 그리지 못했어요" }),
    );
    return () => {
      alive = false;
    };
  }, [ir.data, bond]);

  const d = state.drawing;
  const size = bond * chem.fontScale;
  return (
    <div
      data-overlay-id={item.id}
      className={fresh ? "sl-fade-in" : undefined}
      style={{ position: "absolute", left: item.transform.x, top: item.transform.y, pointerEvents: "none", color: theme.color.ink }}
    >
      {d ? (
        <svg width={d.width} height={d.height} style={{ display: "block", overflow: "visible" }}>
          <g stroke={theme.color.ink} strokeWidth={chem.lineWidth} strokeLinecap="round" fill="none">
            {d.lines.map(([p, q], i) => (
              <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />
            ))}
            {d.circles.map((c, i) => (
              <circle key={`c${i}`} cx={c.c[0]} cy={c.c[1]} r={c.r} />
            ))}
          </g>
          <g fill={theme.color.ink} fontFamily={chem.font} fontSize={size}>
            {d.labels.map((l, i) => (
              <Label key={i} l={l} size={size} />
            ))}
          </g>
        </svg>
      ) : (
        <div style={{ padding: theme.space[3], fontSize: 13, color: state.error ? theme.color.danger : theme.color.asymptote }}>
          {state.error ?? "구조식 준비 중…"}
        </div>
      )}
      {d && ir.data.commonName && (
        <div style={{ textAlign: "center", marginTop: theme.space[1], fontSize: 15 }}>{ir.data.commonName}</div>
      )}
    </div>
  );
}
