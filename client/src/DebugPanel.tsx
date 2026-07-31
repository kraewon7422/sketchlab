import { Bug, X } from "lucide-react";
import { useState, useSyncExternalStore, type ReactElement } from "react";
import { clearEntries, getEntries, subscribe, type DebugLevel } from "./debug";
import { theme } from "./render/theme";

const LEVEL_COLOR: Record<DebugLevel, string> = {
  error: theme.color.danger,
  warn: theme.color.accent,
  info: theme.color.asymptote,
};

/**
 * 개발용 진단 패널 (D7). 프로덕션 번들에서는 렌더되지 않는다.
 *
 * 컴파일이 성공해도 런타임에 조용히 죽는 경우를 잡기 위한 창구.
 * 에러가 하나라도 쌓이면 버튼에 빨간 배지가 붙는다.
 */
export function DebugPanel(): ReactElement | null {
  const entries = useSyncExternalStore(subscribe, getEntries);
  const [open, setOpen] = useState(false);

  if (!import.meta.env.DEV) return null;

  const errorCount = entries.filter((e) => e.level === "error").length;

  return (
    <div
      style={{
        position: "fixed",
        left: theme.space[3],
        bottom: `calc(${theme.space[3]}px + env(safe-area-inset-bottom))`,
        zIndex: 50,
        fontFamily: theme.font.ui,
      }}
    >
      {open && (
        <section
          aria-label="디버그 로그"
          style={{
            width: "min(92vw, 420px)",
            maxHeight: "45vh",
            overflowY: "auto",
            marginBottom: theme.space[2],
            padding: theme.space[3],
            borderRadius: theme.radius.m,
            border: `1px solid ${theme.color.sub}`,
            background: theme.color.bg,
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: theme.space[2],
            }}
          >
            <strong style={{ fontSize: 13, color: theme.color.ink }}>
              디버그 로그 ({entries.length})
            </strong>
            <button
              type="button"
              onClick={clearEntries}
              style={{
                border: "none",
                background: "transparent",
                color: theme.color.accent,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              비우기
            </button>
          </header>

          {entries.length === 0 ? (
            <p style={{ fontSize: 12, color: theme.color.asymptote }}>기록 없음</p>
          ) : (
            <ol style={{ display: "grid", gap: theme.space[1], listStyle: "none" }}>
              {entries
                .slice()
                .reverse()
                .map((entry) => (
                  <li
                    key={entry.id}
                    style={{
                      fontSize: 12,
                      lineHeight: 1.45,
                      color: theme.color.ink,
                      borderLeft: `2px solid ${LEVEL_COLOR[entry.level]}`,
                      paddingLeft: theme.space[2],
                    }}
                  >
                    <span style={{ color: LEVEL_COLOR[entry.level] }}>[{entry.source}]</span>{" "}
                    {entry.message}
                    {entry.detail && (
                      <pre
                        style={{
                          margin: `${theme.space[1]}px 0 0`,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          color: theme.color.asymptote,
                          fontSize: 11,
                        }}
                      >
                        {entry.detail}
                      </pre>
                    )}
                  </li>
                ))}
            </ol>
          )}
        </section>
      )}

      <button
        type="button"
        aria-label={open ? "디버그 패널 닫기" : "디버그 패널 열기"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "relative",
          width: 36,
          height: 36,
          display: "grid",
          placeItems: "center",
          borderRadius: "50%",
          border: `1px solid ${theme.color.sub}`,
          background: theme.color.bg,
          color: theme.color.ink,
          cursor: "pointer",
          opacity: 0.55,
        }}
      >
        {open ? <X size={16} strokeWidth={1.5} /> : <Bug size={16} strokeWidth={1.5} />}
        {errorCount > 0 && !open && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 14,
              height: 14,
              padding: "0 3px",
              borderRadius: 7,
              background: theme.color.danger,
              color: "#fff",
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {errorCount}
          </span>
        )}
      </button>
    </div>
  );
}
