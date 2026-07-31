# SketchLab — 개발 마스터 스펙 v3

> 손으로 그린 스케치를 수학·과학 표준 표현으로 변환하고, 인터랙티브 3D/그래프로
> 보여준 뒤, 노트 앱에 붙여넣을 수 있게 내보내는 크로스플랫폼 웹 도구.
>
> **문서 버전**: v3 (2026-07-29) — 3중 렌즈(개발·교육·디자인) 리뷰 반영 개정
> **대상**: Claude Code 개발 세션
> **원칙**: 이 문서 하나만 읽고 Phase 0부터 순서대로 구현 가능해야 한다

---

## 0. v2 → v3 변경 요약 (3중 렌즈 리뷰)

### 0.1 개발자 렌즈 (D)
| # | 심각도 | 내용 | 반영 |
|---|---|---|---|
| D1 | 🔴 | **v2의 zod 스키마는 판별 검증이 안 된다.** `data: Shape2D \| Solid3D \| …` 평면 유니온은 `kind`와 `data`의 짝을 강제하지 못해 `kind:"chem"` + `data:{primitives:…}` 같은 불일치가 통과한다. `z.discriminatedUnion("kind", …)`으로 재구성. 또한 `zodToJsonSchema`는 기본으로 `$ref`를 뿜는데 Tool Use 스키마에서 말썽 — `$refStrategy:"none"` 필수 | §6.1, §7.3 |
| D2 | 🔴 | Compute Engine `.compile()`은 **모든 식을 컴파일하지 못한다** (미지원 연산 시 undefined). v2는 이때 에러 처리로 끝냈는데, 실제로는 `.N()` 점별 평가 폴백으로 그릴 수 있는 식이 많다. 컴파일 → 폴백 → 에러 3단으로 | §9.1 |
| D3 | 🔴 | `extractRHS`의 "우변 추출" 가정은 `x^2+y^2=1` 같은 **음함수에서 붕괴**한다. 식 분류기(명시적/음함수/수식-only)를 먼저 태우고 경로 분기 | §9.2 |
| D4 | 🟠 | **secure context 누락.** `navigator.clipboard`·`navigator.share`·`crypto.subtle`(해시)은 HTTPS 또는 localhost에서만 동작한다. 태블릿 실기 테스트를 LAN IP(http)로 하면 내보내기가 전부 죽는다 — 개발 단계부터 HTTPS 셋업 명시 | §12.3 |
| D5 | 🟡 | rate limit이 프록시/CDN 뒤에 가면 전 사용자가 같은 IP로 묶인다 — `app.set("trust proxy", 1)` + 배포 환경 문서화 | §7.5 |
| D6 | 🟡 | immer patches는 `enablePatches()` 호출이 선행돼야 한다(빠뜨리면 런타임 에러). IndexedDB 쓰기는 pointermove 중이 아니라 **스트로크 종료 시에만** | §5.3 |
| D7 | 🟡 | React ErrorBoundary·디버그 패널이 규약(§2-6)에만 있고 구조에 없음. `.env.example` 부재 | §16 |

### 0.2 수학·과학 교육자 렌즈 (E)
| # | 심각도 | 내용 | 반영 |
|---|---|---|---|
| E1 | 🔴 | **축 단위 비율 미정의.** 기본이 뷰포트 맞춤이면 `y=x`가 45°로 안 보이고 원이 타원으로 그려진다 — 교육 도구로서 실격. 단위 비율 1:1(`aspect:"equal"`)을 기본으로, 지수함수처럼 세로로 폭발하는 경우만 자동 해제 | §8.3 |
| E2 | 🔴 | 삼각함수 x축 눈금이 정수면 교과서와 어긋난다. **trig 감지 시 π/2 단위 눈금**(라벨 `π/2, π, 3π/2…`)이 규범 | §8.3 |
| E3 | 🟠 | `1/x`·`tan x`의 **점근선을 점선으로 표시**해야 교과서 그림이 된다. v2는 선을 끊기만 했다. 불연속 경계에서 수직 점근선 후보를 검출해 점선 렌더 | §8.3 |
| E4 | 🟠 | 축 이름(`x축: 시간(s)` 등)이 IR에 없다 — 과학 그래프에 축 라벨은 필수. `view.xLabel/yLabel` 추가 | §6.1 |
| E5 | 🟡 | 근·y절편·꼭짓점 주석 토글 — 교육 가치 크지만 v1 범위 밖 → P8 백로그 | §14 |
| E6 | 🟡 | 전개도(net)·단면 뷰 — 매우 교육적이나 공수 큼 → `crossSection` IR 필드는 유지하되 **P8로 명시** (v2는 IR에 있는데 Phase에 없는 유령 기능이었다) | §14 |
| E7 | 🟢 | 화학 관용명 캡션 토글 (`c1ccccc1` → "벤젠 (benzene)") — VLM이 이미 알고 있으므로 IR에 `commonName?` 한 필드로 공짜 구현 | §6.1 |

