import katex from "katex";
import "katex/dist/katex.min.css";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { BBox } from "../ink/types";
import { IR_VERSION, SOLID_KINDS, type SceneIR, type SolidKind } from "@sketchlab/shared";
import { buildFromInput, describe } from "../math/build";
import { SOLID_NAMES } from "../solid/mesh";
import { CHEM_EXAMPLES, chemFromInput } from "../chem/names";
import { analyze, normalizeInput } from "../math/latex";
import { markFresh } from "../render/Shape2DView";
import { chem, plot, solid, theme } from "../render/theme";
import { sessionStore } from "../store/session";

/**
 * 수식·그래프 직접 입력 (마스터스펙 v4 §9.3 — API 키 없이 동작하는 1급 경로).
 * 바텀시트: 입력창 + 실시간 KaTeX 미리보기 + 예시 칩 + 추가.
 * 평문(sin(x), sqrt(x), pi)도 받는다 — normalizeInput이 LaTeX로 고쳐 준다.
 */

const EXAMPLES: Array<[label: string, latex: string]> = [
  ["포물선", "y=x^2-3"],
  ["삼각함수", "y=\\sin x"],
  ["계수 슬라이더", "y=a\\sin(bx)"],
  ["유리함수", "y=\\frac{1}{x}"],
  ["로그", "y=\\log_2 x"],
  ["지수", "y=2^x"],
  ["원", "x^2+y^2=4"],
  ["극좌표", "r=1+\\cos\\theta"],
  ["정적분", "\\int_0^2 x^2\\,dx"],
  ["공간좌표", "A(2,3,4)"],
  ["수식", "\\sum_{k=1}^{n} k=\\frac{n(n+1)}{2}"],
];

/**
 * 새 객체 자리: 위에서부터 훑으며 기존 잉크·객체와 겹치지 않는 첫 자리.
 * 빈 자리가 없으면 가운데 (겹치더라도 보이게).
 */
function freeSpot(w: number, h: number, area: { width: number; height: number }): { x: number; y: number } {
  const gap = theme.space[5];
  const items = sessionStore.getState().items;
  const taken = items.map((i) => i.bbox);
  const hits = (x: number, y: number) =>
    taken.some((b) => x < b.maxX + gap && x + w > b.minX - gap && y < b.maxY + gap && y + h > b.minY - gap);
  // 후보 자리 = 왼쪽·위 여백, 그리고 기존 것들의 바로 오른쪽·바로 아래 (격자로 훑으면 몇 px 차이로 놓친다)
  const xs = [gap, ...taken.map((b) => b.maxX + gap)].sort((a, b) => a - b);
  const ys = [gap, ...taken.map((b) => b.maxY + gap)].sort((a, b) => a - b);
  for (const y of ys) {
    if (y + h > area.height - gap) continue;
    for (const x of xs) {
      if (x + w <= area.width - gap && !hits(x, y)) return { x, y };
    }
  }
  // 빈 자리가 없다(팬·줌은 아직 없음): 한가운데에 겹쳐 쌓지 말고 비스듬히 엇갈려 놓는다
  const k = items.filter((i) => i.kind === "object").length % 6;
  return {
    x: Math.max(gap, Math.min(area.width - w - gap, gap + k * theme.space[6])),
    y: Math.max(gap, Math.min(area.height - h - gap, gap + k * theme.space[6])),
  };
}

export interface FormulaSheetProps {
  onClose: () => void;
  /** 새 객체를 놓을 캔버스 영역 (월드 좌표) */
  area: { width: number; height: number };
}

