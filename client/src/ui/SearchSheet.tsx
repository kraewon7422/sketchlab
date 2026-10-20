import { Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { aiConfigured } from "../ai/settings";
import { theme } from "../render/theme";
import { aiSearch, buildIndex, jumpTo, localSearch, type SearchEntry, type SearchHit } from "../store/noteSearch";

/**
 * 노트에서 찾기 — 낱말·수학 동의어로 바로 (이 기기에서), 말로 물으면 "AI로 찾기" (설정했을 때).
 * 결과를 누르면 그 쪽·그 자리로 가서 골라 둔다.
 */
export function SearchSheet({ onClose }: { onClose: () => void }): ReactElement {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<SearchEntry[] | null>(null);
  const [aiHits, setAiHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ai = aiConfigured();

  useEffect(() => {
    inputRef.current?.focus();
    void buildIndex().then(setIndex);
  }, []);

  const local = useMemo(() => (index ? localSearch(index, query) : []), [index, query]);
  const hits = aiHits ?? local;

  const askAi = async () => {
    if (!index || !query.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      setAiHits(await aiSearch(index, query));
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI로 찾지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="노트에서 찾기"
      className="sl-sheet-up"
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        top: `calc(${theme.space[2]}px + env(safe-area-inset-top) + 48px)`,
        width: "min(560px, calc(100vw - 16px))",
        maxHeight: "min(70vh, 640px)",
        display: "flex",
        flexDirection: "column",
        background: theme.color.bg,
        borderRadius: 16,
        boxShadow: "0 8px 32px rgba(26,26,26,0.16)",
        border: `1px solid ${theme.color.sub}`,
        zIndex: 30,
        overflow: "hidden",
        wordBreak: "keep-all",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ai && local.length === 0) void askAi();
        }}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, borderBottom: `1px solid ${theme.color.sub}` }}
      >
        <Search size={18} color={theme.color.asymptote} style={{ flex: "0 0 auto" }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAiHits(null);
            setError(null);
          }}
          placeholder="적분, 행렬, numpy, 연쇄법칙 했던 곳…"
          aria-label="찾을 말"
          style={{ flex: 1, minWidth: 0, height: 36, border: "none", outline: "none", fontSize: 16, background: "transparent" }}
        />
        {ai && (
          <button
            type="button"
            onClick={() => void askAi()}
            disabled={!query.trim() || busy}
            title="말로 물어보기 (AI)"
            style={{ flex: "0 0 auto", height: 34, padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 4, border: "none", borderRadius: 999, background: aiHits ? theme.color.accent : theme.color.selection, color: aiHits ? "#fff" : theme.color.accent, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", opacity: !query.trim() || busy ? 0.5 : 1 }}
          >
            <Sparkles size={14} /> {busy ? "찾는 중…" : "AI로 찾기"}
          </button>
        )}
        <button type="button" aria-label="닫기" onClick={onClose} style={{ flex: "0 0 auto", width: 36, height: 36, border: "none", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }}>
          <X size={18} />
        </button>
      </form>
      <div style={{ overflowY: "auto", padding: 6 }}>
        {error && <div style={{ padding: 10, fontSize: 13.5, color: theme.color.danger }}>{error}</div>}
        {!index ? (
          <div style={{ padding: 12, fontSize: 13.5, color: theme.color.asymptote }}>쪽들을 모으는 중…</div>
        ) : !query.trim() ? (
          <div style={{ padding: 12, fontSize: 13.5, lineHeight: 1.6, color: theme.color.asymptote }}>
            이 노트의 글·수식·코드·표·그래프에서 찾아요 ({index.length}개). 손글씨는 ✨로 알아본 것만 찾을 수 있어요.
            {ai ? " 말로 물어보려면 AI로 찾기를 누르세요." : ""}
          </div>
        ) : hits.length === 0 ? (
          <div style={{ padding: 12, fontSize: 13.5, color: theme.color.asymptote }}>찾지 못했어요{ai && !aiHits ? " · AI로 찾기를 눌러 말로 물어보세요" : ""}</div>
        ) : (
          hits.map((h) => (
            <button
              key={`${h.pageId}/${h.itemId}`}
              type="button"
              onClick={() => {
                onClose();
                void jumpTo(h);
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: 10, background: "transparent", cursor: "pointer" }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 12, color: theme.color.asymptote }}>
                <span style={{ color: theme.color.accent, fontWeight: 600, whiteSpace: "nowrap" }}>{h.pageNo}쪽</span>
                {h.pageTitle !== `${h.pageNo}쪽` && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{h.pageTitle}</span>}
                <span style={{ whiteSpace: "nowrap" }}>· {h.label}</span>
              </div>
              <div style={{ fontSize: 14, color: theme.color.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: h.label === "코드" || h.label === "수식" ? "Consolas, monospace" : undefined }}>{snippet(h.text, query)}</div>
              {h.why && <div style={{ fontSize: 12, color: theme.color.accent }}>{h.why}</div>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** 맞은 낱말 근처만 보여 준다 */
function snippet(text: string, query: string): string {
  const t = query.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const i = t ? text.toLowerCase().indexOf(t) : -1;
  if (i < 30) return text.slice(0, 120);
  return `…${text.slice(i - 20, i + 100)}`;
}
