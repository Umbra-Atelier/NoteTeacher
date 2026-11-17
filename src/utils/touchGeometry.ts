export interface TouchGeometrySample {
  id: number;
  clientX: number;
  clientY: number;
  width: number;
  height: number;
  size: number;
  force: number;
  touchType?: string;
  isMeasured: boolean;
  timestamp: number;
}

const recentTouchSamples: TouchGeometrySample[] = [];
const pointerMeasuredCache = new Map<number, { width: number; height: number; size: number; time: number }>();
let trackerInstalled = false;

export function getTouchContactDiameters(
  touch: Pick<Touch, 'clientX' | 'clientY'> & {
    radiusX?: number;
    radiusY?: number;
    force?: number;
    touchType?: string;
  }
): {
  width: number;
  height: number;
  size: number;
  force: number;
  touchType?: string;
  isMeasured: boolean;
} {
  const rx = typeof touch.radiusX === 'number' && Number.isFinite(touch.radiusX) ? touch.radiusX : 0;
  const ry = typeof touch.radiusY === 'number' && Number.isFinite(touch.radiusY) ? touch.radiusY : 0;
  const maxR = Math.max(rx, ry);
  // Browsers/iPadOS frequently populate default placeholder 0, 0.5, or 1 on Touch when radius isn't real
  const isMeasured = maxR > 1.5;
  const width = rx > 0 ? Math.max(1, Math.round(rx * 2)) : 0;
  const height = ry > 0 ? Math.max(1, Math.round(ry * 2)) : 0;
  const size = Math.max(width, height);
  const ext = touch as Touch & { force?: number; touchType?: string };
  return {
    width,
    height,
    size,
    force: typeof ext.force === 'number' && Number.isFinite(ext.force) ? ext.force : 0,
    touchType: typeof ext.touchType === 'string' ? ext.touchType : undefined,
    isMeasured,
  };
}

function upsertTouchSample(touch: Touch, now: number) {
  const geom = getTouchContactDiameters(touch);
  const idx = recentTouchSamples.findIndex((s) => s.id === touch.identifier);
  const existing = idx !== -1 ? recentTouchSamples[idx] : null;
  // Preserve real measured diameter if later event temporarily glitches back to placeholder <= 1
  const keepExistingSize =
    !geom.isMeasured && existing && existing.isMeasured && now - existing.timestamp < 500;
  const entry: TouchGeometrySample = {
    id: touch.identifier,
    clientX: touch.clientX,
    clientY: touch.clientY,
    width: keepExistingSize ? existing.width : geom.width,
    height: keepExistingSize ? existing.height : geom.height,
    size: keepExistingSize ? existing.size : geom.size,
    force: geom.force,
    touchType: geom.touchType,
    isMeasured: geom.isMeasured || Boolean(keepExistingSize),
    timestamp: now,
  };
  if (idx !== -1) {
    recentTouchSamples[idx] = entry;
  } else {
    recentTouchSamples.push(entry);
    if (recentTouchSamples.length > 24) {
      recentTouchSamples.splice(0, recentTouchSamples.length - 24);
    }
  }
}

export function recordTouchGeometry(e: TouchEvent): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  for (let i = 0; i < e.touches.length; i++) {
    upsertTouchSample(e.touches[i], now);
  }
  for (let i = 0; i < e.changedTouches.length; i++) {
    upsertTouchSample(e.changedTouches[i], now);
  }
  // Prune stale entries older than 1200ms
  for (let i = recentTouchSamples.length - 1; i >= 0; i--) {
    if (now - recentTouchSamples[i].timestamp > 1200) {
      recentTouchSamples.splice(i, 1);
    }
  }
}

export function ensureTouchGeometryTracker(): void {
  if (trackerInstalled || typeof window === 'undefined') return;
  trackerInstalled = true;
  const onTouch = (ev: Event) => {
    recordTouchGeometry(ev as TouchEvent);
  };
  window.addEventListener('touchstart', onTouch, { capture: true, passive: true });
  window.addEventListener('touchmove', onTouch, { capture: true, passive: true });
  window.addEventListener('touchend', onTouch, { capture: true, passive: true });
  window.addEventListener('touchcancel', onTouch, { capture: true, passive: true });
}

export function clearPointerGeometryCache(pointerId: number): void {
  pointerMeasuredCache.delete(pointerId);
}

/**
 * Resolves the true contact dimensions (in CSS px) for a PointerEvent, falling back
 * cleanly to TouchEvent radiusX*2 / radiusY*2 when PointerEvent.width/height reports
 * the W3C default 1x1 placeholder (common on iPadOS WebKit and some Android/touch drivers).
 */
export function getEffectiveTouchMetrics(
  e: Pick<PointerEvent, 'pointerType' | 'pointerId' | 'width' | 'height'> & {
    clientX?: number;
    clientY?: number;
    getCoalescedEvents?: () => PointerEvent[];
  }
): {
  width: number;
  height: number;
  size: number;
  isMeasured: boolean;
} {
  let pw = Math.round(e.width || 0);
  let ph = Math.round(e.height || 0);

  if (typeof e.getCoalescedEvents === 'function') {
    try {
      const coalesced = e.getCoalescedEvents();
      if (coalesced && coalesced.length > 0) {
        for (let i = 0; i < coalesced.length; i++) {
          const cw = Math.round(coalesced[i].width || 0);
          const ch = Math.round(coalesced[i].height || 0);
          if (cw > pw) pw = cw;
          if (ch > ph) ph = ch;
        }
      }
    } catch {
      // Ignore coalesced lookup errors
    }
  }

  const pointerSize = Math.max(pw, ph);
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

  if (pointerSize > 1) {
    const res = {
      width: Math.max(1, pw),
      height: Math.max(1, ph),
      size: pointerSize,
      time: now,
    };
    if (e.pointerType === 'touch') {
      pointerMeasuredCache.set(e.pointerId, res);
    }
    return { width: res.width, height: res.height, size: res.size, isMeasured: true };
  }

  if (e.pointerType === 'touch') {
    const cx = typeof e.clientX === 'number' ? e.clientX : null;
    const cy = typeof e.clientY === 'number' ? e.clientY : null;
    if (cx !== null && cy !== null) {
      let bestSample: TouchGeometrySample | null = null;
      let bestDist = 72;
      for (let i = recentTouchSamples.length - 1; i >= 0; i--) {
        const s = recentTouchSamples[i];
        if (now - s.timestamp > 400 || !s.isMeasured) continue;
        const d = Math.hypot(s.clientX - cx, s.clientY - cy);
        if (d <= bestDist) {
          bestDist = d;
          bestSample = s;
        }
      }
      if (bestSample && bestSample.size > 1) {
        pointerMeasuredCache.set(e.pointerId, {
          width: bestSample.width,
          height: bestSample.height,
          size: bestSample.size,
          time: now,
        });
        return {
          width: bestSample.width,
          height: bestSample.height,
          size: bestSample.size,
          isMeasured: true,
        };
      }
    }

    const cached = pointerMeasuredCache.get(e.pointerId);
    if (cached && now - cached.time < 500 && cached.size > 1) {
      return {
        width: cached.width,
        height: cached.height,
        size: cached.size,
        isMeasured: true,
      };
    }
  }

  return {
    width: Math.max(1, pw),
    height: Math.max(1, ph),
    size: Math.max(1, pointerSize),
    isMeasured: false,
  };
}
