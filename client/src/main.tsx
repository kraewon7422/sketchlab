import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root";
import { ErrorBoundary } from "./ErrorBoundary";
import { debugLog, installGlobalHandlers } from "./debug";
import { applyThemeVars } from "./render/theme";
import { startPersistence } from "./store/persistence";
import { startPaperAutoExtend } from "./store/pageActions";
import "./index.css";
// 글 상자 글씨체 (명조·손글씨) — @font-face만 등록, 글꼴 조각은 그 글씨체로 쓴 글자가 있을 때만 받는다
import "@fontsource/nanum-myeongjo/400.css";
import "@fontsource/nanum-myeongjo/700.css";
import "@fontsource/nanum-pen-script/400.css";

/**
 * 부팅 순서 — 각 줄에 이유가 있다.
 *
 * 1. 전역 에러 핸들러 먼저. 이후 단계에서 터지는 것도 디버그 패널에 남게.
 * 2. 테마 변수를 첫 페인트 전에 동기로 주입. 색이 늦게 들어오는 깜빡임 방지.
 * 3. React 마운트.
 * 4. 저장된 세션 복원 + 저장 구독 시작 (비동기 — 화면을 막지 않는다).
 *
 * immer의 enablePatches()는 store/session.ts 최상단에서 호출된다 (D6).
 * 여기서 부르지 않는 이유: 스토어를 import 하는 모든 경로에서 자동으로 보장되어야
 * "부팅 코드에 한 줄 넣는 걸 깜빡했다"가 불가능해지기 때문이다.
 */
installGlobalHandlers();
applyThemeVars(document.documentElement);

const container = document.getElementById("root");
if (!container) {
  // index.html이 깨졌다는 뜻. 조용히 죽지 않고 이유를 남긴다 (규약 §2-6).
  throw new Error("#root 엘리먼트를 찾지 못했습니다. index.html을 확인하세요.");
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary area="app">
      <Root />
    </ErrorBoundary>
  </StrictMode>,
);

// 복원이 늦어도 화면은 이미 떠 있다. 실패해도 앱은 계속 쓸 수 있어야 하므로
// 던지지 않고 로그만 남긴다 (규약 §2-6 — 대신 조용히 넘어가지도 않는다).
// 앱은 노트 보관함에서 시작한다 — 노트를 열 때 그 노트의 쪽을 불러온다 (noteActions.openNote)
void startPersistence()
  .then(() => import("./store/autoBackup").then((m) => m.loadBackupState()))
  // 동기화 연결 상태 (Google Drive — 연결하지 않았으면 아무것도 내려받지 않는다)
  .then(() => import("./sync/sync").then((m) => m.loadSyncState()))
  .catch((error: unknown) => {
    debugLog.error("persistence", "저장소 초기화에 실패했습니다", error);
  });
// 종이 모드: 마지막 장에 쓰기 시작하면 빈 장을 하나 더
startPaperAutoExtend();

// 오프라인 지원 — 배포본에서만 (개발 서버에서 캐시가 끼면 수정이 안 보인다)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
      debugLog.warn("pwa", "오프라인 지원을 켜지 못했습니다", error);
    });
  });
}
