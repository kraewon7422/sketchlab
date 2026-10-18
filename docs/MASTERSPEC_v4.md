# SketchLab — 개발 마스터 스펙 v4

> 노트 필기 환경(갤럭시 탭 + S Pen 우선)에서 **삐뚤빼뚤한 손그림·손글씨를
> 교과서 품질의 도형·그래프·수식·화학구조·3D 입체로 바꾸고**, 손가락으로 돌려보고,
> **삼성노트·GoodNotes에 그대로 붙여넣는** 크로스플랫폼 웹 도구(PWA).
>
> **문서 버전**: v4 (2026-10-17) — v3 + 실현 가능성 감사 + 갤럭시 탭 실사용 흐름 + API 드리프트 수정
> **대상**: Claude Code 개발 세션
> **원칙**: 이 문서 하나만 읽고 현재 Phase부터 이어서 구현 가능해야 한다.
> **이전 판**: `docs/MASTERSPEC_v3.md` (보존. v3와 충돌 시 **v4가 우선**)

---

## 목차

0. v3 → v4 변경 요약 · 현재 진행 상태
1. 실현 가능성 감사 (되는 것 / 조건부 / 안 되는 것)
2. 프로젝트 정의 · 실사용 시나리오 (갤럭시 탭 기준)
3. 작업 규약 (Claude Code)
4. 핵심 결정: 파이썬 배제 — "밤티"의 원인과 브라우저 해법
5. 기술 스택 (v4 확정, 실제 설치 버전 반영)
6. 입력: S Pen · 손가락 · 마우스 · 이미지
7. 씬 모델과 상태
8. Scene IR v4 (스키마)
9. 인식 파이프라인 (Tier 0 / 수동 입력 / Tier 1 VLM / 정정)
10. 수식 파싱·계산
11. 2D 렌더링 — 교과서 규범 + 매끄러운 모션
12. 3D 렌더링 — 교과서 선화(線畫) + 매끄러운 회전
13. 화학
14. 내보내기 · 노트 앱 연동 (이 프로젝트의 실용성이 결정되는 곳)
15. UI/UX
16. 배포 · HTTPS · 비용
17. 범위 방어선
18. 함정 목록 v4
19. 파일 구조
20. 개발 Phase (v4 재편)
21. 품질 게이트
22. 개발자 메모

---

## 0. v3 → v4 변경 요약 · 현재 진행 상태

### 0.1 현재 상태 (2026-10-17 기준)
| Phase | 상태 | 비고 |
|---|---|---|
| P0 뼈대 + CI + HTTPS | ✅ | basic-ssl 사용(mkcert 대신) |
| P1 잉크 + 씬 모델 | ✅ | 95개 테스트 통과, 초기 JS 74KB gzip. **태블릿 실기 펜 확인만 남음** |
| P1.5 ~ P8 | ⬜ | 이 문서 §20 순서대로 |

### 0.2 v4 변경 사항 (심각도순)
| # | 심각도 | 내용 | 반영 |
|---|---|---|---|
| A1 | 🔴 | **강제 `tool_choice`는 최신 모델에서 400 에러다.** Opus 5.5·Sonnet 5.5·Fable 5.1은 `tool_choice: {type:"tool"}`을 거부한다. v3 §7.3 코드는 그대로 쓰면 죽는다 → **구조화 출력(`output_config.format` + `messages.parse`)으로 교체.** "유지되는 축"의 *Tool Use 강제 출력*을 *스키마 강제 출력*으로 개정 | §9.4 |
| A2 | 🔴 | `temperature` 등 샘플링 파라미터는 Opus 5 이후 모델에서 400. v3 코드의 `temperature: 0` 삭제. 조절은 `output_config.effort`로만 | §9.4 |
| A3 | 🔴 | 프로젝트는 **zod 4**를 쓴다. `zod-to-json-schema`·`$refStrategy`는 zod 3 전용이다. SDK 헬퍼 `zodOutputFormat`을 쓰고, **VLM용 "와이어 스키마"를 IR과 분리**(튜플·default·refine 없는 평탄한 객체) → 서버에서 IR로 변환 후 `SceneIRSchema.parse` | §8.3, §9.4 |
| A4 | 🔴 | **자체 서명 인증서(basic-ssl)로는 서비스 워커가 등록되지 않는다**(Chrome은 인증서 오류 페이지에서 SW 등록을 거부). PWA 설치·오프라인·공유 대상(Share Target)은 **유효한 인증서**가 필요 → `adb reverse`(localhost) 또는 **Tailscale serve**(tailnet 전용 정식 인증서) | §16.1 |
| G1 | 🔴 | **노트 연동의 현실을 명시.** 삼성노트·GoodNotes는 외부 앱이 노트 안에 쓰는 공개 API가 없다. 가능한 경로는 "이미지로 넣기"뿐이며, 갤럭시 탭에서 가장 매끄러운 경로는 **분할 화면/팝업 창 + 드래그 앤 드롭**이다. 4개 경로를 실기 스파이크로 순위를 정한다 | §1, §14 |
| G2 | 🟠 | **S Pen 전용 처리 부재**: hover 커서, 측면 버튼(접촉 중일 때만 — 공중에서 누르면 에어 커맨드가 뜬다), 120Hz `getPredictedEvents`, 엣지 뒤로가기 제스처 | §6.1 |
| G3 | 🟠 | **노트 → SketchLab 방향 경로**: 노트에 이미 손으로 쓴 것을 S Pen 스마트 셀렉트로 캡처 → 공유 → SketchLab(PWA Share Target)이 받아 인식. PC는 캡처 후 `Ctrl+V` | §6.3, §14.4 |
| G4 | 🟠 | **투명 PNG + 노트 다크 모드 = 검은 선이 안 보임.** 내보내기에 배경 옵션(투명/흰색) 필수 | §14.2 |
| M1 | 🟠 | **입체좌표(공간좌표) 누락.** v3은 곡면(plot3d)과 입체(solid3d)뿐, 고교 기하의 공간 점·벡터·직선·평면이 없다 → `space3d` kind 신설 | §8.2 |
| M2 | 🟠 | **계수 슬라이더**: `y=ax^2+b`의 `a`,`b`를 자동 슬라이더로 → 곡선이 실시간으로 부드럽게 변형. "인터랙티브"의 핵심인데 v3에 없음 | §11.4 |
| M3 | 🟠 | **적분 시각화**: `\int_a^b f(x)\,dx`를 그리면 곡선 + 넓이 음영 + 수치값. 사용자 요구("인테그랄")에 직접 대응 | §11.5 |
| M4 | 🟠 | **화학 렌더러를 RDKit.js로 승격**(smiles-drawer는 원자가 검증이 없어 틀린 구조를 "그럴듯하게" 그린다). 이름으로 찾기(PubChem), 화학 반응식(`\ce{}` mhchem), 완전 구조식(모든 원자 표시) 모드 추가 | §13 |
| M5 | 🟠 | **3D 숨은선을 정확하게**: v3은 "후면 모서리 전부 점선"으로 단순화했다. 깊이 테스트 2패스로 정확한 숨은선을 거의 공짜로 얻는다. 곡면 입체는 해석적 윤곽선 | §12.2 |
| M6 | 🟠 | **3D → 벡터 SVG 내보내기**: 교과서 입체 그림은 선화다. 래스터 캡처 대신 모서리를 투영해 SVG로 → 노트에서 400% 확대해도 선명 | §12.6 |
| M7 | 🟡 | 카탈로그 확장: 정다면체 5종, 각뿔대·원뿔대, 반구 (중학 교과 필수). 카탈로그 방식 자체는 유지 | §8.2 |
| M8 | 🟡 | 120Hz 디스플레이에서 OrbitControls 감쇠가 **프레임 기반이라 2배 빨리 멈춘다** → 시간 기반 자체 컨트롤러 | §12.3 |
| M9 | 🟡 | **API 키 없이도 쓸모 있어야 한다**: 수동 입력(MathLive 수식 키보드 / SMILES·이름 / 입체 선택 칩)을 1급 경로로. VLM은 "더 편한 입력"이지 유일한 입력이 아님 | §9.3 |
| M10 | 🟡 | 적응 샘플링을 P8 → P3로 당김 (`sin(1/x)`·급경사에서 각진 곡선 = 밤티의 대표 원인) | §11.3 |
| M11 | 🟡 | 모델 ID 갱신: 기본 `claude-opus-5-5` (Opus 5 후속, 더 저렴). 환경변수로 교체 가능 | §9.4 |

### 0.3 유지되는 축 (재검토 금지)
파이썬 런타임 배제(§4) / Scene IR 단일 계약(§8) / 2티어 인식 + 정정(§9) /
3D는 카탈로그 매칭(§8.2 — 목록만 확장) / 씬 모델(§7) / **스키마 강제 출력**(§9.4, v4 개정) /
교과서 시각 언어(§11.1) / theme.ts 토큰만 사용.

---

## 1. 실현 가능성 감사

> 결론: **전체 실현 가능.** 단, "노트 앱 *안에서* 직접 변환"은 불가능하고
> "노트 옆에서(분할/팝업) 변환 → 끌어다 넣기"가 현실적 최선이다.
> 이 차이를 사용자에게 숨기지 말고 UX로 최대한 메운다.