### 0.3 웹디자이너 렌즈 (W)
| # | 심각도 | 내용 | 반영 |
|---|---|---|---|
| W1 | 🔴 | **v2에 UI/UX 스펙이 사실상 없다** (레이아웃 분할 한 줄뿐). 디자인 토큰(간격·라운드·타이포·모션), 컴포넌트 목록, 화면 구조가 미정이면 구현자가 임의로 만들고 → "AI가 만든 티 나는 UI"가 된다. 디자인 시스템 절 신설 | §12.1 |
| W2 | 🟠 | **인터랙션 원칙 미정:** 결과를 어디에 보여주나? → **그린 자리 그대로 교체(in-place)** 가 원칙. 별도 결과 패널 금지(노트 흐름 파괴). 정정 UI만 바텀시트. "정리하기"는 엄지 존 FAB | §12.2 |
| W3 | 🟠 | 상태 디자인 부재: 첫 실행 빈 화면(뭘 해야 할지 모름), Tier 1 대기 중(멈춘 것처럼 보임), 저신뢰 결과(불안하게 보임) — 각각 힌트 오버레이 / 그룹 위 shimmer / 은은한 confidence 배지로 정의 | §12.2 |
| W4 | 🟡 | 선택·그룹 하이라이트 시각 미정의, 아이콘 세트 미정(lucide-react), UI 폰트 미정(**Pretendard** — 수식의 KaTeX와 병존) | §12.1 |

**유지되는 축** (재검토 금지): 파이썬 배제(§3), Scene IR(§6), 2티어 인식(§7),
3D 카탈로그(§7.4), 씬 모델(§5), Tool Use 강제 출력(§7.3), 교과서 시각 언어(§8.1).

---

## 1. 프로젝트 정의

### 1.1 한 줄 정의
> 노트 필기 환경에서 **삐뚤빼뚤한 손그림 → 교과서 품질의 정확한 도형·그래프·수식·화학구조**로
> 바꿔주고, 3D는 손가락으로 돌려볼 수 있게 하고, 결과를 노트 앱에 그대로 붙여넣는 도구.

### 1.2 사용 시나리오 (이걸 못 하면 실패)
1. 태블릿 브라우저에서 연다 (설치 없음)
2. 삼각형을 대충 그린다 → 0.1초 안에 **그 자리에서** 반듯해짐
3. 같은 화면에 `y = x^2 - 3` 손글씨 → ✨ 탭 → 포물선 그래프. 삼각형은 그대로
4. `y = sin x` → x축 눈금이 **π/2 단위**로 찍힌 교과서 그래프
5. `y = 1/x` → 축이 **점선 점근선**과 함께, 원점 대칭 쌍곡선
6. 정육면체 스케치 → 3D 전환, 60fps 관성 회전
7. 육각형+교대 이중결합 → 벤젠 구조식 + "벤젠 (benzene)" 캡션
8. 객체 탭 → 복사 → GoodNotes/삼성노트 붙여넣기 → 투명 고해상도
9. 오인식 → 객체 탭 → 바텀시트에서 대안 선택 또는 LaTeX/SMILES 수정

### 1.3 지원 인식 카테고리
| 카테고리 | 예시 | 티어 |
|---|---|---|
| 평면도형 | 삼각형, 사각형, 원, 다각형, 화살표 | Tier 0 (로컬) |
| 입체도형 | 정육면체, 직육면체, 원기둥, 원뿔, 구, 각뿔, 각기둥, 정사면체 | Tier 1 (VLM) |
| 좌표·그래프 | 축·점·벡터 / 다항·유리·삼각·지수·로그·매개변수·음함수 | Tier 1 |
| 수학식 | 계수, 지수, 분수, 근호, 로그, 적분, 시그마, 극한, 행렬 | Tier 1 |
| 화학구조 | 벤젠, 사슬, 작용기, 이중·삼중결합, 고리화합물 | Tier 1 |

---

## 2. 작업 규약 (Claude Code)

1. Phase **순서 엄수**. Acceptance(자동 테스트 포함) 미통과 시 다음 Phase 금지.
2. Phase 종료마다 **실기 브라우저 스크린샷 검증**. 컴파일 성공 ≠ 완료.
3. §0의 "유지되는 축"은 재검토 없이 따른다.
4. 큰 구조 변경 시 `_v2` 파일 신설, 원본 보존.
5. 외부 입력(VLM·사용자 편집)은 경계에서 zod 검증. 내부는 검증된 데이터만.
6. 에러를 삼키지 않는다 — UI 에러 카드 또는 디버그 패널 기록.
7. **색·굵기·간격·모션 값은 `theme.ts` 토큰만 사용.** 컴포넌트 하드코딩 금지 (W1).

---

## 3. 핵심 결정 ①: 파이썬 렌더링 전면 배제

| 파이썬이 "밤티"나는 구조적 원인 | 브라우저 해법 |
|---|---|
| matplotlib CPU 래스터 (확대 시 뭉개짐) | GPU 합성 + SVG 벡터 |
| FuncAnimation 프레임 덤프 (실시간 불가) | requestAnimationFrame 60fps |
| mplot3d 오일러각 (짐벌락) | 쿼터니언 SLERP |
| AA 부재 (계단현상) | WebGL MSAA |
| 선형 보간 (기계적 움직임) | 이징·스프링 |
| 이벤트 루프 100ms+ | 포인터 직결 <16ms |

Manim은 오프라인 렌더러 — 인터랙티브 부적합.

> **렌더링·애니메이션·UI는 100% 브라우저. 파이썬은 런타임에 없다.**
> 부수 효과: 태블릿·폰·PC 지원 공짜.

---

## 4. 기술 스택 (v3 확정)

