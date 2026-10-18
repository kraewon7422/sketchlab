import type { MainModule } from "@rdkit/rdkit";
import wasmUrl from "@rdkit/rdkit/RDKit_minimal.wasm?url";

/**
 * RDKit.js 로더 (마스터스펙 v4 §13.1) — 약 7 MB WASM이라 화학 구조식을 처음 그릴 때만 내려받는다.
 * 하는 일은 하나: SMILES → 2D 좌표가 든 JSON. 그리기는 chem/layout.ts.
 */

let module: Promise<MainModule> | null = null;

export function loadRDKit(): Promise<MainModule> {
  module ??= import("@rdkit/rdkit").then((m) => m.default({ locateFile: () => wasmUrl }));
  // 실패하면 다음 번에 다시 시도할 수 있게
  module.catch(() => {
    module = null;
  });
  return module;
}

/**
 * SMILES → RDKit JSON (교과서 배치 좌표 포함). 잘못된 SMILES면 null.
 * explicitH: 수소를 원자로 꺼내 놓는다 (완전 구조식).
 */
export function moleculeJson(rd: MainModule, smiles: string, explicitH: boolean): string | null {
  let mol = rd.get_mol(smiles);
  if (!mol) return null;
  try {
    if (explicitH) {
      const withH = rd.get_mol(mol.add_hs());
      mol.delete();
      mol = withH;
      if (!mol) return null;
    }
    // 골격식은 CoordGen (고리·사슬이 반듯). 완전 구조식은 RDKit 기본 배치가 교과서처럼
    // H–C–C–O를 일직선, H를 위아래 직각으로 놓는다 (CoordGen은 H를 비스듬히 흩뜨린다).
    mol.set_new_coords(!explicitH);
    // 방향 다듬기는 모양만 바꾼다. 메테인+H처럼 무거운 원자 결합이 없으면 RDKit이 예외를 던지는데,
    // 이때는 방금 놓은 좌표(결합 길이 1.5 그대로)를 쓰면 된다.
    try {
      mol.normalize_depiction(1);
      mol.straighten_depiction();
    } catch {
      /* 다듬기 생략 */
    }
    return mol.get_json();
  } finally {
    mol?.delete();
  }
}