### 1.1 판정표
| 요구 | 판정 | 근거 / 방법 |
|---|---|---|
| 태블릿·폰·PC 전부 동작 | ✅ 가능 | 웹(PWA). 이미 P0·P1이 PC·태블릿에서 동작 확인됨 |
| 매끄러운 3D 회전 | ✅ 가능 | WebGL(three.js) + 쿼터니언 + 시간 기반 관성. 갤럭시 탭 GPU로 60~120fps 충분 |
| 예쁜 그래프(교과서 품질) | ✅ 가능 | 자작 SVG 렌더러 + 교과서 규범(§11.2) + 적응 샘플링 |
| 평면도형 즉시 보정 | ✅ 가능 | Tier 0 로컬 기하 인식 (<30ms, 오프라인) |
| 손글씨 수식 → LaTeX | ✅ 가능(온라인) | VLM. 인식률은 필체에 좌우 → **정정 UI 필수**. 오프라인 손글씨 수식 인식은 웹에서 현실적 대안 없음 |
| 로그·적분·시그마·행렬 등 "문자 완벽" | ✅ 가능 | KaTeX(화면) + MathJax SVG(내보내기). LaTeX가 단일 진실 |
| 화학 구조식(벤젠 등) 인식·그리기 | ✅ 가능(온라인) | VLM → SMILES → **RDKit 검증·배치·렌더**. 이름 입력(PubChem)으로 우회 가능 |
| 입체도형 손그림 → 3D | 🟡 조건부 | **카탈로그 매칭만** 현실적(정육면체·원기둥 등 + 비율). 임의 형태 2D→3D 재구성은 연구 과제 → 범위 밖 |
| 삼성노트에 결과 넣기 | 🟡 조건부 | 이미지로만. 경로: 드래그 앤 드롭(분할 화면) / 클립보드 / 공유 / 파일 저장. **실기 스파이크로 순위 확정**(§14.3) |
| GoodNotes(안드로이드·iPad)에 넣기 | 🟡 조건부 | 이미지로만. iPad는 공유 시트가 안정적, 안드로이드는 실기 확인 |
| 노트 안에서 3D가 계속 돌아감 | ❌ 불가 | 노트 앱은 정지 이미지만 담는다. 대안: 이미지 + "다시 열기 링크"(§14.5) |
| 삼성노트에 쓴 손글씨를 자동 감지·변환 | ❌ 불가 | 삼성노트에 플러그인/확장 API 없음. 대안: 스마트 셀렉트 캡처 → SketchLab으로 공유(§6.3) |
| 노트에 붙인 그림을 다시 편집 | 🟡 조건부 | 이미지 자체는 편집 불가. "다시 열기 링크"로 SketchLab에서 원본 객체 복원(§14.5) |

### 1.2 의존하는 외부 요소와 리스크
| 외부 요소 | 리스크 | 완화 |
|---|---|---|
| Anthropic API | 비용·네트워크·키 관리 | 명시 액션만 호출, 해시 캐시, 일일 예산 상한, 수동 입력 경로 |
| Chrome 안드로이드의 드래그·클립보드 동작 | 버전·기기마다 다름. 문서화 빈약 | P6 첫날 실기 스파이크 + 전 경로 폴백 체인 |
| 삼성노트 이미지 수용 방식 | 비공개 동작. 붙여넣기/드롭 지원 범위 불명확 | 동일 |
| RDKit.js WASM (~7MB) | 첫 로드 느림 | lazy + 서비스 워커 캐시. 화학 열 때만 로드 |

---

## 2. 프로젝트 정의 · 실사용 시나리오

### 2.1 한 줄 정의
> 노트 옆에 띄워 두고 **대충 그리면 교과서 그림이 되고, 끌어다 노트에 넣는** 수학·과학 도구.

### 2.2 기기별 기본 배치
| 기기 | 권장 배치 | 브라우저 |
|---|---|---|
| **갤럭시 탭 (주 사용)** | 삼성노트 + SketchLab **분할 화면**(좌우 50:50 또는 노트 70:30) 또는 **팝업 창** | Chrome (주) / 삼성 인터넷 (보조 검증) |
| 갤럭시 폰 | 단독 전체 화면 → 공유/복사 | Chrome |
| PC | 삼성노트 Windows 앱 옆에 브라우저 창 → `Ctrl+C` / `Ctrl+V` | Chrome / Edge |
| iPad | GoodNotes + Split View → 공유 시트 | Safari |

### 2.3 필수 시나리오 (이걸 못 하면 실패)
1. 탭에서 홈 화면 아이콘(PWA)으로 연다. 설치 없이 브라우저로도 된다.
2. 삼성노트와 분할 화면. S Pen으로 삼각형을 대충 그린다 → 0.1초 안에 **그 자리에서** 반듯해진다.
3. `y = x^2 - 3` 손글씨 → ✨ → 포물선 그래프. 삼각형은 그대로.
4. `y = a\sin(bx)` → `a`, `b` 슬라이더가 생기고 끌면 곡선이 120fps로 부드럽게 변한다. x축은 **π/2 눈금**.
5. `y = 1/x` → **점선 점근선** + 원점 대칭 쌍곡선. 원은 원으로(1:1 축 비율).
6. `\int_0^2 x^2\,dx` → 곡선 + 넓이 음영 + `= 8/3 ≈ 2.667`.
7. 정육면체 스케치 → 3D 전환, 손가락으로 돌리면 관성으로 미끄러지고 **숨은 모서리는 정확히 점선**.
8. 공간좌표 `A(1,2,3)`, 벡터 `\vec{OA}` → 3D 좌표공간에 점·벡터·라벨.
9. 육각형 + 교대 이중결합 → 벤젠 골격식 + "벤젠 (benzene)" 캡션. "에탄올"이라고 타이핑해도 구조식이 나온다.
10. 결과 객체를 **길게 눌러 삼성노트 쪽으로 끌어다 놓기** → 노트에 고해상도 이미지로 들어간다.
    (실패 시: 복사 → 노트에서 붙여넣기 / 공유 / 갤러리 저장)
11. 노트에 이미 손으로 써 둔 식을 S Pen 스마트 셀렉트로 잡아 SketchLab에 공유 → 그래프로 변환.
12. 오인식 → 객체 탭 → 바텀시트에서 대안 선택 또는 수식 키보드로 수정 (3탭 이내).

### 2.4 인식 카테고리
| 카테고리 | 예시 | 경로 |
|---|---|---|
| 평면도형 | 선분, 삼각형, 사각형, 원, 호, 다각형, 화살표, 직각 표시 | Tier 0 (로컬) |
| 입체도형 | 정다면체 5종, 직육면체, 각기둥, 각뿔, 각뿔대, 원기둥, 원뿔, 원뿔대, 구, 반구 | Tier 1 / 선택 칩 |
| 평면좌표·그래프 | 다항·유리·무리·삼각·지수·로그·절댓값·매개변수·음함수·극좌표, 점, 넓이 | Tier 1 / 수식 키보드 |
| 공간좌표 | 점, 벡터, 선분, 직선, 평면, 곡면 `z=f(x,y)` | Tier 1 / 수식 키보드 |
| 수학식 | 계수·지수·분수·근호·로그·적분·시그마·극한·행렬·벡터 | Tier 1 / 수식 키보드 |
| 화학 | 골격식, 구조식, 벤젠·고리, 작용기, 이중·삼중결합, 반응식(`\ce{}`) | Tier 1 / SMILES·이름 |

---

## 3. 작업 규약 (Claude Code)

1. **세션 시작 시 `CONTINUE.md`를 먼저 읽는다.** 각 단계 완료마다 갱신한다(완료·중단 지점·다음 단계·수정 파일·명령).
2. Phase **순서 엄수**. Acceptance(자동 테스트 포함) 미통과 시 다음 Phase 금지.
3. Phase 종료마다 **실기 검증**(Playwright 스크린샷 + 사용자 태블릿 스크린샷). 컴파일 성공 ≠ 완료.
4. 2개 이상 파일을 건드리는 작업은 **계획 → 사용자 승인 → 실행**. 새 의존성은 **반드시 먼저 묻는다** (§5의 "도입 예정" 목록도 도입 시점에 확인).
5. 큰 구조 변경 시 `_v2` 파일 신설, 원본 보존.
6. 외부 입력(VLM·사용자 편집·공유받은 이미지·URL 해시)은 경계에서 zod 검증. 내부는 검증된 데이터만.
7. 에러를 삼키지 않는다 — UI 에러 카드 또는 `debugLog.error`.
8. **색·굵기·간격·모션 값은 `client/src/render/theme.ts` 토큰만.** 하드코딩은 버그.
9. 소스 파일은 항상 UTF-8로 저장한다 (한글 주석 깨짐 방지).
10. 실기 확인 요청은 누구나 따라 할 수 있게 **"어디를 눌러서 무엇이 보이면 성공"** 형태로 한국어 단계별로.

---

## 4. 핵심 결정: 파이썬 배제 — "밤티"의 원인과 브라우저 해법

| 파이썬(matplotlib/mplot3d)이 밤티 나는 구조적 원인 | 브라우저 해법 | 이 문서 위치 |
|---|---|---|
| CPU 래스터 → 확대 시 뭉개짐 | SVG 벡터 + GPU 합성, 내보내기도 벡터 | §11, §12.6 |
| FuncAnimation 프레임 덤프 → 실시간 아님 | `requestAnimationFrame` 60~120fps, 필요할 때만 렌더 | §11.4, §12.4 |
| mplot3d 오일러각 → 짐벌락·이상한 회전 | 쿼터니언 + 턴테이블 제약 | §12.3 |
| 3D 깊이 정렬 오류(mplot3d는 진짜 z-buffer가 없음) | WebGL 깊이 버퍼 + 2패스 숨은선 | §12.2 |
| 선 굵기 1px 고정, 계단 현상 | `LineSegments2`(화면 공간 굵기) + MSAA | §12.2 |
| 균등 샘플링 → 급경사에서 각짐, 점근선에 수직선 | 적응 샘플링 + 불연속 브레이크 + 점근선 점선 | §11.3 |
| 선형 보간 → 기계적 움직임 | 이징·스프링·시간 기반 감쇠 | §12.3, §15.1 |
| 수식 폰트 불일치 | KaTeX/MathJax(Computer Modern) | §10.3 |

Manim은 오프라인 렌더러 — 인터랙티브 부적합.

> **렌더링·애니메이션·UI는 100% 브라우저. 파이썬은 런타임에 없다.**

---

## 5. 기술 스택 (v4 확정)

### 5.1 설치됨 (P0·P1, `package.json` 기준)
```
언어/빌드    : TypeScript 6.0.3 (고정 — typescript-eslint 8의 peer 범위 <6.1) + Vite 8
패키지       : npm workspaces — shared/ + client/ + server/   (pnpm 아님)
UI           : React 19 + Tailwind CSS 4 + lucide-react
상태         : zustand 5 + immer 11 (enablePatches는 store/session.ts 최상단)
저장         : IndexedDB (idb 8)
스키마       : zod 4 (shared/src/ir.ts)
서버         : Node ≥20 + Express 5 (+ tsx)
개발 HTTPS   : @vitejs/plugin-basic-ssl (LAN 테스트용 자체 서명)
테스트       : Vitest 4 (+ Playwright — 브라우저 검증)
CI           : GitHub Actions — lint + typecheck + vitest
```