```
언어/빌드    : TypeScript (strict) + Vite
패키지       : npm workspaces — client/ + server/ + shared/
UI           : React 18 + Tailwind CSS + lucide-react (아이콘)
UI 폰트      : Pretendard Variable (한글 UI) / KaTeX 폰트 (수식)   ← v3 (W4)
상태         : zustand + immer (enablePatches 선행 호출 — D6)
3D           : three + @react-three/fiber + drei — React.lazy 지연 로드
2D 벡터      : 자작 SVG 렌더러 (차트 라이브러리 금지)
수식 표시    : KaTeX (화면) / mathjax-full tex2svg (내보내기, lazy)
수식 파싱    : @cortex-js/compute-engine — compile → N() 폴백 (D2)
화학 2D      : smiles-drawer + 자작 검증 (ChemRenderer 인터페이스 뒤에 격리)
잉크         : Pointer Events API
스키마       : zod (shared/, discriminatedUnion — D1)
저장         : IndexedDB (idb)
PWA          : vite-plugin-pwa
서버         : Node 20 + Express + @anthropic-ai/sdk
서버 보안    : express-rate-limit + trust proxy + cors allowlist + 3MB 상한
테스트       : Vitest + Playwright / VLM 회귀 세트
CI           : GitHub Actions — lint + typecheck + vitest
개발 HTTPS   : vite-plugin-mkcert (D4 — 태블릿 실기 테스트 필수)
```

**금지**: 차트 라이브러리 / 파이썬 백엔드 / localStorage / `THREE.Line` 기본 재질 /
프론트 API 키 / 자작 LaTeX 파서.

**성능 예산**: 초기 JS(three 제외) < 250KB gzip. three·mathjax는 lazy 청크.

---

## 5. 씬 모델과 상태

### 5.1 CanvasItem
```typescript
type CanvasItem =
  | { id: string; kind: "ink";    strokes: Stroke[]; bbox: BBox }
  | { id: string; kind: "object"; ir: SceneIR;       bbox: BBox;
      sourceStrokes: Stroke[];                        // 재인식·되돌리기용. 불변
      transform: { x: number; y: number; scale: number } };

type Stroke = { id: string; points: { x:number; y:number; p:number; t:number }[]; bbox: BBox };
```
인식 성공 → `ink`가 `object`로 **그 자리에서** 교체 (in-place cross-fade — W2).

### 5.2 스트로크 그룹핑
```
1. 올가미/탭 명시 선택이 항상 우선
2. 자동: 직전 스트로크와 시간 <2s AND bbox 20% 팽창 교차 → 같은 그룹
3. "정리하기"는 활성 그룹에만 적용. 그룹 경계는 은은한 하이라이트로 항상 시각화
```

### 5.3 스토어 (zustand + immer)
```typescript
import { enablePatches } from "immer";
enablePatches();                                  // ⚠️ D6: 앱 부팅 시 1회. 빠뜨리면 런타임 에러

type Store = {
  items: CanvasItem[];
  selection: string[];
  activeGroupId: string | null;
  history: { undo: Patch[][]; redo: Patch[][] };
  addStroke(s: Stroke): void;                     // 완성된 스트로크만 (진행 중은 로컬 ref)
  recognize(ids: string[]): Promise<void>;
  applyIR(ids: string[], ir: SceneIR): void;
  undo(): void; redo(): void;
};
```
- Undo 단위: 스트로크 추가 / 인식 적용 / 이동 / 삭제.
- **IndexedDB 쓰기는 스트로크 종료·객체 변경 시에만** (D6). pointermove 중 금지.
- 복원은 부팅 시 1회 (스토어→DB 단방향).

---

## 6. Scene IR (v3: 판별 유니온 재구성 — D1)

```
스트로크 → [인식기] → SceneIR → [렌더러] → 화면/내보내기
```

### 6.1 스키마 (shared/ir.ts — **코드가 곧 명세**)
```typescript
import { z } from "zod";

const Vec2 = z.tuple([z.number(), z.number()]);

const Shape2D = z.object({
  primitives: z.array(z.discriminatedUnion("t", [
    z.object({ t: z.literal("line"),    a: Vec2, b: Vec2 }),
    z.object({ t: z.literal("circle"),  c: Vec2, r: z.number().positive() }),
    z.object({ t: z.literal("arc"),     c: Vec2, r: z.number().positive(),
               from: z.number(), to: z.number() }),
    z.object({ t: z.literal("polygon"), pts: z.array(Vec2).min(3), closed: z.boolean() }),
    z.object({ t: z.literal("arrow"),   a: Vec2, b: Vec2 }),
  ])),
  labels: z.array(z.object({ text: z.string(), at: Vec2 })).optional(),
  marks:  z.array(z.object({ t: z.enum(["rightAngle","tick","angleArc"]), at: Vec2 })).optional(),
});

const Solid3D = z.object({
  solid: z.enum(["cube","box","cylinder","cone","sphere","prism","pyramid","tetrahedron"]),
  params: z.record(z.number()),
  showEdges: z.boolean().default(true),
  showHiddenEdges: z.boolean().default(true),
  crossSection: z.object({ normal: z.tuple([z.number(),z.number(),z.number()]),
                           offset: z.number() }).optional(),   // 렌더는 P8 (E6)
  labels: z.array(z.object({ text: z.string(), vertex: z.number() })).optional(),
});

const Plot2D = z.object({
  functions: z.array(z.object({
    latex: z.string(),                       // 단일 진실 (expr 없음)
    kind: z.enum(["explicit","parametric","implicit","polar"]),
    domain: z.tuple([z.number(), z.number()]).optional(),
    color: z.string().optional(),
  })).min(1),
  view: z.object({
    xmin: z.number(), xmax: z.number(), ymin: z.number(), ymax: z.number(),
    xLabel: z.string().optional(),           // ← v3 (E4) "시간 t (s)" 등. LaTeX 허용
    yLabel: z.string().optional(),
    aspect: z.enum(["equal","auto"]).default("equal"),   // ← v3 (E1) 기본 1:1
  }),
  grid: z.boolean().default(false),
  points: z.array(z.object({ at: Vec2, label: z.string().optional() })).optional(),
});

const Plot3D = z.object({
  surfaces: z.array(z.object({ latex: z.string(), kind: z.literal("explicit") })).min(1),
  view: z.object({ xmin:z.number(), xmax:z.number(), ymin:z.number(), ymax:z.number(),
                   zmin:z.number(), zmax:z.number() }),
  resolution: z.number().int().min(16).max(96).default(48),
});

const Formula = z.object({ latex: z.string().min(1) });

const Chem = z.object({
  smiles: z.string().min(1),                 // 단일 진실. 좌표 저장 금지
  display: z.enum(["skeletal","kekule"]).default("skeletal"),
  commonName: z.string().optional(),         // ← v3 (E7) "벤젠 (benzene)" 캡션
  highlights: z.array(z.number().int()).optional(),
});

const meta = {
  version: z.literal("3.0"),
  confidence: z.number().min(0).max(1),
  source: z.enum(["local","vlm"]),
};

// ⭐ D1: kind와 data의 짝을 스키마 수준에서 강제
export const SceneIRSchema = z.discriminatedUnion("kind", [
  z.object({ ...meta, kind: z.literal("shape2d"), data: Shape2D }),
  z.object({ ...meta, kind: z.literal("solid3d"), data: Solid3D }),
  z.object({ ...meta, kind: z.literal("plot2d"),  data: Plot2D }),
  z.object({ ...meta, kind: z.literal("plot3d"),  data: Plot3D }),
  z.object({ ...meta, kind: z.literal("formula"), data: Formula }),
  z.object({ ...meta, kind: z.literal("chem"),    data: Chem }),
]);
// alternatives는 재귀를 피해 별도 필드로 감싼 RecognizeResult에 둔다:
export const RecognizeResult = z.object({
  best: SceneIRSchema,
  alternatives: z.array(SceneIRSchema).max(2).optional(),
});
export type SceneIR = z.infer<typeof SceneIRSchema>;
```

