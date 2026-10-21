import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
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

/**
 * 7단계 코드 블록의 Python(Pyodide) — 기본 파이썬 파일을 앱과 함께 둔다 (<base>/pyodide/…).
 * 개발 서버에서는 node_modules에서 바로 내주고, 빌드에서는 dist/pyodide/로 복사한다.
 * (numpy 같은 꾸러미는 처음 import할 때 CDN에서 — pyWorker.ts)
 */
const PYODIDE_FILES = ["pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
const pyodideDir = path.dirname(createRequire(import.meta.url).resolve("pyodide/package.json"));
function pyodideAssets(): PluginOption {
  return {
    name: "sketchlab-pyodide-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /\/pyodide\/([\w.-]+)(?:\?.*)?$/.exec(req.url ?? "");
        const file = m?.[1];
        if (!file || !PYODIDE_FILES.includes(file)) return next();
        res.setHeader("Content-Type", file.endsWith(".wasm") ? "application/wasm" : file.endsWith(".json") ? "application/json" : file.endsWith(".zip") ? "application/zip" : "text/javascript");
        fs.createReadStream(path.join(pyodideDir, file)).pipe(res);
      });
    },
    generateBundle() {
      for (const file of PYODIDE_FILES) this.emitFile({ type: "asset", fileName: `pyodide/${file}`, source: fs.readFileSync(path.join(pyodideDir, file)) });
    },
  };
}

export default defineConfig({
  // GitHub Pages는 https://<user>.github.io/sketchlab/ 아래에서 서빙한다.
  // 배포 워크플로가 SKETCHLAB_BASE=/sketchlab/ 로 빌드하고, 로컬은 기본값 "/" 그대로.
  base: process.env["SKETCHLAB_BASE"] ?? "/",
  plugins: [
    react(),
    tailwindcss(),
    ...(httpsEnabled ? [basicSsl() as PluginOption] : []),
    pyodideAssets(),
  ],
  // 코드 블록 작업자(jsWorker·pyWorker)는 ES 모듈 작업자
  worker: { format: "es" },
  // Pyodide는 스스로 파일을 불러오는 꾸러미라 미리 묶지 않는다
  optimizeDeps: { exclude: ["pyodide"] },
  // C·C++ 실행기(JSCPP → printf 꾸러미)가 Node의 stream을 찾는다 — 브라우저에선 빈 Stream으로 (code/streamShim.ts)
  resolve: { alias: { stream: path.resolve(path.dirname(createRequire(import.meta.url).resolve("./package.json")), "src/code/streamShim.ts") } },
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
