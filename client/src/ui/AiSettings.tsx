import { X } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { AiError, OPENROUTER_MODELS, loadAiSettings, ollamaModels, saveAiSettings, testConnection, type AiSettings as Settings, type Provider } from "../ai/client";
import { theme } from "../render/theme";

/**
 * AI 설정 (바텀시트) — 어디로 물어볼지, 어떤 모델로.
 *   OpenRouter: 키를 붙여 넣고 모델 고르기 (무료 모델 있음)
 *   내 PC (Ollama): 주소와 설치된 모델
 * [연결 테스트]로 실제로 한 번 물어보고 걸린 시간을 보여 준다.
 */
export default function AiSettings({ onClose }: { onClose: () => void }): ReactElement {
  const [s, setS] = useState<Settings>(loadAiSettings);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [localModels, setLocalModels] = useState<string[] | null>(null);

  const update = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveAiSettings(next);
    setStatus(null);
  };

  useEffect(() => {
    if (s.provider !== "ollama") return;
    let alive = true;
    ollamaModels(s.ollamaUrl).then(
      (m) => alive && setLocalModels(m),
      () => alive && setLocalModels(null),
    );
    return () => {
      alive = false;
    };
  }, [s.provider, s.ollamaUrl]);

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const r = await testConnection(s);
      setStatus({ ok: true, text: `연결됐어요 · ${(r.ms / 1000).toFixed(1)}초 · 답: ${r.reply}` });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof AiError ? e.message : "연결하지 못했어요" });
    } finally {
      setTesting(false);
    }
  };

  const field = {
    width: "100%",
    height: theme.touch.minTarget,
    padding: `0 ${theme.space[3]}px`,
    border: `1px solid ${theme.color.sub}`,
    borderRadius: theme.radius.s,
    fontSize: 15,
    background: theme.color.bg,
    color: theme.color.ink,
    boxSizing: "border-box" as const,
    userSelect: "text" as const,
  };
  const label = { fontSize: 13, color: theme.color.asymptote, margin: `${theme.space[3]}px 0 ${theme.space[1]}px` };

  const providerButton = (p: Provider, text: string) => (
    <button
      type="button"
      aria-pressed={s.provider === p}
      onClick={() => update({ provider: p })}
      style={{
        flex: 1,
        height: theme.touch.minTarget,
        border: `1px solid ${s.provider === p ? theme.color.accent : theme.color.sub}`,
        borderRadius: theme.radius.s,
        background: s.provider === p ? theme.color.selection : theme.color.bg,
        color: s.provider === p ? theme.color.accent : theme.color.ink,
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      {text}
    </button>
  );

  return (
    <div
      role="dialog"
      className="sl-sheet-up"
      aria-label="AI 설정"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        maxHeight: "80%",
        overflowY: "auto",
        background: theme.color.bg,
        borderTop: `1px solid ${theme.color.sub}`,
        borderRadius: `${theme.radius.sheet}px ${theme.radius.sheet}px 0 0`,
        boxShadow: "0 -8px 32px rgba(26,26,26,0.12)",
        padding: `${theme.space[4]}px ${theme.space[4]}px calc(${theme.space[4]}px + env(safe-area-inset-bottom))`,
        zIndex: 20,
        touchAction: "auto",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: theme.space[2] }}>
          <strong style={{ fontSize: 15 }}>AI 설정</strong>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            style={{ width: theme.touch.minTarget, height: theme.touch.minTarget, border: "none", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }}
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: theme.color.ink }}>
          손글씨(글자·수식·화학)를 알아보고, 말로 부탁한 분자·반응식·그래프를 그릴 때 씁니다. 키와 주소는 이 기기에만 저장돼요.
        </p>

        <div style={{ display: "flex", gap: theme.space[2], marginTop: theme.space[3] }}>
          {providerButton("openrouter", "OpenRouter (클라우드)")}
          {providerButton("ollama", "내 PC (Ollama)")}
        </div>

        {s.provider === "openrouter" ? (
          <>
            <div style={label}>
              API 키 — <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>에서 만들기
            </div>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-or-…"
              value={s.openrouterKey}
              onChange={(e) => update({ openrouterKey: e.target.value })}
              style={field}
            />
            <div style={label}>모델 (그림을 읽을 수 있는 모델)</div>
            <select
              value={OPENROUTER_MODELS.some((m) => m.id === s.openrouterModel) ? s.openrouterModel : "__custom"}
              onChange={(e) => e.target.value !== "__custom" && update({ openrouterModel: e.target.value })}
              style={field}
            >
              {OPENROUTER_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              <option value="__custom">직접 입력…</option>
            </select>
            <input
              spellCheck={false}
              value={s.openrouterModel}
              onChange={(e) => update({ openrouterModel: e.target.value.trim() })}
              aria-label="모델 ID"
              style={{ ...field, marginTop: theme.space[2], fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 13 }}
            />
          </>
        ) : (
          <>
            <div style={label}>PC 주소 (태블릿에서는 HTTPS 주소가 필요해요)</div>
            <input spellCheck={false} value={s.ollamaUrl} onChange={(e) => update({ ollamaUrl: e.target.value.trim() })} style={field} />
            <div style={label}>모델</div>
            {localModels && localModels.length > 0 ? (
              <select value={s.ollamaModel} onChange={(e) => update({ ollamaModel: e.target.value })} style={field}>
                {!localModels.includes(s.ollamaModel) && <option value={s.ollamaModel}>{s.ollamaModel}</option>}
                {localModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input spellCheck={false} value={s.ollamaModel} onChange={(e) => update({ ollamaModel: e.target.value.trim() })} style={field} />
            )}
            <div style={{ ...label, marginTop: theme.space[1] }}>손글씨를 읽으려면 그림을 읽는 모델(qwen3.5, gemma4 등)을 고르세요.</div>
          </>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: theme.space[3], marginTop: theme.space[4] }}>
          <button
            type="button"
            onClick={() => void test()}
            disabled={testing}
            style={{
              height: theme.touch.minTarget,
              padding: `0 ${theme.space[4]}px`,
              border: "none",
              borderRadius: theme.radius.s,
              background: theme.color.accent,
              color: theme.color.bg,
              fontSize: 15,
              opacity: testing ? 0.5 : 1,
              cursor: "pointer",
            }}
          >
            {testing ? "확인 중…" : "연결 테스트"}
          </button>
          {status && <span style={{ fontSize: 13, color: status.ok ? theme.color.ink : theme.color.danger }}>{status.text}</span>}
        </div>
      </div>
    </div>
  );
}