### 5.2 도입 예정 (Phase별, **도입 시점에 사용자에게 확인**)
| Phase | 패키지 (2026-10 기준 최신) | 용도 | 번들 |
|---|---|---|---|
| P3 | `@cortex-js/compute-engine` 0.154 | LaTeX 파싱·컴파일·수치계산 | **lazy** (크다) |
| P3 | `katex` 0.19 (+ `contrib/mhchem`) | 화면 수식 | 초기 |
| P3 | `mathlive` 0.111 | 수식 입력 필드 + 가상 수식 키보드(태블릿) | lazy |
| P3 | `@anthropic-ai/sdk` 0.135 (서버) | VLM 인식 | 서버 |
| P3 | `express-rate-limit`, `cors` (서버) | 보안 | 서버 |
| P4 | `three` 0.186 + `@react-three/fiber` 9 + `@react-three/drei` 10 | 3D | **lazy** |
| P5 | `@rdkit/rdkit` 2026.9 (MinimalLib WASM ~7MB) | SMILES 검증·정규화·2D 배치·SVG | **lazy + SW 캐시** |
| P6 | `@mathjax/src` 4.x **또는** `mathjax-full` 3.2.2 | 내보내기용 수식 SVG(path) — P6 첫날 API 확인 후 택1 | lazy |
| P7 | `vite-plugin-pwa` 2 | 서비스 워커·매니페스트·Share Target | 빌드 |
| 미정 | `pretendard` (devDep에 이미 있음) | UI 한글 폰트 로컬 번들 — **사용자 확인 후 적용** | CSS |

**제거/보류**: `smiles-drawer` — RDKit 로드 실패 시의 폴백으로만 검토(기본 미도입).

**금지**: 차트 라이브러리 / 파이썬 백엔드 / localStorage / `THREE.Line` 기본 재질 /
프론트엔드 API 키 / 자작 LaTeX 파서 / 자작 SMILES 파서.

**성능 예산**: 초기 JS(three·CE·RDKit·MathJax·MathLive 제외) < 250KB gzip (현재 74KB).

---

## 6. 입력: S Pen · 손가락 · 마우스 · 이미지

### 6.1 S Pen (갤럭시 탭) — v4 신설
P1에서 구현된 것: 포인터 캡처, `getCoalescedEvents`, 필압 가변 굵기, 팜 리젝션, RDP, 지우개.
**P1.5에서 추가·실기 확인할 것:**

| 항목 | 구현 | 주의 |
|---|---|---|
| 펜 판별 | `e.pointerType === "pen"` | 첫 펜 입력 이후 손가락 1지 = 팬(그리기 아님) |
| hover 커서 | 펜이 화면 위 공중에 있을 때 `pointermove`(`buttons===0`)가 온다 → 펜촉 위치에 작은 원 커서(굵기 미리보기) | 지원 안 되는 기기도 있음 → 없으면 그냥 안 보임 |
| 예측 점 | `e.getPredictedEvents()`로 1~2점 미리 그려 체감 지연 감소. **확정 획에는 넣지 않는다**(다음 프레임에 교체) | 미지원 브라우저 대비 존재 확인 |
| 측면 버튼 | 펜 **접촉 중** `(e.buttons & 2)` → 일시 올가미(또는 지우개 — 설정) | ⚠️ 공중에서 버튼 누르면 **에어 커맨드**가 열린다. 접촉 중일 때만 의미를 부여. 기기·브라우저별 실기 확인 |
| 120Hz | 그리기는 이벤트 기반 증분(이미 구현). 애니메이션은 **시간(dt) 기반**만 | 프레임 수 기반 감쇠 금지(§12.3) |
| 시스템 제스처 방지 | `touch-action:none`, `overscroll-behavior:none`(당겨서 새로고침 방지), `-webkit-touch-callout:none`, `user-select:none`, `contextmenu` preventDefault | 화면 가장자리 뒤로가기 제스처는 웹에서 막을 수 없다 → 캔버스 좌우 8px 여백 |

### 6.2 손가락 · 마우스 · 키보드(DeX/PC)
- 손가락: 펜 미감지 상태 1지 = 그리기 / 2지 = 팬·줌 / 길게 누르기 = 올가미.
- 마우스: 좌클릭 = 그리기, 휠 = 줌, 스페이스+드래그 = 팬.
- 단축키(PC·DeX): `Ctrl+Z / Ctrl+Shift+Z`, `Ctrl+C`(선택 객체 이미지 복사), `Ctrl+V`(이미지 붙여넣기 → 인식), `Enter`(✨ 정리하기), `Delete`.

### 6.3 이미지 입력 (노트 → SketchLab 방향) — v4 신설
노트에 이미 손으로 써 둔 것을 변환하는 경로. **삼성노트에 API가 없으므로 이게 "연동"의 현실적 형태다.**

| 경로 | 기기 | 방법 |
|---|---|---|
| **공유 대상(Share Target)** | 갤럭시 탭·폰 (설치된 PWA) | 삼성노트에서 S Pen **스마트 셀렉트**로 영역 캡처 → 공유 → SketchLab |
| 붙여넣기 | PC·DeX | `Win+Shift+S` 캡처 → SketchLab에서 `Ctrl+V` (`paste` 이벤트의 `image/*`) |
| 파일 열기/드롭 | 전부 | 사진(종이 노트 촬영 포함)·스크린샷 |

처리: 이미지를 캔버스에 **"참조 이미지" 아이템**으로 놓는다 → 사용자가 올가미/사각형으로 영역 선택 → ✨ → Tier 1 인식
→ 결과 객체를 옆에 배치. 전처리: 그레이스케일 + 자동 대비 + 선택 영역 크롭 + 긴 변 ≤1024px.
(참조 이미지는 IndexedDB에 Blob으로 저장. 내보내기에는 포함하지 않는 것이 기본.)

---

## 7. 씬 모델과 상태 (P1 구현 유지 + 확장)

### 7.1 CanvasItem (v4)
```typescript
type CanvasItem =
  | { id: string; kind: "ink";    strokes: Stroke[]; bbox: BBox }
  | { id: string; kind: "object"; ir: SceneIR; bbox: BBox;
      sourceStrokes: Stroke[];                         // 재인식·되돌리기용. 불변
      transform: { x: number; y: number; scale: number };
      view3d?: { q: [number, number, number, number]; zoom: number } } // ← v4: 3D 시점 보존(내보내기 각도)
  | { id: string; kind: "image";  blobKey: string; bbox: BBox };       // ← v4: 참조 이미지(§6.3)
```
인식 성공 → `ink`가 `object`로 **그 자리에서** 교체(in-place cross-fade).

### 7.2 스토어 · 저장 (P1 구현 그대로)
- `enablePatches()`는 `store/session.ts` 최상단(이미 구현).
- Undo 단위: 스트로크 추가 / 인식 적용 / 이동 / 삭제 / IR 편집 / 슬라이더 **놓을 때 1회**(끄는 중 매 프레임 기록 금지).
- IndexedDB 쓰기는 스트로크 종료·객체 변경 시에만. 복원은 부팅 시 1회.
- **IR 버전 마이그레이션**: 저장된 IR의 `version`이 `"3.0"`이면 `migrateIR()`로 `"4.0"`으로 올린 뒤 parse.
  (P1까지는 object 아이템이 저장된 적이 없지만, 마이그레이션 함수와 테스트는 P2에서 만든다.)

---

## 8. Scene IR v4

```
스트로크/이미지/수동입력 → [인식기] → SceneIR → [렌더러] → 화면 / PNG·SVG / 링크
```

### 8.1 IR 원칙
- 좌표 정규화(캔버스 픽셀 금지) / **LaTeX·SMILES가 단일 진실**(파생 좌표 저장 금지) / 경계에서 zod parse 필수.
- kind와 data의 짝은 `z.discriminatedUnion("kind")`로 강제(D1, 이미 구현).
- 새 필드는 **optional**로만 추가 → v3 데이터가 거의 그대로 통과.

### 8.2 스키마 변경점 (`shared/src/ir.ts` — 코드가 곧 명세)
기존 v3 정의(Shape2D, Formula 등)는 유지. 아래만 추가·변경한다.

