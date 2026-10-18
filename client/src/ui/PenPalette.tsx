import { Highlighter, Pen } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { hexToHsl, hslToHex, rainbow, type Hsl } from "../ink/color";
import { smoothStrokePath } from "../ink/smoothOutline";
import { penOpts, theme } from "../render/theme";
import { currentStrokeStyle, penStore, usePen, type PenKind } from "../store/pen";

/**
 * 펜 팔레트 — 툴바의 색 단추를 누르면 열린다.
 *   [펜 | 형광펜]  미리보기
 *   자주 쓰는 색 + 최근에 직접 고른 색
 *   무지개 12색
 *   색상 · 채도 · 밝기 슬라이더 (아무 색이나)
 *   굵기 슬라이더 · 흔들림 보정
 * 무엇을 고르든 도구는 펜으로 돌아간다 (지우개 상태에서 색을 고르면 바로 쓰고 싶은 것).
 */
export function PenPalette({ onPick, openUp }: { onPick: () => void; openUp: boolean }): ReactElement {
  const [open, setOpen] = useState(false);
  const pen = usePen((s) => s);
  const style = currentStrokeStyle(pen);
  const rootRef = useRef<HTMLDivElement>(null);
  const highlighter = pen.kind === "highlighter";
  const current = style.color;

  // 슬라이더 값은 따로 들고 있다 — 회색(채도 0)이 되어도 색상 위치를 잃지 않게
  const [hsl, setHsl] = useState<Hsl>(() => hexToHsl(current));
  const lastSet = useRef(current);
  useEffect(() => {
    // 단추로 색을 바꿨을 때만 슬라이더를 맞춘다 (슬라이더로 바꾼 건 이미 맞다)
    if (current !== lastSet.current) {
      setHsl(hexToHsl(current));
      lastSet.current = current;
    }
  }, [current]);

  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      // 닫으려고 캔버스를 톡 친 것 — 점이 찍히지 않게 삼킨다 (다른 단추는 그대로 눌린다)
      if ((e.target as Element | null)?.closest("main")) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [open]);

  const pick = (color: string) => {
    lastSet.current = "";
    penStore.getState().pickColor(color);
    onPick();
  };
  /** 슬라이더를 움직이는 동안: 색만 바꾸고, 손을 떼면 최근 색에 올린다 */
  const slide = (patch: Partial<Hsl>) => {
    const next = { ...hsl, ...patch };
    setHsl(next);
    const c = hslToHex(next);
    lastSet.current = c;
    penStore.getState().set(highlighter ? { highlightColor: c } : { penColor: c });
    onPick();
  };
  const commitSlide = () => penStore.getState().pickColor(hslToHex(hsl));

  const presets: readonly string[] = highlighter ? penOpts.highlightColors : penOpts.colors;
  const names: readonly string[] = highlighter ? penOpts.highlightNames : penOpts.colorNames;
  const recent = highlighter ? pen.recentHighlight : pen.recentPen;
  const rb = highlighter ? penOpts.rainbowHighlight : penOpts.rainbowPen;
  const hues = rainbow(rb.s, rb.l);
  const widthRange = highlighter ? penOpts.highlightWidth : penOpts.penWidth;

  const swatch = (c: string, label: string, size = 30) => (
    <button
      key={label + c}
      type="button"
      aria-label={label}
      aria-pressed={current === c}
      title={label}
      onClick={() => pick(c)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: "none",
        padding: 0,
        background: c,
        opacity: highlighter ? 0.8 : 1,
        boxShadow: current === c ? `0 0 0 2px ${theme.color.bg}, 0 0 0 4px ${theme.color.accent}` : `0 0 0 1px ${theme.color.sub}`,
        cursor: "pointer",
        flex: "0 0 auto",
      }}
    />
  );

  const kindButton = (kind: PenKind, label: string, Icon: typeof Pen) => (
    <button
      type="button"
      aria-pressed={pen.kind === kind}
      onClick={() => {
        penStore.getState().set({ kind });
        onPick();
      }}
      style={{
        flex: 1,
        height: 40,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: theme.space[1],
        border: "none",
        borderRadius: theme.radius.s,
        background: pen.kind === kind ? theme.color.selection : "transparent",
        color: pen.kind === kind ? theme.color.accent : theme.color.ink,
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      <Icon size={18} strokeWidth={1.6} />
      {label}
    </button>
  );

  const hueTrack = `linear-gradient(to right, ${Array.from({ length: 13 }, (_, i) => hslToHex({ h: i * 30, s: Math.max(hsl.s, 60), l: 50 })).join(", ")})`;
  const satTrack = `linear-gradient(to right, ${hslToHex({ ...hsl, s: 0 })}, ${hslToHex({ ...hsl, s: 100 })})`;
  const lightTrack = `linear-gradient(to right, #000000, ${hslToHex({ ...hsl, l: 50 })}, #FFFFFF)`;
  const gradientSlider = (label: string, value: number, max: number, track: string, onChange: (v: number) => void) => (
    <label style={{ display: "grid", gap: 4, fontSize: 12, color: theme.color.asymptote }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </span>
      <input
        type="range"
        className="sl-gradient-range"
        aria-label={label}
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={commitSlide}
        onKeyUp={commitSlide}
        style={{ background: track, ["--thumb" as string]: current } as CSSProperties}
      />
    </label>
  );

  // 미리보기 획: 필압이 살짝 변하는 물결 (실제 펜과 같은 외곽선 엔진)
  const sample = Array.from({ length: 40 }, (_, i) => ({ x: 14 + i * 6, y: 26 + Math.sin(i / 5) * 10, p: highlighter ? 0.5 : 0.35 + 0.4 * Math.sin((i / 39) * Math.PI), t: i * 8 }));

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="펜 색·굵기"
        aria-expanded={open}
        title="펜 색·굵기·형광펜"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: theme.touch.minTarget,
          height: theme.touch.minTarget,
          display: "grid",
          placeItems: "center",
          border: "none",
          borderRadius: theme.radius.s,
          background: open ? theme.color.selection : "transparent",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: current,
            opacity: highlighter ? 0.75 : 1,
            boxShadow: `0 0 0 2px ${theme.color.bg}, 0 0 0 3px ${theme.color.sub}`,
          }}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="펜 설정"
          style={{
            position: "absolute",
            left: 0,
            ...(openUp ? { bottom: theme.touch.minTarget + theme.space[2] } : { top: theme.touch.minTarget + theme.space[2] }),
            width: 300,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "min(72vh, 640px)",
            overflowY: "auto",
            padding: theme.space[3],
            display: "grid",
            gap: theme.space[3],
            background: theme.color.bg,
            border: `1px solid ${theme.color.sub}`,
            borderRadius: theme.radius.m,
            boxShadow: "0 8px 28px rgba(26,26,26,0.16)",
            zIndex: 30,
            touchAction: "pan-y",
          }}
        >
          <div style={{ display: "flex", gap: theme.space[1] }}>
            {kindButton("pen", "펜", Pen)}
            {kindButton("highlighter", "형광펜", Highlighter)}
          </div>

          {/* 미리보기 */}
          <svg width="100%" height={52} viewBox="0 0 268 52" style={{ display: "block", borderRadius: theme.radius.s, background: "#FAFAFA" }}>
            <text x={20} y={34} fontSize={20} fill={theme.color.ink} opacity={highlighter ? 0.75 : 0}>
              가나다 abc 123
            </text>
            <path
              d={smoothStrokePath(sample, { baseWidth: style.width })}
              fill={current}
              opacity={highlighter ? penOpts.highlightOpacity : 1}
              style={highlighter ? { mixBlendMode: "multiply" } : undefined}
            />
          </svg>

          <div style={{ display: "flex", flexWrap: "wrap", gap: theme.space[2] }}>
            {presets.map((c, i) => swatch(c, names[i] ?? c))}
            {recent.map((c) => swatch(c, `최근 ${c}`))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 4 }} aria-label="무지개">
            {hues.map((c, i) => (
              <button
                key={c}
                type="button"
                aria-label={`무지개 ${i + 1}`}
                onClick={() => pick(c)}
                style={{
                  height: 26,
                  border: "none",
                  padding: 0,
                  borderRadius: 6,
                  background: c,
                  boxShadow: current === c ? `0 0 0 2px ${theme.color.bg}, 0 0 0 4px ${theme.color.accent}` : "none",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>

          {gradientSlider("색상", hsl.h, 360, hueTrack, (h) => slide({ h }))}
          {gradientSlider("채도", hsl.s, 100, satTrack, (s) => slide({ s }))}
          {gradientSlider("밝기", hsl.l, 100, lightTrack, (l) => slide({ l }))}

          <label style={{ display: "grid", gap: 4, fontSize: 13, color: theme.color.ink }}>
            <span style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{highlighter ? "형광펜 굵기" : "펜 굵기"}</span>
              <span style={{ color: theme.color.asymptote }}>{style.width.toFixed(highlighter ? 0 : 1)}px</span>
            </span>
            <input
              type="range"
              aria-label={highlighter ? "형광펜 굵기" : "펜 굵기"}
              min={widthRange.min}
              max={widthRange.max}
              step={highlighter ? 1 : 0.1}
              value={style.width}
              onChange={(e) => {
                const w = Number(e.target.value);
                penStore.getState().set(highlighter ? { highlightWidth: w } : { penWidth: w });
                onPick();
              }}
              style={{ width: "100%", accentColor: theme.color.accent }}
            />
          </label>

          <label style={{ display: "grid", gap: 4, fontSize: 13, color: theme.color.ink }}>
            <span style={{ display: "flex", justifyContent: "space-between" }}>
              <span>흔들림 보정</span>
              <span style={{ color: theme.color.asymptote }}>{pen.smoothing === 0 ? "끔" : `${Math.round(pen.smoothing * 100)}%`}</span>
            </span>
            <input
              type="range"
              aria-label="흔들림 보정"
              min={0}
              max={0.9}
              step={0.05}
              value={pen.smoothing}
              onChange={(e) => penStore.getState().set({ smoothing: Number(e.target.value) })}
              style={{ width: "100%", accentColor: theme.color.accent }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
