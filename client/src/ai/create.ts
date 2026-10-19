import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { z } from "zod";
import { buildFromInput } from "../math/build";
import { chem as chemTheme, plot } from "../render/theme";
import { resolveMolecule } from "./chemResolve";
import { askJson } from "./client";

/**
 * 수식·반응식이 실제로 차지할 폭 — 글자 수로 어림하면 겹친다 (실측: 반응식 두 줄이 겹침).
 * 브라우저에서는 KaTeX로 그려서 재고, DOM이 없으면(테스트) 넉넉히 어림한다.
 */
async function measureLatex(latex: string, fontSize: number): Promise<{ width: number; height: number }> {
  if (typeof document === "undefined") return { width: latex.length * fontSize * 0.62 + 24, height: fontSize * 2 };
  const katex = (await import("katex")).default;
  await import("katex/contrib/mhchem");
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;left:-9999px;top:0;white-space:nowrap;font-size:${fontSize}px`;
  el.innerHTML = katex.renderToString(latex, { throwOnError: false, displayMode: false });
  document.body.appendChild(el);
  const r = { width: Math.ceil(el.offsetWidth) + 8, height: Math.ceil(el.offsetHeight) + 8 };
  el.remove();
  return r;
}

/**
 * AI에게 부탁해서 그리기 (P3b) — "에탄올을 산화하면?", "부테인의 이성질체", "감쇠 진동 그래프".
 *
 * 모델은 무엇을 그릴지 목록만 정한다 (분자 이름·반응식·식). 실제 그림은 앱이 만든다:
 * 분자는 PubChem·RDKit으로 확인한 구조, 그래프는 우리 그래프 엔진 — 모델이 틀린 구조를 그려 넣을 수 없다.
 */

const ITEM_TYPES = ["molecule", "reaction", "graph", "formula", "text"] as const;

export const CreatePlan = z.object({
  items: z
    .array(
      z.object({
        type: z.enum(ITEM_TYPES),
        /** molecule: 영어 이름 (PubChem) */
        name: z.string(),
        /** molecule: 한국어 이름 (캡션) — 모르면 "" */
        korean: z.string(),
        smiles: z.string(),
        /** reaction: mhchem \ce{} 안쪽 */
        ce: z.string(),
        /** graph·formula: LaTeX */
        latex: z.string(),
        /** text: 짧은 설명 */
        text: z.string(),
      }),
    )
    .max(8),
  /** 한두 문장 설명 (요청한 언어로) */
  note: z.string(),
});
export type CreatePlan = z.infer<typeof CreatePlan>;

export const CREATE_SYSTEM = `You are a chemistry and math teaching assistant inside a notebook app.
The student asks for something to draw (Korean or English). Decide what to place on the page, as a short list of items (at most 8):
- "molecule": one structure. "name" = English name PubChem knows (IUPAC or common), "korean" = Korean name if you know it, "smiles" = your best SMILES.
- "reaction": a chemical equation. "ce" = mhchem \\ce{} contents, e.g. "CH3CH2OH + [O] -> CH3CHO + H2O".
- "graph": a curve to plot. "latex" = an equation like y=e^{-0.3x}\\cos(2x) (use x and y; one equation per item).
- "formula": math to typeset. "latex" = LaTeX without $.
- "text": a short label or explanation line.
For "isomers of X" list every structural isomer as separate molecules. For a reaction, give the equation and also the main product molecules.
Only add graphs or formulas when the request is about a curve, a function or math; never add unrelated filler items.
"note": one or two sentences in the student's language explaining the result.
Fill every field; use "" when it does not apply.`;

export interface CreatedObject {
  ir: SceneIR;
  /** 놓을 자리 크기 (월드 px) */
  width: number;
  height: number;
  /** ObjectItem.transform.scale */
  scale: number;
}

const meta = (): Pick<SceneIR, "version" | "confidence" | "source"> => ({ version: IR_VERSION, confidence: 0.85, source: "vlm" });

/** 모델이 정한 목록 → 그릴 객체들 (못 그리는 항목은 건너뛰고 이유를 모은다) */
export async function planToObjects(plan: CreatePlan, maxWidth: number): Promise<{ objects: CreatedObject[]; skipped: string[] }> {
  const objects: CreatedObject[] = [];
  const skipped: string[] = [];

  for (const it of plan.items) {
    try {
      if (it.type === "molecule") {
        const mol = await resolveMolecule([it.name, it.korean], it.smiles);
        const caption = it.korean.trim() || mol.name;
        const data = { smiles: mol.smiles, style: "skeletal" as const, aromaticCircle: false, ...(caption ? { commonName: caption } : {}) };
        const { chemDrawing } = await import("../render/ChemObject");
        let bond: number = chemTheme.bond;
        let d = await chemDrawing(data, bond);
        if (d.width > maxWidth) {
          bond = Math.max(16, Math.floor((bond * maxWidth) / d.width));
          d = await chemDrawing(data, bond);
        }
        objects.push({ ir: { ...meta(), kind: "chem", data }, width: d.width, height: d.height + (caption ? 28 : 0), scale: bond });
      } else if (it.type === "reaction" && it.ce.trim()) {
        const ce = it.ce.trim();
        let fontSize = 22;
        let m = await measureLatex(`\\ce{${ce}}`, fontSize);
        if (m.width > maxWidth) {
          fontSize = Math.max(13, Math.floor((fontSize * maxWidth) / m.width));
          m = await measureLatex(`\\ce{${ce}}`, fontSize);
        }
        objects.push({ ir: { ...meta(), kind: "chemEq", data: { ce, fontSize } }, width: m.width, height: m.height, scale: 1 });
      } else if (it.type === "graph" && it.latex.trim()) {
        const r = buildFromInput(it.latex);
        if (!r.ok || r.ir.kind !== "plot2d") {
          skipped.push(it.latex);
          continue;
        }
        const w = Math.min(plot.width, maxWidth);
        const sliders = r.ir.data.params?.length ?? 0;
        objects.push({ ir: { ...r.ir, ...meta() }, width: w, height: w * plot.aspect + 48 + sliders * 44, scale: w });
      } else if (it.type === "formula" && it.latex.trim()) {
        const latex = it.latex.trim();
        let fontSize = 22;
        let m = await measureLatex(latex, fontSize);
        if (m.width > maxWidth) {
          fontSize = Math.max(13, Math.floor((fontSize * maxWidth) / m.width));
          m = await measureLatex(latex, fontSize);
        }
        objects.push({ ir: { ...meta(), kind: "formula", data: { latex, evaluate: false, fontSize } }, width: m.width, height: m.height, scale: 1 });
      } else if (it.type === "text" && it.text.trim()) {
        const text = it.text.trim();
        objects.push({ ir: { ...meta(), kind: "text", data: { text, fontSize: 18 } }, width: Math.min(maxWidth, text.length * 11 + 16), height: 30, scale: 1 });
      }
    } catch (e) {
      skipped.push(it.name || it.ce || it.latex || it.text || it.type);
      void e;
    }
  }
  return { objects, skipped };
}

export async function planFromPrompt(request: string, signal?: AbortSignal): Promise<CreatePlan> {
  return askJson({ name: "create", system: CREATE_SYSTEM, prompt: request, schema: CreatePlan, ...(signal ? { signal } : {}) });
}