```typescript
// ── 메타: 버전만 올린다
const meta = {
  version: z.literal("4.0"),
  confidence: z.number().min(0).max(1),
  source: z.enum(["local", "vlm", "manual"]),     // ← v4: 수동 입력 구분
};

// ── 입체 카탈로그 확장 (M7). "카탈로그 방식"은 유지, 목록만 늘린다.
export const SOLID_KINDS = [
  "cube", "box", "tetrahedron", "octahedron", "dodecahedron", "icosahedron", // 정다면체 5종(+직육면체)
  "prism", "pyramid", "frustum",            // n각기둥·n각뿔·n각뿔대 (params.n)
  "cylinder", "cone", "conicalFrustum",     // 원기둥·원뿔·원뿔대
  "sphere", "hemisphere",
] as const;

const Solid3D = z.object({
  solid: z.enum(SOLID_KINDS),
  params: z.record(z.string(), z.number()),        // 예: {n:6, r:1, h:2, r2:0.5}
  style: z.enum(["line", "shaded"]).default("line"),  // ← v4: 교과서 선화가 기본
  showHiddenEdges: z.boolean().default(true),
  labels: z.array(z.object({ text: z.string(), vertex: z.number().int() })).optional(),
  crossSection: z.object({ normal: Vec3, offset: z.number() }).optional(), // 렌더는 P8
});

// ── 공간좌표 (M1, 신설)
const Space3D = z.object({
  view: z.object({ range: z.number().positive().default(5) }),   // 각 축 [-range, range]
  points:   z.array(z.object({ at: Vec3, label: z.string().optional() })).optional(),
  vectors:  z.array(z.object({ from: Vec3, to: Vec3, label: z.string().optional() })).optional(),
  segments: z.array(z.object({ a: Vec3, b: Vec3 })).optional(),
  lines:    z.array(z.object({ point: Vec3, dir: Vec3, label: z.string().optional() })).optional(),
  planes:   z.array(z.object({ normal: Vec3, d: z.number(), label: z.string().optional() })).optional(), // n·x = d
  surfaces: z.array(z.object({ latex: z.string() })).optional(),  // z = f(x,y). v3 Plot3D 흡수
  showProjections: z.boolean().default(false),                    // 점에서 각 평면으로 점선 수선
});

// ── 평면 그래프 확장 (M2·M3)
const Param = z.object({
  name: z.string().regex(/^[a-zA-Z]$/),          // 한 글자 계수만 (x, y, t, e, i 제외 — 분류기에서 거름)
  value: z.number(), min: z.number(), max: z.number(), step: z.number().positive(),
});
const Plot2D = z.object({
  functions: /* v3 그대로 */,
  view:      /* v3 그대로 + 아래 */ ,
  //  view.xTicks: z.enum(["auto","pi"]).default("auto")   ← v4: π 눈금 명시 가능
  grid: z.boolean().default(false),
  points: /* v3 그대로 */,
  params: z.array(Param).max(4).optional(),       // ← v4 (M2) 계수 슬라이더
  shade: z.array(z.object({                       // ← v4 (M3) 넓이 음영
    fn: z.number().int(),                         // functions 인덱스
    from: z.number(), to: z.number(),
    against: z.union([z.literal("axis"), z.number().int()]).default("axis"), // x축 또는 다른 함수와 사이
    showValue: z.boolean().default(true),
  })).optional(),
  annotations: z.array(z.enum(["roots", "yIntercept", "extrema"])).optional(), // v3 E5를 P7로 당김
});

// ── 수식: 표시 옵션
const Formula = z.object({
  latex: z.string().min(1),
  evaluate: z.boolean().default(false),          // ← v4: 정적분·시그마 등 수치값 "≈" 병기
});

// ── 화학 (M4)
const Chem = z.object({
  smiles: z.string().min(1),                     // 단일 진실. RDKit 정규 SMILES로 저장
  style: z.enum(["skeletal", "full", "kekule"]).default("skeletal"),
  //   skeletal: 골격식(탄소·수소 생략)  full: 완전 구조식(모든 원자·H 표시)  kekule: 벤젠 고리 이중결합 명시
  aromaticCircle: z.boolean().default(false),    // 벤젠 고리 안 원 표기
  commonName: z.string().optional(),             // "벤젠 (benzene)"
  highlights: z.array(z.number().int()).optional(),
});
const ChemEquation = z.object({ ce: z.string().min(1) }); // ← v4: "2H2 + O2 -> 2H2O" (mhchem \ce{} 내부)

export const SceneIRSchema = z.discriminatedUnion("kind", [
  z.object({ ...meta, kind: z.literal("shape2d"),  data: Shape2D }),
  z.object({ ...meta, kind: z.literal("solid3d"),  data: Solid3D }),
  z.object({ ...meta, kind: z.literal("plot2d"),   data: Plot2D }),
  z.object({ ...meta, kind: z.literal("space3d"),  data: Space3D }),   // plot3d 대체
  z.object({ ...meta, kind: z.literal("formula"),  data: Formula }),
  z.object({ ...meta, kind: z.literal("chem"),     data: Chem }),
  z.object({ ...meta, kind: z.literal("chemEq"),   data: ChemEquation }),
]);
```
- v3의 `plot3d`는 `space3d.surfaces`로 흡수. `migrateIR`에서 변환한다.
- `display:"skeletal"|"kekule"`(v3) → `style`로 마이그레이션.

### 8.3 VLM 와이어 스키마 (A3 — IR과 분리)
구조화 출력이 지원하는 JSON Schema는 부분집합이다. **튜플(`[x,y]`), `.default()`, `.refine()`, 정규식, 숫자 범위**는
호환이 불확실하므로 VLM에게는 **평탄한 객체 스키마**를 따로 준다.

```typescript
// shared/src/wire.ts  — VLM 출력 전용. 렌더러는 절대 이걸 직접 쓰지 않는다.
const P2 = z.object({ x: z.number(), y: z.number() });
const P3 = z.object({ x: z.number(), y: z.number(), z: z.number() });
// … kind별 Wire 객체 (튜플 대신 P2/P3, default 없음, optional 최소화)
export const RecognizeWire = z.object({
  best: WireIR,
  alternatives: z.array(WireIR),       // 없으면 빈 배열 (optional 대신)
});
// shared/src/wireToIR.ts — 순수 함수. 단위 테스트 필수.
export function wireToIR(w: z.infer<typeof WireIR>): SceneIR { /* 변환 후 SceneIRSchema.parse */ }
```
**P3 첫 작업**: `zodOutputFormat(RecognizeWire)`이 만드는 JSON Schema를 실제로 출력해 보고,
API에 1회 호출해 400 없이 통과하는지 확인 → 결과를 CONTINUE.md에 기록.

---

## 9. 인식 파이프라인

```
그룹 확정 ─┬→ Tier 0 (로컬 <30ms, 항상, 오프라인)          → 평면도형 즉시 스냅
          ├→ 수동 입력 (수식 키보드 / SMILES·이름 / 입체 칩) → 오프라인·무료
          └→ Tier 1 (VLM 2~6s, ✨ 명시 액션만)               → 도착 시 in-place 교체
                    └→ 실패/저신뢰 → Tier 2 정정 바텀시트
```

### 9.1 Tier 0 — 로컬 기하 인식 (순수 함수, 단위테스트 1순위) — v3 유지
```
닫힘(|시작-끝| < 길이×0.15) → 원 검사(중심거리 std/mean<0.12, 최소제곱 피팅)
→ RDP(ε=화면폭 0.2%) 꼭짓점 수 → 3/4/n각형 → 각도로 직사각형·정사각형 판별
열림 → 최소제곱 직선 잔차 → 직선 / 자유곡선 유지
화살표: 긴 선 끝 + 짧은 선 2개 예각
```
- **스냅 시 크기·위치·회전 보존.** 축 정렬 강제 금지.
- 재사용: `ink/geometry.ts`(거리·bbox·부호넓이), `ink/simplify.ts`(RDP) — 이미 있음.
- 참고: 삼성노트 자체에도 "도형 자동 보정"이 있다. **Tier 0은 차별점이 아니라 기본기**다.
  차별점은 그래프·3D·화학·수식 — 시간 배분을 거기에 둔다.

### 9.2 Tier 1 전처리 — v3 유지
- 흰 배경 + 검은 3px AA 선 오프스크린 렌더, 여백 8%, 긴 변 ≤1024px.
- 캐시 키 = `crypto.subtle.digest("SHA-256", 직렬화 (x,y,t) 정수열)` → IndexedDB. insecure 환경은 fnv1a 폴백.

### 9.3 수동 입력 — 1급 경로 (M9, v4 신설)
VLM이 없거나(오프라인·키 없음) 틀렸을 때도 **3탭 안에** 원하는 결과를 만들 수 있어야 한다.
| 대상 | 입력 UI |
|---|---|
| 수식·그래프·공간좌표 | **MathLive** `<math-field>` + 가상 수식 키보드(태블릿에 최적). LaTeX 직접 입력도 허용 |
| 화학 | SMILES 입력 **또는 이름 입력** → PubChem PUG REST(무료, 키 없음)로 SMILES 조회 → RDKit 정규화 |
| 입체 | 카탈로그 칩(아이콘 그리드) + 치수 슬라이더 |

PubChem 호출 예 (클라이언트에서 직접, 온라인 필요):
`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{영문명}/property/IsomericSMILES/TXT`
- 한글 이름("에탄올")은 PubChem이 모른다 → 자주 쓰는 고교 화학 물질 ~100종의 **한글→영문 사전**을 `client/src/chem/names.ko.ts`에 둔다.
- 응답은 외부 입력 → RDKit 검증 통과해야 IR로.

### 9.4 Tier 1 — VLM (스키마 강제 출력, A1·A2·A3)
```typescript
// server/src/recognize.ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { RecognizeWire } from "@sketchlab/shared/wire";
import { wireToIR } from "@sketchlab/shared/wireToIR";

const client = new Anthropic();                     // ANTHROPIC_API_KEY는 서버 env에만
const MODEL = process.env["SKETCHLAB_MODEL"] ?? "claude-opus-5-5";

const SYSTEM = [{
  type: "text" as const,
  text: `You convert a hand-drawn sketch (school math/science notes, often Korean) into structured output.
- Plottable relation (y=..., f(x)=..., x^2+y^2=1, r=..., x=f(t),y=g(t)) → "plot2d". LaTeX only.
  Single-letter coefficients other than x,y,t (e.g. a,b,k) → add to params with a sensible value/range.
  A definite integral with a plottable integrand → plot2d with shade, plus formula if asked.
- Points/vectors/lines/planes in 3D, or z=f(x,y) → "space3d".
- Math without a plottable relation → "formula".
- Chemical structure → "chem" with canonical SMILES; commonName in Korean (English) when well-known,
  e.g. c1ccccc1 → "벤젠 (benzene)". Chemical equation → "chemEq" (mhchem syntax).
- 3D solid sketch → "solid3d" from the catalog only, with approximate params.
- If axis names are written (t, v, 시간), put them in xLabel/yLabel.
- confidence < 0.6 means you are guessing; give up to 2 alternatives when ambiguous.`,
  cache_control: { type: "ephemeral" as const },
}];

export async function recognize(pngBase64: string) {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,                              // thinking + 출력 함께 덮음. 작게 잡지 말 것
    output_config: { effort: "low", format: zodOutputFormat(RecognizeWire) }, // A2: temperature 금지
    system: SYSTEM,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: pngBase64 } },
      { type: "text", text: "Recognize this sketch." },
    ]}],
  });
  if (res.stop_reason === "refusal") throw new RecognizeError("refused");
  if (res.stop_reason === "max_tokens") throw new RecognizeError("truncated");
  const wire = res.parsed_output;
  if (!wire) throw new RecognizeError("unparsed");  // 호출측에서 1회 재시도 후 에러 카드
  return {                                          // 이중 안전벨트: 변환 후 IR 스키마로 다시 parse
    best: wireToIR(wire.best),
    alternatives: wire.alternatives.map(wireToIR),
    usage: res.usage,                               // 비용 로깅(§16.3)
  };
}
```
- **모델**: 기본 `claude-opus-5-5`(Opus 5 후속, 더 저렴, 손글씨 판독 품질이 제품 품질을 결정하는 지점).
  - Opus 5.5는 thinking을 끌 수 없다. 지연은 `effort:"low"`로 줄인다. 2~6초가 목표.
  - 비용을 더 줄이려면 env로 `claude-sonnet-5-5`(절반 가격) 교체 → **VLM 회귀 세트로 정확도 비교 후** 결정(사용자 결정 사항).
