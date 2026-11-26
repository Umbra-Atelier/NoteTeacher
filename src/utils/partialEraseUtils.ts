import { CanvasStroke, GeometricShape, StrokePoint } from '../types';

let fragmentSeq = 0;
function nextFragId(prefix: string): string {
  fragmentSeq += 1;
  return `${prefix}-${Date.now()}-${fragmentSeq}-${Math.random().toString(36).slice(2, 6)}`;
}

function makePt(x: number, y: number, pressure = 0.5): StrokePoint {
  return { x, y, pressure };
}

function polylineLength(pts: StrokePoint[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

export function computePointsBounds(pts: StrokePoint[]): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (!pts || pts.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Samples the quadratic Bezier curve rendered by `pointsToSvgPath` so freehand curves
 * split cleanly at small circle radii without flattening curved segments.
 */
function sampleFreehandStrokeCurve(points: StrokePoint[], maxStepPx = 3): StrokePoint[] {
  if (!points || points.length <= 1) return points ? [...points] : [];
  const out: StrokePoint[] = [points[0]];

  const pushPoint = (p: StrokePoint) => {
    const prev = out[out.length - 1];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) >= 0.35) {
      out.push(p);
    }
  };

  let curX = points[0].x;
  let curY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const ctrl = points[i - 1];
    const next = points[i];
    const endX = (ctrl.x + next.x) / 2;
    const endY = (ctrl.y + next.y) / 2;
    const pressure = (ctrl.pressure + next.pressure) / 2;

    const approxLen =
      Math.hypot(ctrl.x - curX, ctrl.y - curY) + Math.hypot(endX - ctrl.x, endY - ctrl.y);
    const steps = Math.max(1, Math.min(48, Math.ceil(approxLen / maxStepPx)));

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const omt = 1 - t;
      const qx = omt * omt * curX + 2 * omt * t * ctrl.x + t * t * endX;
      const qy = omt * omt * curY + 2 * omt * t * ctrl.y + t * t * endY;
      pushPoint({ x: qx, y: qy, pressure });
    }
    curX = endX;
    curY = endY;
  }

  // Final straight tail `L last`
  const last = points[points.length - 1];
  const tailLen = Math.hypot(last.x - curX, last.y - curY);
  const tailSteps = Math.max(1, Math.min(24, Math.ceil(tailLen / maxStepPx)));
  for (let s = 1; s <= tailSteps; s++) {
    const t = s / tailSteps;
    pushPoint({
      x: curX + t * (last.x - curX),
      y: curY + t * (last.y - curY),
      pressure: last.pressure,
    });
  }

  return out;
}

/**
 * Exact segment-circle intersection parameters t in (0, 1) sorted ascending.
 */
function intersectSegmentCircle(
  a: StrokePoint,
  b: StrokePoint,
  cx: number,
  cy: number,
  r: number
): number[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - cx;
  const fy = a.y - cy;

  const aCoef = dx * dx + dy * dy;
  if (aCoef < 1e-9) return [];

  const bCoef = 2 * (fx * dx + fy * dy);
  const cCoef = fx * fx + fy * fy - r * r;

  const disc = bCoef * bCoef - 4 * aCoef * cCoef;
  if (disc <= 1e-9) return [];

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-bCoef - sqrtDisc) / (2 * aCoef);
  const t2 = (-bCoef + sqrtDisc) / (2 * aCoef);

  const hits: number[] = [];
  const EPS = 1e-4;
  if (t1 > EPS && t1 < 1 - EPS) hits.push(t1);
  if (t2 > EPS && t2 < 1 - EPS && Math.abs(t2 - t1) > EPS) hits.push(t2);
  hits.sort((u, v) => u - v);
  return hits;
}

export interface PolylineSplitRun {
  inside: boolean;
  points: StrokePoint[];
}

/**
 * Splits an open or closed polyline by a circle `(cx, cy, r)` into contiguous runs
 * classified as either inside (`inside: true`) or outside (`inside: false`) the circle.
 */
