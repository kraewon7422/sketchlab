import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { installGlobalHandlers } from "./debug";
import { applyThemeVars } from "./render/theme";
import "./index.css";

/**
 * 부팅 순서 — 각 줄에 이유가 있다.
 *
 * 1. 전역 에러 핸들러 먼저. 이후 단계에서 터지는 것도 디버그 패널에 남게.
 * 2. 테마 변수를 첫 페인트 전에 동기로 주입. 색이 늦게 들어오는 깜빡임 방지.
 * 3. 그 다음에야 React 마운트.
 *
 * P1에서 immer의 enablePatches()가 여기 2번과 3번 사이에 들어간다 (D6).
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
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
