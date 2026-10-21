import type { SceneIR } from "@sketchlab/shared";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { ChemDrawing } from "../chem/layout";
import { grade, makePuzzle, solved, todaySeed, type Lang, type Mark } from "../chem/namingPuzzle";
import type { ObjectItem } from "../ink/types";
import { sessionStore } from "../store/session";
import { chemDrawing } from "./ChemObject";
import { btn, onBtn } from "./figureKit";
import { isFresh } from "./Shape2DView";
import { chem, theme } from "./theme";

/**
 * 이름 퍼즐 — 구조식을 보고 조각을 차례로 톡 해 IUPAC 이름을 만든다 (하이픈·쉼표는 안 맞춰도 된다).
 *   초록 = 맞는 자리, 노랑 = 이름에 있지만 다른 자리, 회색 = 이름에 없음 · 6번 · 틀릴수록 힌트
 *   낸 답은 IR에 저장 (다시 열어도 그대로), 고르는 중인 조각은 화면에만.
 */

type NamingIR = Extract<SceneIR, { kind: "naming" }>;

const MAX_TRIES = 6;
const COLOR: Record<Mark, string> = { green: "#3E9B6B", yellow: "#D9A521", gray: "#9AA3B2" };
const ACCENT = "#E2733F";

export default memo(function NamingObject({ item, interactive = false }: { item: ObjectItem; interactive?: boolean }): ReactElement | null {
  if (item.ir.kind !== "naming") return null;
  return <NamingBox item={item} ir={item.ir} interactive={interactive} />;
});

