import { Pipette } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { hexToHsv, hexToRgb, hsvToHex, rgbToHex, type Hsv } from "../ink/color";
import { theme } from "../render/theme";
import { cancelEyedropper, startEyedropper, useEyedropperActive } from "./eyedropper";

/**
 * 색 고르기 — 삼성노트 "사용자 지정" 판처럼.
 *   판: 가로 = 색상, 세로 = 채도 (위가 흐림)  ·  밝기 막대  ·  HEX / R G B 입력  ·  스포이트
 * onChange는 고르는 동안 계속, onCommit은 손을 뗐을 때 한 번 (최근 색에 올리기).
 */
export function ColorPicker({ value, onChange, onCommit }: { value: string; onChange: (hex: string) => void; onCommit: (hex: string) => void }): ReactElement {
  // 판·막대 위치는 따로 들고 있다 — 검정(밝기 0)이 되어도 색상·채도 위치를 잃지 않게
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const last = useRef(value);
  useEffect(() => {
    if (value.toUpperCase() !== last.current.toUpperCase()) {
      setHsv(hexToHsv(value));
      last.current = value;
    }
  }, [value]);
  const picking = useEyedropperActive();
  useEffect(() => cancelEyedropper, []);

  const set = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    last.current = hex;
    onChange(hex);
  };
  const setHex = (hex: string, commit = true) => {
    last.current = hex;
    setHsv(hexToHsv(hex));
    onChange(hex);
    if (commit) onCommit(hex);
  };

  const pad = useRef<HTMLDivElement>(null);
  const fromPad = (clientX: number, clientY: number) => {
    const r = pad.current?.getBoundingClientRect();
    if (!r) return;
    const h = Math.min(359.9, Math.max(0, ((clientX - r.left) / r.width) * 360));
    const s = Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100));
    set({ ...hsv, h, s, v: hsv.v < 5 ? 100 : hsv.v });
  };

  const [r, g, b] = hexToRgb(hsvToHex(hsv));
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const shown = hsvToHex(hsv);

  return (
    <div style={{ display: "grid", gap: theme.space[2] }}>
      <div
        ref={pad}
        role="slider"
        aria-label="색상과 채도"
        aria-valuetext={shown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPad(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons) fromPad(e.clientX, e.clientY);
        }}
        onPointerUp={() => onCommit(hsvToHex(hsv))}
        style={{
          position: "relative",
          height: 130,
          borderRadius: theme.radius.s,
          background: "linear-gradient(to bottom, #FFFFFF, rgba(255,255,255,0)), linear-gradient(to right, #F00, #FF0 17%, #0F0 33%, #0FF 50%, #00F 67%, #F0F 83%, #F00)",
          touchAction: "none",
          cursor: "crosshair",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", inset: 0, background: "#000", opacity: 1 - hsv.v / 100, pointerEvents: "none" }} />
        <span
          style={{
            position: "absolute",
            left: `${(hsv.h / 360) * 100}%`,
            top: `${hsv.s}%`,
            width: 18,
            height: 18,
            marginLeft: -9,
            marginTop: -9,
            borderRadius: "50%",
            border: "3px solid #fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
            background: shown,
            pointerEvents: "none",
          }}
        />
      </div>

      <label style={{ display: "grid", gridTemplateColumns: "1fr 44px", alignItems: "center", gap: theme.space[2], fontSize: 12, color: theme.color.asymptote }}>
        <input
          type="range"
          className="sl-gradient-range"
          aria-label="밝기"
          min={0}
          max={100}
          step={1}
          value={Math.round(hsv.v)}
          onChange={(e) => set({ ...hsv, v: Number(e.target.value) })}
          onPointerUp={() => onCommit(hsvToHex(hsv))}
          onKeyUp={() => onCommit(hsvToHex(hsv))}
          style={{ background: `linear-gradient(to right, #000, ${hsvToHex({ ...hsv, v: 100 })})`, ["--thumb" as string]: shown } as CSSProperties}
        />
        <span style={{ textAlign: "right" }}>{Math.round(hsv.v)}%</span>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "32px 2.2fr 1fr 1fr 1fr 34px", alignItems: "end", gap: 6 }}>
        <span aria-hidden style={{ height: 32, borderRadius: theme.radius.s, background: shown, boxShadow: `0 0 0 1px ${theme.color.sub}` }} />
        <NumField
          label="색상 코드"
          value={hexDraft ?? shown}
          onChange={setHexDraft}
          onDone={() => {
            const v = (hexDraft ?? "").trim().replace(/^#?/, "#");
            setHexDraft(null);
            if (/^#[0-9a-f]{6}$/i.test(v)) setHex(v.toUpperCase());
          }}
        />
        {(["빨강", "초록", "파랑"] as const).map((name, i) => (
          <NumField
            key={name}
            label={name}
            value={String([r, g, b][i])}
            numeric
            onDone={(text) => {
              const n = Number(text);
              if (!Number.isFinite(n)) return;
              const rgb: [number, number, number] = [r, g, b];
              rgb[i] = n;
              setHex(rgbToHex(...rgb));
            }}
          />
        ))}
        <button
          type="button"
          aria-label="스포이트 — 노트에서 색 가져오기"
          aria-pressed={picking}
          title="스포이트 — 노트에서 색 가져오기"
          onClick={() => (picking ? cancelEyedropper() : void startEyedropper((c) => setHex(c)))}
          style={{
            height: 32,
            display: "grid",
            placeItems: "center",
            border: `1px solid ${picking ? theme.color.accent : theme.color.sub}`,
            borderRadius: theme.radius.s,
            background: picking ? theme.color.selection : theme.color.bg,
            color: picking ? theme.color.accent : theme.color.ink,
            cursor: "pointer",
          }}
        >
          <Pipette size={16} />
        </button>
      </div>
      {picking && <span style={{ fontSize: 12, color: theme.color.accent }}>노트에서 색을 가져올 곳을 톡 하세요</span>}
    </div>
  );
}

/** 이름표 + 입력 칸 (손을 떼거나 Enter를 누를 때 반영) */
function NumField({ label, value, numeric = false, onChange, onDone }: { label: string; value: string; numeric?: boolean; onChange?: (v: string) => void; onDone: (v: string) => void }): ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label style={{ display: "grid", gap: 2, fontSize: 11, color: theme.color.asymptote, minWidth: 0 }}>
      {label}
      <input
        type="text"
        inputMode={numeric ? "numeric" : "text"}
        aria-label={label}
        value={onChange ? value : (draft ?? value)}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => (onChange ? onChange(e.target.value) : setDraft(e.target.value))}
        onBlur={(e) => {
          setDraft(null);
          onDone(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        style={{ width: "100%", height: 32, boxSizing: "border-box", padding: "0 4px", border: `1px solid ${theme.color.sub}`, borderRadius: theme.radius.s, font: "inherit", fontSize: 12.5, color: theme.color.ink, textAlign: "center" }}
      />
    </label>
  );
}
