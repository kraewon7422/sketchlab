import { defineConfig } from "vitest/config";

/**
 * 워크스페이스 전체의 단위 테스트를 한 번에 돌린다.
 *
 * 현재는 전부 순수 함수 테스트라 node 환경으로 충분하다.
 * P1에서 DOM이 필요한 테스트(포인터 이벤트 등)가 생기면
 * projects로 나눠 client만 jsdom 환경을 주는 방식으로 확장한다.
 * 브라우저 실동작 검증은 Vitest가 아니라 Playwright 담당 (§4).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["{shared,client,server}/src/**/*.test.ts"],
    passWithNoTests: false,
  },
});
