import type { Shape2DData, Shape2DMark, Shape2DPrimitive } from "@sketchlab/shared";
import { memo } from "react";
import { InkStrokes } from "../ink/InkLayer";
import { useMediaUrl } from "./useMediaUrl";
import type { ObjectItem } from "../ink/types";
import { catmullRomBeziers, localToWorld, type ObjectTransform } from "./shape2dGeometry";
import { penOpts, shape, stroke, theme } from "./theme";

/**
 * 평면도형 렌더러 — 교과서 시각 언어 (§11.1): 주선 #1A1A1A 2px, 장식 없음.
 *
 * 좌표는 매번 로컬 → 월드로 바꿔 그린다. <g transform="scale()">를 쓰지 않는 이유:
 * 그러면 선 굵기까지 같이 커져서, 크게 그린 도형은 선이 굵고 작게 그린 도형은 가늘어진다.
 * 교과서 그림은 크기와 관계없이 선 굵기가 같아야 한다.
 */

// 색은 바깥 <g color>에서, 굵기는 바깥 <g strokeWidth>에서 물려받는다 — 색 펜·형광펜 도형도 같은 코드로
const lineProps = {
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "miter",
  strokeMiterlimit: 4,
  fill: "none",
} as const;

export function Shape2DView({ data, transform }: { data: Shape2DData; transform: ObjectTransform }) {
  const width = data.width ?? stroke.main;
  return (
    <g
      color={data.color ?? theme.color.ink}
      strokeWidth={width}
      // 형광펜으로 그려 정리한 도형: 형광펜 자국처럼 반투명 + 곱하기 (아래 글씨가 비친다)
      opacity={data.highlight ? penOpts.highlightOpacity : undefined}
      style={data.highlight ? { mixBlendMode: "multiply" } : undefined}
    >
      {data.primitives.map((p, i) => (
        <Primitive key={i} p={p} tf={transform} width={width} />
      ))}
      {data.marks?.map((m, i) => (
        <Mark key={`m${i}`} m={m} tf={transform} />
      ))}
      {/* 이름표 (좌표축의 x·y·O 등) — 교과서처럼 기울인 세리프, 도형 크기에 비례 */}
      {data.labels?.map((l, i) => {
        const p = localToWorld(l.at, transform);
        return (
          <text key={`l${i}`} x={p.x} y={p.y} fill="currentColor" fontSize={18 * transform.scale} fontStyle="italic" fontFamily="KaTeX_Math, 'Times New Roman', serif" textAnchor="middle">
            {l.text}
          </text>
        );
      })}
    </g>
  );
}

function Primitive({ p, tf, width }: { p: Shape2DPrimitive; tf: ObjectTransform; width: number }) {
  const W = (v: readonly [number, number]) => localToWorld(v, tf);

  switch (p.t) {
    case "line": {
      const a = W(p.a);
      const b = W(p.b);
      return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...lineProps} />;
    }
    case "circle": {
      const c = W(p.c);
      return <circle cx={c.x} cy={c.y} r={p.r * tf.scale} {...lineProps} />;
    }
    case "arc": {
      const c = W(p.c);
      const r = p.r * tf.scale;
      const s = { x: c.x + r * Math.cos(p.from), y: c.y + r * Math.sin(p.from) };
      const e = { x: c.x + r * Math.cos(p.to), y: c.y + r * Math.sin(p.to) };
      const large = p.to - p.from > Math.PI ? 1 : 0;
      // from → to 는 항상 각도 증가 방향(화면에서 시계 방향) = sweep-flag 1
      return <path d={`M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`} {...lineProps} />;
    }
    case "polygon": {
      const pts = p.pts.map(W).map((q) => `${q.x},${q.y}`).join(" ");
      return p.closed ? <polygon points={pts} {...lineProps} /> : <polyline points={pts} {...lineProps} />;
    }
    case "parabola": {
      const a = W(p.p0);
      const c = W(p.c);
      const b = W(p.p1);
      // 포물선 구간은 정확히 2차 베지어 — 근사가 아니다
      return <path d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`} {...lineProps} />;
    }
    case "ellipse": {
      const c = W(p.c);
      return (
        <ellipse
          cx={c.x}
          cy={c.y}
          rx={p.rx * tf.scale}
          ry={p.ry * tf.scale}
          transform={`rotate(${(p.rot * 180) / Math.PI} ${c.x} ${c.y})`}
          {...lineProps}
        />
      );
    }
    case "curve": {
      const segs = catmullRomBeziers(p.pts.map(W), p.closed);
      const first = segs[0]?.[0];
      if (!first) return null;
      const d =
        `M ${first.x} ${first.y}` +
        segs.map(([, c1, c2, e]) => ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${e.x} ${e.y}`).join("") +
        (p.closed ? " Z" : "");
      return <path d={d} {...lineProps} strokeLinejoin="round" />;
    }
    case "arrow": {
      const a = W(p.a);
      const b = W(p.b);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      // 굵은(형광펜) 화살표는 촉도 굵기에 맞춰 크게
      const head = Math.min(Math.max(shape.arrowHead, width * 2.4), len * 0.4);
      const spread = (shape.arrowSpreadDeg * Math.PI) / 180;
      const wing = (sign: number) => ({
        x: b.x - head * (ux * Math.cos(spread) - sign * uy * Math.sin(spread)),
        y: b.y - head * (uy * Math.cos(spread) + sign * ux * Math.sin(spread)),
      });
      const w1 = wing(1);
      const w2 = wing(-1);
      // 몸통은 촉 밑동까지만 — 끝이 둥근 선이 뾰족한 촉 밖으로 삐져나오지 않게
      const neck = { x: b.x - ux * head * 0.8, y: b.y - uy * head * 0.8 };
      return (
        <g>
          <line x1={a.x} y1={a.y} x2={neck.x} y2={neck.y} {...lineProps} />
          <polygon
            points={`${b.x},${b.y} ${w1.x},${w1.y} ${w2.x},${w2.y}`}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={stroke.sub}
            strokeLinejoin="round"
          />
        </g>
      );
    }
  }
}