- **거절 대비**: Opus 5.5 서버측 폴백(`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`)을 기본으로 켠다.
  beta 엔드포인트에서 `parse` 헬퍼와 함께 쓰는 정확한 형태는 P3에서 SDK 문서로 확인. 손그림 인식이 거절될 일은 드물다.
  확인이 안 되면 `stop_reason` 검사 + 에러 카드만으로 출시 가능.
- **강제 `tool_choice` 사용 금지**(A1). `temperature`·`top_p` 금지(A2).
- 클라 규율: ✨ 액션에서만 호출 / AbortController / 캐시 우선 / 오프라인이면 FAB에 오프라인 배지.

### 9.5 3D = 카탈로그 매칭 (유지)
일반 2D→3D 재구성 금지. VLM은 "카탈로그 중 무엇 + 비율"만. 모델은 파라메트릭 생성.

### 9.6 서버 보안
```typescript
app.set("trust proxy", 1);                         // 이미 구현
app.use(cors({ origin: ALLOWED_ORIGINS }));        // env. "*" 금지
app.use(express.json({ limit: "3mb" }));
app.use("/api", requireAccessToken);               // ← v4: 외부 노출 시 ACCESS_TOKEN 헤더 필수
app.use("/api/recognize", rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true }));
app.use("/api/recognize", dailyBudgetGuard);       // ← v4: 일일 예산(USD) 초과 시 429
// 서버측 이미지 재검증: PNG 시그니처, 긴 변 ≤1024px, 아니면 400
```
`.env.example`에 추가: `SKETCHLAB_MODEL=claude-opus-5-5`, `ACCESS_TOKEN=`, `DAILY_BUDGET_USD=1`.

### 9.7 Tier 2 — 정정 (필수)
객체 탭 → 바텀시트: 대안 카드 / MathLive 편집 / SMILES·이름 편집 / 입체 칩 / "원본 잉크로 되돌리기".
확정 시 zod + 파서(CE / RDKit) 재검증. confidence < 0.6 → 자동 펼침.

---

## 10. 수식 파싱·계산

### 10.1 평가 경로 (3단 폴백 — v3 D2 유지)
```typescript
const expr = ce.parse(latex);
if (!expr.isValid) return { kind: "parse_error" };
const compiled = expr.compile();                       // 1) 컴파일 (빠름)
if (compiled) return (vars) => compiled(vars);
return (vars) => {                                     // 2) .N() 폴백 (느림 — 샘플 수 절반)
  const v = expr.subs(vars).N().valueOf();
  return typeof v === "number" ? v : NaN;
};
// 3) 둘 다 불가 → "식을 해석하지 못했어요" 카드 + 편집 유도. 침묵 금지.
```
⚠️ Compute Engine은 버전마다 API가 바뀐다(0.x). `compile()`의 반환 형태, `isValid`/`errors` 등
**정확한 시그니처는 P3에서 설치 버전의 문서·타입 정의로 확인**하고 래퍼(`math/evaluate.ts`) 한 곳에만 둔다.

### 10.2 식 분류기 (v3 D3 유지 + 확장)
```
"y=", "f(x)=" 좌변                 → explicit
"r=" 좌변 (θ 변수)                  → polar
"x=f(t), y=g(t)" 쌍                 → parametric
"=" 있음 & 양변에 x,y 혼재           → implicit (L−R=0, marching squares)
"z=" 좌변 & x,y 변수                → space3d.surfaces
"\int_a^b f(x) dx" (정적분)          → plot2d + shade(a..b) + 값
"=" 없음                            → formula. 단일변수 식이면 "그래프로 보기" 버튼
자유 변수 중 x,y,t,θ,e,π,i 외 한 글자 → params(슬라이더) 후보
```

### 10.3 수식 조판 ("문자 완벽")
- 화면: **KaTeX**. `\log_2`, `\int`, `\sum`, `\lim`, `\begin{pmatrix}`, `\vec{}`, `\overline{}`, `\angle`, `\triangle`,
  `\sqrt[n]{}` 등 교과 표기 회귀 테스트 세트(`tests/fixtures/latex.txt`, 50식)를 만들어 렌더 에러 0을 보장.
- 화학 반응식: KaTeX `contrib/mhchem` → `\ce{2H2 + O2 -> 2H2O}`.
- 내보내기: **MathJax SVG**(글리프가 path라 폰트 의존성 없음).
- ⚠️ 한글 `\text{넓이}`: KaTeX는 시스템 폰트로 표시. MathJax SVG는 한글을 `<text>`로 남긴다 →
  PNG 래스터화 시에는 기기 폰트로 그려지지만 SVG 파일은 다른 기기에서 글꼴이 달라질 수 있다. 내보내기 SVG에서 알려진 한계로 문서화.
- 화면 라벨은 SVG 위 **HTML 오버레이**로 배치(SVG `foreignObject` 금지 — 내보내기 래스터화가 깨진다).

---

## 11. 2D 렌더링 (SVG) — 교과서 규범 + 매끄러운 모션

### 11.1 시각 언어 (v3 유지)
```
배경 #FFFFFF(내보내기: 투명/흰색 선택) / 주선 #1A1A1A 2px / 보조 #D4D4D4 1px
숨은선 점선 [4,4] / 강조 #2563EB·#DC2626·#059669 / 점근선 #9CA3AF [6,4] 1.5px
수식 KaTeX(Computer Modern). 네온·그라디언트·글로우 금지. theme.ts 토큰만.
```

### 11.2 교과서 규범 (v3 §8.3 유지 — "교과서 같음"을 만드는 절)
- (a) **축 단위 비율 기본 `equal`**(원이 원으로). y범위가 x의 8배 초과 시 `auto` 전환 + "축 비율 다름" 미세 표기.
- (b) **π 눈금**: `\sin·\cos·\tan` 포함 & 다항 항 없음 → π/2 간격, 라벨 `-π, -π/2, O, π/2, π…`. 그 외 nice number(1·2·5×10^k).
- (c) **점근선 점선**: 수직(불연속 양측 발산) / 수평(끝단 수렴, std < 뷰높이 1%).
- 축 공통: 끝 화살표, 원점 `O`, 라벨 축 바깥, 기본 격자 없음, `xLabel`/`yLabel`은 화살표 옆.

### 11.3 샘플링 (M10 — 적응 샘플링으로 교체)
```
1) 화면 폭 기준 균등 초기 격자 (px당 0.5점)
2) 인접 세 점의 꺾임각 > 2° 또는 |Δy| > 뷰높이 2% 이면 구간 이분할 (최대 깊이 8)
3) 비유한값(NaN/±∞) → null 브레이크, 큰 점프(> 뷰높이 50%) → null 브레이크
4) 클램프: 뷰 밖 ±20%
5) 출력: Array<[x,y] | null>  (null → SVG path의 M)
```
- 기존 v3 `sampleFunction`(균등)은 `sampleUniform`으로 남겨 비교 테스트용으로 보존.
- 내보내기 시에는 **출력 해상도(3×) 기준으로 재샘플링** — 화면용 점을 확대하면 각진다.
- implicit: marching squares 128×128 + 선분 연결 → 폴리라인 → Catmull-Rom 평활. parametric: t 800 샘플 + 동일 적응 규칙.

### 11.4 계수 슬라이더 & 모션 (M2)
- `params` 있는 그래프 → 객체 아래에 슬라이더(최대 4개, 터치 타깃 44px).
- 끄는 동안: **매 프레임 재샘플링**(컴파일 함수 기준 ~2,000점/프레임은 탭에서 여유). `.N()` 폴백 함수면 끄는 중에는 저해상도.
- 놓을 때: Undo 1회 기록 + IndexedDB 저장.
- 등장 애니메이션: 곡선 "그려지기"(`stroke-dasharray` + `stroke-dashoffset`, `motion.slow` 400ms, easeOut). 음영은 opacity 페이드.
- 함수 식 편집 후 전환: 이전/새 샘플을 같은 x격자로 재샘플해 **y값 보간 모핑** 250ms (불연속 구간은 크로스페이드).
- `prefers-reduced-motion` → 모든 전환 0ms.

### 11.5 적분·넓이 (M3)
- `shade`: 곡선과 x축(또는 두 곡선) 사이 다각형 채움 `color.accent` 12% 불투명도, 경계 a·b에 수직 점선.
- 값: Compute Engine으로 정적분 수치(가능하면 기호 결과 병기: `= \frac{8}{3} \approx 2.667`). 실패 시 심프슨 1/3 법(n=512)으로 계산.
- 부호 있는 넓이 vs 넓이(절댓값) 토글 — x축 아래 영역은 `color.danger` 톤으로 구분.

### 11.6 주석 (annotations, P7)
근·y절편·극값: 작은 점(r=3) + KaTeX 좌표 라벨. 극값은 수치 미분 부호 변화로 검출. 겹치면 라벨 자동 회피(간단한 상하 교대).

---

## 12. 3D 렌더링 (Three.js) — 교과서 선화 + 매끄러운 회전

### 12.1 공통
- `React.lazy`로 three 청크 분리. `<Canvas gl={{antialias:true, alpha:true}} dpr={[1,2]} frameloop="demand" camera={{fov:35}}>`.
  **`frameloop="demand"`**: 움직일 때만 렌더 → 태블릿 배터리·발열 보호. 관성 중에는 `invalidate()`를 매 프레임 호출.
- 조명: ambient 0.75 + directional 0.5, 그림자 없음. 면은 흰색 + opacity 0.15~0.25 — **모서리가 주인공**.
- `webglcontextlost`/`restored` → 재생성 + `invalidate()`.

### 12.2 선과 숨은선 (M5)
- 모서리: `EdgesGeometry` → `LineSegments2` + `LineMaterial({ linewidth: 2 })`(화면 픽셀 굵기). `resolution`은 ResizeObserver로 갱신.
- **2패스 숨은선**(볼록·비볼록 모두 정확):
  1. 면: `colorWrite:false`(또는 낮은 opacity) + `depthWrite:true` + `polygonOffset`(factor 1, units 1) — 깊이만 기록
  2. 보이는 모서리: 실선, `depthFunc: LessEqualDepth`
  3. 숨은 모서리: 점선(`dashed:true`, dashSize/gapSize 토큰), `depthFunc: GreaterDepth`, `depthWrite:false`
