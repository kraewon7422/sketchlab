import { MOLECULES, chemFromInput } from "../chem/names";
import { loadRDKit } from "../chem/rdkit";
import { AiError } from "./client";

/**
 * AI가 말한 분자 → 확실한 구조 (v4 §13: 모델이 쓴 SMILES를 그대로 믿지 않는다).
 *
 * 작은 모델은 이름은 맞혀도 SMILES를 자주 틀린다 (실측: qwen3.5 9B가 이부프로펜을 엉뚱하게).
 * 그래서 순서대로:
 *   1) 앱에 든 교과서 분자 목록 (한국어·영어 이름)
 *   2) PubChem에서 이름으로 찾기 (공개 화학 데이터베이스)
 *   3) 그래도 없으면 모델의 SMILES — RDKit이 읽을 수 있을 때만
 * 어느 것이든 RDKit으로 한 번 더 확인한다.
 */

export interface ResolvedMolecule {
  smiles: string;
  /** 캡션 — 한국어 이름을 알면 한국어 */
  name: string;
  source: "list" | "pubchem" | "model";
}

async function validSmiles(smiles: string): Promise<boolean> {
  if (!smiles.trim()) return false;
  const rd = await loadRDKit();
  const mol = rd.get_mol(smiles.trim());
  if (!mol) return false;
  const ok = mol.get_num_atoms() > 0;
  mol.delete();
  return ok;
}

/** RDKit 정규화 SMILES — 같은 분자를 다르게 쓴 것(케쿨레·방향족)을 같게 비교하려고 */
async function canonical(smiles: string): Promise<string | null> {
  const rd = await loadRDKit();
  const mol = rd.get_mol(smiles);
  if (!mol) return null;
  const c = mol.get_smiles();
  mol.delete();
  return c;
}

let koreanBySmiles: Promise<Map<string, string>> | null = null;
/** 목록에 있는 분자면 한국어 이름 (PubChem은 영어 이름만 준다) */
async function koreanName(smiles: string): Promise<string | null> {
  koreanBySmiles ??= (async () => {
    const m = new Map<string, string>();
    for (const [s, name] of MOLECULES) {
      const c = await canonical(s);
      if (c) m.set(c, name);
    }
    return m;
  })();
  const c = await canonical(smiles);
  return c ? ((await koreanBySmiles).get(c) ?? null) : null;
}

export async function pubchemSmiles(name: string, signal?: AbortSignal): Promise<{ smiles: string; title: string } | null> {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name.trim())}/property/SMILES,Title/JSON`;
  try {
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { PropertyTable?: { Properties?: Array<{ SMILES?: string; Title?: string }> } };
    const p = data.PropertyTable?.Properties?.[0];
    return p?.SMILES ? { smiles: p.SMILES, title: p.Title ?? name } : null;
  } catch {
    return null;
  }
}

export async function resolveMolecule(names: readonly string[], modelSmiles: string): Promise<ResolvedMolecule> {
  const candidates = [...new Set(names.map((n) => n.trim()).filter(Boolean))];

  for (const n of candidates) {
    const local = chemFromInput(n);
    if (local && !local.guessed) return { smiles: local.smiles, name: local.name ?? n, source: "list" };
  }
  for (const n of candidates) {
    const found = await pubchemSmiles(n);
    if (found && (await validSmiles(found.smiles))) {
      return { smiles: found.smiles, name: (await koreanName(found.smiles)) ?? candidates[0] ?? found.title, source: "pubchem" };
    }
  }
  if (await validSmiles(modelSmiles)) {
    return { smiles: modelSmiles.trim(), name: (await koreanName(modelSmiles)) ?? candidates[0] ?? "", source: "model" };
  }
  throw new AiError(`"${candidates[0] ?? "분자"}"의 구조를 찾지 못했어요`);
}