function NamingBox({ item, ir, interactive }: { item: ObjectItem; ir: NamingIR; interactive: boolean }) {
  const W = item.transform.scale;
  const { level, seed, lang, guesses } = ir.data;
  const fresh = isFresh(item.id);
  const puzzle = useMemo(() => makePuzzle(seed, level), [seed, level]);
  const answer = puzzle.answer[lang];
  const tiles = puzzle.tiles[lang];
  /** 고르는 중: 조각 번호(tiles의 자리) */
  const [cur, setCur] = useState<number[]>([]);
  const [drawing, setDrawing] = useState<ChemDrawing | null>(null);
  const won = guesses.some((g) => solved(g, answer));
  const over = won || guesses.length >= MAX_TRIES;
  const misses = guesses.length - (won ? 1 : 0);

  useEffect(() => {
    let alive = true;
    void chemDrawing({ smiles: puzzle.smiles, style: "skeletal", aromaticCircle: false }, Math.min(chem.bond, 36)).then((d) => alive && setDrawing(d));
    return () => {
      alive = false;
    };
  }, [puzzle.smiles]);

  // 문제·언어가 바뀌면 고르던 것 비우기
  useEffect(() => setCur([]), [seed, level, lang]);

  const boxRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const b = item.bbox;
    if (Math.abs(b.maxY - b.minY - h) > 2) sessionStore.getState().fitObjectBox(item.id, { minX: item.transform.x, minY: item.transform.y, maxX: item.transform.x + W, maxY: item.transform.y + h });
  });

  const save = (patch: Partial<NamingIR["data"]>, label: string) => {
    const now = sessionStore.getState().items.find((i) => i.id === item.id);
    if (!now || now.kind !== "object" || now.ir.kind !== "naming") return;
    sessionStore.getState().commitObjectIR(item.id, now.ir, { ...now.ir, data: { ...now.ir.data, ...patch } }, label);
  };
  const submit = () => {
    if (!cur.length || over) return;
    save({ guesses: [...guesses, cur.map((k) => tiles[k] as string)] }, "이름 퍼즐 답");
    setCur([]);
  };
  const newPuzzle = (s: number, l = level) => save({ seed: s, level: l, guesses: [] }, "새 이름 문제");

  // 힌트: 1번 틀리면 종류, 2번 → 주 사슬 길이, 3번 → 구조식에 주 사슬·번호
  const hints: string[] = [];
  if (misses >= 1 || over) hints.push(`화합물 종류: ${puzzle.naming.family}`);
  if (misses >= 2 || over) hints.push(`주 사슬: 탄소 ${puzzle.naming.chain.length}개`);
  const showChain = misses >= 3 || over;
  const at = (i: number) => drawing?.atoms[i];
  const tile = (text: string, color?: string, onClick?: () => void, used = false, key?: string | number) => (
    <button
      key={key}
      type="button"
      disabled={!onClick || used}
      onClick={onClick}
      style={{
        minHeight: 32,
        padding: "3px 10px",
        borderRadius: 8,
        border: `1.5px solid ${color ?? theme.color.sub}`,
        background: color ?? theme.color.bg,
        color: color ? "#fff" : theme.color.ink,
        fontSize: 14,
        fontWeight: 600,
        fontFamily: "inherit",
        cursor: onClick && !used ? "pointer" : "default",
        opacity: used ? 0.3 : 1,
        pointerEvents: "auto",
      }}
    >
      {text}
    </button>
  );
  const isToday = seed === todaySeed();

  return (
    <div ref={boxRef} data-overlay-id={item.id} className={fresh ? "sl-fade-in" : undefined} style={{ position: "absolute", left: item.transform.x, top: item.transform.y, width: W, pointerEvents: "none", color: theme.color.ink }}>
      <div style={{ textAlign: "center", fontSize: 13, color: theme.color.asymptote }}>
        <b style={{ color: theme.color.ink, fontSize: 15 }}>이름 퍼즐</b> · {level === "easy" ? "하" : "중"} · {isToday ? "오늘의 문제" : `문제 ${seed}`}
      </div>
      {/* 구조식 */}
      <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}>
        {drawing ? (
          <svg width={drawing.width} height={drawing.height} style={{ display: "block", overflow: "visible" }}>
            {showChain && (
              <polyline points={puzzle.naming.chain.map((i) => (at(i) ?? [0, 0]).join(",")).join(" ")} fill="none" stroke={ACCENT} strokeOpacity={0.28} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
            )}
            <g stroke={theme.color.ink} strokeWidth={chem.lineWidth} strokeLinecap="round" fill="none">
              {drawing.lines.map(([p, q], i) => (
                <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />
              ))}
            </g>
            <g fill={theme.color.ink} fontFamily={chem.font} fontSize={Math.min(chem.bond, 36) * chem.fontScale}>
              {drawing.labels.map((l, i) => (
                <text key={i} x={l.at[0]} y={l.at[1] + Math.min(chem.bond, 36) * chem.fontScale * 0.36} textAnchor="middle">
                  {l.symbol}
                  {l.hydrogens > 0 ? `H${l.hydrogens > 1 ? String.fromCharCode(0x2080 + l.hydrogens) : ""}` : ""}
                </text>
              ))}
            </g>
            {showChain &&
              puzzle.naming.chain.map((i, k) => {
                const p = at(i);
                return (
                  p && (
                    <g key={i}>
                      <circle cx={p[0]} cy={p[1] - 15} r={8} fill={ACCENT} />
                      <text x={p[0]} y={p[1] - 15} textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#fff" fontWeight={700}>
                        {k + 1}
                      </text>
                    </g>
                  )
                );
              })}
          </svg>
        ) : (
          <div style={{ fontSize: 13, color: theme.color.asymptote, padding: 20 }}>구조식 준비 중…</div>
        )}
      </div>
      {/* 낸 답들 */}
      <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
        {guesses.map((g, r) => {
          const marks = grade(g, answer);
          return (
            <div key={r} style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
              {g.map((p, k) => tile(p, COLOR[marks[k] as Mark], undefined, false, k))}
            </div>
          );
        })}
      </div>
      {over ? (
        <div style={{ textAlign: "center", marginTop: 8, fontSize: 14, wordBreak: "keep-all" }}>
          {won ? <b style={{ color: COLOR.green }}>정답! {guesses.length}번 만에 맞혔어요</b> : <b style={{ color: theme.color.danger }}>아쉬워요</b>}
          <div style={{ marginTop: 2 }}>
            {puzzle.naming.en} <span style={{ color: theme.color.asymptote }}>· {puzzle.naming.ko}</span>
          </div>
        </div>
      ) : (
        <>
          {/* 고르는 중 — 톡 하면 빠진다 */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center", minHeight: 36, marginTop: 6, padding: 4, borderRadius: 10, background: "#F4F6F9" }}>
            {cur.length === 0 && <span style={{ fontSize: 12.5, color: theme.color.asymptote, alignSelf: "center" }}>아래 조각을 이름 차례대로 톡 하세요 (남은 기회 {MAX_TRIES - guesses.length}번)</span>}
            {cur.map((k, i) => tile(tiles[k] as string, undefined, interactive ? () => setCur((c) => c.filter((_, j) => j !== i)) : undefined, false, `c${i}`))}
          </div>
          {/* 조각 */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", marginTop: 8 }}>
            {tiles.map((t, k) => tile(t, undefined, interactive ? () => setCur((c) => [...c, k]) : undefined, cur.includes(k), k))}
          </div>
        </>
      )}
      {hints.length > 0 && !won && (
        <div style={{ marginTop: 8, fontSize: 12.5, textAlign: "center", color: theme.color.ink, wordBreak: "keep-all", lineHeight: 1.5 }}>
          {hints.map((h) => (
            <div key={h}>💡 {h}</div>
          ))}
          {showChain && <div>💡 구조식에 주 사슬과 번호를 표시했어요</div>}
        </div>
      )}
      {interactive && (
        <div data-export-skip style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 8, pointerEvents: "auto" }}>
          {!over && (
            <>
              <button type="button" style={btn} onClick={() => setCur([])}>
                지우기
              </button>
              <button type="button" style={cur.length ? onBtn : btn} onClick={submit}>
                확인
              </button>
            </>
          )}
          <button type="button" style={btn} onClick={() => newPuzzle(Math.floor(Math.random() * 1e6) + 1)}>
            새 문제
          </button>
          {!isToday && (
            <button type="button" style={btn} onClick={() => newPuzzle(todaySeed())}>
              오늘의 문제
            </button>
          )}
          <button type="button" style={btn} onClick={() => newPuzzle(seed, level === "easy" ? "medium" : "easy")}>
            {level === "easy" ? "하 → 중" : "중 → 하"}
          </button>
          <button type="button" style={btn} onClick={() => save({ lang: (lang === "en" ? "ko" : "en") as Lang, guesses: [] }, "퍼즐 언어")}>
            {lang === "en" ? "한글 이름으로" : "English names"}
          </button>
        </div>
      )}
    </div>
  );
}
