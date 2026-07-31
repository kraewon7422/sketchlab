import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/**
 * ESLint 플랫 설정 — 워크스페이스 전체 공용.
 *
 * 타입 인지(type-aware) 규칙은 아직 켜지 않았다. 워크스페이스 3개 + 설정 파일들의
 * 프로젝트 귀속을 맞추는 비용 대비 이득이 P0 시점엔 작고, 타입 오류는 typecheck가
 * 이미 전부 잡는다. 인식 파이프라인이 생기는 P3 전에 켜는 것을 검토한다.
 */
export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // 브라우저 코드 + React 훅 규칙
  //
  // 플러그인의 configs.recommended 는 eslintrc 형식인 데다 v7부터 16개 규칙을
  // 한꺼번에 켠다. 무엇이 왜 켜졌는지 보이도록 핵심 두 개만 명시적으로 등록한다.
  // rules-of-hooks 는 조건부 훅 호출 같은 실제 런타임 버그를 잡고,
  // exhaustive-deps 는 P1의 포인터 이벤트 구독에서 오래된 클로저를 막는다.
  {
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Node 코드 (서버, 빌드 스크립트, 설정 파일)
  {
    files: ["server/**/*.ts", "scripts/**/*.mjs", "*.config.{ts,js}", "client/vite.config.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // 공용 규칙
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    rules: {
      // 규약 §2-6: 에러를 삼키지 않는다. 빈 catch는 실수로 만들기 쉬우므로 막는다.
      "no-empty": ["error", { allowEmptyCatch: false }],
      // 미사용 변수는 typecheck(noUnusedLocals)와 중복이지만,
      // _ 접두사 예외를 여기서만 표현할 수 있다.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // 규약 §5: 외부 입력은 경계에서 zod로 검증한다. any로 빠져나가지 못하게.
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error", "info", "log"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },

  // 테스트는 조금 느슨하게
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
