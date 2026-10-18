import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { z } from "zod";
import { debugLog } from "../debug";
import type { BBox, InkItem } from "../ink/types";
import { buildFromInput } from "../math/build";
import { markFresh } from "../render/Shape2DView";
import { chem as chemTheme, plot } from "../render/theme";
import { sessionStore } from "../store/session";
import { resolveMolecule } from "./chemResolve";
import { AiError, askJson } from "./client";
import { strokesToSvg } from "./inkImage";

/**
 * 손글씨 인식 (P3b) — ✨가 도형으로 못 알아본 잉크를 AI에게 보여 준다.
 *
 *   글자  → 깔끔한 활자 (쓴 크기·색 그대로)
 *   수식  → KaTeX 수식
 *   그래프 → y=… 같은 식이면 교과서 그래프
 *   분자  → 이름 → PubChem → RDKit으로 확인한 구조식
 *   반응식 → mhchem 반응식
 *
 * 되돌리기 한 번이면 원래 손글씨로 돌아간다 (원본 획을 객체 안에 그대로 보관).
 */

const KINDS = ["text", "math", "graph", "chem", "reaction", "unknown"] as const;

/** 모든 칸을 필수로 — 엄격한 구조화 출력을 받는 모델에서도 그대로 통한다 (안 쓰는 칸은 "") */
export const HandwritingAnswer = z.object({
  kind: z.enum(KINDS),
  /** 쓴 그대로 옮겨 적기 */
  written: z.string(),
  text: z.string(),
  latex: z.string(),
  /** 분자의 영어 이름 (PubChem에서 찾을 수 있는) */
  molecule: z.string(),
  smiles: z.string(),
  ce: z.string(),
});
export type HandwritingAnswer = z.infer<typeof HandwritingAnswer>;

export const SYSTEM = `You read handwriting from a student's tablet notebook (Korean or English, math and science).
Look at the image and decide what it is, then transcribe it.
kind:
- "text": ordinary words or sentences. Put the exact transcription in "text" (keep line breaks as \\n).
- "math": an expression or equation to typeset, not to plot (identities, calculations, limits, integrals, chemistry-free formulas). Put LaTeX (no $ signs) in "latex".
- "graph": an equation of a curve the student wants drawn: y=..., f(x)=..., x^2+y^2=..., r=... in polar. Put LaTeX in "latex".
- "chem": ONE molecule, written as a name (benzene, 에탄올), a formula (CH3COOH, H2O) or drawn as a structure. Put its English name that PubChem knows in "molecule" and your best SMILES in "smiles".
- "reaction": a chemical equation with an arrow. Put the mhchem \\ce{} contents in "ce", e.g. "2H2 + O2 -> 2H2O".
- "unknown": not readable.
Always fill "written" with exactly what is written. Leave fields that do not apply as "".`;

export type AiRecognizeOutcome = { ok: true; label: string } | { ok: false; message: string };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export async function recognizeWithAi(inkId: string): Promise<AiRecognizeOutcome> {
  const state = sessionStore.getState();
  const item = state.items.find((i): i is InkItem => i.id === inkId && i.kind === "ink");
  if (!item) return { ok: false, message: "알아볼 손글씨가 없어요" };
  // 이 묶음은 여기서 닫는다 — AI를 기다리는 동안 쓴 다음 획은 새 묶음으로
  if (state.activeGroupId === inkId) state.setActiveGroup(null);
  const strokeCount = item.strokes.length;

  const rendered = strokesToSvg(item.strokes);
  if (!rendered) return { ok: false, message: "형광펜은 알아보지 않아요" };

  try {
    const { svgToPngDataUrl } = await import("../export/exportImage");
    const image = await svgToPngDataUrl(rendered, 1);
    const t0 = performance.now();
    const a = await askJson({ name: "handwriting", system: SYSTEM, prompt: "What is written here?", image, schema: HandwritingAnswer });
    debugLog.info("ai", `손글씨: ${a.kind} "${a.written}" (${Math.round(performance.now() - t0)}ms)`);

    // 기다리는 동안 그 손글씨를 지웠거나 고쳤으면 적용하지 않는다
    const now = sessionStore.getState().items.find((i): i is InkItem => i.id === inkId && i.kind === "ink");
    if (!now || now.strokes.length !== strokeCount) return { ok: false, message: "그사이 손글씨가 바뀌어서 적용하지 않았어요" };

    const placed = await toObject(a, now);
    if (!placed) return { ok: false, message: "무엇인지 알아보지 못했어요" };
    const id = sessionStore.getState().replaceWithObject(inkId, placed.ir, placed.transform, placed.bbox);
    if (!id) return { ok: false, message: "알아볼 손글씨가 없어요" };
    markFresh(id);
    return { ok: true, label: placed.label };
  } catch (e) {
    if (e instanceof AiError) return { ok: false, message: e.message };
    debugLog.warn("ai", "손글씨 인식 실패", e);
    return { ok: false, message: "AI 인식 중 문제가 생겼어요" };
  }
}