### 6.2 IR 원칙
- 좌표 정규화 (캔버스 픽셀 금지) / LaTeX·SMILES 단일 진실 / 경계에서 zod parse 필수.
- **v2와의 차이**: 판별 유니온으로 kind-data 불일치가 스키마에서 차단됨.
  alternatives 재귀 제거(Tool Use JSON Schema 변환 안정성).

---

## 7. 인식 파이프라인

```
그룹 확정 → Tier 0 (로컬 <30ms, 항상)
          → Tier 1 (VLM 1~2s, ✨ 명시 액션만) → 도착 시 in-place 교체
          → 실패/저신뢰 → Tier 2 (정정 바텀시트)
```

### 7.1 Tier 0 — 로컬 기하 인식 (순수 함수, 단위테스트 1순위)
```
닫힘(|시작-끝| < 길이×0.15) → 원 검사(중심거리 std/mean<0.12, 최소제곱 피팅)
→ RDP(ε=화면폭 0.2%) 꼭짓점 수 → 3/4/n각형 → 각도로 직사각형·정사각형 판별
열림 → 최소제곱 직선 잔차 → 직선 / 자유곡선 유지
화살표: 긴 선 끝 + 짧은 선 2개 예각
```
**스냅 시 크기·위치·회전 보존.** 축 정렬 강제 금지.

### 7.2 Tier 1 전처리
- 흰 배경 + 검은 3px AA 선 오프스크린 렌더, 여백 8%, 긴 변 ≤1024px
- 해시 = `crypto.subtle.digest("SHA-256", 직렬화된 (x,y,t) 정수열)` → IndexedDB 캐시 키
  (⚠️ secure context 필요 — §12.3)

### 7.3 Tier 1 — VLM (Tool Use 강제 출력)
```typescript
import { zodToJsonSchema } from "zod-to-json-schema";
import { RecognizeResult } from "../shared/ir";

const inputSchema = zodToJsonSchema(RecognizeResult, {
  $refStrategy: "none",        // ⚠️ D1: $ref 없는 평탄한 스키마로 — Tool Use 호환
});

const SYSTEM = [{
  type: "text" as const,
  text: `You convert a hand-drawn sketch image into structured recognition output.
- Math expression without plottable relation → kind "formula".
- Equation relating variables (y=..., f(x)=..., x^2+y^2=1) → "plot2d".
  Emit LaTeX only. For trig/log/rational functions choose a sensible view range.
- If axes labels are written in the sketch (e.g. "t", "v"), put them in view.xLabel/yLabel.
- Chemical structure → "chem" with canonical SMILES; add commonName when well-known
  (e.g. c1ccccc1 → "벤젠 (benzene)").
- 3D solid sketch → "solid3d" from the catalog with approximate ratios.
- confidence < 0.6 means guessing. Provide up to 2 alternatives when ambiguous.`,
  cache_control: { type: "ephemeral" },
}];

const res = await client.messages.create({
  model: "claude-sonnet-4-6", max_tokens: 2000, temperature: 0,
  system: SYSTEM,
  tools: [{ name: "emit_recognition", description: "Return recognition result.",
            input_schema: inputSchema as any }],
  tool_choice: { type: "tool", name: "emit_recognition" },
  messages: [{ role: "user", content: [
    { type: "image", source: { type: "base64", media_type: "image/png", data: png } },
    { type: "text", text: "Recognize this sketch." }]}],
});
// tool_use 블록 추출 → RecognizeResult.safeParse (이중 안전벨트) → 실패 시 1회 재시도 후 에러 카드
```
클라 규율: ✨ 액션에서만 호출 / debounce 300ms + AbortController / 캐시 우선 /
오프라인이면 버튼에 오프라인 배지.

