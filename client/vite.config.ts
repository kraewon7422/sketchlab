import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

/**
 * D4 — secure context 강제.
 *
 * navigator.clipboard / navigator.share / crypto.subtle 은 HTTPS 또는 localhost
 * 에서만 동작한다. 태블릿 실기 테스트는 LAN IP로 접속하므로 http면 내보내기가
 * 전부 죽는다. 그래서 개발 서버를 기본 HTTPS로 띄운다.
 *
 * ── 스펙 §4/§12.3에서 지정한 vite-plugin-mkcert 대신 basic-ssl을 쓰는 이유 ──
 * mkcert는 OS 신뢰 저장소에 로컬 CA를 설치하며 Windows "보안 경고" 모달을 띄운다.
 * 그런데 그렇게 얻는 이득은 "이 PC의 브라우저에서 경고가 안 뜬다"뿐이다.
 * 정작 목표인 태블릿은 rootCA.pem을 따로 옮겨 설치해야 하고(iPad는 프로파일
 * 설치 + 인증서 신뢰 설정까지 별도 단계), 그 과정이 브라우저 경고를 한 번
 * 넘기는 것보다 훨씬 번거롭다.
 *
 * basic-ssl은 OS를 건드리지 않고 자체 서명 인증서만 만든다. 기기에서 최초 1회
 * "고급 → 계속"을 누르면 그 다음부터 secure context가 정상 성립하므로
 * clipboard·share·crypto.subtle 전부 동작한다 — D4의 목적은 그대로 달성된다.
 *
 * 데스크톱 개발은 http://localhost 도 이미 secure context라 문제없다.
 * HTTPS가 방해될 때만 SKETCHLAB_NO_HTTPS=1 로 끌 수 있다.
 */
const httpsEnabled = process.env["SKETCHLAB_NO_HTTPS"] !== "1";

export default defineConfig({
  // GitHub Pages는 https://<user>.github.io/sketchlab/ 아래에서 서빙한다.
  // 배포 워크플로가 SKETCHLAB_BASE=/sketchlab/ 로 빌드하고, 로컬은 기본값 "/" 그대로.
  base: process.env["SKETCHLAB_BASE"] ?? "/",
  plugins: [
    react(),
    tailwindcss(),
    ...(httpsEnabled ? [basicSsl() as PluginOption] : []),
  ],
  server: {
    // 태블릿·폰이 LAN IP로 붙을 수 있도록 0.0.0.0 바인딩
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    // 성능 예산 §4: 초기 JS(three 제외) < 250KB gzip.
    // 넘으면 경고가 뜨도록 임계값을 예산에 맞춰 낮춰 둔다.
    chunkSizeWarningLimit: 250,
  },
});
