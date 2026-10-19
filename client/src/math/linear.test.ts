import { describe, expect, it } from "vitest";
import { frac, fromNumber, texFrac } from "./fraction";
import { det, inverse, linearCoefficients, multiply, parseMatrix, rank, rref, solve, splitSystem, texSolution, textPoint, transpose } from "./linear";
import { buildLinear } from "./linearBuild";

const F = (rows: number[][]) => rows.map((r) => r.map((x) => frac(x)));
const nums = (M: ReturnType<typeof F>) => M.map((r) => r.map(texFrac));
const tex = String.raw;

describe("분수", () => {
  it("소수를 분수로 되돌린다", () => {
    expect(fromNumber(1 / 3)).toEqual(frac(1, 3));
    expect(fromNumber(-1.6)).toEqual(frac(-8, 5));
    expect(texFrac(frac(-8, 5))).toBe(tex`-\frac{8}{5}`);
  });
});

describe("연립일차방정식", () => {
  it("2x+3y=7, x−y=1 → x=2, y=1", () => {
    const s = solve(F([[2, 3], [1, -1]]), [frac(7), frac(1)]);
    expect(s.kind).toBe("unique");
    if (s.kind === "unique") expect(textPoint(s.values)).toBe("(2, 1)");
  });

  it("분수 해: 2x+3y=5, x−y=1 → (8/5, 3/5)", () => {
    const s = solve(F([[2, 3], [1, -1]]), [frac(5), frac(1)]);
    if (s.kind !== "unique") throw new Error("unique expected");
    expect(textPoint(s.values)).toBe("(8/5, 3/5)");
  });

  it("평행선은 해가 없고, 같은 직선은 무수히 많다", () => {
    expect(solve(F([[1, 1], [2, 2]]), [frac(1), frac(3)]).kind).toBe("none");
    const inf = solve(F([[1, 1], [2, 2]]), [frac(1), frac(2)]);
    expect(inf.kind).toBe("infinite");
    expect(texSolution(inf, ["x", "y"])).toContain("y = t");
  });

  it("3원: x+y+z=6, 2x−y+z=3, x+2y−z=2 → (1, 2, 3)", () => {
    const s = solve(F([[1, 1, 1], [2, -1, 1], [1, 2, -1]]), [frac(6), frac(3), frac(2)]);
    if (s.kind !== "unique") throw new Error("unique expected");
    expect(textPoint(s.values)).toBe("(1, 2, 3)");
  });

  it("일차인지 수치로 확인하고 계수를 꺼낸다", () => {
    // 2(x+1) + y/2 − 3 = 0  →  2x + 1/2 y = 1
    const r = linearCoefficients((x, y) => 2 * (x + 1) + y / 2 - 3, 2);
    expect(r?.coefs.map(texFrac)).toEqual(["2", tex`\frac{1}{2}`]);
    expect(texFrac(r?.rhs ?? frac(0))).toBe("1");
    expect(linearCoefficients((x, y) => x * y - 1, 2)).toBeNull(); // 일차가 아님
  });

  it("입력 나누기: 쉼표·세미콜론·cases, 괄호 안 쉼표는 그대로", () => {
    expect(splitSystem("2x+3y=7, x-y=1")).toEqual(["2x+3y=7", "x-y=1"]);
    expect(splitSystem("2x+3y=7; x-y=1")).toEqual(["2x+3y=7", "x-y=1"]);
    expect(splitSystem(tex`\begin{cases} x+y=2 \\ x-y=0 \end{cases}`)).toEqual(["x+y=2", "x-y=0"]);
    expect(splitSystem("f(1,2)=3")).toBeNull();
    expect(splitSystem("y=x^2")).toBeNull();
  });
});

describe("행렬", () => {
  const A = F([[2, 1], [1, 3]]);
  it("행렬식·역행렬·계수·전치·곱", () => {
    expect(texFrac(det(A))).toBe("5");
    expect(nums(inverse(A) ?? [])).toEqual([
      [tex`\frac{3}{5}`, tex`-\frac{1}{5}`],
      [tex`-\frac{1}{5}`, tex`\frac{2}{5}`],
    ]);
    expect(inverse(F([[1, 2], [2, 4]]))).toBeNull();
    expect(rank(F([[1, 2], [2, 4]]))).toBe(1);
    expect(nums(transpose(F([[1, 2, 3]])))).toEqual([["1"], ["2"], ["3"]]);
    expect(nums(multiply(A, inverse(A) ?? []))).toEqual([
      ["1", "0"],
      ["0", "1"],
    ]);
    expect(nums(rref(F([[1, 2, 3], [2, 4, 7]])).R)).toEqual([
      ["1", "2", "0"],
      ["0", "0", "1"],
    ]);
  });

  it("행렬 입력 형식", () => {
    expect(parseMatrix("[[1,2],[3,4]]")?.length).toBe(2);
    expect(parseMatrix("[1 2; 3 4]")?.[1]?.map(texFrac)).toEqual(["3", "4"]);
    expect(parseMatrix(tex`\begin{pmatrix}1&1/2\\0&\frac{3}{4}\end{pmatrix}`)?.[1]?.map(texFrac)).toEqual(["0", tex`\frac{3}{4}`]);
    expect(parseMatrix("[[1,2],[3]]")).toBeNull();
    expect(parseMatrix("[1,2]")).toBeNull();
  });

  it("ƒ 입력: 행렬 명령이 수식 객체가 된다", () => {
    const r = buildLinear("inv [[2,1],[1,3]]");
    expect(r?.ir.kind).toBe("formula");
    if (r?.ir.kind === "formula") expect(r.ir.data.latex).toContain(tex`\frac{3}{5}`);
    const d = buildLinear("det [[1,2],[2,4]]");
    if (d?.ir.kind === "formula") expect(d.ir.data.latex).toContain("= 0");
    else throw new Error("formula expected");
  });

  it("ƒ 입력: 미지수 2개 연립은 두 직선 그래프 + 교점", () => {
    const r = buildLinear("2x+3y=5, x-y=1");
    expect(r?.ir.kind).toBe("plot2d");
    if (r?.ir.kind !== "plot2d") return;
    expect(r.ir.data.functions).toHaveLength(2);
    expect(r.ir.data.points?.[0]?.label).toBe("(8/5, 3/5)");
    expect(r.ir.data.caption).toContain("cases");
  });

  it("ƒ 입력: 일차가 아니면 넘긴다 (다른 해석으로)", () => {
    expect(buildLinear("x^2+y^2=4, x+y=1")).toBeNull();
  });
});
