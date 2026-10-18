import type { SceneIR } from "@sketchlab/shared";
import { applyPatches, enablePatches, produceWithPatches, type Patch } from "immer";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { bboxOfPoints, distanceToPolyline, unionBBoxes } from "../ink/geometry";
import { shouldJoinGroup } from "../ink/grouping";
import type { CanvasItem, InkItem, ObjectItem, Stroke } from "../ink/types";
import { distanceToShape2D, type ObjectTransform } from "../render/shape2dGeometry";

/**
 * ⚠️ D6 — 이 호출이 없으면 produceWithPatches가 런타임에 던진다.
 * 모듈 최상단에 두는 이유: 스토어를 import 하는 순간 반드시 실행되므로
 * "부팅 코드에서 호출하는 걸 깜빡했다"가 원천적으로 불가능해진다.
 */
enablePatches();

/**
 * 세션 스토어 — 캔버스에 무엇이 있는지에 대한 단일 진실 (§5.3).
 *
 * 설계 메모
 * - 저장소(IndexedDB)를 여기서 직접 부르지 않는다. store/persistence.ts 가
 *   items 참조 변화를 구독해서 처리한다. 그래야 스토어가 순수하게 테스트된다.
 * - zustand/vanilla 로 만들고 React 훅은 얇게 감싼다. 스토어 로직 테스트에
 *   React 렌더러가 필요 없다.
 * - Undo 단위는 §5.3 그대로: 스트로크 추가 / 인식 적용 / 이동 / 삭제.
 *   pointermove 마다 커밋하지 않는다 — 진행 중인 획은 컴포넌트의 ref에만 있다.
 */

/** 되돌리기 대상이 되는 문서 상태. history 자신은 여기에 들어가지 않는다. */
interface Doc {
  items: CanvasItem[];
  selection: string[];
  activeGroupId: string | null;
}

interface HistoryEntry {
  /** 디버그 패널·테스트에서 무엇을 되돌리는지 알아보기 위한 이름 */
  label: string;
  forward: Patch[];
  inverse: Patch[];
}

export interface SessionState extends Doc {
  history: { undo: HistoryEntry[]; redo: HistoryEntry[] };

  /**
   * 획을 추가하고, 그 획이 들어간 그룹 id를 돌려준다.
   * newGroup: 자동 그룹핑을 건너뛰고 새 그룹으로 — "그리고 멈추기" 스냅은 그 획 하나만 바꿔야 한다.
   */
  addStroke(stroke: Stroke, options?: { newGroup?: boolean }): string;
  /**
   * 잉크 그룹을 인식 결과 객체로 그 자리에서 교체한다 (§12.2 in-place). Undo 1단위 "인식 적용".
   * 대상이 없거나 잉크가 아니면 null.
   */
  replaceWithObject(inkId: string, ir: SceneIR, transform: ObjectTransform): string | null;
  /** 지정한 지점 근처의 획을 지운다. 지운 개수를 돌려준다. */
  eraseAt(x: number, y: number, radius: number): number;
  setSelection(ids: string[]): void;
  setActiveGroup(id: string | null): void;
  undo(): void;
  redo(): void;
  /** 부팅 시 IndexedDB에서 복원. 되돌리기 이력에 남기지 않는다 (§5.3 단방향). */
  hydrate(items: CanvasItem[]): void;
}

/** 이력이 무한정 쌓여 메모리를 먹지 않게 한다. */
const MAX_HISTORY = 100;

