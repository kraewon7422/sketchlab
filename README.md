# SketchLab

손으로 그린 스케치를 수학·과학 표준 표현으로 바꾸고, 인터랙티브 3D/그래프로 보여준 뒤,
노트 앱(삼성노트·GoodNotes)에 붙여넣을 수 있게 내보내는 크로스플랫폼 웹 도구.

전체 설계는 [`docs/MASTERSPEC_v3.md`](docs/MASTERSPEC_v3.md)에 있습니다. **이 저장소의 모든 작업은
그 문서의 Phase 순서를 따릅니다.**

현재 상태: **P0 완료** (뼈대 + CI + HTTPS)

---

## 빠른 시작

```bash
npm install          # 최초 1회
npm run dev          # 클라이언트만 (개발 중 대부분 이걸로 충분)
npm run dev:all      # 클라이언트 + API 서버 함께
```

`npm run dev` 를 실행하면 이런 주소가 나옵니다.

```
➜  Local:   https://localhost:5173/
➜  Network: https://192.168.x.x:5173/   ← 태블릿·폰은 이 주소로 접속
```

### 태블릿·폰에서 열기 (중요)

1. PC와 **같은 Wi-Fi**에 연결합니다.
2. 위의 `Network` 주소를 기기 브라우저에 입력합니다.
3. **"연결이 비공개로 설정되어 있지 않습니다"** 경고가 뜹니다 → `고급` → `계속`(또는 `안전하지 않음으로 이동`)
   을 누릅니다. 기기당 최초 1회만 하면 됩니다.
4. `https://<주소>/env-check.html` 을 열어 전부 초록인지 확인합니다.

> **왜 경고를 넘겨야 하나요?**
> 클립보드 복사·공유 시트·SHA-256 해시는 브라우저가 **secure context**(HTTPS 또는 localhost)에서만
> 허용합니다. 개발 서버는 자체 서명 인증서로 HTTPS를 켜므로 브라우저가 경고를 띄우지만,
> 한 번 넘기면 그 주소는 정상적인 secure context가 됩니다 — 내보내기가 전부 동작합니다.
> `http://<LAN IP>` 로 접속하면 내보내기가 **전부 조용히 실패**합니다 (마스터스펙 D4 / 함정 #21).

HTTPS를 꺼야 할 일이 있으면 `SKETCHLAB_NO_HTTPS=1 npm run dev` 로 실행합니다.
(데스크톱은 `http://localhost` 도 secure context라 개발에 지장이 없습니다.)

---

## 명령어

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 클라이언트 개발 서버 (HTTPS, LAN 노출) |
| `npm run dev:server` | API 서버만 (`http://localhost:8787`) |
| `npm run dev:all` | 둘 다 함께 |
| `npm run build` | 클라이언트 프로덕션 빌드 → `client/dist` |
| `npm run lint` | ESLint |
| `npm run typecheck` | 워크스페이스 전체 타입 검사 |
| `npm test` | Vitest 단위 테스트 |
| `npm run ci` | lint + typecheck + test 한 번에 |

---

## 구조

```
sketchlab/
├── docs/MASTERSPEC_v3.md   설계 원본 — 판단이 갈릴 때 여기가 기준
├── shared/                 클라이언트·서버 공용 계약
│   └── src/ir.ts           Scene IR (zod 판별 유니온) — 인식기와 렌더러의 유일한 접점
├── client/                 웹 앱
│   ├── public/env-check.html   기기별 secure context 점검 페이지
│   └── src/
│       ├── main.tsx        부팅 순서 (전역 에러 핸들러 → 테마 주입 → React)
│       ├── App.tsx         화면 셸 (툴바 / 캔버스 / FAB)
│       ├── debug.ts        에러·진단 수집소 — 에러를 삼키지 않기 위한 창구
│       ├── ErrorBoundary.tsx
│       ├── DebugPanel.tsx  개발 전용 진단 패널
│       └── render/theme.ts 디자인 토큰 단일 진실
├── server/src/index.ts     API 프록시 (P3에서 VLM 인식 담당)
└── scripts/dev-all.mjs
```

### 어디를 고쳐야 하는지

| 바꾸고 싶은 것 | 파일 |
|---|---|
| 색·간격·모션·터치 크기 | `client/src/render/theme.ts` (**여기만**. 컴포넌트 하드코딩 금지) |
| 인식 결과의 데이터 형태 | `shared/src/ir.ts` |
| 화면 배치 | `client/src/App.tsx` |
| 에러가 어디에 남는지 | `client/src/debug.ts` |
| 서버 API | `server/src/index.ts` |

---

## 환경 변수

`.env.example` 을 `.env` 로 복사해 채웁니다. **서버만 읽습니다** — API 키가 클라이언트 번들에
들어가면 안 됩니다.

`ANTHROPIC_API_KEY` 는 P3(VLM 인식)부터 필요합니다. P0~P2는 없어도 동작합니다.

---

## 개발 규칙 (요약)

마스터스펙 §2 전문을 따르되, 특히:

1. **Phase 순서 엄수.** Acceptance 미통과 시 다음 Phase로 넘어가지 않습니다.
2. **컴파일 성공 ≠ 완료.** Phase 종료마다 실기 브라우저에서 확인합니다.
3. **에러를 삼키지 않습니다.** 잡은 에러는 UI 에러 카드나 `debug.ts` 로그에 반드시 남깁니다.
4. **색·굵기·간격·모션은 `theme.ts` 토큰만.** 컴포넌트에 hex나 임의 px를 적지 않습니다.
5. **외부 입력은 경계에서 zod 검증.** 내부는 검증된 데이터만 다닙니다.