export default function FormulaSheet({ onClose, area }: FormulaSheetProps): ReactElement {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const preview = useMemo(() => {
    const c = chemFromInput(text);
    if (c && !c.guessed) return { html: "", note: `화학 구조식${c.name ? ` · ${c.name}` : ""}` };
    const latex = normalizeInput(text);
    if (!latex) return { html: "", note: "식을 입력하거나 아래 예시를 누르세요" };
    if (c) return { html: "", note: "화학 구조식 (SMILES)" };
    const a = analyze(text);
    return { html: katex.renderToString(latex, { throwOnError: false, displayMode: true }), note: describe(a) };
  }, [text]);

  const add = (input: string) => {
    const c = chemFromInput(input);
    if (c) void addChem(c, input);
    else addFormula(input);
  };

  /** 화학 구조식: RDKit을 불러 크기를 잰 뒤 빈 자리에 놓는다 */
  const addChem = async (c: { smiles: string; name?: string; guessed?: boolean }, input: string) => {
    setError(null);
    setLoading(true);
    try {
      const { chemDrawing } = await import("../render/ChemObject");
      const data = { smiles: c.smiles, style: "skeletal" as const, aromaticCircle: false, ...(c.name ? { commonName: c.name } : {}) };
      let bond: number = chem.bond;
      let d = await chemDrawing(data, bond);
      const maxW = area.width - theme.space[6] * 2;
      if (d.width > maxW) {
        bond = Math.max(16, Math.floor((bond * maxW) / d.width));
        d = await chemDrawing(data, bond);
      }
      const h = d.height + (c.name ? 28 : 0);
      const { x, y } = freeSpot(d.width, h, area);
      const ir: SceneIR = { version: IR_VERSION, kind: "chem", source: "manual", confidence: 1, data };
      const id = sessionStore.getState().addObject(ir, { x, y, scale: bond }, { minX: x, minY: y, maxX: x + d.width, maxY: y + h });
      markFresh(id);
      onClose();
    } catch (e) {
      // SMILES처럼 보였지만 아니었다 → 수식으로
      if (c.guessed) addFormula(input);
      else setError(e instanceof Error ? e.message : "구조식을 그리지 못했어요");
    } finally {
      setLoading(false);
    }
  };

  const addFormula = (input: string) => {
    const r = buildFromInput(input);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    if (r.ir.kind === "space3d") {
      const S = Math.min(solid.size + 40, area.width - theme.space[6] * 2);
      const pos = freeSpot(S, S + 24, area);
      const sid = sessionStore.getState().addObject(r.ir, { x: pos.x, y: pos.y, scale: S }, { minX: pos.x, minY: pos.y, maxX: pos.x + S, maxY: pos.y + S + 24 });
      markFresh(sid);
      onClose();
      return;
    }
    const isPlot = r.ir.kind === "plot2d";
    const w = isPlot ? Math.min(plot.width, area.width - theme.space[6] * 2) : Math.min(520, area.width - theme.space[6] * 2);
    const sliders = r.ir.kind === "plot2d" ? (r.ir.data.params?.length ?? 0) : 0;
    const h = isPlot ? w * plot.aspect + 48 + sliders * theme.touch.minTarget : 72;
    const { x, y } = freeSpot(w, h, area);
    const bbox: BBox = { minX: x, minY: y, maxX: x + w, maxY: y + h };
    const id = sessionStore.getState().addObject(r.ir, { x, y, scale: w }, bbox);
    markFresh(id);
    onClose();
  };

  const addSolid = (kind: SolidKind) => {
    const S = Math.min(solid.size, area.width - theme.space[6] * 2);
    const h = S + 48;
    const { x, y } = freeSpot(S, h, area);
    const ir: SceneIR = {
      version: IR_VERSION,
      kind: "solid3d",
      source: "manual",
      confidence: 1,
      data: { solid: kind, params: {}, style: "line", showEdges: true, showHiddenEdges: true },
    };
    const id = sessionStore.getState().addObject(ir, { x, y, scale: S }, { minX: x, minY: y, maxX: x + S, maxY: y + h });
    markFresh(id);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-label="수식 입력"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: "70%",
        overflowY: "auto",
        background: theme.color.bg,
        borderTop: `1px solid ${theme.color.sub}`,
        borderRadius: `${theme.radius.sheet}px ${theme.radius.sheet}px 0 0`,
        boxShadow: "0 -8px 32px rgba(26,26,26,0.12)",
        padding: `${theme.space[4]}px ${theme.space[4]}px calc(${theme.space[4]}px + env(safe-area-inset-bottom))`,
        zIndex: 20,
        touchAction: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: theme.space[2], marginBottom: theme.space[3] }}>
        <strong style={{ fontSize: 15 }}>수식·그래프 입력</strong>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          style={{ width: theme.touch.minTarget, height: theme.touch.minTarget, border: "none", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }}
        >
          <X size={20} strokeWidth={1.5} />
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add(text);
        }}
        style={{ display: "flex", gap: theme.space[2] }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder="예: y=x^2-3   y=sin(x)   x^2+y^2=4   A(2,3,4)"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={{
            flex: 1,
            minWidth: 0,
            height: theme.touch.minTarget,
            padding: `0 ${theme.space[3]}px`,
            border: `1px solid ${theme.color.sub}`,
            borderRadius: theme.radius.s,
            fontFamily: "ui-monospace, Menlo, Consolas, monospace",
            fontSize: 16,
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          style={{
            height: theme.touch.minTarget,
            padding: `0 ${theme.space[4]}px`,
            border: "none",
            borderRadius: theme.radius.s,
            background: theme.color.accent,
            color: theme.color.bg,
            fontSize: 15,
            opacity: text.trim() ? 1 : 0.4,
            cursor: text.trim() ? "pointer" : "not-allowed",
          }}
        >
          추가
        </button>
      </form>

      <div style={{ minHeight: 64, display: "grid", placeItems: "center", marginTop: theme.space[2], overflowX: "auto" }}>
        <div dangerouslySetInnerHTML={{ __html: preview.html }} />
      </div>
      <p style={{ margin: 0, textAlign: "center", fontSize: 13, color: error ? theme.color.danger : theme.color.asymptote }}>
        {loading ? "구조식 준비 중… (처음 한 번은 몇 초 걸려요)" : (error ?? preview.note)}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: theme.space[2], marginTop: theme.space[4] }}>
        {EXAMPLES.map(([label, latex]) => (
          <button
            key={label}
            type="button"
            onClick={() => add(latex)}
            style={{
              minHeight: 36,
              padding: `${theme.space[1]}px ${theme.space[3]}px`,
              border: `1px solid ${theme.color.sub}`,
              borderRadius: 999,
              background: theme.color.bg,
              color: theme.color.ink,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <p style={{ margin: `${theme.space[5]}px 0 ${theme.space[2]}px`, fontSize: 13, color: theme.color.asymptote }}>
        화학 구조식 — 이름(벤젠, ethanol)이나 SMILES(c1ccccc1)를 입력해도 돼요
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: theme.space[2] }}>
        {CHEM_EXAMPLES.map((name) => (
          <button
            key={name}
            type="button"
            disabled={loading}
            onClick={() => add(name)}
            style={{
              minHeight: 36,
              padding: `${theme.space[1]}px ${theme.space[3]}px`,
              border: `1px solid ${theme.color.sub}`,
              borderRadius: 999,
              background: theme.color.bg,
              color: theme.color.ink,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <p style={{ margin: `${theme.space[5]}px 0 ${theme.space[2]}px`, fontSize: 13, color: theme.color.asymptote }}>
        입체도형 — 돌려 볼 수 있어요
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: theme.space[2] }}>
        {SOLID_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => addSolid(kind)}
            style={{
              minHeight: 36,
              padding: `${theme.space[1]}px ${theme.space[3]}px`,
              border: `1px solid ${theme.color.sub}`,
              borderRadius: 999,
              background: theme.color.bg,
              color: theme.color.ink,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {SOLID_NAMES[kind]}
          </button>
        ))}
      </div>
    </div>
  );
}