function Mark({ m, tf }: { m: Shape2DMark; tf: ObjectTransform }) {
  if (m.t !== "rightAngle" || !m.dirs) return null;
  const p = localToWorld(m.at, tf);
  const [d1, d2] = m.dirs;
  const s = shape.rightAngle;
  const a = { x: p.x + d1[0] * s, y: p.y + d1[1] * s };
  const c = { x: p.x + d2[0] * s, y: p.y + d2[1] * s };
  const b = { x: a.x + d2[0] * s, y: a.y + d2[1] * s };
  return (
    <polyline
      points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke.sub}
    />
  );
}

// ─────────────────────────────────────────────────────────── 객체 아이템

/**
 * 방금 인식된 객체 id → 애니메이션 만료 시각.
 * 저장소에서 복원된 객체는 여기 없으므로 새로고침할 때마다 다시 페이드되지 않는다.
 * (StrictMode 이중 마운트에서도 같은 판정이 나오도록 "소비"하지 않고 시각으로 판단한다.)
 */
const freshUntil = new Map<string, number>();

export function markFresh(id: string, now = performance.now()): void {
  freshUntil.set(id, now + theme.motion.base * 4);
}

export function isFresh(id: string): boolean {
  const until = freshUntil.get(id);
  if (until === undefined) return false;
  if (performance.now() > until) {
    freshUntil.delete(id);
    return false;
  }
  return true;
}

/** 사진·PDF 쪽: 캔버스(SVG) 안에 그려서 그 위에 손글씨가 얹힌다. 파일은 media 저장소에서 (예전 쪽은 data URL) */
function ImageItem({ item, fresh }: { item: ObjectItem; fresh: boolean }) {
  const data = item.ir.kind === "image" ? item.ir.data : null;
  const url = useMediaUrl(data?.mediaId);
  if (!data) return null;
  const s = item.transform.scale;
  const href = url ?? data.src;
  return href ? (
    <image data-object-id={item.id} className={fresh ? "sl-fade-in" : undefined} href={href} x={item.transform.x} y={item.transform.y} width={data.w * s} height={data.h * s} preserveAspectRatio="none" />
  ) : (
    // 파일을 불러오는 동안 자리만 (옅은 사각형)
    <rect data-object-id={item.id} x={item.transform.x} y={item.transform.y} width={data.w * s} height={data.h * s} fill="#F1F3F6" />
  );
}

export const ObjectItemView = memo(function ObjectItemView({ item }: { item: ObjectItem }) {
  const fresh = isFresh(item.id);

  if (item.ir.kind === "image") {
    // 돌린 사진: 자리 상자 가운데 둘레로
    const rot = item.transform.rot ?? 0;
    const b = item.bbox;
    return rot ? (
      <g transform={`rotate(${rot} ${(b.minX + b.maxX) / 2} ${(b.minY + b.maxY) / 2})`}>
        <ImageItem item={item} fresh={fresh} />
      </g>
    ) : (
      <ImageItem item={item} fresh={fresh} />
    );
  }

  if (item.ir.kind !== "shape2d") {
    // 그래프·수식은 HTML 층(ObjectOverlays)이 그린다. 손그림에서 온 객체면 원본 잉크도 남긴다.
    return item.sourceStrokes.length > 0 && !["plot2d", "formula", "chemEq", "solid3d", "space3d"].includes(item.ir.kind) ? (
      <InkStrokes strokes={item.sourceStrokes} />
    ) : null;
  }

  return (
    <g data-object-id={item.id}>
      {fresh && (
        <g className="sl-fade-out" pointerEvents="none">
          <InkStrokes strokes={item.sourceStrokes} />
        </g>
      )}
      <g className={fresh ? "sl-fade-in" : undefined}>
        <Shape2DView data={item.ir.data} transform={item.transform} />
      </g>
    </g>
  );
});
