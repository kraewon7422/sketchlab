# SketchLab

**Sketch it rough with a pen; get a textbook-quality figure back, right where you drew it.**

[![CI](https://github.com/kraewon7422/sketchlab/actions/workflows/ci.yml/badge.svg)](https://github.com/kraewon7422/sketchlab/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/demo-live-2563EB)](https://kraewon7422.github.io/sketchlab/)
[![License: MIT](https://img.shields.io/badge/license-MIT-1A1A1A)](LICENSE)

![A hand-drawn triangle, tilted rectangle, circle, arrow, right triangle and line, and the same shapes snapped into clean geometry](docs/images/before-after.png)

![Hand-drawn parabolas, an oval, an S-curve, a wave and a heart, and the same strokes as exact parabolas, an exact ellipse and smooth curves](docs/images/curves-before-after.png)

**▶ Try it: [kraewon7422.github.io/sketchlab](https://kraewon7422.github.io/sketchlab/)**. Draw a shape, then tap ✨ (or press <kbd>Enter</kbd>).
On a tablet, finish a stroke and hold the pen still for half a second: that stroke snaps on its own.
Tap the **ƒ** button to type an equation (`y=x^2-3`, `y=a sin(bx)`, `x^2+y^2=4`, `\int_0^2 x^2 dx`) and get a textbook graph,
or pick a 3D solid and turn it with your finger. **Tap anything to copy it into your notes.**

> 🇰🇷 [한국어 설명은 아래에 있습니다](#한국어)

---

## Why I made it

I take math and science notes by hand on a Galaxy Tab. Drawing a clean graph, a solid you can
rotate, or a chemical structure inside a notes app is slow, and the usual workaround (plotting in
Python and pasting the image) looks rough and isn't interactive at all.

SketchLab's goal is a tool that sits **next to the notes app** (split screen or pop-up window).
You sketch roughly, it turns the sketch into a precise, textbook-style figure, and you drag the
result into your notes. It runs in the browser, so the same tool works on a tablet, a phone and a PC.

## Status

Built in phases; each phase has acceptance criteria (automated tests plus a real-browser check)
that must pass before the next one starts. The full design is in the
[master spec](docs/MASTERSPEC_v4.md) (Korean).

| Phase | What | State |
|---|---|---|
| P0 | Monorepo, strict TypeScript, CI, HTTPS dev server | ✅ |
| P1 | Pen input: pressure, palm rejection, undo/redo, auto-grouping, local persistence | ✅ |
| P1.5 | S Pen polish: hover cursor, predicted points, side-button eraser, responsive layouts, **any-color pens and highlighter with size sliders, stroke stabilizer, two-finger pan and pinch zoom** | ✅ |
| **P2** | **Local shape recognition (Tier 0): lines, arrows, polygons, circles, arcs, parabolas, ellipses, smooth curves** | ✅ **← the live demo** |
| **P3a** | **Graph engine + typed input: textbook axes (1:1 scale, π ticks, dashed asymptotes), coefficient sliders, integrals** | ✅ |
| **P3b** | **AI: handwriting → text, formulas, graphs, molecules and reactions; "ask AI" to draw molecules, reactions and graphs from a sentence. Bring your own model: OpenRouter (cloud, free tiers) or a local Ollama. Molecules are always verified with PubChem + RDKit** | ✅ |
| **P4** | **3D solids and 3D coordinate space, with smooth inertial rotation and exact hidden lines** | ✅ |
| **P5** | **Chemistry: skeletal formulas from a name (benzene, 에탄올) or SMILES, aromatic circles, full structural formulas (RDKit layout, lazy-loaded)**; handwriting recognition next | ✅ / 🔜 |
| **P6** | **Into your notes: tap → Copy / Save / Share as a crisp 3× PNG, or drag the preview into a split-screen notes app** (re-edit links next) | ✅ / 🔜 |
| **P7** | **Note-app editing: tool rail, tap/lasso select, move, resize, duplicate, recolor, lock, stroke/area eraser, rich text boxes, shape tool, pen presets, notebook pages with ruled/grid/graph paper, whole-page PNG/PDF export, dark screen, installable offline app (PWA)** | ✅ |
| **P8** | **Linear algebra: systems of linear equations (lines + exact intersection, or augmented matrix → RREF → solution) and matrices (det, inverse, rank, transpose, product) with exact fractions** | ✅ |

## Textbook graphs

![Six graphs drawn by SketchLab: a parabola, sin x with pi ticks, 1/x, a circle, the integral of x squared from 0 to 2 with its shaded area and exact value 8/3, and a sin(bx) with coefficient sliders](docs/images/graphs.png)

Typed equations become graphs that follow textbook conventions rather than plotting-library defaults:

- **1:1 axis scale** by default, so a circle is a circle and *y = x* is at 45°; the view is chosen so
  the interesting part of the curve and the x-axis are both visible.
- **π/2 ticks** with textbook labels (−π, −π/2, π/2, π, 3π/2…) when the function is purely trigonometric;
  nice 1·2·5 steps otherwise; origin labelled *O*; arrowheads on the axes; no grid.
- **No vertical lines through discontinuities.** Adaptive sampling refines only where the curve bends on
  screen; a jump that survives the deepest refinement is a real discontinuity, so `tan x` and `1/x` break
  cleanly instead of drawing a line from +∞ to −∞.
- **Dashed asymptotes** found automatically (vertical where the curve diverges at a break, horizontal where
  it converges far away), snapped to exact values like π/2 — and not drawn on top of the axes.
- **Coefficient sliders** for extra letters (`y = a sin(bx)`), redrawing live; one undo step per drag.
- **Definite integrals** show the shaded area and the exact value from symbolic integration
  (∫₀² x² dx = 8/3 ≈ 2.667).
- Implicit curves (marching squares) and polar curves; anything that is not a graph is typeset as a formula.

Parsing and evaluation use [Compute Engine](https://cortexjs.io/compute-engine/) (compiled to JS,
strict real mode so √(−1) is a gap, not a complex number) and formulas are typeset with
[KaTeX](https://katex.org). Both load only when the first graph is created.

## Rotatable 3D solids

![Eight solids drawn as textbook line drawings: cube, cylinder, cone, sphere, square pyramid, octahedron, conical frustum and icosahedron, with hidden edges dashed](docs/images/solids.png)

Textbook solids are line drawings, so SketchLab draws them that way — as vectors, not shaded 3D meshes:

- **Exact hidden lines.** Parallel projection; a face is visible when its rotated normal faces the viewer,
  which on these convex solids decides every edge exactly: an edge is solid if it touches a visible face,
  dashed if it doesn't (a cube from the standard view: 9 solid, 3 dashed).
- **Curved surfaces** are smooth groups of small facets. Edges inside a group are never drawn — only the
  rims and the **silhouette**, where facing flips. A cylinder gets its two generator lines, a sphere its
  outline and a half-dashed equator, from the same single rule.
- **Smooth rotation.** Drag to turn (turntable, pitch limited to ±85°), release to let it glide. The glide
  slows by `ω ← ω·e^(−k·dt)` — time-based, so it feels the same on 60 Hz and 120 Hz screens. Double-tap
  returns to the standard view; the angle is saved with the drawing (one undo step).
- **3D coordinate space**: type points like `A(2,3,4)` to get the textbook picture — x, y, z axes, the point
  with its coordinates, and the dashed box of perpendiculars to the coordinate planes with the feet marked
  on the axes. Rotates the same way.
- No WebGL and no 3D library: a few hundred edges per frame in plain SVG, sharp at any zoom, and ready to
  export as vectors. 14 solids: cube, box, the five Platonic solids, prism, pyramid, frustum, cylinder, cone,
  conical frustum, sphere, hemisphere.

## Into your notes

Tap any shape, graph, solid or formula to select it, then:

| Action | What happens | Best for |
|---|---|---|
| **Copy** | a 3× PNG on the clipboard | long-press → Paste in Samsung Notes / GoodNotes; <kbd>Ctrl</kbd>+<kbd>V</kbd> on a PC |
| **Save** | downloads the PNG | always works: insert it from the gallery |
| **Share** | the system share sheet | Android / iPad, picking the notes app |

The image is made from exactly what is on screen: the object is cloned into a standalone SVG — formula
captions included, with KaTeX's CSS and fonts embedded — and drawn at 3× on a **white background**
(a transparent PNG would make black lines vanish in a dark-mode note). One detail that took a measurement
to find: Chrome treats an SVG containing HTML (`foreignObject`) as tainted when it is loaded from a
`blob:` URL and refuses to export the canvas; loaded from a `data:` URL it is fine.

## How shape recognition works

Everything in the demo runs **locally in the browser**: no server, no network, about 0.1 ms per
shape on a desktop CPU.

```
pen strokes ──▶ classify each stroke ──▶ combine strokes ──▶ snap ──▶ Scene IR ──▶ SVG renderer
                line / arc / circle /      arrows, polygons    exact      (zod-validated,
                polygon / parabola /       drawn as 3 lines    90°, ...    versioned JSON)
                ellipse / smooth curve
```

1. **Resample by arc length.** Stored strokes are simplified (RDP), so straight parts have almost
   no points. Resampling evenly lets corners be measured over a fixed *fraction of the stroke length*,
   which makes every threshold scale-invariant: a tiny triangle and a huge one get the same answer.
2. **Find corners** as peaks of the turning angle, measured over a window on each side.
3. **Fit**: total-least-squares lines for edges (vertices = intersections of neighbouring edges,
   so corners come out sharp), and an algebraic (Kåsa) circle fit for round shapes.
4. **Curves.** A parabola is fitted in a rotated frame (any tilt) and stored as one quadratic Bézier —
   a parabola segment *is* a quadratic Bézier, so it is exact, not approximated; nearly symmetric ones become
   exactly symmetric. Elongated loops become ellipses (axis ratio and tilt kept). Everything else becomes a
   smooth Catmull-Rom curve with evenly spaced control points that keeps the drawn shape and only its truly
   sharp corners (a heart keeps its tips; a sine wave keeps round peaks).
5. **Combine and snap.** A triangle drawn as three separate lines becomes one triangle. Near-equal
   sides become an equilateral triangle; four near-right angles become a rectangle (or a square), keeping
   the **original tilt**. A near-right triangle gets an exact 90° corner *and* the right-angle mark.
6. **Leave handwriting alone.** A group of several small strokes that includes curves looks like writing,
   so nothing in it is touched: a half-straightened word is worse than the original. (Reading handwriting is
   a later phase.)

A few problems that only showed up with realistic, wobbly input, each now pinned by a test:

| Problem | Fix |
|---|---|
| Closing a shape, the pen overshoots the start; joining the ends creates two fake corners | Trim the stroke where it passes closest to its own start |
| A handwritten **S** has two sharp-ish bends and turned into a zigzag | A real corner turns almost as much over a short window as over a long one; a smooth bend doesn't (`sharpRatio`). A real corner also passes close to where its two edges meet; a bend cuts inside (`roundCut`) |
| Smoothed sine waves came out as "tents": straight sides, pointy peaks | Measured the short/long turn ratio: true corners ≥ 0.83, tight bends ≤ 0.63 → only ≥ 0.75 stays sharp inside curves; and control points are spaced evenly (uneven RDP points pinch Catmull-Rom curves) |
| Narrow U-shaped parabolas were filed as "curve" | Their tight vertex looks like a corner; when straight edges don't fit, try the parabola fit before falling back |
| Small, quickly drawn arrowheads are too shaky to read as a clean "V" | An unclassifiable stroke counts as an arrowhead only at the tip of a line and swept back along it; anywhere else it still rejects the group |
| On tiny strokes the measuring window shrank below hand jitter | Pixel minimums for both windows |

**Measured accuracy**: synthetic hand-drawn shapes with low-frequency wobble, jitter, random
rotation and size, and an over- or under-shot close; 8 seeds × 40 tries per shape:

| Circle | Line | Arrow | Ellipse | Parabola | Rectangle | Triangle |
|---|---|---|---|---|---|---|
| 100% | 100% | 100% | 100% | 98.8% | 99.4% | 99.1% |

Also: 198 / 200 hand-drawn arcs stay arcs (not parabolas), sharp V's stay V's (100 / 100), and
0 / 400 small handwriting groups ("2x=") are changed.

## Engineering notes

- **One contract between recognition and rendering.** Every recognized object is a *Scene IR*
  value, a [zod](https://zod.dev) discriminated union ([`shared/src/ir.ts`](shared/src/ir.ts)), so
  a mismatched `kind`/`data` pair can't get through. Coordinates are object-local and normalized,
  never canvas pixels. IR is versioned, and stored data from older versions is migrated
  ([`migrate.ts`](shared/src/migrate.ts)) and re-validated on load. Anything invalid falls back to
  the original ink rather than being lost.
- **Input at 120 Hz without jank.** Pointer events bypass React. The live stroke is updated by
  appending only the new segment to an SVG path each animation frame; the store is touched once
  per stroke. Coalesced events recover fast strokes, and predicted events reduce perceived latency
  without ever entering the saved stroke.
- **Crisp pressure-sensitive ink: one outline per stroke.** The first version drew each stroke as
  hundreds of overlapping quads and joint polygons; each piece is anti-aliased separately, and on a
  high-resolution tablet the seams looked blurry and pixelated. Now a stroke is a single closed path — a
  centripetal Catmull-Rom centerline (no overshoot on uneven point spacing), smoothed pressure,
  quadratic-Bézier sides and true arc end caps — rebuilt every frame while drawing (3000 points in a few ms).
- **Undo/redo via immer patches**; recognition is a single undo step that restores the exact original ink.
- **Design tokens only.** Every colour, size and duration comes from
  [`theme.ts`](client/src/render/theme.ts). Textbook visual language: 2 px `#1A1A1A` lines, no
  gradients or glow.

## Tech stack

TypeScript (strict) · React 19 · Vite · zustand + immer · zod · SVG (no chart libraries) ·
Compute Engine · KaTeX · IndexedDB · Vitest · Playwright · GitHub Actions · npm workspaces
(`shared/`, `client/`, `server/`)

AI runs straight from the browser to the provider you choose in **AI settings**: an OpenRouter key
(cloud models, including free ones) or an Ollama server on your own PC. The key or address is stored
only in that device's local storage. The `server/` package is a stub and is not needed.

## Run it locally

```bash
npm install
npm run dev          # https://localhost:5173, also exposed on your LAN for a tablet
```

| Command | What it does |
|---|---|
| `npm run dev` | Client dev server (HTTPS, reachable from a tablet on the same Wi-Fi) |
| `npm run ci` | Lint + typecheck + all tests |
| `npm test` | Unit tests only (Vitest) |
| `npm run build` | Production build → `client/dist` |

Opening the dev server from a tablet: use the `Network` address it prints, and accept the
self-signed-certificate warning once. HTTPS is needed because clipboard, share sheet and
`crypto.subtle` only work in a secure context.

## Project layout

```
shared/src/        Scene IR schema + migration (the contract)
client/src/
  ink/             pen input, palm rejection, stroke outlines, grouping
  recognize/tier0/ local shape recognition (fit.ts, classify.ts + tests)
  math/            graph engine: sampling, asymptotes, ticks, view, LaTeX analysis
  solid/           3D catalog meshes, projection and hidden-line classification
  render/          SVG renderers, design tokens
  store/           session store (undo/redo), IndexedDB persistence
  ui/              responsive layout modes
server/src/        API proxy (P3b)
docs/              master spec (design source of truth, Korean)
```

## License

[MIT](LICENSE)

---

<a id="한국어"></a>

## 한국어

**펜으로 대충 그리면, 그린 자리에서 교과서 품질의 그림으로 바뀌는 도구.**

갤럭시 탭으로 수학·과학 필기를 하면서, 노트 안에서 깔끔한 그래프·돌려볼 수 있는 입체·화학 구조식을
그리기가 너무 번거로워서 만들기 시작했습니다. 파이썬으로 그려 붙이는 방법은 결과가 투박하고
인터랙티브하지도 않습니다. SketchLab은 노트 앱 **옆에** (분할 화면·팝업 창) 띄워 두고 대충 그리면
정확한 그림으로 바꿔 주고, 결과를 노트로 끌어다 넣는 것을 목표로 합니다. 브라우저에서 돌아가므로
태블릿·폰·PC 어디서나 같은 도구를 씁니다.

**▶ 체험: [kraewon7422.github.io/sketchlab](https://kraewon7422.github.io/sketchlab/)**:
도형을 그리고 ✨를 누르세요. 태블릿에서는 획 끝에서 펜을 0.5초 멈추면 그 획이 바로 반듯해집니다.
**그림을 톡 치면 [복사 · 저장 · 공유] 메뉴**가 나옵니다 — 복사한 뒤 삼성노트·GoodNotes에서 길게 눌러 붙여넣기.

### 현재 단계

**ƒ 버튼으로 식을 입력하면 교과서식 그래프**(1:1 축 비율, π 눈금, 점선 점근선, 계수 슬라이더,
정적분 넓이와 정확한 값, 축·식 표시 켜고 끄기)가 그려지고, **화학 구조식**(벤젠·에탄올 같은 이름이나 SMILES 입력 → 교과서 골격식, 벤젠 고리의 원 표기, 모든 원자를 쓴 구조식)과 **입체도형 14종**(정육면체·원기둥·원뿔·구·정다면체 등)을 손가락으로 돌려 볼 수 있습니다
(숨은선은 정확한 점선, 관성 회전, 두 번 탭하면 처음 각도). 그리고 펜 입력(필압·팜 리젝션·되돌리기, **획 하나를 매끈한 외곽선 하나로 그려 고해상도 화면에서도 선명**) +
**로컬 도형 인식**(선분·화살표·원·호·다각형·**포물선·타원·매끈한 자유 곡선**, 정삼각형·직사각형·정사각형 스냅,
기울기 보존, 직각 표시). 인식은 전부 브라우저 안에서 돌아가며
서버·네트워크가 필요 없습니다. **AI**(🤖 AI 설정에서 OpenRouter 키 또는 내 PC의 Ollama 연결)를 켜면 ✨가 손글씨 글자·수식·그래프·분자·반응식을 알아보고, ƒ의 "AI에게 부탁" 탭에서 "에탄올을 산화하면?"처럼 말로 부탁해 분자·반응식·그래프를 그릴 수 있습니다 (분자 구조는 항상 PubChem·RDKit으로 확인). 펜은 색(무지개·색상·채도·밝기)·굵기·형광펜·흔들림 보정을 고를 수 있고, 두 손가락으로 화면을 옮기고 확대합니다. 그린 것은 눌러서 복사·저장·공유하거나, 분할 화면에서 미리보기를 끌어 삼성노트·GoodNotes에 놓을 수 있습니다. 다음은 손글씨 수식·구조식 인식입니다.
전체 설계: [마스터 스펙 v4](docs/MASTERSPEC_v4.md).

### 로컬 실행

```bash
npm install
npm run dev
```

태블릿에서 열기: PC와 같은 Wi-Fi에 연결 → 터미널에 나온 `Network` 주소(`https://192.168.x.x:5173`)를
태블릿 Chrome에 입력 → "연결이 비공개로 설정되어 있지 않습니다" 경고에서 **고급 → 계속** (기기당 1회).
클립보드·공유 기능은 HTTPS에서만 동작하기 때문에 경고를 넘겨야 합니다.

| 명령 | 하는 일 |
|---|---|
| `npm run dev` | 개발 서버 (HTTPS, 같은 Wi-Fi의 태블릿에서 접속 가능) |
| `npm run ci` | 린트 + 타입 검사 + 전체 테스트 |
| `npm run build` | 프로덕션 빌드 |
