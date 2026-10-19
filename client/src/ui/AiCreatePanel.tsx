import { useRef, useState, type ReactElement } from "react";
import { AiError } from "../ai/client";
import { aiConfigured, modelName } from "../ai/settings";
import { markFresh } from "../render/Shape2DView";
import { theme } from "../render/theme";
import { sessionStore } from "../store/session";
import { freeSpot, type Area } from "./placement";

/**
 * ƒ 시트의 "AI에게 부탁" 탭 — 말로 부탁하면 분자·반응식·그래프를 페이지에 놓는다.
 * 무엇을 그릴지는 AI가, 그림 자체는 앱이 (분자는 PubChem·RDKit으로 확인한 구조).
 */

const EXAMPLES = ["에탄올을 산화하면?", "뷰테인의 구조 이성질체 모두", "벤젠의 나이트로화 반응식", "감쇠 진동 그래프", "아스피린 합성 반응", "y=sin x와 y=cos x"];

export function AiCreatePanel({ area, onClose, onOpenSettings }: { area: Area; onClose: () => void; onOpenSettings?: () => void }): ReactElement {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ready = aiConfigured();

  const run = async (request: string) => {
    const q = request.trim();
    if (!q || busy) return;
    setBusy(true);
    setStatus({ ok: true, text: `AI가 생각하는 중… (${modelName()})` });
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { planFromPrompt, planToObjects } = await import("../ai/create");
      const plan = await planFromPrompt(q, ac.signal);
      setStatus({ ok: true, text: "구조를 확인하고 그리는 중…" });
      const maxW = Math.min(520, area.width - theme.space[6] * 2);
      const { objects, skipped } = await planToObjects(plan, maxW);
      if (objects.length === 0) {
        setStatus({ ok: false, text: skipped.length ? `그릴 수 있는 것이 없었어요 (${skipped.join(", ")})` : "그릴 것을 찾지 못했어요 · 다르게 물어봐 주세요" });
        return;
      }
      for (const o of objects) {
        const { x, y } = freeSpot(o.width, o.height, area);
        const id = sessionStore.getState().addObject(o.ir, { x, y, scale: o.scale }, { minX: x, minY: y, maxX: x + o.width, maxY: y + o.height });
        markFresh(id);
      }
      // 설명 한두 줄도 글자로 함께 놓는다
      if (plan.note.trim()) {
        const note = plan.note.trim();
        const w = Math.min(area.width - theme.space[6] * 2, note.length * 9 + 16);
        const lines = Math.ceil((note.length * 9) / Math.max(1, w));
        const { x, y } = freeSpot(w, lines * 24, area);
        const id = sessionStore.getState().addObject(
          { version: objects[0]?.ir.version ?? "4.0", confidence: 0.85, source: "vlm", kind: "text", data: { text: wrap(note, Math.floor(w / 9)), fontSize: 15, color: theme.color.asymptote } },
          { x, y, scale: 1 },
          { minX: x, minY: y, maxX: x + w, maxY: y + lines * 24 },
        );
        markFresh(id);
      }
      onClose();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setStatus({ ok: false, text: "취소했어요" });
      else setStatus({ ok: false, text: e instanceof AiError ? e.message : "AI에게 묻다가 문제가 생겼어요" });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  if (!ready) {
    return (
      <div style={{ padding: `${theme.space[4]}px 0`, fontSize: 14, lineHeight: 1.7 }}>
        AI가 연결되어 있지 않아요. 🤖 <b>AI 설정</b>에서 OpenRouter 키를 넣거나 내 PC(Ollama)를 연결해 주세요.
        {onOpenSettings && (
          <div style={{ marginTop: theme.space[3] }}>
            <button
              type="button"
              onClick={onOpenSettings}
              style={{ height: theme.touch.minTarget, padding: `0 ${theme.space[4]}px`, border: "none", borderRadius: theme.radius.s, background: theme.color.accent, color: theme.color.bg, fontSize: 15, cursor: "pointer" }}
            >
              AI 설정 열기
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(text);
        }}
        style={{ display: "flex", gap: theme.space[2] }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 에탄올을 산화하면?  부테인 이성질체  감쇠 진동 그래프"
          aria-label="AI에게 부탁할 내용"
          disabled={busy}
          style={{
            flex: 1,
            minWidth: 0,
            height: theme.touch.minTarget,
            padding: `0 ${theme.space[3]}px`,
            border: `1px solid ${theme.color.sub}`,
            borderRadius: theme.radius.s,
            fontSize: 16,
            userSelect: "text",
            WebkitUserSelect: "text",
          }}
        />
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            style={{ height: theme.touch.minTarget, padding: `0 ${theme.space[4]}px`, border: `1px solid ${theme.color.sub}`, borderRadius: theme.radius.s, background: theme.color.bg, fontSize: 15, cursor: "pointer" }}
          >
            취소
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim()}
            style={{
              height: theme.touch.minTarget,
              padding: `0 ${theme.space[4]}px`,
              border: "none",
              borderRadius: theme.radius.s,
              background: theme.color.accent,
              color: theme.color.bg,
              fontSize: 15,
              opacity: text.trim() ? 1 : 0.4,
              cursor: text.trim() ? "pointer" : "not-allowed",
            }}
          >
            그리기
          </button>
        )}
      </form>
      <p style={{ margin: `${theme.space[2]}px 0 0`, minHeight: 20, fontSize: 13, textAlign: "center", color: status && !status.ok ? theme.color.danger : theme.color.asymptote }}>
        {status?.text ?? "분자·반응식·그래프를 말로 부탁하세요. 분자 구조는 PubChem·RDKit으로 확인해서 그려요."}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: theme.space[2], marginTop: theme.space[3] }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={busy}
            onClick={() => {
              setText(ex);
              void run(ex);
            }}
            style={{
              minHeight: 36,
              padding: `${theme.space[1]}px ${theme.space[3]}px`,
              border: `1px solid ${theme.color.sub}`,
              borderRadius: 999,
              background: theme.color.bg,
              color: theme.color.ink,
              fontSize: 13,
              opacity: busy ? 0.5 : 1,
              cursor: "pointer",
            }}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 대충 n글자마다 줄바꿈 (공백에서) */
function wrap(s: string, n: number): string {
  const out: string[] = [];
  let line = "";
  for (const word of s.split(/\s+/)) {
    if (line && (line + " " + word).length > n) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out.join("\n");
}