### 7.4 3D = 카탈로그 매칭 (유지)
일반 2D→3D 재구성 금지. VLM은 "8종 중 무엇 + 비율"만, 모델은 파라메트릭 생성.

### 7.5 서버 보안
```typescript
app.set("trust proxy", 1);                      // ⚠️ D5: 프록시 뒤 실제 IP
app.use(cors({ origin: ALLOWED_ORIGINS }));     // env. "*" 금지
app.use(express.json({ limit: "3mb" }));
app.use("/api/recognize", rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true }));
// 서버측 이미지 크기 재검증 (>1024px → 400)
```
`.env.example`: `ANTHROPIC_API_KEY=` / `ALLOWED_ORIGINS=` / `PORT=8787` (D7)

### 7.6 Tier 2 — 정정 (필수)
객체 탭 → 바텀시트: 대안 / LaTeX 편집 / SMILES 편집. 확정 시 zod + 파서 재검증.
confidence<0.6 → 자동 펼침. "원본으로 되돌리기" = object→ink 복원.

---

## 8. 2D 렌더링 (SVG) — 교과서 규범

### 8.1 시각 언어
```
배경 #FFFFFF(내보내기 투명) / 주선 #1A1A1A 2px / 보조 #D4D4D4 1px
숨은선 점선 [4,4] / 강조 #2563EB·#DC2626·#059669 / 수식 KaTeX(Computer Modern)
네온·그라디언트·글로우 금지. theme.ts 토큰만.
```

### 8.2 함수 샘플링 (v2 수정판 유지)
```typescript
export function sampleFunction(
  f: (x: number) => number,
  view: { xmin: number; xmax: number; ymin: number; ymax: number },
  width: number,
): Array<[number, number] | null> {
  const pts: Array<[number, number] | null> = [];
  const n = width * 2;
  const yJump = (view.ymax - view.ymin) * 0.5;
  const yPad  = (view.ymax - view.ymin) * 0.2;
  let prev: number | null = null;
  for (let i = 0; i <= n; i++) {
    const x = view.xmin + (view.xmax - view.xmin) * i / n;
    let y: number;
    try { y = f(x); } catch { pts.push(null); prev = null; continue; }
    if (!Number.isFinite(y)) { pts.push(null); prev = null; continue; }
    if (prev !== null && Math.abs(y - prev) > yJump) pts.push(null);
    pts.push([x, Math.max(view.ymin - yPad, Math.min(view.ymax + yPad, y))]);
    prev = y;
  }
  return pts;   // null → SVG path의 M(moveto)
}
```

### 8.3 교육자 규범 3종 (v3 신설 — E1·E2·E3, **이 절이 "교과서 같음"을 만든다**)

**(a) 축 단위 비율 — 기본 `aspect:"equal"`**
```
equal: 1 x-unit 픽셀수 == 1 y-unit 픽셀수. 원이 원으로, y=x가 45°로 보인다.
       view 범위가 화면비와 안 맞으면 y범위를 중심 기준으로 확장해 맞춘다.
auto : y값 동적 범위가 x의 8배를 넘으면(지수함수 등) 자동 전환 + 뷰에 "축 비율 다름" 미세 표기.
사용자 토글 제공 (정정 바텀시트).
```

**(b) π 눈금 — trig 감지 시**
```
latex에 \sin·\cos·\tan 포함 && 다항 항 없음 → x축 눈금 π/2 간격.
라벨: -π, -π/2, O, π/2, π, 3π/2 … (KaTeX 렌더).
그 외: 정수 우선 눈금, "nice number" 규칙(1·2·5×10^k).
```

**(c) 점근선 점선 표시**
```
수직: sampleFunction의 null 경계 양측에서 |y|가 뷰 높이 40% 이상 발산하며
      부호가 반대(1/x형) 또는 동일(1/x²형)로 치솟으면 해당 x에 수직 점선.
수평: |x|→뷰 경계에서 y가 상수 c로 수렴(마지막 10% 샘플 std < 뷰높이 1%)하면 y=c 점선.
스타일: #9CA3AF 점선 [6,4] 1.5px — 곡선보다 확실히 연하게.
```

**축 공통 규범**: 끝 화살표, 원점 `O`, 라벨 축 바깥, 기본 격자 없음,
`xLabel`/`yLabel`은 화살표 옆 KaTeX 렌더.

### 8.4 implicit / parametric
- parametric: t 균등 800 샘플, 동일 불연속 규칙
- implicit: marching squares 128×128 (Compute Engine 컴파일 함수로 격자 평가). 정적 렌더만.

---

## 9. 수식 파싱·계산 (v3: 3단 폴백 — D2·D3)

### 9.1 평가 경로
```typescript
const expr = ce.parse(rhsLatex);
if (expr.errors.length) return { kind: "parse_error" };
const compiled = expr.compile();
if (compiled) return (x: number) => compiled({ x });          // 1) 컴파일 (빠름)
return (x: number) => {                                        // 2) .N() 폴백 (느림, 그래도 그림)
  const v = expr.subs({ x }).N().valueOf();
  return typeof v === "number" ? v : NaN;
};
// 3) 둘 다 불가 → "식을 해석하지 못했어요" 카드 + LaTeX 편집 유도. 침묵 금지.
```
`.N()` 폴백은 샘플 수를 절반(픽셀당 1)로 낮춰 프레임 보호.

### 9.2 식 분류기 (extractRHS 대체 — D3)
```
"y=", "f(x)=" 좌변            → explicit: 우변만 파싱
"=" 있음 & 양변에 x,y 혼재     → implicit: f(x,y) = L-R 로 이항해 marching squares
"=" 없음                       → formula(표시만) — 단, 단일변수 식이면 "그래프로 보기" 버튼 제공
"x=f(t), y=g(t)" 패턴          → parametric
```

