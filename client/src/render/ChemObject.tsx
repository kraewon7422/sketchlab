import type { SceneIR } from "@sketchlab/shared";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { nameMolecule, parseSmiles, toSmiles, valid, type El, type Mol } from "../chem/iupac";
import { layoutMolecule, type AtomLabel, type ChemDrawing } from "../chem/layout";
import { loadRDKit, moleculeJson } from "../chem/rdkit";
import type { ObjectItem } from "../ink/types";
import { sessionStore } from "../store/session";
import { btn, onBtn } from "./figureKit";
import { isFresh } from "./Shape2DView";
import { chem, theme } from "./theme";

/**
 * 화학 구조식 객체 (마스터스펙 v4 §13) — 교과서 골격식.
 * 배치는 RDKit(lazy WASM), 선·기호는 우리 손으로 그린다 (앱의 다른 그림과 같은 선 굵기·색).
 * 사슬 분자면 IUPAC 이름(영어·한국어)을 앱이 지어 아래에 보인다:
 *   [왜 이 이름?] 주 사슬을 칠하고 탄소에 1, 2, 3 … 번호, 이름 짓는 차례
 *   [구조 바꾸기] 원자를 톡 → 원소 바꾸기·탄소 잇기·지우기, 결합을 톡 → 단일 → 이중 → 삼중 (이름이 바로 바뀐다)
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

export default memo(function ChemObject({ item, interactive = false }: { item: ObjectItem; interactive?: boolean }): ReactElement | null {
  if (item.ir.kind !== "chem") return null;
  return <ChemBox item={item} ir={item.ir} interactive={interactive} />;
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

const ELEMENTS: El[] = ["C", "O", "N", "F", "Cl", "Br", "I"];
const ACCENT = "#E2733F";

function ChemBox({ item, ir, interactive }: { item: ObjectItem; ir: ChemIR; interactive: boolean }) {
  const bond = item.transform.scale;
  const [state, setState] = useState<{ drawing: ChemDrawing | null; error: string | null }>({ drawing: null, error: null });
  const fresh = isFresh(item.id);
  const [why, setWhy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [selAtom, setSelAtom] = useState<number | null>(null);

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

  // 사슬 분자면 앱이 직접 읽고 이름을 짓는다 (고리·에테르 등은 null → 이름 줄 없음)
  const mol = useMemo(() => parseSmiles(ir.data.smiles), [ir.data.smiles]);
  const naming = useMemo(() => (mol ? nameMolecule(mol) : null), [mol]);

  const d = state.drawing;
  const size = bond * chem.fontScale;
  // 관용명 캡션에 이미 IUPAC 이름이 들어 있으면 다시 쓰지 않는다
  const showName = !!naming && !(ir.data.commonName ?? "").includes(naming.en) && !(ir.data.commonName ?? "").includes(naming.ko);

  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || !d) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const b = item.bbox;
    if (Math.abs(b.maxY - b.minY - h) > 2 || Math.abs(b.maxX - b.minX - w) > 2) sessionStore.getState().fitObjectBox(item.id, { minX: item.transform.x, minY: item.transform.y, maxX: item.transform.x + w, maxY: item.transform.y + h });
  });

  /** 편집한 분자를 기록 (Undo 1단계) — 관용명은 더 맞지 않으니 뺀다 */
  const commitMol = (next: Mol, label: string) => {
    if (!valid(next) || next.atoms.length === 0) return;
    const now = sessionStore.getState().items.find((i) => i.id === item.id);
    if (!now || now.kind !== "object" || now.ir.kind !== "chem") return;
    const rest = { ...now.ir.data };
    delete rest.commonName;
    sessionStore.getState().commitObjectIR(item.id, now.ir, { ...now.ir, data: { ...rest, smiles: toSmiles(next) } }, label);
    setSelAtom(null);
  };
  const cycleBond = (k: number) => {
    if (!mol) return;
    const next: Mol = { atoms: [...mol.atoms], bonds: mol.bonds.map((b) => [...b] as [number, number, number]) };
    const b = next.bonds[k];
    if (!b) return;
    // 단일 → 이중 → 삼중 → 단일 (원자가가 넘치면 건너뛴다)
    for (const o of [b[2] + 1, b[2] + 2, b[2] + 3].map((v) => ((v - 1) % 3) + 1)) {
      b[2] = o;
      if (valid(next)) break;
    }
    commitMol(next, "결합 바꾸기");
  };
  const setElement = (i: number, el: El) => {
    if (!mol) return;
    commitMol({ atoms: mol.atoms.map((a, k) => (k === i ? el : a)), bonds: mol.bonds }, "원소 바꾸기");
  };
  const addCarbon = (i: number) => {
    if (!mol) return;
    commitMol({ atoms: [...mol.atoms, "C"], bonds: [...mol.bonds, [i, mol.atoms.length, 1]] }, "탄소 잇기");
  };
  const removeAtom = (i: number) => {
    if (!mol) return;
    // 남은 원자 중 가장 큰 덩어리만 (가운데 원자를 지우면 둘로 나뉜다)
    const keep = mol.atoms.map((_, k) => k).filter((k) => k !== i);
    const bonds = mol.bonds.filter(([a, b]) => a !== i && b !== i);
    const comp = new Map<number, number>();
    for (const s of keep) {
      if (comp.has(s)) continue;
      const stack = [s];
      comp.set(s, s);
      while (stack.length) {
        const c = stack.pop() as number;
        for (const [a, b] of bonds) {
          const o = a === c ? b : b === c ? a : -1;
          if (o >= 0 && !comp.has(o)) {
            comp.set(o, s);
            stack.push(o);
          }
        }
      }
    }
    const sizes = new Map<number, number>();
    for (const r of comp.values()) sizes.set(r, (sizes.get(r) ?? 0) + 1);
    const root = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const left = keep.filter((k) => comp.get(k) === root);
    const idx = new Map(left.map((k, n) => [k, n]));
    commitMol({ atoms: left.map((k) => mol.atoms[k] as El), bonds: bonds.filter(([a, b]) => idx.has(a) && idx.has(b)).map(([a, b, o]) => [idx.get(a) as number, idx.get(b) as number, o]) }, "원자 지우기");
  };

  const at = (i: number) => d?.atoms[i];

  return (
    <div
      ref={boxRef}
      data-overlay-id={item.id}
      className={fresh ? "sl-fade-in" : undefined}
      style={{ position: "absolute", left: item.transform.x, top: item.transform.y, pointerEvents: "none", color: theme.color.ink, minWidth: d ? d.width : undefined }}
    >
      {d ? (
        <svg width={d.width} height={d.height} style={{ display: "block", overflow: "visible", margin: "0 auto" }}>
          {/* 주 사슬 칠하기 */}
          {why && naming && (
            <polyline
              points={naming.chain.map((i) => (at(i) ?? [0, 0]).join(",")).join(" ")}
              fill="none"
              stroke={ACCENT}
              strokeOpacity={0.28}
              strokeWidth={bond * 0.42}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
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
          {/* 주 사슬 번호 */}
          {why &&
            naming?.chain.map((i, k) => {
              const p = at(i);
              if (!p) return null;
              return (
                <g key={`n${i}`}>
                  <circle cx={p[0]} cy={p[1] - bond * 0.42} r={bond * 0.2} fill={ACCENT} />
                  <text x={p[0]} y={p[1] - bond * 0.42} textAnchor="middle" dominantBaseline="central" fontSize={bond * 0.24} fill="#fff" fontWeight={700}>
                    {k + 1}
                  </text>
                </g>
              );
            })}
          {/* 편집: 결합·원자 톡 */}
          {edit && mol && (
            <g style={{ pointerEvents: "auto" }}>
              {mol.bonds.map(([a, b], k) => {
                const p = at(a);
                const q = at(b);
                if (!p || !q) return null;
                return <line key={`b${k}`} data-bond={k} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="transparent" strokeWidth={bond * 0.3} style={{ cursor: "pointer" }} onClick={() => cycleBond(k)} />;
              })}
              {mol.atoms.map((_, i) => {
                const p = at(i);
                if (!p) return null;
                return (
                  <circle
                    key={`a${i}`}
                    data-atom={i}
                    cx={p[0]}
                    cy={p[1]}
                    r={bond * 0.2}
                    fill={selAtom === i ? ACCENT : "transparent"}
                    fillOpacity={0.35}
                    stroke={selAtom === i ? ACCENT : theme.color.accent}
                    strokeOpacity={0.6}
                    strokeDasharray={selAtom === i ? undefined : "2 2"}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelAtom((s) => (s === i ? null : i))}
                  />
                );
              })}
            </g>
          )}
        </svg>
      ) : (
        <div style={{ padding: theme.space[3], fontSize: 13, color: state.error ? theme.color.danger : theme.color.asymptote }}>
          {state.error ?? "구조식 준비 중…"}
        </div>
      )}
      {d && ir.data.commonName && (
        <div style={{ textAlign: "center", marginTop: theme.space[1], fontSize: 15, whiteSpace: "nowrap" }}>{ir.data.commonName}</div>
      )}
      {d && showName && naming && (
        <div style={{ textAlign: "center", marginTop: 2, fontSize: ir.data.commonName ? 13 : 15, color: ir.data.commonName ? theme.color.asymptote : theme.color.ink, whiteSpace: "nowrap" }}>
          {naming.ko} <span style={{ color: theme.color.asymptote }}>({naming.en})</span>
        </div>
      )}
      {d && why && naming && (
        <ol style={{ margin: "6px auto 0", paddingLeft: 20, maxWidth: Math.max(260, d.width), fontSize: 12.5, lineHeight: 1.55, color: theme.color.ink, wordBreak: "keep-all" }}>
          {naming.steps.map((s, k) => (
            <li key={k}>{s}</li>
          ))}
        </ol>
      )}
      {d && interactive && mol && (
        <div data-export-skip style={{ marginTop: 6, display: "grid", gap: 6, justifyItems: "center", pointerEvents: "auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
            {naming && (
              <button type="button" style={why ? onBtn : btn} onClick={() => setWhy((v) => !v)}>
                왜 이 이름?
              </button>
            )}
            <button
              type="button"
              style={edit ? onBtn : btn}
              onClick={() => {
                setEdit((v) => !v);
                setSelAtom(null);
              }}
            >
              {edit ? "편집 끝" : "구조 바꾸기"}
            </button>
          </div>
          {edit && selAtom !== null && (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 5 }}>
              {ELEMENTS.map((el) => (
                <button key={el} type="button" style={mol.atoms[selAtom] === el ? onBtn : btn} onClick={() => setElement(selAtom, el)}>
                  {el}
                </button>
              ))}
              <button type="button" style={btn} onClick={() => addCarbon(selAtom)}>
                + 탄소 잇기
              </button>
              {mol.atoms.length > 1 && (
                <button type="button" style={btn} onClick={() => removeAtom(selAtom)}>
                  지우기
                </button>
              )}
            </div>
          )}
          {edit && <div style={{ fontSize: 12, color: theme.color.asymptote, textAlign: "center", wordBreak: "keep-all" }}>원자를 톡 → 원소 바꾸기·탄소 잇기 · 결합을 톡 → 단일·이중·삼중</div>}
          {edit && !naming && <div style={{ fontSize: 12, color: theme.color.danger, textAlign: "center" }}>이 모양은 아직 이름을 짓지 못해요 (에테르·에스터 등)</div>}
        </div>
      )}
    </div>
  );
}