export function splitPolylineByCircle(
  points: StrokePoint[],
  cx: number,
  cy: number,
  r: number,
  isClosedLoop = false
): { runs: PolylineSplitRun[]; anyInside: boolean } {
  if (!points || points.length === 0) {
    return { runs: [], anyInside: false };
  }
  if (points.length === 1) {
    const inside = Math.hypot(points[0].x - cx, points[0].y - cy) <= r;
    return {
      runs: [{ inside, points: [...points] }],
      anyInside: inside,
    };
  }

  // Build sub-segments split at exact circle intersections
  const pieces: Array<{ a: StrokePoint; b: StrokePoint; inside: boolean }> = [];
  let anyInside = false;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;

    const ts = intersectSegmentCircle(a, b, cx, cy, r);
    const allTs = [0, ...ts, 1];

    for (let k = 0; k < allTs.length - 1; k++) {
      const t0 = allTs[k];
      const t1 = allTs[k + 1];
      if (t1 - t0 < 1e-6) continue;

      const pa: StrokePoint = {
        x: a.x + t0 * (b.x - a.x),
        y: a.y + t0 * (b.y - a.y),
        pressure: a.pressure + t0 * (b.pressure - a.pressure),
      };
      const pb: StrokePoint = {
        x: a.x + t1 * (b.x - a.x),
        y: a.y + t1 * (b.y - a.y),
        pressure: a.pressure + t1 * (b.pressure - a.pressure),
      };

      const midX = (pa.x + pb.x) / 2;
      const midY = (pa.y + pb.y) / 2;
      const inside = Math.hypot(midX - cx, midY - cy) <= r;
      if (inside) anyInside = true;

      pieces.push({ a: pa, b: pb, inside });
    }
  }

  if (pieces.length === 0) {
    const inside = Math.hypot(points[0].x - cx, points[0].y - cy) <= r;
    return {
      runs: [{ inside, points: [...points] }],
      anyInside: inside,
    };
  }

  if (!anyInside) {
    return { runs: [{ inside: false, points: [...points] }], anyInside: false };
  }

  // Group contiguous segments with identical inside/outside state
  const runs: PolylineSplitRun[] = [];
  for (const seg of pieces) {
    const lastRun = runs[runs.length - 1];
    if (!lastRun || lastRun.inside !== seg.inside) {
      runs.push({ inside: seg.inside, points: [seg.a, seg.b] });
    } else {
      const prevPt = lastRun.points[lastRun.points.length - 1];
      if (Math.hypot(seg.a.x - prevPt.x, seg.a.y - prevPt.y) > 0.2) {
        lastRun.points.push(seg.a);
      }
      lastRun.points.push(seg.b);
    }
  }

  // If this came from a closed loop and both end runs share the same state, stitch them cleanly
  if (
    isClosedLoop &&
    runs.length >= 2 &&
    runs[0].inside === runs[runs.length - 1].inside
  ) {
    const tail = runs.pop()!;
    const head = runs[0];
    const seamEnd = tail.points[tail.points.length - 1];
    const seamStart = head.points[0];
    if (Math.hypot(seamEnd.x - seamStart.x, seamEnd.y - seamStart.y) < 1.5) {
      head.points = [...tail.points.slice(0, -1), ...head.points];
    } else {
      head.points = [...tail.points, ...head.points];
    }
  }

  // Filter out microscopic (< 0.4px) boundary dust when multiple runs exist
  const cleaned =
    runs.length > 1
      ? runs.filter((run) => run.points.length >= 2 && polylineLength(run.points) >= 0.4)
      : runs;

  const finalRuns = cleaned.length > 0 ? cleaned : runs;
  const finalAnyInside = finalRuns.some((rItem) => rItem.inside);
  return { runs: finalRuns, anyInside: finalAnyInside };
}