export const sessionStore: StoreApi<SessionState> = createStore<SessionState>((set, get) => {
  /**
   * 문서를 바꾸고 그 변경을 되돌리기 이력에 기록한다.
   * 아무것도 바뀌지 않았으면 이력을 더럽히지 않는다 — 사용자가 undo를 눌렀는데
   * 아무 일도 안 일어나는 것처럼 보이는 상황을 막는다.
   */
  const commit = (label: string, recipe: (draft: Doc) => void): void => {
    const state = get();
    const doc: Doc = {
      items: state.items,
      selection: state.selection,
      activeGroupId: state.activeGroupId,
    };

    const [next, forward, inverse] = produceWithPatches(doc, recipe);
    if (forward.length === 0) return;

    set({
      items: next.items,
      selection: next.selection,
      activeGroupId: next.activeGroupId,
      history: {
        undo: [...state.history.undo, { label, forward, inverse }].slice(-MAX_HISTORY),
        // 새 작업을 하면 앞으로 가기는 무효가 된다 — 일반적인 편집기 동작.
        redo: [],
      },
    });
  };

  const travel = (direction: "undo" | "redo"): void => {
    const state = get();
    const source = direction === "undo" ? state.history.undo : state.history.redo;
    const entry = source[source.length - 1];
    if (!entry) return;

    const doc: Doc = {
      items: state.items,
      selection: state.selection,
      activeGroupId: state.activeGroupId,
    };
    const next = applyPatches(doc, direction === "undo" ? entry.inverse : entry.forward);

    const remaining = source.slice(0, -1);
    const other = direction === "undo" ? state.history.redo : state.history.undo;

    set({
      items: next.items,
      selection: next.selection,
      activeGroupId: next.activeGroupId,
      history:
        direction === "undo"
          ? { undo: remaining, redo: [...other, entry] }
          : { undo: [...other, entry], redo: remaining },
    });
  };

  return {
    items: [],
    selection: [],
    activeGroupId: null,
    history: { undo: [], redo: [] },

    addStroke(stroke, options = {}) {
      let groupId = "";
      commit("스트로크 추가", (draft) => {
        const active = options.newGroup ? undefined : findInkItem(draft.items, draft.activeGroupId);
        const lastStroke = active?.strokes[active.strokes.length - 1];

        if (active && lastStroke && shouldJoinGroup(lastStroke, stroke)) {
          active.strokes.push(stroke);
          active.bbox = unionBBoxes(active.strokes.map((s) => s.bbox));
          groupId = active.id;
          return;
        }

        const item: InkItem = {
          id: newId("ink"),
          kind: "ink",
          strokes: [stroke],
          bbox: stroke.bbox,
        };
        draft.items.push(item);
        draft.activeGroupId = item.id;
        groupId = item.id;
      });
      return groupId;
    },

    replaceWithObject(inkId, ir, transform) {
      const target = get().items.find((i) => i.id === inkId);
      if (!target || target.kind !== "ink") return null;

      const object: ObjectItem = {
        id: newId("obj"),
        kind: "object",
        ir,
        bbox: target.bbox,
        sourceStrokes: target.strokes,
        transform,
      };
      commit("인식 적용", (draft) => {
        const index = draft.items.findIndex((i) => i.id === inkId);
        if (index === -1) return;
        // 같은 자리(같은 순서)에 넣는다 — 위에 겹친 다른 그림과의 앞뒤 관계가 바뀌지 않게.
        draft.items[index] = object;
        if (draft.activeGroupId === inkId) draft.activeGroupId = null;
        draft.selection = draft.selection.filter((id) => id !== inkId);
      });
      return object.id;
    },

    eraseAt(x, y, radius) {
      let removed = 0;

      commit("지우개", (draft) => {
        const survivors: CanvasItem[] = [];

        for (const item of draft.items) {
          if (item.kind === "object") {
            // 인식된 객체는 선에 닿으면 통째로 지운다 (획 단위 지우개와 같은 감각). Undo로 복구.
            if (item.ir.kind === "shape2d" && distanceToShape2D(item.ir.data, item.transform, x, y) <= radius) {
              removed += 1;
              continue;
            }
            survivors.push(item);
            continue;
          }

          const kept = item.strokes.filter(
            (s) => distanceToPolyline(x, y, s.points) > radius,
          );
          removed += item.strokes.length - kept.length;

          // 획이 하나도 안 남은 그룹은 통째로 사라진다.
          if (kept.length === 0) continue;

          if (kept.length !== item.strokes.length) {
            item.strokes = kept;
            item.bbox = unionBBoxes(kept.map((s) => s.bbox));
          }
          survivors.push(item);
        }

        if (removed === 0) return;

        draft.items = survivors;
        // 지운 뒤 활성 그룹이 사라졌으면 다음 획은 새 그룹으로 시작해야 한다.
        if (!survivors.some((i) => i.id === draft.activeGroupId)) {
          draft.activeGroupId = null;
        }
      });

      return removed;
    },

    setSelection(ids) {
      // 선택은 되돌리기 대상이 아니다. 이력을 더럽히지 않도록 직접 set 한다.
      set({ selection: ids });
    },

    setActiveGroup(id) {
      set({ activeGroupId: id });
    },

    undo: () => travel("undo"),
    redo: () => travel("redo"),

    hydrate(items) {
      set({
        items,
        selection: [],
        activeGroupId: null,
        history: { undo: [], redo: [] },
      });
    },
  };
});

function findInkItem(items: CanvasItem[], id: string | null): InkItem | undefined {
  if (!id) return undefined;
  const found = items.find((i) => i.id === id);
  return found && found.kind === "ink" ? found : undefined;
}

let idCounter = 0;

/**
 * 로컬 전용 식별자.
 *
 * crypto.randomUUID()를 쓰지 않는 이유: 그 API도 secure context 전용이라
 * 혹시 http로 열린 환경에서 스토어가 통째로 죽는다. 여기서 필요한 건
 * 세션 안에서만 유일하면 되는 값이라 카운터로 충분하다.
 */
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** 테스트 전용 — 스토어를 초기 상태로 되돌린다. */
export function __resetSession(): void {
  sessionStore.setState({
    items: [],
    selection: [],
    activeGroupId: null,
    history: { undo: [], redo: [] },
  });
}

/** 스트로크를 만든다. 컴포넌트와 테스트가 같은 경로를 쓰도록 여기 둔다. */
export function createStroke(points: Stroke["points"], endedAt: number): Stroke {
  return {
    id: newId("stroke"),
    points,
    bbox: bboxOfPoints(points),
    endedAt,
    tool: "pen",
  };
}

export function useSession<T>(selector: (state: SessionState) => T): T {
  return useStore(sessionStore, selector);
}
