import "fake-indexeddb/auto";
import { IR_VERSION, type SceneIR } from "@sketchlab/shared";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import type { CanvasItem } from "../ink/types";
import { __resetDB } from "./db";
import { buildIndex, localSearch, type SearchEntry } from "./noteSearch";
import { itemsKey, pagesStore } from "./pages";
import { __forgetSaved, flushSaves, saveItems } from "./persistence";
import { sessionStore } from "./session";

const obj = (id: string, ir: Omit<SceneIR, "version" | "confidence" | "source">): CanvasItem =>
  ({ id, kind: "object", ir: { version: IR_VERSION, confidence: 1, source: "manual", ...ir } as SceneIR, transform: { x: 0, y: 0, scale: 100 }, bbox: { minX: 0, minY: 0, maxX: 100, maxY: 40 }, sourceStrokes: [] }) as CanvasItem;

const entry = (text: string, pageNo = 1, label = "수식"): SearchEntry => ({ pageId: `p${pageNo}`, pageTitle: `${pageNo}쪽`, pageNo, itemId: text, label, text, bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 } });

describe("노트에서 찾기", () => {
  it("낱말 그대로, 그리고 수학 동의어로 (적분 → \\int)", () => {
    const entries = [entry("수식 \\int_0^1 x^2\\,dx"), entry("수식 \\lim_{x\\to0}\\frac{\\sin x}{x}", 2), entry("숙제: 적분 연습", 3, "글")];
    const hits = localSearch(entries, "적분");
    expect(hits.map((h) => h.pageNo)).toEqual([3, 1]); // 그대로 맞은 것이 먼저
    expect(localSearch(entries, "극한을 찾기").map((h) => h.pageNo)).toEqual([2]);
    expect(localSearch(entries, "행렬")).toEqual([]);
  });

  it("쪽 이름도 찾는다", () => {
    expect(localSearch([entry("아무거나", 4)], "4쪽")).toHaveLength(1);
  });

  describe("모든 쪽을 모은다 (지금 쪽은 화면 그대로, 다른 쪽은 저장소에서)", () => {
    beforeEach(() => {
      globalThis.indexedDB = new IDBFactory();
      __resetDB();
      __forgetSaved();
    });

    it("코드·표·글", async () => {
      pagesStore.getState().load(
        [
          { id: "a", title: "미분", background: "blank", createdAt: 1 },
          { id: "b", title: "프로그래밍", background: "blank", createdAt: 2 },
        ],
        "a",
      );
      sessionStore.getState().hydrate([obj("t1", { kind: "text", data: { text: "연쇄법칙 정리" } })]);
      await saveItems([obj("c1", { kind: "code", data: { name: "셀 1", lang: "python", source: "import numpy as np" } }), obj("tb", { kind: "table", data: { rows: [["키", "몸무게"]], header: true } })], itemsKey("b"));
      await flushSaves();
      const idx = await buildIndex();
      expect(idx.map((e) => e.itemId).sort()).toEqual(["c1", "t1", "tb"]);
      expect(localSearch(idx, "numpy")[0]?.pageTitle).toBe("프로그래밍");
      expect(localSearch(idx, "파이썬")[0]?.itemId).toBe("c1");
      expect(localSearch(idx, "몸무게")[0]?.label).toBe("표");
    });
  });
});