- 곡면 입체(원기둥·원뿔·구): 메시 모서리 대신 **해석적 윤곽선**
  - 원기둥/원뿔: 윗·아랫 원(타원으로 보임) + 시점에 따른 **실루엣 모선 2개**(카메라 방향과 접하는 모선을 매 회전마다 계산)
  - 구: 화면 공간 외곽 원 + 적도 타원(뒤 절반 점선)
  - 실루엣은 회전 시 재계산(점 수십 개 수준이라 비용 무시 가능).

### 12.3 회전 컨트롤러 (M8 — 자작, ~150줄)
OrbitControls의 감쇠는 **프레임마다 고정 비율**이라 120Hz에서 2배 빨리 멈추고 기기마다 손맛이 달라진다.
```
상태: yaw, pitch(±85° 클램프 — 턴테이블: 학생에게 트랙볼보다 직관적), 각속도 ω
드래그 중: 포인터 Δ → 각도 직접 반영, ω = 최근 50ms 이동량 / 시간
놓은 뒤:   ω ← ω · exp(−k·dt)   (k = theme.motion.inertiaDecay, dt는 초)  ← 시간 기반
           |ω| < ε 이면 정지 → 렌더 중단(demand)
핀치: 줌(거리) — 동일 시간 기반 감쇠
더블탭: 기본 시점(등각)으로 복귀
시점 프리셋(정면·측면·위·등각): 쿼터니언 SLERP + easeInOutCubic 600ms
최종 카메라 자세는 Quaternion으로 저장(CanvasItem.view3d) → 내보내기 각도 = 화면 각도
```
- **그리기와의 충돌**: 3D 객체는 탭하면 "조작 모드"(테두리 강조). 조작 모드에서만 1지/펜 드래그 = 회전.
  객체 밖을 탭하면 해제 → 다시 그리기. (항상 회전 가능하게 두면 근처에 필기하다 객체가 돈다.)

### 12.4 등장·전환 모션
등장: scale 0.92→1 + opacity, easeOutExpo 400ms / 시점 전환 600ms / 슬라이더 치수 변경은 지오메트리 재생성(파라메트릭이라 즉시).
reduced-motion → 0.

### 12.5 Space3D
- 축: 3개 화살표 + `x, y, z` 라벨(HTML 오버레이, 3D→화면 투영 위치 매 프레임 갱신).
- 점: 화면 고정 크기 원(스프라이트). 라벨 `A(1,2,3)` KaTeX.
- `showProjections`: 점에서 xy·yz·zx 평면으로 점선 수선 — 교과서 공간좌표 그림의 핵심.
- 평면: 반투명 사각 패치(범위 내 클리핑) + 테두리. 곡면: 격자 48(모바일 32) 와이어 + 단색 면.

### 12.6 3D → 벡터 SVG 내보내기 (M6)
교과서의 입체 그림은 선화다. 래스터 캡처보다 **투영 SVG**가 노트에서 훨씬 선명하다.
```
1) 현재 카메라로 모든 모서리 끝점을 화면 좌표로 투영
2) 다면체: 각 모서리의 가시성 = 인접 두 면 중 하나라도 카메라를 향하면 보임(볼록 다면체에서 정확)
   비볼록·복합 장면: 모서리를 N등분해 각 점을 깊이 버퍼(readPixels 1회)와 비교해 보임/숨음 구간 분할
3) 곡면: §12.2의 해석적 윤곽선을 그대로 투영
4) 출력: 보이는 선 <path stroke-width=2>, 숨은 선 stroke-dasharray, 라벨은 MathJax SVG
```
`style:"shaded"`이거나 곡면(space3d.surfaces)이면 래스터 캡처(동기 `gl.render` → 즉시 `toBlob`, 3×)로 폴백.

---

## 13. 화학 (M4)

### 13.1 렌더러: RDKit.js MinimalLib
- lazy 로드(첫 화학 객체 생성 시) + 서비스 워커 캐시. 로딩 중에는 shimmer.
- 흐름: `SMILES → get_mol → (실패 시 에러 카드) → 정규 SMILES로 IR 저장 → get_svg(옵션)`.
- **검증이 공짜**: RDKit sanitization이 원자가 오류(5가 탄소 등)를 거른다. smiles-drawer는 이걸 못 한다.
- 스타일:
  - `skeletal`: 기본 골격식
  - `full`: 수소를 명시적으로 추가하고 모든 탄소 라벨 표시(고교 "구조식") — 드로잉 옵션 JSON으로 제어. **정확한 옵션 키는 P5에서 설치 버전 문서로 확인**
  - `kekule` / `aromaticCircle`: 벤젠 표기 토글
- 원소색은 theme.ts와 동기화(C `#1A1A1A`, O `#DC2626`, N `#2563EB`). 교과서용은 **흑백이 기본**, 색은 토글.
- `commonName` → 구조식 아래 캡션.
- 인터페이스: `ChemRenderer { validate(smiles); toSvg(smiles, style) }` 뒤에 격리 — 교체·폴백 대비.

### 13.2 입력 경로
손그림 → VLM → SMILES / SMILES 직접 입력 / **이름 입력(한글 사전 → PubChem)** (§9.3).

### 13.3 반응식
`chemEq` → KaTeX mhchem(화면) / MathJax mhchem(내보내기). 화살표·계수·상태 기호 `(s)(l)(g)(aq)`.

### 13.4 범위 밖
3D 분자 모델(볼앤스틱) → P8 (`3Dmol.js` 또는 three 자작 후보).

---

## 14. 내보내기 · 노트 앱 연동 (이 프로젝트의 실용성이 결정되는 곳)

### 14.1 원칙
노트 앱에 들어가는 것은 **이미지**다(§1). 그러니 이미지의 품질과 "넣는 동작의 마찰"이 전부다.
- 품질: 벡터 우선(SVG → 고해상도 PNG), 3×, 여백 8%, 선 굵기는 노트 확대를 고려해 내보내기 시 1.25배.
- 마찰: **끌어다 놓기 1동작**이 목표. 안 되면 2동작(복사 → 붙여넣기).

### 14.2 출력물
| 형식 | 용도 | 비고 |
|---|---|---|
| PNG (3×) | 노트 붙여넣기 기본 | **배경: 투명 / 흰색 토글** (G4 — 노트 다크 모드에서 투명+검은 선은 안 보인다). 기본값은 흰색, 설정에 기억 |
| SVG | PC·벡터 편집 | 수식은 MathJax path, 3D는 투영 선화(§12.6) |
| "다시 열기 링크" | 노트에 같이 붙여 두고 나중에 편집 | §14.5 |

크기 프리셋(노트 기준): 작게 / 보통 / 크게 = 논리 폭 360 / 640 / 960px (×3 렌더).

### 14.3 노트로 넣는 경로 — 갤럭시 탭 실기 스파이크 (P6 첫날)
아래 4경로를 **실제 갤럭시 탭 + 삼성노트 + (가능하면) GoodNotes 안드로이드**에서 시험하고 결과표를 CONTINUE.md에 남긴 뒤 UI 우선순위를 정한다.

| # | 경로 | 구현 | 사전 판단 |
|---|---|---|---|
| ① | **분할 화면 / 팝업 창 드래그 앤 드롭** | 결과 객체를 `<img draggable>`로 렌더. `src`는 **같은 출처의 실제 https URL**(`/export/<id>.png` — 서비스 워커가 Cache Storage에서 응답)로. blob:/data: URL은 앱 간 드래그에서 거부될 가능성이 높아 비교군으로만 | Chrome 안드로이드(태블릿)는 이미지 드래그를 다른 앱으로 넘기는 기능이 있다. 삼성노트 수용 여부는 실기 확인 |
| ② | 클립보드 | `navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })])` — **Promise를 직접 전달**(사용자 제스처 유지). 이후 삼성노트에서 길게 눌러 붙여넣기 또는 삼성 키보드 클립보드 | 안드로이드 Chrome의 이미지 클립보드는 앱마다 수용이 다르다는 보고가 있다. 실기 확인 |
| ③ | 공유 시트 | `navigator.canShare({ files })` → `navigator.share({ files:[png] })` → 삼성노트/GoodNotes 선택 | 대체로 동작. 단 기존 노트 커서 위치가 아니라 **새 노트**로 들어갈 수 있다 |
| ④ | 파일 저장 | `<a download>` → 갤러리/내 파일 → 노트에서 이미지 삽입 | 항상 동작(최후 폴백) |

PC(삼성노트 Windows·OneNote 등): ② 클립보드가 사실상 표준 → `Ctrl+C` 한 번.
iPad(GoodNotes): ③ 공유 시트 + ② 클립보드.

UI: 객체 바텀시트 첫 줄에 **기기에서 1순위로 판정된 경로**의 큰 버튼 하나 + "다른 방법" 접힘 메뉴.
모든 경로는 실패 시 다음 경로로 자동 안내(토스트 + 버튼). 침묵 실패 금지.

### 14.4 노트 → SketchLab (역방향) — §6.3 요약
Share Target(설치 PWA) / PC 붙여넣기 / 파일 열기. 매니페스트:
```json
"share_target": {
  "action": "/share-target", "method": "POST", "enctype": "multipart/form-data",
  "params": { "files": [{ "name": "image", "accept": ["image/png", "image/jpeg", "image/webp"] }] }
}
```
서비스 워커가 POST를 가로채 이미지를 IndexedDB에 넣고 `/?shared=<key>`로 리다이렉트.
⚠️ Share Target은 **설치된 PWA + 유효한 HTTPS 인증서**에서만 동작(§16.1).

### 14.5 다시 열기 링크 & PNG 메타데이터
- 링크: `https://<호스트>/#ir=<base64url(deflate(JSON IR))>` — `CompressionStream("deflate-raw")`. 노트에 텍스트로 같이 붙여 둔다.
  링크를 열면 해시를 **zod로 검증**(외부 입력) 후 캔버스에 객체 복원. 길이가 2,000자를 넘으면 경고(일부 앱이 자름).
