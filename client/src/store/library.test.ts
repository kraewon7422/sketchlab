import { describe, expect, it } from "vitest";
import { canMoveFolder, folderCount, folderPath, foldersIn, notesIn, removeFolder, type Folder, type LibraryData, type NoteMeta } from "./library";

const folder = (id: string, parentId: string | null, name = id): Folder => ({ id, name, color: "#000000", parentId, createdAt: 0 });
const note = (id: string, folderId: string | null, extra: Partial<NoteMeta> = {}): NoteMeta => ({ id, title: id, folderId, createdAt: 0, updatedAt: 0, ...extra });

// 수학 ⊃ 수학 1학기 ⊃ 수행 / 영어
const data: LibraryData = {
  folders: [folder("math", null, "수학"), folder("m1", "math", "수학 1학기"), folder("task", "m1", "수학 수행"), folder("eng", null, "영어")],
  notes: [
    note("a", "math", { updatedAt: 3 }),
    note("b", "m1", { updatedAt: 1, favorite: true }),
    note("c", "task", { updatedAt: 2 }),
    note("d", null, { title: "시간표", updatedAt: 5 }),
    note("e", "eng", { trashedAt: 9 }),
  ],
  sort: "updated",
  sortDesc: true,
  view: "grid",
};

describe("노트 보관함", () => {
  it("폴더 수 = 아래 폴더까지, 휴지통 제외", () => {
    expect(folderCount(data, "math")).toBe(3);
    expect(folderCount(data, "m1")).toBe(2);
    expect(folderCount(data, "eng")).toBe(0);
  });

  it("칸마다 보이는 노트 — 모든 노트·즐겨찾기·휴지통·폴더, 최근 수정 순", () => {
    expect(notesIn(data, { kind: "all" }).map((n) => n.id)).toEqual(["d", "a", "c", "b"]);
    expect(notesIn(data, { kind: "favorites" }).map((n) => n.id)).toEqual(["b"]);
    expect(notesIn(data, { kind: "trash" }).map((n) => n.id)).toEqual(["e"]);
    expect(notesIn(data, { kind: "folder", id: "m1" }).map((n) => n.id)).toEqual(["b"]);
    expect(notesIn(data, { kind: "folders" }).map((n) => n.id)).toEqual(["d"]);
    expect(notesIn(data, { kind: "all" }, "시간").map((n) => n.id)).toEqual(["d"]);
    // 이름 순 (한국어 순서: 한글 이름이 영어보다 앞)
    expect(notesIn({ ...data, sort: "title", sortDesc: false }, { kind: "all" }).map((n) => n.id)).toEqual(["d", "a", "b", "c"]);
  });

  it("폴더 카드: 맨 위 폴더들 / 그 폴더의 아래 폴더들", () => {
    expect(foldersIn(data, { kind: "folders" }).map((f) => f.id)).toEqual(["math", "eng"]);
    expect(foldersIn(data, { kind: "folder", id: "math" }).map((f) => f.id)).toEqual(["m1"]);
  });

  it("폴더를 지우면 안의 노트·폴더는 한 칸 위로 (노트를 잃지 않는다)", () => {
    const out = removeFolder(data, "m1");
    expect(out.folders.find((f) => f.id === "task")?.parentId).toBe("math");
    expect(out.notes.find((n) => n.id === "b")?.folderId).toBe("math");
    expect(out.notes).toHaveLength(data.notes.length);
  });

  it("폴더를 자기 아래로는 못 옮긴다 · 경로", () => {
    expect(canMoveFolder(data.folders, "math", "task")).toBe(false);
    expect(canMoveFolder(data.folders, "task", "eng")).toBe(true);
    expect(canMoveFolder(data.folders, "m1", null)).toBe(true);
    expect(folderPath(data.folders, "task").map((f) => f.name)).toEqual(["수학", "수학 1학기", "수학 수행"]);
  });
});
