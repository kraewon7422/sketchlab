import katex from "katex";
import "katex/dist/katex.min.css";
import { ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { BBox } from "../ink/types";
import { IR_VERSION, SOLID_KINDS, type SceneIR, type SolidKind } from "@sketchlab/shared";
import { buildFromInput, describe } from "../math/build";
import { describeLinear } from "../math/linearBuild";
import { parseTupper, TUPPER_LATEX } from "../math/tupper";
import { parseVenn, vennLatex } from "../math/venn";
import { parseDist } from "../math/stats";
import { buildSpace, describeSpace } from "../math/space3d";
import { parseTensor } from "../math/tensor";
import { paramCount, parseNNet } from "../math/nnet";
import { TOPOLOGY } from "../math/build";
import { measureKatex } from "../math/measure";
import { SOLID_NAMES } from "../solid/mesh";
import { CHEM_EXAMPLES, chemFromInput } from "../chem/names";
import { analyze, normalizeInput } from "../math/latex";
import { markFresh } from "../render/Shape2DView";
import { chem, plot, solid, theme } from "../render/theme";
import { sessionStore } from "../store/session";
import { freeSpot, type Area } from "./placement";
import { AiCreatePanel } from "./AiCreatePanel";
import { LatexGuide } from "./LatexGuide";
import { DataPanel } from "./DataPanel";

/**
 * 수식·그래프 직접 입력 (마스터스펙 v4 §9.3 — API 키 없이 동작하는 1급 경로).
 * 바텀시트: 입력창 + 실시간 KaTeX 미리보기 + 예시 칩 + 추가.
 * 평문(sin(x), sqrt(x), pi)도 받는다 — normalizeInput이 LaTeX로 고쳐 준다.
 */

type Example = [label: string, input: string];

/** 예시 단추 — 분류별로 접었다 펴기 (처음엔 그래프·방정식만 펼쳐 둔다) */
const GROUPS: Array<{ title: string; examples: Example[]; solids?: true; chem?: true; open?: true }> = [
  {
    title: "그래프",
    open: true,
    examples: [
      ["포물선", "y=x^2-3"],
      ["삼각함수", "y=\\sin x"],
      ["계수 슬라이더", "y=a\\sin(bx)"],
      ["유리함수", "y=\\frac{1}{x}"],
      ["로그", "y=\\log_2 x"],
      ["지수", "y=2^x"],
      ["원", "x^2+y^2=4"],
      ["극좌표", "r=1+\\cos\\theta"],
      ["정적분", "\\int_0^2 x^2\\,dx"],
      ["부등식 영역", "1<x+y<3"],
      ["원 안쪽", "x^2+y^2\\le 4"],
      ["투퍼 공식", "투퍼 공식"],
    ],
  },
  {
    title: "확률·통계",
    examples: [
      ["정규분포 확률", "N(170,6^2), P(164<X<182)"],
      ["표준정규분포", "P(-1<Z<1)"],
      ["이항분포", "B(10,0.3), P(X\\le 3)"],
      ["포아송분포", "Po(3), P(X=2)"],
      ["균등분포", "U(0,2)"],
    ],
  },
  {
    title: "집합 (벤 다이어그램)",
    examples: [
      ["교집합", "A\\cap B"],
      ["차집합", "A-B"],
      ["여집합", "벤 (A\\cup B)^c"],
      ["세 집합", "(A\\cup B)\\cap C"],
    ],
  },
  {
    title: "방정식·행렬",
    open: true,
    examples: [
      ["연립방정식", "2x+3y=7, x-y=1"],
      ["3원 연립", "x+y+z=6, 2x-y+z=3, x+2y-z=2"],
      ["행렬", "[[2,1],[1,3]]"],
      ["역행렬", "inv [[2,1],[1,3]]"],
    ],
  },
  {
    title: "공간 곡면·벡터",
    examples: [
      ["포물면", "z=x^2+y^2"],
      ["안장면", "z=x^2-y^2"],
      ["물결 곡면", "z=\\sin x\\cos y"],
      ["구", "(x-1)^2+y^2+z^2=4"],
      ["구와 평면", "x^2+y^2+z^2=9, z=1"],
      ["원기둥", "공간 x^2+y^2=4"],
      ["평면", "x+2y+z=4"],
      ["평행육면체", "평행육면체 (2,0,0),(1,2,0),(0,1,2)"],
    ],
  },
  {
    title: "텐서·위상·신경망",
    examples: [
      ["텐서 2×3×4", "텐서 2x3x4"],
      ["값 있는 텐서", "[[[1,2],[3,4]],[[5,6],[7,8]]]"],
      ["도넛 ↔ 컵", "도넛 컵"],
      ["신경망", "신경망 3-4-4-2"],
      ["큰 신경망", "신경망 10-16-16-3"],
    ],
  },
  { title: "공간좌표·입체도형", examples: [["공간좌표", "A(2,3,4)"]], solids: true },
  { title: "화학 구조식", examples: [], chem: true },
  {
    title: "수식",
    examples: [
      ["시그마", "\\sum_{k=1}^{n} k=\\frac{n(n+1)}{2}"],
      ["극한", "\\lim_{x\\to 0}\\frac{\\sin x}{x}=1"],
      ["근의 공식", "x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}"],
    ],
  },
];

const chipStyle = {
  minHeight: 36,
  padding: `${theme.space[1]}px ${theme.space[3]}px`,
  border: `1px solid ${theme.color.sub}`,
  borderRadius: 999,
  background: theme.color.bg,
  color: theme.color.ink,
  fontSize: 13,
  cursor: "pointer",
} as const;

export interface FormulaSheetProps {
  onClose: () => void;
  /** AI 탭에서 "AI 설정 열기" */
  onOpenAiSettings?: () => void;
  /** 새 객체를 놓을 캔버스 영역 (월드 좌표) */
  area: Area;
}

export default function FormulaSheet({ onClose, area, onOpenAiSettings }: FormulaSheetProps): ReactElement {
  const [mode, setMode] = useState<"formula" | "data" | "ai">("formula");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set(GROUPS.filter((g) => g.open).map((g) => g.title)));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const preview = useMemo(() => {
    const c = chemFromInput(text);
    if (c && !c.guessed) return { html: "", note: `화학 구조식${c.name ? ` · ${c.name}` : ""}` };
    const latex = normalizeInput(text);
    if (!latex) return { html: "", note: "식을 입력하거나 아래 예시를 누르세요" };
    if (c) return { html: "", note: "화학 구조식 (SMILES)" };
    const tensor = parseTensor(text);
    if (tensor) return { html: katex.renderToString(`T\\in\\mathbb{R}^{${tensor.dims.join("\\times")}}`, { throwOnError: false, displayMode: true }), note: "3D 텐서 · 돌려 보고, 겹·행·열 단면을 골라 행렬로 보기" };
    const layers = parseNNet(text);
    if (layers) {
      const pc = paramCount(layers);
      return { html: "", note: `신경망 ${layers.join("–")} · 층 ${layers.length}개 · 가중치 ${pc.weights}개 + 편향 ${pc.biases}개` };
    }
    if (TOPOLOGY.test(text)) return { html: "", note: "위상수학 · 도넛이 머그잔으로 (구멍 1개는 그대로) — 재생 단추·슬라이더" };
    if (parseTupper(text)) return { html: katex.renderToString(TUPPER_LATEX, { throwOnError: false, displayMode: true }), note: "투퍼의 자기 참조 공식 · 그래프가 이 식 모양이 돼요" };
    const venn = parseVenn(text);
    if (venn) return { html: katex.renderToString(vennLatex(venn), { throwOnError: false, displayMode: true }), note: `벤 다이어그램 · 집합 ${venn.sets.join(", ")} · 식의 영역을 칠해요` };
    const dist = parseDist(text);
    if (dist) {
      const names = { normal: "정규분포", binomial: "이항분포", poisson: "포아송분포", uniform: "균등분포", exponential: "지수분포" } as const;
      return {
        html: katex.renderToString(`X\\sim ${dist.distLatex}${dist.query ? `,\\ ${dist.query.latex}` : ""}`, { throwOnError: false, displayMode: true }),
        note: `${names[dist.dist.kind]} 그래프${dist.query ? " · 그 확률을 칠하고 값을 구해요" : ""}`,
      };
    }
    const html = katex.renderToString(latex, { throwOnError: false, displayMode: true });
    const sp = buildSpace(text);
    if (sp) {
      if ("error" in sp) return { html, note: sp.error };
      if (sp.kind === "space3d") return { html: sp.data.caption ? katex.renderToString(sp.data.caption, { throwOnError: false, displayMode: true }) : html, note: describeSpace(sp) };
    }
    const lin = describeLinear(text);
    if (lin) return { html, note: lin };
    const a = analyze(text);
    return { html, note: describe(a) };
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
      // 아래 식(캡션): 한 줄 48, 평행육면체처럼 두 줄이면 84
      const cap = r.ir.data.caption ? (r.ir.data.caption.includes("gathered") ? 84 : 48) : 0;
      const pos = freeSpot(S, S + 24 + cap, area);
      const sid = sessionStore.getState().addObject(r.ir, { x: pos.x, y: pos.y, scale: S }, { minX: pos.x, minY: pos.y, maxX: pos.x + S, maxY: pos.y + S + 24 + cap });
      markFresh(sid);
      onClose();
      return;
    }
    if (r.ir.kind === "tensor" || r.ir.kind === "topology" || r.ir.kind === "nnet") {
      // 텐서·도넛: 정사각 그림 + 아래(단면 행렬·단추 / 슬라이더), 신경망: 가로로 긴 그림 + 한 줄
      const maxW = area.width - theme.space[6] * 2;
      const w = r.ir.kind === "nnet" ? Math.min(480, maxW) : Math.min(solid.size, maxW);
      const h = r.ir.kind === "nnet" ? Math.round(w * 0.62) + 28 : r.ir.kind === "tensor" ? w + 110 : w + 72;
      const pos = freeSpot(w, h, area);
      const oid = sessionStore.getState().addObject(r.ir, { x: pos.x, y: pos.y, scale: w }, { minX: pos.x, minY: pos.y, maxX: pos.x + w, maxY: pos.y + h });
      markFresh(oid);
      onClose();
      return;
    }
    if (r.ir.kind === "venn") {
      // 벤 다이어그램: 상자 폭 × 0.72 + 아래 식
      const vw = Math.min(420, area.width - theme.space[6] * 2);
      const vh = vw * 0.72 + 44;
      const pos = freeSpot(vw, vh, area);
      const vid = sessionStore.getState().addObject(r.ir, { x: pos.x, y: pos.y, scale: vw }, { minX: pos.x, minY: pos.y, maxX: pos.x + vw, maxY: pos.y + vh });
      markFresh(vid);
      onClose();
      return;
    }
    const isPlot = r.ir.kind === "plot2d";
    const maxW = area.width - theme.space[6] * 2;
    let w = isPlot ? Math.min(plot.width, maxW) : Math.min(520, maxW);
    const sliders = r.ir.kind === "plot2d" ? (r.ir.data.params?.length ?? 0) : 0;
    // 그래프 아래 식이 연립식(cases)이면 두세 줄이라 더 높다
    const captionH = r.ir.kind === "plot2d" && r.ir.data.caption?.includes("cases") ? 90 : 48;
    let h = isPlot ? w * plot.aspect + captionH + sliders * theme.touch.minTarget : 72;
    // 투퍼 그림은 가로로 긴 106×17 칸 + 식 두 줄
    if (r.ir.kind === "plot2d" && r.ir.data.tupper) h = ((w - 62) / 106) * 17 + 110;
    if (r.ir.kind === "formula") {
      // 수식은 실제로 그려 보고 잰다 (풀이 과정·행렬은 여러 줄)
      const m = measureKatex(katex, r.ir.data.latex, 22, true);
      w = Math.min(maxW, m.width);
      h = m.height;
    }
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
      className="sl-sheet-up"
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
        {(["formula", "data", "ai"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            style={{
              height: 36,
              padding: `0 ${theme.space[3]}px`,
              border: "none",
              borderRadius: 999,
              background: mode === m ? theme.color.selection : "transparent",
              color: mode === m ? theme.color.accent : theme.color.ink,
              fontSize: 15,
              fontWeight: mode === m ? 600 : 400,
              whiteSpace: "nowrap",
              flex: "0 0 auto",
              cursor: "pointer",
            }}
          >
            {m === "formula" ? "수식·그래프" : m === "data" ? "표·차트" : "AI에게 부탁"}
          </button>
        ))}
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

      {mode === "data" ? (
        <DataPanel area={area} onClose={onClose} />
      ) : mode === "ai" ? (
        <AiCreatePanel area={area} onClose={onClose} {...(onOpenAiSettings ? { onOpenSettings: onOpenAiSettings } : {})} />
      ) : (
      <>
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

      <LatexGuide
        onPick={(code) => {
          setText(code);
          setError(null);
          inputRef.current?.focus();
        }}
      />

      <div style={{ display: "grid", gap: theme.space[2], marginTop: theme.space[3] }}>
        {GROUPS.map((g) => {
          const open = openGroups.has(g.title);
          const count = g.examples.length + (g.solids ? SOLID_KINDS.length : 0) + (g.chem ? CHEM_EXAMPLES.length : 0);
          return (
            <section key={g.title}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setOpenGroups((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.title)) next.delete(g.title);
                    else next.add(g.title);
                    return next;
                  })
                }
                style={{ width: "100%", minHeight: 36, display: "flex", alignItems: "center", gap: theme.space[2], padding: 0, border: "none", background: "transparent", color: theme.color.ink, fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}
              >
                <ChevronRight size={16} strokeWidth={1.8} style={{ transform: open ? "rotate(90deg)" : undefined, transition: `transform ${theme.motion.fast}ms` }} />
                {g.title}
                <span style={{ fontWeight: 400, color: theme.color.asymptote }}>{count}</span>
              </button>
              {open && (
                <>
                  {g.chem && (
                    <p style={{ margin: `0 0 ${theme.space[2]}px`, fontSize: 12, color: theme.color.asymptote }}>
                      이름(벤젠, ethanol)이나 SMILES(c1ccccc1)를 입력해도 돼요
                    </p>
                  )}
                  {g.solids && (
                    <p style={{ margin: `0 0 ${theme.space[2]}px`, fontSize: 12, color: theme.color.asymptote }}>입체도형은 돌려 볼 수 있어요</p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: theme.space[2] }}>
                    {g.examples.map(([label, input]) => (
                      <button key={label} type="button" onClick={() => add(input)} style={chipStyle}>
                        {label}
                      </button>
                    ))}
                    {g.solids &&
                      SOLID_KINDS.map((kind) => (
                        <button key={kind} type="button" onClick={() => addSolid(kind)} style={chipStyle}>
                          {SOLID_NAMES[kind]}
                        </button>
                      ))}
                    {g.chem &&
                      CHEM_EXAMPLES.map((name) => (
                        <button key={name} type="button" disabled={loading} onClick={() => add(name)} style={chipStyle}>
                          {name}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