- PNG에도 `iTXt` 청크(`sketchlab-ir`)로 IR을 넣는다 → SketchLab에 그 PNG 파일을 다시 열면 편집 가능 객체로 복원.
  ⚠️ 노트 앱에 붙여넣으면 재인코딩되어 메타데이터가 사라질 수 있다 → **링크가 주 경로, 메타데이터는 보조.**

---

## 15. UI/UX (v3 §12 유지 + 반응형 확장)

### 15.1 디자인 토큰 (`theme.ts`, P0에 이미 있음 — 아래 키만 추가)
```typescript
motion: { ..., inertiaDecay: 4.5 /* 1/s, §12.3 */, morph: 250 },
export: { scale: 3, padding: 0.08, strokeBoost: 1.25, bg: "white" as "white" | "transparent" },
```

### 15.2 화면 구조 · 반응형 (분할/팝업 대응 — v4)
컨테이너 폭 기준 3단계:
| 모드 | 폭 | 레이아웃 |
|---|---|---|
| wide | ≥ 900px | 상단 툴바 + 캔버스 + 우하단 FAB |
| split | 480~899px (탭 분할 화면) | 툴바 아이콘만, 바텀시트 높이 50% |
| compact | < 480px (팝업 창·폰) | 툴바를 하단 바로 이동, FAB 위에 겹치지 않게, 바텀시트 = 전체 높이 시트 |

원칙(v3 유지): 결과는 **그린 자리에 in-place** / ✨ 정리하기 = 엄지 존 FAB / 상단엔 펜·지우개·올가미·undo·redo만 /
그 외 기능은 객체 탭 → 바텀시트. 3D 객체는 시트 위로 보이도록 시트 높이 제한.

### 15.3 상태 디자인 (v3 유지 + 추가)
| 상태 | 처리 |
|---|---|
| 첫 실행 | 중앙 고스트 힌트 → 첫 스트로크에 페이드아웃 (구현됨) |
| Tier 1 대기 | 그룹 위 shimmer + FAB 스피너. 캔버스는 잠그지 않음 |
| 저신뢰 | 객체 우상단 `?` 배지 → 탭하면 대안 펼침 |
| 인식 실패 | 연한 에러 카드: "해석하지 못했어요 · 다시 그리기 / 직접 입력" |
| 오프라인 | FAB 오프라인 배지 + "도형 보정과 직접 입력은 계속 됩니다" |
| RDKit 로딩 | 화학 객체 자리 shimmer + "화학 엔진 준비 중(처음 한 번)" |
| 내보내기 실패 | 토스트 + 다음 경로 버튼 |
| 예산 초과(429) | "오늘 인식 한도에 도달했어요 · 직접 입력은 가능" |

---

## 16. 배포 · HTTPS · 비용

### 16.1 HTTPS 단계별 (A4)
| 단계 | 방법 | secure context | 서비스 워커/PWA/Share Target |
|---|---|---|---|
| PC 개발 | `http://localhost:5173` | ✅ | ✅ |
| 탭 빠른 실기 (현재) | basic-ssl `https://<LAN IP>:5173` + 경고 1회 통과 | ✅ | ❌ **인증서 오류로 SW 등록 거부** |
| 탭 USB 실기 | `adb reverse tcp:5173 tcp:5173` → 탭에서 `http://localhost:5173` | ✅ | ✅ (localhost 예외) |
| **탭 무선 실사용 (권장)** | **Tailscale serve**(tailnet 전용) → `https://<머신>.<tailnet>.ts.net:<포트>` 정식 인증서 | ✅ | ✅ |
| 공개 배포 (선택) | 정적 클라이언트(Cloudflare Pages 등) + 서버(Render/Fly 등) | ✅ | ✅ |

Tailscale 사용 시:
- 공개 인터넷(**funnel**)이 아니라 tailnet 전용(**serve**)으로만 연다 — API 키가 걸린 서버를 공개하지 않는다.
  다른 서비스가 같은 머신에서 serve를 쓰고 있다면 경로·포트가 겹치지 않게 붙인다.
- 머신 호스트명은 문서·코드·커밋에 하드코딩하지 않는다(`.env`의 `ALLOWED_ORIGINS`에만).
- 탭에 Tailscale 앱이 설치·로그인되어 있어야 한다.

### 16.2 운영 형태
v1 기본: **개발 PC가 서버**(Vite 빌드 정적 파일 + Express API를 한 포트에서 서빙) + Tailscale serve.
PC가 꺼져 있으면 Tier 0·수동 입력·내보내기는 PWA 캐시로 동작, VLM만 오프라인 배지.

### 16.3 비용 (2026-10 단가, 1회 인식 추정)
| 모델 | 입력 $/1M | 출력 $/1M | 1회 추정 (이미지 ~1.5k + 시스템 ~0.6k 입력, thinking 포함 출력 ~1k) |
|---|---|---|---|
| `claude-opus-5-5` (기본) | 4 | 20 | 약 $0.03 |
| `claude-sonnet-5-5` | 2 | 10 | 약 $0.015 |
- 하루 30회 사용 시 Opus 5.5 기준 약 $1 미만. `DAILY_BUDGET_USD` 기본 1.
- 시스템 프롬프트는 prompt caching 대상(최소 캐시 길이 미만이면 캐시 안 됨 — `usage.cache_read_input_tokens`로 확인, 0이어도 정상일 수 있음).
- 서버는 매 응답의 `usage`를 로그에 남기고 일일 누적 비용을 계산한다.

---

## 17. 범위 방어선

❌ 임의 2D→3D 재구성 (카탈로그만) / 자체 인식 모델 학습 / 협업·계정·클라우드 동기화 /
한글 문장 손글씨 인식(수식 속 한글 라벨은 VLM이 처리) / 동영상·GIF / 3D 분자 모델 /
노트 앱 내부 직접 기록(API 없음) / 단면·전개도 렌더(필드만 예약) / 다크 모드 /
log 스케일 축 → 전부 **P8 백로그**.

---

## 18. 함정 목록 v4

| # | 함정 | 대응 |
|---|---|---|
| 1 | `touch-action` 미설정 → 스크롤 | `none` (구현됨) |
| 2 | 펜 빠른 획 각짐 | `getCoalescedEvents` (구현됨) + 예측 점 |
| 3 | 3D 선 1px | `LineSegments2`+`LineMaterial` |
| 4 | 리사이즈 후 선 굵기 | `resolution` 갱신 |
| 5 | 3D 캡처 검정 | 동기 render → 즉시 toBlob |
| 6 | 클립보드 이미지 거부 | Promise 직접 전달 + 다음 경로 폴백 |
| 7 | `tan x` 수직선 | null 브레이크 + 점근선은 별도 점선 |
| 8 | **강제 `tool_choice` 400** | 구조화 출력(`messages.parse` + `zodOutputFormat`) (A1) |
| 9 | **`temperature` 400** | 삭제, `effort`만 (A2) |
| 10 | **zod 4 ↔ 스키마 변환 불일치 / 튜플 미지원** | 와이어 스키마 분리 + 변환 함수 (A3) |
| 11 | **자체 서명 인증서에서 SW 등록 실패** | adb reverse / Tailscale serve (A4) |
| 12 | VLM 비용 | 명시 액션 + 해시 캐시 + 일일 예산 + rate limit |
| 13 | 모바일 프레임 드랍·발열 | dpr≤2, `frameloop="demand"`, three lazy, 곡면 해상도 32 |
| 14 | **120Hz에서 감쇠가 2배 빠름** | 시간 기반 `exp(−k·dt)` (M8) |
| 15 | **S Pen 버튼 → 에어 커맨드** | 접촉 중 버튼만 사용 (G2) |
| 16 | 당겨서 새로고침·엣지 제스처 | `overscroll-behavior:none` + 가장자리 여백 |
| 17 | 수식 PNG 폰트 깨짐 | MathJax SVG path |
| 18 | `foreignObject` 수식이 내보내기에서 사라짐 | HTML 오버레이 + 내보내기는 MathJax |
| 19 | SMILES 침묵 실패 / 틀린 구조를 그럴듯하게 그림 | RDKit sanitize + 에러 카드 |
| 20 | **투명 PNG가 다크 모드 노트에서 안 보임** | 흰 배경 기본 (G4) |
| 21 | 앱 간 드래그에서 blob: URL 거부 | SW가 응답하는 실제 https URL (§14.3) |
| 22 | 노트 붙여넣기 시 PNG 메타데이터 소실 | 다시 열기 링크가 주 경로 |
| 23 | 3D 조작과 필기 충돌 | 탭 → 조작 모드에서만 회전 (§12.3) |
| 24 | 확대 내보내기에서 곡선 각짐 | 출력 해상도로 재샘플 (§11.3) |
| 25 | 음함수에서 RHS 추출 붕괴 | 식 분류기 선행 |
| 26 | 원이 타원 | aspect equal 기본 |
| 27 | CE API 변경(0.x) | `math/evaluate.ts` 래퍼 한 곳에 격리 + 버전 고정 |
| 28 | RDKit WASM 첫 로드 지연 | lazy + SW 캐시 + 로딩 상태 |
| 29 | 오픈 프록시화 / 키 소진 | CORS + rate limit + ACCESS_TOKEN + 예산 + funnel 금지 |
| 30 | `setPointerCapture` 예외로 입력 전체 중단 | try/catch (구현됨) |
| 31 | 필압 외곽선 감김 방향 혼재 → 획 가운데 구멍 | `normalizeWinding` (구현됨, 건드리지 말 것) |
| 32 | 소스 인코딩 깨짐 → 한글 주석 손상 | UTF-8 고정 |

---

## 19. 파일 구조 (현재 + 예정)

