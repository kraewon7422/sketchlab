import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { hexToHsl, hslToHex, rainbow, type Hsl } from "../ink/color";
import { smoothStrokePath } from "../ink/smoothOutline";
import { penOpts, theme } from "../render/theme";
import { currentStrokeStyle, penStore, usePen } from "../store/pen";

/**
 * 펜·형광펜 옵션 패널 (도구 레일에서 펜/형광펜을 한 번 더 누르면 열린다).
 *   미리보기
 *   자주 쓰는 색 + 최근에 직접 고른 색
 *   무지개 12색
 *   색상 · 채도 · 밝기 슬라이더 (아무 색이나)
 *   굵기 슬라이더 · 흔들림 보정
 * 펜인지 형광펜인지는 레일에서 고른 도구(penStore.kind)를 따른다.
 */
export function PenOptions(): ReactElement {
  const pen = usePen((s) => s);
  const style = currentStrokeStyle(pen);
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

  const pick = (color: string) => {
    lastSet.current = "";
    penStore.getState().pickColor(color);
  };
  /** 슬라이더를 움직이는 동안: 색만 바꾸고, 손을 떼면 최근 색에 올린다 */
  const slide = (patch: Partial<Hsl>) => {
    const next = { ...hsl, ...patch };
    setHsl(next);
    const c = hslToHex(next);
    lastSet.current = c;
    penStore.getState().set(highlighter ? { highlightColor: c } : { penColor: c });
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
    <div style={{ display: "grid", gap: theme.space[3] }}>
      <strong style={{ fontSize: 14 }}>{highlighter ? "형광펜" : "펜"}</strong>

      {/* 즐겨 찾는 펜 — 누르면 그 펜으로, ×로 빼기 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }} aria-label="즐겨 찾는 펜">
        {pen.presets.map((pr, i) => {
          const on = pr.kind === pen.kind && pr.color === current && Math.abs(pr.width - style.width) < 0.05;
          return (
            <span key={`${pr.color}-${pr.width}-${i}`} style={{ position: "relative" }}>
              <button
                type="button"
                aria-label={`즐겨 찾는 펜 ${i + 1}`}
                onClick={() =>
                  penStore.getState().set(pr.kind === "highlighter" ? { kind: "highlighter", highlightColor: pr.color, highlightWidth: pr.width } : { kind: "pen", penColor: pr.color, penWidth: pr.width })
                }
                style={{
                  width: 46,
                  height: 34,
                  display: "grid",
                  placeItems: "center",
                  border: `1.5px solid ${on ? theme.color.accent : theme.color.sub}`,
                  borderRadius: 10,
                  background: theme.color.bg,
                  cursor: "pointer",
                }}
              >
                <span style={{ width: 28, height: Math.max(2, Math.min(14, pr.kind === "highlighter" ? pr.width * 0.5 : pr.width * 1.3)), borderRadius: 99, background: pr.color, opacity: pr.kind === "highlighter" ? 0.6 : 1 }} />
              </button>
              <button
                type="button"
                aria-label={`즐겨 찾는 펜 ${i + 1} 빼기`}
                onClick={() => penStore.getState().set({ presets: pen.presets.filter((_, j) => j !== i) })}
                style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, padding: 0, border: "none", borderRadius: "50%", background: theme.color.sub, color: theme.color.ink, fontSize: 11, lineHeight: "18px", cursor: "pointer" }}
              >
                ×
              </button>
            </span>
          );
        })}
        {pen.presets.length < 6 && (
          <button
            type="button"
            onClick={() => penStore.getState().set({ presets: [...pen.presets, { kind: pen.kind, color: current, width: style.width }] })}
            style={{ height: 34, padding: "0 10px", border: `1px dashed ${theme.color.accent}`, borderRadius: 10, background: theme.color.bg, color: theme.color.accent, fontSize: 12, cursor: "pointer" }}
          >
            + 지금 펜 저장
          </button>
        )}
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

      <label style={{ display: "flex", alignItems: "center", gap: theme.space[2], fontSize: 13, color: theme.color.ink }}>
        <input
          type="checkbox"
          checked={pen.penOnly}
          onChange={(e) => penStore.getState().set({ penOnly: e.target.checked })}
          style={{ width: 18, height: 18, accentColor: theme.color.accent }}
        />
        손가락으로는 그리지 않기 (S Pen 전용)
      </label>
      <span style={{ fontSize: 12, color: theme.color.asymptote, marginTop: -theme.space[2] }}>손가락은 화면 이동·확대와 고르기만 해요</span>
    </div>
  );
}