function sampleArcPoints(
  cx: number,
  cy: number,
  r: number,
  startA: number,
  endA: number,
  anticlockwise: boolean
): StrokePoint[] {
  let delta = endA - startA;
  if (anticlockwise) {
    while (delta > 0) delta -= Math.PI * 2;
    while (delta <= -Math.PI * 2) delta += Math.PI * 2;
  } else {
    while (delta < 0) delta += Math.PI * 2;
    while (delta >= Math.PI * 2) delta -= Math.PI * 2;
  }
  const steps = Math.max(16, Math.min(96, Math.ceil((Math.abs(delta) * r) / 3)));
  const pts: StrokePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = startA + (i / steps) * delta;
    pts.push(makePt(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return pts;
}

/**
 * Decomposes any supported GeometricShape into exact polyline sub-paths.
 * Returns { paths, isClosedLoop } per sub-path so sharp corners remain sharp
 * and closed outlines don't split redundantly at the starting seam.
 */
export function decomposeGeometricShapeToPaths(
  sh: GeometricShape
): Array<{ points: StrokePoint[]; isClosedLoop: boolean }> {
  if (sh.type === 'polyline') {
    return sh.points && sh.points.length > 0
      ? [{ points: sh.points.map((p) => makePt(p.x, p.y, p.pressure ?? 0.5)), isClosedLoop: false }]
      : [];
  }

  const x = Math.min(sh.x, sh.x + sh.width);
  const y = Math.min(sh.y, sh.y + sh.height);
  const w = Math.abs(sh.width);
  const h = Math.abs(sh.height);

  if (sh.type === 'rect') {
    return [
      {
        isClosedLoop: true,
        points: [
          makePt(x, y),
          makePt(x + w, y),
          makePt(x + w, y + h),
          makePt(x, y + h),
          makePt(x, y),
        ],
      },
    ];
  }

  if (sh.type === 'rounded_rect') {
    const rad = Math.min(16, w / 4, h / 4);
    if (rad <= 0.5) {
      return [
        {
          isClosedLoop: true,
          points: [
            makePt(x, y),
            makePt(x + w, y),
            makePt(x + w, y + h),
            makePt(x, y + h),
            makePt(x, y),
          ],
        },
      ];
    }
    const pts: StrokePoint[] = [
      ...sampleArcPoints(x + rad, y + rad, rad, Math.PI, (3 * Math.PI) / 2, false),
      ...sampleArcPoints(x + w - rad, y + rad, rad, -Math.PI / 2, 0, false),
      ...sampleArcPoints(x + w - rad, y + h - rad, rad, 0, Math.PI / 2, false),
      ...sampleArcPoints(x + rad, y + h - rad, rad, Math.PI / 2, Math.PI, false),
    ];
    if (pts.length > 0) pts.push({ ...pts[0] });
    return [{ isClosedLoop: true, points: pts }];
  }

  if (sh.type === 'circle') {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const steps = Math.max(48, Math.min(180, Math.ceil(perim / 3)));
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      pts.push(makePt(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
    }
    return [{ isClosedLoop: true, points: pts }];
  }

  if (sh.type === 'triangle') {
    return [
      {
        isClosedLoop: true,
        points: [
          makePt(x + w / 2, y),
          makePt(x + w, y + h),
          makePt(x, y + h),
          makePt(x + w / 2, y),
        ],
      },
    ];
  }

  if (sh.type === 'line') {
    return [
      {
        isClosedLoop: false,
        points: [makePt(sh.x, sh.y), makePt(sh.x + sh.width, sh.y + sh.height)],
      },
    ];
  }

  if (sh.type === 'arrow' || sh.type === 'double_arrow') {
    const fromX = sh.x;
    const fromY = sh.y;
    const toX = sh.x + sh.width;
    const toY = sh.y + sh.height;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const headLen = 14;
    const paths: Array<{ points: StrokePoint[]; isClosedLoop: boolean }> = [
      { isClosedLoop: false, points: [makePt(fromX, fromY), makePt(toX, toY)] },
      {
        isClosedLoop: false,
        points: [
          makePt(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6)),
          makePt(toX, toY),
          makePt(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6)),
        ],
      },
    ];
    if (sh.type === 'double_arrow') {
      paths.push({
        isClosedLoop: false,
        points: [
          makePt(fromX + headLen * Math.cos(angle - Math.PI / 6), fromY + headLen * Math.sin(angle - Math.PI / 6)),
          makePt(fromX, fromY),
          makePt(fromX + headLen * Math.cos(angle + Math.PI / 6), fromY + headLen * Math.sin(angle + Math.PI / 6)),
        ],
      });
    }
    return paths;
  }

  if (sh.type === 'arc') {
    const cx = sh.centerX ?? sh.x + sh.width / 2;
    const cy = sh.centerY ?? sh.y + sh.height / 2;
    const r = sh.radius ?? Math.min(w, h) / 2;
    const a1 = sh.startAngle ?? 0;
    const a2 = sh.endAngle ?? Math.PI / 2;
    const isAcute = sh.arcSweep !== 'obtuse';

    let diff = (a2 - a1) % (2 * Math.PI);
    if (diff < 0) diff += 2 * Math.PI;
    const acuteSpan = diff <= Math.PI ? diff : 2 * Math.PI - diff;
    const obtuseSpan = 2 * Math.PI - acuteSpan;
    const span = isAcute ? acuteSpan : obtuseSpan;

    let clockwise = diff <= Math.PI;
    if (!isAcute) clockwise = !clockwise;

    const steps = Math.max(24, Math.min(120, Math.ceil((span * r) / 3)));
    const pts: StrokePoint[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = clockwise ? a1 + (i / steps) * span : a1 - (i / steps) * span;
      pts.push(makePt(cx + r * Math.cos(a), cy + r * Math.sin(a)));
    }
    return [{ isClosedLoop: false, points: pts }];
  }

  if (sh.type === 'grid') {
    const gw = Math.max(20, Math.abs(sh.width));
    const gh = Math.max(20, Math.abs(sh.height));
    const gx = sh.x;
    const gy = sh.y;
    const rows = sh.gridRows || Math.max(1, Math.round(gh / 28));
    const cols = sh.gridCols || Math.max(1, Math.round(gw / 28));
    const paths: Array<{ points: StrokePoint[]; isClosedLoop: boolean }> = [
      {
        isClosedLoop: true,
        points: [
          makePt(gx, gy),
          makePt(gx + gw, gy),
          makePt(gx + gw, gy + gh),
          makePt(gx, gy + gh),
          makePt(gx, gy),
        ],
      },
    ];
    for (let i = 1; i < cols; i++) {
      const lx = gx + (i / cols) * gw;
      paths.push({ isClosedLoop: false, points: [makePt(lx, gy), makePt(lx, gy + gh)] });
    }
    for (let j = 1; j < rows; j++) {
      const ly = gy + (j / rows) * gh;
      paths.push({ isClosedLoop: false, points: [makePt(gx, ly), makePt(gx + gw, ly)] });
    }
    return paths;
  }

  return [];
}

function quickPointBboxHit(
  pts: StrokePoint[],
  cx: number,
  cy: number,
  margin: number
): boolean {
  if (!pts || pts.length === 0) return false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return (
    cx >= minX - margin &&
    cx <= maxX + margin &&
    cy >= minY - margin &&
    cy <= maxY + margin
  );
}

/**
 * Splits only touched portions of drawn strokes & geometric elements on `pageId`
 * into `isGhosted: false` (kept normal) and `isGhosted: true` (highlighted red for confirmation).
 * Leaves calculators, graphing boxes, placed images, and untouched elements completely intact.
 */
export function circleErasePage(
  pageId: string,
  strokes: CanvasStroke[],
  shapes: GeometricShape[],
  cx: number,
  cy: number,
  radius: number
): {
  strokes: CanvasStroke[];
  shapes: GeometricShape[];
  didModify: boolean;
} {
  const r = Math.max(2, radius);
  let didModify = false;

  const nextStrokes: CanvasStroke[] = [];
  for (const s of strokes) {
    if (s.pageId !== pageId || s.isGhosted || !s.points || s.points.length === 0) {
      nextStrokes.push(s);
      continue;
    }

    // Small stroke-width tolerance makes thin/medium lines easy to carve cleanly
    const hitRadius = r;
    if (!quickPointBboxHit(s.points, cx, cy, hitRadius + Math.max(8, s.width))) {
      nextStrokes.push(s);
      continue;
    }

    // Densify curve on first split of a freehand stroke so curvature stays accurate
    const workPoints =
      s.points.length >= 3 ? sampleFreehandStrokeCurve(s.points, 3) : s.points;

    const { runs, anyInside } = splitPolylineByCircle(workPoints, cx, cy, hitRadius, false);
    if (!anyInside) {
      nextStrokes.push(s);
      continue;
    }

    didModify = true;
    if (runs.length === 1 && runs[0].inside) {
      nextStrokes.push({ ...s, isGhosted: true });
    } else {
      for (const run of runs) {
        nextStrokes.push({
          ...s,
          id: nextFragId(s.id.split('__p')[0]),
          points: run.points,
          isGhosted: run.inside,
        });
      }
    }
  }

  const nextShapes: GeometricShape[] = [];
  for (const sh of shapes) {
    if (sh.pageId !== pageId || sh.isGhosted) {
      nextShapes.push(sh);
      continue;
    }

    // Quick bounding-box reject before decomposing
    const shMinX = Math.min(sh.x, sh.x + sh.width);
    const shMaxX = Math.max(sh.x, sh.x + sh.width);
    const shMinY = Math.min(sh.y, sh.y + sh.height);
    const shMaxY = Math.max(sh.y, sh.y + sh.height);
    const margin = r + Math.max(18, sh.strokeWidth || 2);
    if (
      cx < shMinX - margin ||
      cx > shMaxX + margin ||
      cy < shMinY - margin ||
      cy > shMaxY + margin
    ) {
      nextShapes.push(sh);
      continue;
    }

    const subPaths = decomposeGeometricShapeToPaths(sh);
    if (subPaths.length === 0) {
      nextShapes.push(sh);
      continue;
    }

    const splitResults = subPaths.map((sp) =>
      splitPolylineByCircle(sp.points, cx, cy, r, sp.isClosedLoop)
    );
    const shapeHit = splitResults.some((res) => res.anyInside);

    if (!shapeHit) {
      nextShapes.push(sh);
      continue;
    }

    didModify = true;
    const baseId = sh.id.split('__p')[0];
    for (const res of splitResults) {
      for (const run of res.runs) {
        if (run.points.length < 2) continue;
        const bounds = computePointsBounds(run.points);
        nextShapes.push({
          id: nextFragId(baseId),
          type: 'polyline',
          pageId: sh.pageId,
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          points: run.points,
          strokeColor: sh.strokeColor,
          fillColor: 'transparent',
          strokeWidth: sh.strokeWidth,
          strokeStyle: sh.strokeStyle,
          opacity: sh.opacity,
          isWritingGuide: sh.isWritingGuide,
          guideGroupId: sh.guideGroupId,
          guideRole: sh.guideRole,
          guideBandTop: sh.guideBandTop,
          guideBandBottom: sh.guideBandBottom,
          guideSpacing: sh.guideSpacing,
          guideExtTop: sh.guideExtTop,
          guideExtended: sh.guideExtended,
          isGhosted: run.inside,
        });
      }
    }
  }

  return { strokes: nextStrokes, shapes: nextShapes, didModify };
}

/**
 * Sweeps the eraser circle continuously from `(x1, y1)` to `(x2, y2)` so fast drags
 * never skip across thin strokes or geometric lines.
 */
export function sweepCircleErase(
  pageId: string,
  strokes: CanvasStroke[],
  shapes: GeometricShape[],
  from: { x: number; y: number } | null,
  to: { x: number; y: number },
  radius: number
): {
  strokes: CanvasStroke[];
  shapes: GeometricShape[];
  didModify: boolean;
} {
  const r = Math.max(2, radius);
  if (!from) {
    return circleErasePage(pageId, strokes, shapes, to.x, to.y, r);
  }

  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const stepSize = Math.max(2, r * 0.45);
  const steps = Math.max(1, Math.min(32, Math.ceil(dist / stepSize)));

  let curStrokes = strokes;
  let curShapes = shapes;
  let anyModified = false;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = from.x + (to.x - from.x) * t;
    const cy = from.y + (to.y - from.y) * t;
    const res = circleErasePage(pageId, curStrokes, curShapes, cx, cy, r);
    curStrokes = res.strokes;
    curShapes = res.shapes;
    if (res.didModify) anyModified = true;
  }

  return {
    strokes: curStrokes,
    shapes: curShapes,
    didModify: anyModified,
  };
}