interface Placed {
  ir: SceneIR;
  transform: { x: number; y: number; scale: number };
  bbox: BBox;
  label: string;
}

const meta = (confidence = 0.9): Pick<SceneIR, "version" | "confidence" | "source"> => ({ version: IR_VERSION, confidence, source: "vlm" });

/** AI의 답 → 손글씨 자리에 놓을 객체 */
export async function toObject(a: HandwritingAnswer, item: InkItem): Promise<Placed | null> {
  const b = item.bbox;
  const inkW = b.maxX - b.minX;
  const inkH = b.maxY - b.minY;
  const at = (w: number, h: number): Pick<Placed, "bbox"> & { x: number; y: number } => ({ x: b.minX, y: b.minY, bbox: { minX: b.minX, minY: b.minY, maxX: b.minX + w, maxY: b.minY + h } });
  const colors = new Set(item.strokes.filter((s) => s.tool !== "highlighter").map((s) => s.color ?? ""));
  const color = colors.size === 1 ? [...colors][0] || undefined : undefined;

  switch (a.kind) {
    case "text": {
      const text = (a.text || a.written).trim();
      if (!text) return null;
      const lines = text.split("\n").length;
      const fontSize = Math.round(clamp((inkH / lines) * 0.8, 14, 72));
      const p = at(Math.max(inkW, text.length * fontSize * 0.55), lines * fontSize * 1.35);
      return { ir: { ...meta(), kind: "text", data: { text, fontSize, ...(color ? { color } : {}) } }, transform: { x: p.x, y: p.y, scale: 1 }, bbox: p.bbox, label: `글자 "${text.length > 20 ? `${text.slice(0, 20)}…` : text}"` };
    }
    case "graph": {
      const r = buildFromInput(a.latex || a.written);
      if (r.ok && r.ir.kind === "plot2d") {
        const w = Math.round(clamp(inkW * 1.2, 280, plot.width));
        const sliders = r.ir.data.params?.length ?? 0;
        const h = w * plot.aspect + 48 + sliders * 44;
        const p = at(w, h);
        return { ir: { ...r.ir, source: "vlm", confidence: 0.9 }, transform: { x: p.x, y: p.y, scale: w }, bbox: p.bbox, label: "그래프" };
      }
      // 그래프로 못 그리면 수식으로
      return toObject({ ...a, kind: "math" }, item);
    }
    case "math": {
      const latex = (a.latex || a.written).trim();
      if (!latex) return null;
      const fontSize = Math.round(clamp(inkH * 0.6, 16, 64));
      const p = at(Math.max(inkW, latex.length * fontSize * 0.4), fontSize * 1.6);
      return { ir: { ...meta(), kind: "formula", data: { latex, evaluate: false, fontSize } }, transform: { x: p.x, y: p.y, scale: 1 }, bbox: p.bbox, label: "수식" };
    }
    case "reaction": {
      const ce = (a.ce || a.written).trim();
      if (!ce) return null;
      const fontSize = Math.round(clamp(inkH * 0.6, 16, 56));
      const p = at(Math.max(inkW, ce.length * fontSize * 0.45), fontSize * 1.6);
      return { ir: { ...meta(), kind: "chemEq", data: { ce, fontSize } }, transform: { x: p.x, y: p.y, scale: 1 }, bbox: p.bbox, label: "반응식" };
    }
    case "chem": {
      const mol = await resolveMolecule([a.written, a.molecule], a.smiles);
      const data = { smiles: mol.smiles, style: "skeletal" as const, aromaticCircle: false, ...(mol.name ? { commonName: mol.name } : {}) };
      const bond = Math.round(clamp(Math.min(inkW, inkH * 2) / 3, 22, chemTheme.bond * 1.2));
      const { chemDrawing } = await import("../render/ChemObject");
      const d = await chemDrawing(data, bond);
      const p = at(d.width, d.height + (mol.name ? 28 : 0));
      return { ir: { ...meta(), kind: "chem", data }, transform: { x: p.x, y: p.y, scale: bond }, bbox: p.bbox, label: mol.name || "구조식" };
    }
    default:
      return null;
  }
}