```
sketchlab/
├── CONTINUE.md  README.md  .env.example  package.json  …   (P0)
├── docs/ MASTERSPEC_v3.md  MASTERSPEC_v4.md                  # 전 버전 보존
├── shared/src/
│   ├── ir.ts  ir.test.ts                    (P0 → P2에서 v4 스키마로)
│   ├── migrate.ts                           (P2) v3→v4 IR 마이그레이션
│   ├── wire.ts  wireToIR.ts  (+ tests)      (P3b) VLM 와이어 스키마
│   └── irLink.ts                            (P6) 다시 열기 링크 인코딩/디코딩
├── client/src/
│   ├── App.tsx  ErrorBoundary.tsx  DebugPanel.tsx  debug.ts   (P0)
│   ├── store/  session.ts  persistence.ts                     (P1)
│   ├── ink/    PointerCanvas InkLayer geometry simplify outline palmRejection grouping (P1)
│   │           penExtras.ts                  (P1.5) hover·예측 점·측면 버튼
│   ├── recognize/ tier0/  tier1/  imageInput/                 (P2·P3b·P7)
│   ├── manual/    MathInput.tsx(MathLive)  ChemInput.tsx  SolidPicker.tsx   (P3a·P5·P4)
│   ├── math/      classify.ts  evaluate.ts  sample.ts  integrate.ts         (P3a)
│   ├── render/    theme.ts  Shape2DView  Plot2DView  axes.ts  sliders  FormulaView
│   │              three/ (lazy) SolidView  Space3DView  controller.ts  hiddenLines.ts  silhouettes.ts  solids.ts
│   │              ChemView  chem/ rdkit.ts  names.ko.ts  pubchem.ts
│   ├── correct/   바텀시트 (대안·편집)
│   ├── ui/        FAB  Toolbar  Sheet  Toast  EmptyHint  layoutMode.ts
│   └── export/    png.ts  svg.ts  project3d.ts  clipboard.ts  share.ts  drag.ts  mathjax.ts
├── client/public/ manifest·아이콘 (P7)
├── server/src/    index.ts  recognize.ts  budget.ts  auth.ts  (P3b)
└── tests/         unit/  e2e/(Playwright)  fixtures/ sketches/ latex.txt  visual/(골든 스크린샷)
```

---

## 20. 개발 Phase (v4 재편)

> **API 키 없이 쓸모 있는 것부터** 만든다. VLM은 그 위에 얹는 편의 기능.

### P0 ✅ / P1 ✅ (완료 — CONTINUE.md)

### P1.5 — 갤럭시 탭 실기 마감 (0.5일)
S Pen hover 커서, 예측 점, 측면 버튼(접촉 중), `overscroll-behavior`, 반응형 3모드(§15.2), `adb reverse` 안내.
**Accept**: 사용자가 탭에서 S Pen으로 필기 → 스크린샷: 필압 굵기 변화·손바닥 무시·분할 화면(split 모드) 레이아웃 정상.

### P2 — Tier 0 + IR v4 (1.5일)
ir.ts v4(optional 필드·새 kind) + `migrate.ts` → 분류기 + Vitest → Shape2DView → in-place cross-fade.
**Accept**: 5도형×10회 중 8+ 정답(자동+실기). 스냅 후 기울기 보존. 기존 객체 불변. v3 IR 샘플 → v4 마이그레이션 테스트 통과.

### P3a — 수식·그래프 엔진 + 수동 입력 (3일) *(API 키 불필요)*
CE 래퍼(3단 폴백) → 식 분류기 → 적응 샘플링 → Plot2D(**aspect·π눈금·점근선·축라벨**) → FormulaView(KaTeX+mhchem)
→ MathLive 입력 → **계수 슬라이더 + 모핑** → **적분 음영 + 값**.
**Accept**: `y=x^2-3`·`y=1/x`·`y=\log_2 x`·`y=\sin x`·`x^2+y^2=1`·`r=1+\cos\theta`·`y=a\sin(bx)`(슬라이더)·`\int_0^2 x^2dx`(=8/3) 전부 정상.
sin은 π 눈금, 1/x는 점선 점근선, 원은 원. 수직선 없음(자동 테스트). latex 회귀 50식 렌더 에러 0.
슬라이더 드래그 중 프레임 드랍 없음(Performance 패널 스크린샷). **골든 스크린샷 시각 회귀 테스트 도입.**

### P3b — VLM 인식 + 서버 보안 (2일)
와이어 스키마 + 변환 → **JSON Schema 실측 + API 1회 실호출 확인** → recognize.ts(구조화 출력) → 보안(CORS·rate limit·ACCESS_TOKEN·예산) → 클라 Tier 1(캐시·shimmer·에러 카드) → VLM 목 서버.
**Accept**: 손글씨 `y=x^2-3` 사진 → 그래프. 분당 11번째 요청 429. 무효 응답 주입 → 생존 + 에러 카드. kind-data 불일치 → zod 차단. usage 로그에 비용 기록.

### P4 — 3D (2.5일)
카탈로그 14종 파라메트릭 → LineSegments2 → **2패스 숨은선** → 곡면 해석적 윤곽선 → **자작 시간 기반 컨트롤러** → 조작 모드 → Space3D(점·벡터·직선·평면·수선·곡면) → lazy·컨텍스트 복구.
**Accept**: 60fps 이상 회전+관성(탭 120Hz에서도 같은 손맛). 정육면체 숨은 모서리가 정확히 3개 점선(등각 시점). 원기둥 실루엣이 회전 내내 접선 유지. `A(1,2,3)` + 수선. 초기 번들에 three 없음.

### P5 — 화학 (1.5일)
RDKit lazy → ChemRenderer → 스타일 3종 + 원 표기 → commonName → 이름 입력(한글 사전 + PubChem) → 반응식.
**Accept**: 벤젠 스케치 → `c1ccccc1` + 캡션. "에탄올" 입력 → 구조식. 5가 탄소 SMILES → 에러 카드. `\ce{2H2 + O2 -> 2H2O}` 렌더.

### P6 — 내보내기 + 노트 연동 (2.5일)
**첫날: §14.3 실기 스파이크(갤럭시 탭 + 삼성노트) → 결과표.** → PNG/SVG(배경 토글·크기 프리셋) → MathJax → 3D 투영 SVG → 클립보드/공유/드래그/파일 폴백 체인 → 다시 열기 링크 + PNG iTXt.
**Accept**: 탭에서 1순위 경로로 삼성노트에 들어감(사용자 스크린샷). PC에서 `Ctrl+C` → 삼성노트 Windows 붙여넣기. 400% 확대 무손상. 다크 모드 노트에서 보임. 링크 열면 객체 복원.

### P7 — 정정 UI + 상태 + PWA + 역방향 연동 (2일)
바텀시트(대안·편집·검증), 배지·shimmer·오프라인, annotations, reduced-motion, `vite-plugin-pwa` + **Share Target**, 이미지 입력(붙여넣기·파일·공유), Tailscale serve 배포(사용자 승인 후), VLM 회귀 세트 20장(수식 8·그래프 4·화학 4·입체 4).
**Accept**: 오인식 3탭 정정. 비행기 모드에서 Tier 0·수동 입력·내보내기 동작. 삼성노트 스마트 셀렉트 → 공유 → SketchLab 인식. eval ≥80%.

**총 약 17일** (하루 3~4시간). P0·P1 완료분 제외 시 잔여 약 15.5일.

### P8 백로그 (v1.1+)
회전 GIF·짧은 영상 / 단면·전개도 / 3D 분자 / 다크 모드 / log 스케일 축 / Mathpix 인식 제공자(수식·화학 손글씨 정확도 비교용 — 유료) /
여러 객체 한 번에 내보내기(페이지 단위) / 삼성노트 PC 앱에서 페이지 이미지 일괄 인식.

---

## 21. 품질 게이트 (v1.0 출시 전)

- [ ] CI 녹색 (lint + typecheck + Vitest) / 골든 스크린샷 시각 회귀 통과
- [ ] 실기: **갤럭시 탭 Chrome(주)** · 삼성 인터넷 · 갤럭시 폰 · PC Chrome · (가능하면) iPad Safari — 전부 HTTPS
- [ ] 분할 화면·팝업 창에서 레이아웃 정상
- [ ] 3D 회전 ≥60fps, 120Hz 기기에서 관성 손맛 동일
- [ ] 그래프 검수: π 눈금 / 점근선 점선 / 원≠타원 / 수직선 없음 / 축 라벨 / 슬라이더 모핑 / 적분 값
- [ ] 삼성노트(탭·PC) · GoodNotes 붙여넣기 400% 확대, 다크 모드 노트에서 보임
- [ ] 비행기 모드: Tier 0 · 수동 입력 · 내보내기 + 오프라인 배지
- [ ] Share Target 역방향 흐름
- [ ] reduced-motion
- [ ] VLM 무효 응답 / kind-data 불일치 / 강제 tool_choice 미사용 확인(코드 grep)
- [ ] rate limit 429 / 예산 429 / ACCESS_TOKEN 없으면 401
- [ ] 초기 번들 <250KB gzip / eval ≥80%
- [ ] 첫 실행 힌트 → 첫 스트로크 페이드아웃

---

## 22. 개발자 메모

- **설명할 수 있어야 하는 핵심 6**: ① 왜 브라우저인가(§4) ② IR 계약 + 판별 유니온 + 와이어 분리(§8)
  ③ 2티어 + 수동 입력의 트레이드오프(§9) ④ 씬 모델(§7) ⑤ 교육 규범이 왜 렌더러 요구사항인가(§11.2)
  ⑥ **"노트 앱 안"이 불가능할 때 마찰을 어떻게 최소화했는가(§14)** — 실용성의 정체.
- 직접 짤 것(설명할 거리가 많은 순): 점근선 검출기 / 적응 샘플링 / 2패스 숨은선·실루엣 계산 / 시간 기반 관성 / Tier 0 분류기.
- 프로젝트 한 줄 요약: *"인식(기하 알고리즘 + VLM)과 렌더링을 중간 표현으로 분리하고, 교과서의 시각 규범(축 비율·π 눈금·점근선·숨은선)을
  렌더러 요구사항으로 정형화했으며, 노트 앱의 API 부재를 분할 화면 드래그·공유 대상·복원 링크로 우회했다."*

---

**변경 이력**
- v4 (2026-10-17): 실현 가능성 감사, 갤럭시 탭·S Pen·노트 연동 흐름(드래그·클립보드·공유·Share Target·복원 링크),
  API 드리프트 수정(구조화 출력·temperature·zod 4·모델 ID), HTTPS/SW 함정, 공간좌표·계수 슬라이더·적분·카탈로그 확장,
  RDKit 화학·이름 입력·반응식, 2패스 숨은선·해석적 실루엣·시간 기반 컨트롤러·3D 벡터 내보내기, 적응 샘플링, Phase 재편(P1.5·P3a/b)
- v3 (2026-07-29): 3중 렌즈 리뷰 18건
- v2 (2026-07-29): 전문 리뷰 12건
- v1 (2026-07-29): 최초 작성