---

## 10. 3D 렌더링 (Three.js) — v2 유지 + 요점

- 모서리: `EdgesGeometry` → `LineSegments2` + `LineMaterial(linewidth:2)`.
  `material.resolution`은 ResizeObserver로 갱신. `THREE.Line` 기본 재질 금지.
- 회전: Quaternion SLERP + easeInOutCubic. OrbitControls `enableDamping dampingFactor=0.08`,
  `enablePan=false`.
- `<Canvas gl={{antialias:true, alpha:true}} dpr={[1,2]} camera={{fov:35}}>`,
  ambient 0.75 + directional 0.5, 그림자 없음, 면 opacity 0.15~0.25 — 모서리가 주인공.
- 이징: 등장 easeOutExpo 400ms / 시점 easeInOutCubic 600ms / reduced-motion 시 0.
- `React.lazy`로 three 청크 분리. `webglcontextlost/restored` → `invalidate()`.
- Plot3D: 컴파일 함수 → 격자 48(모바일 32) → PlaneGeometry 변형 + 와이어 오버레이. 단색.
- 숨은 모서리: v1 출시엔 "후면 모서리 점선 전체 표시" 단순화 허용.

---

## 11. 화학

- 렌더: smiles-drawer. **검증은 자작** — parse 콜백 성공 + 허용 문자 정규식. 실패 시 에러 카드.
- 케쿨레 ↔ 원 표기 토글. 원소색 theme.ts 동기화 (C #1A1A1A, O #DC2626, N #2563EB).
- `commonName` 있으면 구조식 아래 캡션 (E7).
- `ChemRenderer` 인터페이스 뒤에 구현 격리 — 라이브러리 교체 대비 (RDKit.js는 P8 후보).

---

## 12. UI/UX (v3 신설 — W1·W2·W3·W4)

### 12.1 디자인 시스템 (theme.ts 토큰)
```typescript
export const theme = {
  color: {
    bg: "#FFFFFF", ink: "#1A1A1A", sub: "#D4D4D4",
    accent: "#2563EB", danger: "#DC2626", ok: "#059669",
    selection: "rgba(37,99,235,0.12)",          // 선택 채움
    groupHint: "rgba(37,99,235,0.06)",          // 활성 그룹 배경
    asymptote: "#9CA3AF",
  },
  space: [0, 4, 8, 12, 16, 24, 32],             // px 스케일. 임의값 금지
  radius: { s: 8, m: 12, sheet: 20 },
  font: { ui: "'Pretendard Variable', system-ui, sans-serif" },  // 수식은 KaTeX가 관리
  motion: {
    fast: 150, base: 250, slow: 400,            // ms
    easeOut: "cubic-bezier(0.16,1,0.3,1)",      // easeOutExpo 근사
    spring: { damping: 0.08 },                  // OrbitControls와 공유
  },
  touch: { minTarget: 44 },
} as const;
```
- 아이콘: lucide-react, 1.5px 스트로크 — 잉크 선과 톤 일치.
- 다크 모드는 v1 범위 밖. 단, 색을 토큰으로만 쓰므로 P8에서 팔레트 교체로 대응 가능.

### 12.2 화면 구조·인터랙션 원칙
```
┌─────────────────────────────┐
│  캔버스 (전면. 크롬 최소)        │   원칙 1: 결과는 그린 자리에 in-place 교체.
│                             │           별도 결과 패널 금지 — 노트 흐름 유지.
│              [활성 그룹 hint] │   원칙 2: ✨ 정리하기 = 우하단 FAB (엄지 존).
│                        (✨)  │           그룹 없으면 비활성.
├─ 상단 얇은 툴바 ─────────────┤   원칙 3: 펜/지우개/올가미/undo/redo만 상단.
└─────────────────────────────┘           그 외 기능은 객체 탭 → 바텀시트로.
```
- **객체 탭 → 바텀시트** (radius.sheet, 드래그 핸들): 대안 카드 / LaTeX·SMILES 편집 /
  복사·공유·저장 / 되돌리기. 3D 객체는 시트 위에서도 회전 가능하게 시트 높이 40% 제한.
- 선택 표시: bbox 라운드 사각 + `color.selection` 채움. 핸들은 모서리 4개만 (모바일 오조작 방지).
- 캔버스 제스처: 1지 = 그리기(펜 감지 시 손가락은 팬) / 2지 = 팬·줌 / 길게 탭 = 올가미 시작.

### 12.3 상태 디자인 (W3) + secure context (D4)
| 상태 | 처리 |
|---|---|
| 첫 실행 | 중앙 고스트 힌트: "도형이나 수식을 그리고 ✨를 누르세요" — 첫 스트로크에 페이드아웃 |
| Tier 1 대기 | 활성 그룹 위 shimmer 오버레이 + FAB 스피너. **캔버스는 잠그지 않는다** (계속 그릴 수 있음) |
| 저신뢰 (<0.6) | 객체 우상단 미세 배지 `?` (accent 60%) — 탭하면 바텀시트 대안 자동 펼침. 경고색 금지 |
| 인식 실패 | 객체 자리에 연한 에러 카드: "해석하지 못했어요 · 다시 그리기 / 직접 입력" |
| 오프라인 | FAB에 오프라인 배지, Tier 0는 정상 동작 문구 |
| 내보내기 실패 | 토스트 + "파일로 저장" 폴백 버튼 |

**secure context (D4)**: clipboard·share·crypto.subtle는 HTTPS/localhost 전용.
- 개발: `vite-plugin-mkcert`로 로컬 HTTPS → 태블릿에서 `https://<LAN IP>:5173` 접속
  (최초 1회 인증서 신뢰 등록). **http로 실기 테스트하면 내보내기가 전부 실패한다.**
- 해시 폴백: insecure 환경에선 단순 문자열 해시(fnv1a)로 대체해 개발이 막히지 않게.

### 12.4 플랫폼 잡학
`touch-action:none` / `setPointerCapture` / `getCoalescedEvents` / 팜 리젝션(펜 감지 잠금 +
접촉면 `width>40` 무시) / RDP+Catmull-Rom(원본 불변 보관) / `100dvh` / safe-area /
`maximum-scale=1` / IndexedDB.

---

## 13. 내보내기

| 경로 | 대상 | 비고 |
|---|---|---|
| 클립보드 | PC·안드로이드 | `ClipboardItem`에 **Promise 직접 전달** (iOS 제스처 제약). 실패 → 파일 폴백 |
| 공유 시트 | iOS·iPadOS·갤럭시탭 | `canShare({files})` 확인 후 share. 미지원 → 파일 폴백 |
| 파일 | 전부 | PNG(투명 3×, 여백 8%) + SVG |

- 수식 PNG: 화면 KaTeX / 내보내기 **mathjax-full tex2svg**(path 기반, 폰트 무관). lazy.
- 3D: 캡처 직전 동기 `gl.render` → 즉시 `toBlob` (preserveDrawingBuffer 상시 금지).
- 회전 GIF·삼성노트 MCP 버튼: P8.

---

## 14. 범위 방어선

❌ 일반 2D→3D 재구성 (카탈로그 8종만) / 자체 인식 모델 학습 / 협업·계정·클라우드 /
한글 손글씨 인식 / 동영상 / 화학 3D / 프로젝터·카메라 / implicit 실시간 조작 /
다크 모드 / **단면·전개도 렌더 (E6 — IR 필드만 예약)** / 특징점 주석 (E5)
→ 전부 **P8 백로그**에 기록하고 v1에서 구현하지 않는다.

---

## 15. 함정 목록 v3

| # | 함정 | 대응 |
|---|---|---|
| 1 | `touch-action` 미설정 → 스크롤 | `none` |
| 2 | 펜슬 빠른 획 각짐 | `getCoalescedEvents` |
| 3 | 3D 선 1px | `LineSegments2`+`LineMaterial` |
| 4 | 리사이즈 후 선 굵기 | `resolution` 갱신 |
| 5 | 3D 캡처 검정 | 동기 render→toBlob |
| 6 | iOS 클립보드 거부 | Promise 직접 전달 |
| 7 | `tan x` 수직선 | null 브레이크 + **점근선은 별도 점선으로** (E3) |
| 8 | VLM 형식 이탈 | Tool Use + `$refStrategy:"none"` + zod (D1) |
| 9 | VLM 비용 | 명시 액션 + 해시 캐시 + prompt caching + rate limit |
| 10 | 모바일 프레임 드랍 | dpr≤2, three lazy, Plot3D res 32 |
| 11 | 수식 PNG 폰트 | MathJax path |
| 12 | SMILES 침묵 실패 | validate + 에러 카드 |
| 13 | localStorage 한도 | IndexedDB |
| 14 | 스냅이 회전 제거 | 원본 방향 보존 |
| 15 | 자동 그룹핑 오판 | 올가미 우선 + 그룹 시각화 |
| 16 | WebGL 컨텍스트 손실 | restored→invalidate |
| 17 | 오픈 프록시화 | CORS+rate limit+상한+trust proxy (D5) |
| 18 | CE 파싱·컴파일 실패 | compile→N() 폴백→에러 카드 (D2) |
| 19 | 내보내기 무반응 | 전 경로 폴백 체인 |
| 20 | 스토어-DB 불일치 | 단방향 저장, 부팅 1회 복원 |
| 21 | **http 실기 테스트에서 내보내기 전멸** | mkcert HTTPS (D4) |
| 22 | **음함수에서 RHS 추출 붕괴** | 식 분류기 선행 (D3) |
| 23 | **kind-data 불일치 IR 통과** | discriminatedUnion (D1) |
| 24 | **원이 타원으로 보임** | aspect:"equal" 기본 (E1) |
| 25 | enablePatches 누락 런타임 에러 | 부팅 시 1회 호출 (D6) |

---

## 16. 파일 구조

```
sketchlab/
├── README.md                     # 퀵스타트: pnpm i → .env 작성 → dev:all (HTTPS 안내 포함)
├── .env.example                  # D7
├── docs/ MASTERSPEC_v1~3.md      # 전 버전 보존
├── package.json                  # workspaces
├── .github/workflows/ci.yml
├── shared/   ir.ts hash.ts
├── client/src/
│   ├── App.tsx  ErrorBoundary.tsx  DebugPanel.tsx        # D7
│   ├── store/session.ts          # enablePatches, IndexedDB
│   ├── ink/                      # PointerCanvas, stroke, palmRejection, grouping
│   ├── recognize/ tier0/ tier1/
│   ├── math/ classify.ts evaluate.ts                      # §9.2, §9.1
│   ├── render/ theme.ts Shape2DView Plot2DView(axes.ts: π눈금·점근선·aspect)
│   │           Plot3DView(lazy) Solid3DView(lazy, solids.ts) FormulaView ChemView
│   ├── correct/                  # 바텀시트 (대안·편집)
│   ├── ui/                       # FAB, Toolbar, Sheet, Toast, EmptyHint (§12)
│   └── export/
├── server/src/ index.ts recognize.ts
└── tests/ unit/ e2e/ fixtures/sketches/
```

---

## 17. 개발 Phase (v3 재편)

### P0 — 뼈대 + CI + HTTPS (0.5일)
모노레포, strict TS, Tailwind, theme.ts, ErrorBoundary, mkcert, CI.
**Accept**: 태블릿에서 `https://<LAN IP>` 접속 성공. CI 녹색.

### P1 — 잉크 + 씬 모델 (1.5일)
포인터 캡처·스무딩·필압·팜 리젝션·지우개 / CanvasItem·Undo/Redo(patches)·그룹핑·IndexedDB / 첫 실행 힌트.
**Accept**: 손바닥 대고 그려도 깨끗. 새로고침 복원. 떨어진 두 낙서가 다른 그룹으로 하이라이트.

### P2 — Tier 0 (1.5일)
ir.ts 확정(판별 유니온) → 분류기+Vitest → Shape2DView → in-place cross-fade.
**Accept**: 5도형×10회 중 8+ 정답(자동+실기). 스냅 후 기울기 보존. 기존 객체 불변.

### P3 — VLM + 수식 + 그래프 + 교육 규범 + 보안 (3일)
프록시(Tool Use·caching·rate limit·trust proxy) → 식 분류기 → CE 3단 폴백 →
Plot2D(**aspect equal·π눈금·점근선·축라벨**) → Formula. VLM 목 서버 병행.
**Accept**: `y=x^2-3`·`y=1/x`·`y=\log_2 x`·`y=\sin x` 전부 정상. sin은 π 눈금.
1/x에 점선 점근선. **원을 그린 좌표평면에서 원이 원으로 보임(aspect).**
수직선 없음(자동 테스트). `x^2+y^2=1` implicit 렌더. 분당 11번째 요청 429.

### P4 — 3D (2일)
카탈로그 8종·Line2·damping·숨은선·등장 애니·lazy·컨텍스트 복구.
**Accept**: 60fps 회전+관성. 초기 번들에 three 없음.

### P5 — 화학 (1일)
SMILES 인식→validate→렌더→케쿨레/원 토글→commonName 캡션.
**Accept**: 벤젠 스케치→`c1ccccc1`+캡션. 무효 SMILES→에러 카드.

### P6 — 내보내기 (1.5일)
PNG/SVG/클립보드/공유/3D 캡처/MathJax. 전 경로 폴백. Playwright 스모크.
**Accept**: 아이패드 공유→GoodNotes, PC 복사→삼성노트. 400% 무손상. 폴백 동작.

### P7 — 정정 UI + 상태 디자인 + PWA (1.5일)
바텀시트(대안·편집·검증), confidence 배지, shimmer, 오프라인 배지, reduced-motion,
VLM 회귀 세트 15장.
**Accept**: 오인식 3탭 정정. 비행기 모드 Tier 0. eval 리포트 ≥80%.

**총 12.5~14일** (하루 3~4시간).

### P8 백로그 (v1.1+)
적응 샘플링 / 회전 GIF / 삼성노트 MCP / 특징점 주석(E5) / 단면·전개도(E6) /
RDKit.js / 다크 모드 / Plot3D 고도화 / log 스케일 축.

---

## 18. 품질 게이트 (v1.0 출시 전)

- [ ] CI 녹색 (lint+typecheck+Vitest)
- [ ] 실기 4종 (아이패드 Safari·갤럭시탭 Chrome·아이폰·데스크톱) — **HTTPS로**
- [ ] 3D 60fps (DevTools Performance)
- [ ] 그래프 검수: sin의 π 눈금 / 1/x 점근선 점선 / 원≠타원 / 수직선 없음 / 축 라벨
- [ ] GoodNotes·삼성노트 붙여넣기 400% 확대
- [ ] 비행기 모드 Tier 0 + 오프라인 배지
- [ ] reduced-motion 동작
- [ ] VLM 무효 응답 주입 → 생존 + 에러 카드
- [ ] kind-data 불일치 페이로드 주입 → zod 차단 확인 (D1 회귀)
- [ ] rate limit 429 / 초기 번들 <250KB / eval ≥80%
- [ ] 첫 실행 힌트 → 첫 스트로크 페이드아웃

---

## 19. 개발자 메모

- **설명할 수 있어야 하는 핵심 5**: ① 왜 브라우저(§3) ② IR 계약+판별 유니온(§6)
  ③ 2티어 트레이드오프(§7) ④ 씬 모델(§5) ⑤ **교육 규범이 왜 렌더러 요구사항인가(§8.3)**
  — "그래프가 나온다"와 "교과서 그래프가 나온다"의 차이가 이 프로젝트의 정체성이다.
- 직접 짤 것: Tier 0 분류기 / sampleFunction / 그룹핑 휴리스틱 / **점근선 검출기** —
  마지막 것은 극한 개념이 코드가 되는 지점이라 설명할 거리로도 제일 좋다.
- 프로젝트 한 줄 요약(갱신): *"인식(기하 알고리즘+VLM 2티어)과 렌더링을 중간 표현으로 분리하고,
  수학 교과서의 시각 규범(축 비율·π 눈금·점근선)을 렌더러의 요구사항으로 정형화해
  구현했다."*

---

**변경 이력**
- v3 (2026-07-29): 3중 렌즈 리뷰 18건 — zod 판별 유니온, CE 3단 폴백, 식 분류기,
  HTTPS, 교육 규범 3종(aspect·π눈금·점근선)+축라벨, 디자인 시스템·인터랙션·상태 설계
- v2 (2026-07-29): 전문 리뷰 12건 — 씬 모델, Compute Engine, Tool Use, 보안, 테스트
- v1 (2026-07-29): 최초 작성
