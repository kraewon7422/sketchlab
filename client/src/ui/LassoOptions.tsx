import type { ReactElement } from "react";
import { theme } from "../render/theme";
import { penStore, usePen } from "../store/pen";

/**
 * 올가미 패널 — 두 가지 고르기 방식.
 *   애플식:  두른 고리 안의 것 (끝을 시작점으로 곧게 이어 닫는다)
 *   삼성식:  그은 선이 닿은 것 + 감싼 것 (끝을 잇지 않는다, 자유롭게 긋기)
 */
const STYLES = [
  {
    key: "apple",
    label: "애플식",
    note: "빙 둘러 감싼 것만 (끝을 시작점으로 이어요)",
    preview: "M10,30 C10,10 50,6 62,18 C74,30 60,46 36,46 C20,46 12,40 10,30 Z",
    closed: true,
  },
  {
    key: "samsung",
    label: "삼성노트식",
    note: "그은 선이 닿은 것 모두 (자유롭게 그어요)",
    preview: "M8,40 C18,10 30,44 40,18 C48,2 60,40 70,14",
    closed: false,
  },
] as const;

export function LassoOptions(): ReactElement {
  const style = usePen((s) => s.lassoStyle);
  return (
    <div style={{ display: "grid", gap: theme.space[3] }}>
      <strong style={{ fontSize: 14 }}>올가미</strong>
      <div style={{ display: "grid", gap: 6 }}>
        {STYLES.map((s) => {
          const on = style === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => penStore.getState().set({ lassoStyle: s.key })}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr",
                alignItems: "center",
                gap: theme.space[2],
                padding: theme.space[2],
                textAlign: "left",
                border: `1px solid ${on ? theme.color.accent : theme.color.sub}`,
                borderRadius: theme.radius.s,
                background: on ? theme.color.selection : theme.color.bg,
                color: theme.color.ink,
                cursor: "pointer",
              }}
            >
              <svg width={80} height={52} viewBox="0 0 80 52" aria-hidden>
                <path
                  d={s.preview}
                  fill={s.closed ? theme.color.groupHint : "none"}
                  stroke={theme.color.accent}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              </svg>
              <span style={{ display: "grid", gap: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: on ? theme.color.accent : theme.color.ink }}>{s.label}</span>
                <span style={{ fontSize: 12, color: theme.color.asymptote }}>{s.note}</span>
              </span>
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 12, color: theme.color.asymptote }}>고른 것은 끌어서 옮기고, 모서리로 크기·돌리기</span>
    </div>
  );
}
