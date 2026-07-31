import express from "express";

/**
 * SketchLab API 프록시.
 *
 * P0에서는 헬스체크만 있다. 실제 역할은 P3에서 붙는다:
 *   - ANTHROPIC_API_KEY를 서버에만 두고 (프론트 노출 금지, §4)
 *   - Tool Use 강제 출력으로 스케치 → RecognizeResult 변환 (§7.3)
 *   - trust proxy + CORS allowlist + rate limit + 3MB 상한 (§7.5)
 *
 * 인식 모델은 claude-opus-5 를 쓴다 — 손그림 → 구조화 IR 변환 정확도가
 * 제품 품질을 그대로 결정하는 지점이라 여기서 아끼지 않는다.
 */

const PORT = Number(process.env["PORT"] ?? 8787);

export function createApp(): express.Express {
  const app = express();

  // D5: 프록시/CDN 뒤에서 rate limit이 전 사용자를 한 IP로 묶지 않도록.
  // P3에서 rate limit을 붙일 때 이 설정이 선행돼야 의미가 있다.
  app.set("trust proxy", 1);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, phase: "P0", service: "sketchlab-server" });
  });

  return app;
}

// 테스트에서 import할 때는 서버를 띄우지 않는다.
if (process.env["NODE_ENV"] !== "test") {
  createApp().listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });
}
