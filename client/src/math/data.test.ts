import { SceneIRSchema } from "@sketchlab/shared";
import { describe, expect, it } from "vitest";
import { buildChart, buildTableIR, chartOptions, fromRows, linearRegression, numericColumns, parseTable } from "./data";

const TSV = "공부 시간\t점수\n1\t52\n2\t60\n3\t71\n4\t77\n5\t90";

describe("표·차트", () => {
  it("엑셀에서 복사한 칸(탭)·CSV(쉼표, 따옴표)·공백 모두 읽는다, 첫 줄 제목 알아보기", () => {
    const t = parseTable(TSV);
    expect(t?.header).toBe(true);
    expect(t?.rows[0]).toEqual(["공부 시간", "점수"]);
    expect(t?.rows).toHaveLength(6);
    const c = parseTable('이름,설명,값\n가,"쉼표, 있는 글",3\n나,없음,4');
    expect(c?.rows[1]).toEqual(["가", "쉼표, 있는 글", "3"]);
    expect(parseTable("1 2\n3 4")?.rows).toEqual([["1", "2"], ["3", "4"]]);
    expect(parseTable("1 2\n3 4")?.header).toBe(false);
  });

  it("숫자 칸·그릴 수 있는 차트", () => {
    const t = parseTable(TSV);
    if (!t) throw new Error("못 읽음");
    expect(numericColumns(t)).toEqual([0, 1]);
    expect(chartOptions(t)).toEqual(["scatter", "line", "bar"]);
    expect(chartOptions(parseTable("과목,점수\n국어,80\n수학,90") as NonNullable<ReturnType<typeof parseTable>>)).toEqual(["line", "bar"]);
  });

  it("최소제곱 회귀선과 r²", () => {
    const r = linearRegression([
      [1, 2],
      [2, 4],
      [3, 6],
    ]);
    expect(r?.a).toBeCloseTo(2);
    expect(r?.b).toBeCloseTo(0);
    expect(r?.r2).toBeCloseTo(1);
    const t = parseTable(TSV);
    const fit = linearRegression([1, 2, 3, 4, 5].map((x, i) => [x, [52, 60, 71, 77, 90][i] as number]));
    expect(fit?.a).toBeCloseTo(9.3, 1);
    expect(fit?.r2).toBeGreaterThan(0.98);
    const ir = buildChart(t as NonNullable<typeof t>, "scatter");
    if (ir?.kind !== "plot2d") throw new Error("plot2d 아님");
    expect(SceneIRSchema.safeParse(ir).success).toBe(true);
    expect(ir.data.functions[0]?.latex).toMatch(/^y=9\.3x\+/);
    expect(ir.data.caption).toContain("r^2=0.99");
  });

  it("막대·꺾은선: 첫 칸이 글자면 가로축 이름 · 표 객체", () => {
    const t = parseTable("과목,1학기,2학기\n국어,80,85\n수학,90,95\n영어,70,88") as NonNullable<ReturnType<typeof parseTable>>;
    const bar = buildChart(t, "bar");
    if (bar?.kind !== "plot2d") throw new Error("plot2d 아님");
    expect(bar.data.xCategories).toEqual(["국어", "수학", "영어"]);
    expect(bar.data.bars?.map((b) => b.h)).toEqual([80, 90, 70]);
    const line = buildChart(t, "line");
    if (line?.kind !== "plot2d") throw new Error("plot2d 아님");
    expect(line.data.series).toHaveLength(2);
    expect(SceneIRSchema.safeParse(line).success).toBe(true);
    const table = buildTableIR(t);
    expect(SceneIRSchema.safeParse(table).success).toBe(true);
    // 엑셀 파일의 칸(숫자·날짜·빈칸)
    expect(fromRows([["날짜", "값"], [new Date("2026-10-20T00:00:00Z"), 3], [null, 4]])?.rows[1]).toEqual(["2026-10-20", "3"]);
  });
});
