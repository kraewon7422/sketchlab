import { useEffect, useState, type ReactElement } from "react";
import { App } from "./App";
import { theme } from "./render/theme";
import { onDbBlocked } from "./store/db";
import { useLibrary } from "./store/library";
import { Library } from "./ui/Library";

/**
 * 맨 위 화면 고르기 — 노트 보관함 ↔ 노트(편집 화면).
 * 노트마다 편집 화면을 새로 그린다 (key) — 도구·확대 같은 그 노트의 화면 상태가 다른 노트로 새지 않게.
 */
export function Root(): ReactElement {
  const ready = useLibrary((s) => s.ready);
  const open = useLibrary((s) => s.openNoteId);
  if (!ready) return <Starting />;
  return open ? <App key={open} /> : <Library />;
}

/** 불러오는 동안 — 예전 버전이 저장소를 쥐고 있으면 빈 화면 대신 무엇을 하면 되는지 알려 준다 */
function Starting(): ReactElement {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => onDbBlocked(setBlocked), []);
  return (
    <div style={{ height: "100dvh", background: "#F4F5F7", display: "grid", placeItems: "center", padding: 16 }}>
      {blocked && (
        <div role="alert" style={{ maxWidth: 440, padding: 20, borderRadius: 16, background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,.08)", color: theme.color.ink, fontSize: 15, lineHeight: 1.6, wordBreak: "keep-all" }}>
          <b style={{ fontSize: 17 }}>새 버전으로 바꾸는 중이에요</b>
          <p style={{ margin: "8px 0" }}>저장된 노트를 새 형식으로 옮기려는데, 예전 버전의 SketchLab이 다른 탭이나 창(설치한 앱 창 포함)에 열려 있어 기다리고 있어요.</p>
          <p style={{ margin: "8px 0" }}>
            <b>다른 SketchLab 탭·창을 모두 닫으면</b> 이 화면이 저절로 열려요. 노트는 안전해요.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: theme.color.asymptote }}>그래도 안 되면: Chrome에서 Shift + Esc → SketchLab(kraewon7422.github.io) 줄 → 프로세스 종료 → 이 페이지 새로 고침</p>
        </div>
      )}
    </div>
  );
}
