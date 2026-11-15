import React from 'react';
import { createRoot } from 'react-dom/client';
import { CalculatorBox, DesmosBox } from '../types';
import { captureElementToCanvas } from './domSnapshot';

export const DESMOS_HEADER_HEIGHT = 38;
export const CALC_LOGICAL_WIDTH = 336;
export const CALC_LOGICAL_HEIGHT = 496;

export interface DesmosCalcInstance {
  getState: () => unknown;
  setState: (state: unknown) => void;
  setExpression: (expr: { id: string; latex: string; color?: string; hidden?: boolean }) => void;
  getExpressions?: () => Array<{ id: string; latex?: string; color?: string; hidden?: boolean }>;
  asyncScreenshot?: (
    opts: {
      width?: number;
      height?: number;
      targetPixelRatio?: number;
      format?: 'png' | 'svg';
      mode?: 'contain' | 'stretch' | 'preserveX' | 'preserveY';
      preserveAxisNumbers?: boolean;
      transparentBackground?: boolean;
    },
    callback: (dataUrl: string) => void
  ) => void;
  screenshot?: (opts?: {
    width?: number;
    height?: number;
    targetPixelRatio?: number;
    preserveAxisNumbers?: boolean;
  }) => string;
}

export interface PopoverSnapshot {
  dataUrl: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export interface CachedWidgetSnapshot {
  dataUrl: string;
  baseWidth: number;
  baseHeight: number;
  signature: string;
  updatedAt: number;
  popover?: PopoverSnapshot;
}

interface LiveDesmosEntry {
  getContainer: () => HTMLElement | null;
  getStage: () => HTMLElement | null;
  getPopover: () => HTMLElement | null;
  getCalc: () => DesmosCalcInstance | null;
  getBox: () => DesmosBox;
  getZoomScale: () => number;
}

interface LiveCalcEntry {
  getStage: () => HTMLElement | null;
  getBox: () => CalculatorBox;
}

const liveDesmosRegistry = new Map<string, LiveDesmosEntry>();
const liveCalcRegistry = new Map<string, LiveCalcEntry>();

const desmosSnapshotCache = new Map<
  string,
  { asShown?: CachedWidgetSnapshot; clean?: CachedWidgetSnapshot }
>();
const calcSnapshotCache = new Map<
  string,
  { asShown?: CachedWidgetSnapshot; clean?: CachedWidgetSnapshot }
>();

const pageStageSizeMap = new Map<string, { width: number; height: number }>();

export function getDesmosLogicalSize(box: DesmosBox): { baseWidth: number; baseHeight: number } {
  if (box.baseWidth && box.baseHeight) {
    return { baseWidth: box.baseWidth, baseHeight: box.baseHeight };
  }
  const w = box.width || 480;
  const h = box.height || 360;
  const scaleUp = Math.max(460 / w, 360 / h, 1);
  return { baseWidth: w * scaleUp, baseHeight: h * scaleUp };
}

function getDesmosSignature(box: DesmosBox): string {
  const { baseWidth, baseHeight } = getDesmosLogicalSize(box);
  return JSON.stringify({
    bw: Math.round(baseWidth),
    bh: Math.round(baseHeight),
    op: box.opacity ?? 0.98,
    expr: box.expressions,
    st: box.desmosState ?? null,
  });
}

function getCalcSignature(box: CalculatorBox): string {
  return JSON.stringify({
    e: box.expression,
    r: box.result,
    am: box.angleMode ?? (box.isRad ? 'RAD' : 'DEG'),
    fe: !!box.isFeMode,
    m: box.memoryStack || [],
  });
}

export function recordPageStageSize(pageId: string, width: number, height: number): void {
  if (pageId && width > 50 && height > 50) {
    pageStageSizeMap.set(pageId, { width, height });
  }
}

export function getRecordedPageStageSize(
  pageId: string
): { width: number; height: number } | undefined {
  return pageStageSizeMap.get(pageId);
}

export function invalidateAllWidgetSnapshots(): void {
  desmosSnapshotCache.clear();
  calcSnapshotCache.clear();
}

export function getCachedDesmosPreviewUrl(boxId: string): { dataUrl: string; updatedAt: number } | null {
  const entry = desmosSnapshotCache.get(boxId);
  const snap = entry?.asShown || entry?.clean;
  return snap ? { dataUrl: snap.dataUrl, updatedAt: snap.updatedAt } : null;
}

export function getCachedCalcPreviewUrl(boxId: string): { dataUrl: string; updatedAt: number } | null {
  const entry = calcSnapshotCache.get(boxId);
  const snap = entry?.asShown || entry?.clean;
  return snap ? { dataUrl: snap.dataUrl, updatedAt: snap.updatedAt } : null;
}

export function registerLiveDesmos(id: string, entry: LiveDesmosEntry): () => void {
  liveDesmosRegistry.set(id, entry);
  return () => {
    if (liveDesmosRegistry.get(id) === entry) {
      liveDesmosRegistry.delete(id);
    }
  };
}

export function registerLiveCalculator(id: string, entry: LiveCalcEntry): () => void {
  liveCalcRegistry.set(id, entry);
  return () => {
    if (liveCalcRegistry.get(id) === entry) {
      liveCalcRegistry.delete(id);
    }
  };
}

function runAsyncScreenshot(
  calc: DesmosCalcInstance,
  width: number,
  height: number
): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof calc.asyncScreenshot === 'function') {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 1500);

      try {
        calc.asyncScreenshot(
          {
            width: Math.max(100, Math.round(width)),
            height: Math.max(100, Math.round(height)),
            targetPixelRatio: 2,
            preserveAxisNumbers: true,
          },
          (dataUrl) => {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              resolve(dataUrl || null);
            }
          }
        );
      } catch {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      }
      return;
    }

    if (typeof calc.screenshot === 'function') {
      try {
        const uri = calc.screenshot({
          width: Math.max(100, Math.round(width)),
          height: Math.max(100, Math.round(height)),
          targetPixelRatio: 2,
          preserveAxisNumbers: true,
        });
        resolve(uri || null);
      } catch {
        resolve(null);
      }
      return;
    }
    resolve(null);
  });
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * Composes a crisp 2x DPI Clean Desmos worksheet card using Desmos's native asyncScreenshot API
 * so formula panels, keypads, wrench menus, and resize handles are completely collapsed while
 * preserving exact graph curves, viewport bounds, axes, labels, and card opacity.
 */
async function composeCleanDesmosCard(
  calc: DesmosCalcInstance,
  box: DesmosBox,
  baseWidth: number,
  baseHeight: number
): Promise<string | null> {
  const plotW = Math.round(baseWidth);
  const plotH = Math.max(120, Math.round(baseHeight - DESMOS_HEADER_HEIGHT));
  const shotDataUrl = await runAsyncScreenshot(calc, plotW, plotH);
  if (!shotDataUrl) return null;

  const shotImg = await loadImage(shotDataUrl);
  if (!shotImg) return null;

  const pixelRatio = 2;
  const outW = Math.round(baseWidth * pixelRatio);
  const outH = Math.round(baseHeight * pixelRatio);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const opacity = box.opacity ?? 0.98;
  const radius = 12 * pixelRatio;

  ctx.save();
  drawRoundedRectPath(ctx, 0, 0, outW, outH, radius);
  ctx.clip();

  // Translucent card backdrop matching box opacity
  ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
  ctx.fillRect(0, 0, outW, outH);

  // Clean top header bar (38px logical) without interactive buttons
  const headerH = DESMOS_HEADER_HEIGHT * pixelRatio;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, outW, headerH);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = pixelRatio;
  ctx.beginPath();
  ctx.moveTo(0, headerH);
  ctx.lineTo(outW, headerH);
  ctx.stroke();

  ctx.font = `700 ${12 * pixelRatio}px "Plus Jakarta Sans", -apple-system, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2563EB';
  ctx.fillText('Desmos', 14 * pixelRatio, headerH / 2);
  const desmosW = ctx.measureText('Desmos').width;
  ctx.fillStyle = '#1E293B';
  ctx.fillText(' Graphing', 14 * pixelRatio + desmosW, headerH / 2);

  // Plot area below header
  ctx.drawImage(shotImg, 0, headerH, outW, outH - headerH);
  ctx.restore();

  ctx.restore();
  return canvas.toDataURL('image/png');
}

function isCanvasBlank(c: HTMLCanvasElement): boolean {
  try {
    if (c.width === 0 || c.height === 0) return true;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    const samples = [
      [Math.floor(c.width * 0.5), Math.floor(c.height * 0.5)],
      [Math.floor(c.width * 0.25), Math.floor(c.height * 0.25)],
      [Math.floor(c.width * 0.75), Math.floor(c.height * 0.75)],
    ];
    for (const [sx, sy] of samples) {
      const p = ctx.getImageData(sx, sy, 1, 1).data;
      if (p[3] > 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function captureLiveDesmosInternal(
  entry: LiveDesmosEntry,
  clean: boolean
): Promise<CachedWidgetSnapshot | null> {
  const box = entry.getBox();
  const { baseWidth, baseHeight } = getDesmosLogicalSize(box);
  const signature = getDesmosSignature(box);
  const calc = entry.getCalc();

  if (clean) {
    if (calc) {
      const cleanUrl = await composeCleanDesmosCard(calc, box, baseWidth, baseHeight);
      if (cleanUrl) {
        const snap: CachedWidgetSnapshot = {
          dataUrl: cleanUrl,
          baseWidth,
          baseHeight,
          signature,
          updatedAt: Date.now(),
        };
        const existing = desmosSnapshotCache.get(box.id) || {};
        desmosSnapshotCache.set(box.id, { ...existing, clean: snap });
        return snap;
      }
    }
    const stageEl = entry.getStage();
    if (!stageEl) return null;
    const captured = await captureElementToCanvas(stageEl, {
      width: baseWidth,
      height: baseHeight,
      scale: 2,
      backgroundColor: null,
      hideClean: true,
      resetRootTransform: true,
    });
    if (!captured) return null;
    const snap: CachedWidgetSnapshot = {
      dataUrl: captured.toDataURL('image/png'),
      baseWidth,
      baseHeight,
      signature,
      updatedAt: Date.now(),
    };
    const existing = desmosSnapshotCache.get(box.id) || {};
    desmosSnapshotCache.set(box.id, { ...existing, clean: snap });
    return snap;
  }

  // AS SHOWN MODE: capture live Desmos DOM + live plot canvas + open menus/keypad/formula panel
  const stageEl = entry.getStage();
  if (!stageEl) return null;

  const canvasReplacementMap = new WeakMap<HTMLCanvasElement, string>();
  if (calc) {
    const graphCanvases = Array.from(stageEl.querySelectorAll('canvas'));
    for (const gc of graphCanvases) {
      if (isCanvasBlank(gc)) {
        const w = gc.clientWidth || Math.round(baseWidth);
        const h = gc.clientHeight || Math.round(baseHeight - DESMOS_HEADER_HEIGHT);
        if (w > 20 && h > 20) {
          const shot = await runAsyncScreenshot(calc, w, h);
          if (shot) canvasReplacementMap.set(gc, shot);
        }
      }
    }
  }

  const captured = await captureElementToCanvas(stageEl, {
    width: baseWidth,
    height: baseHeight,
    scale: 2,
    backgroundColor: null,
    hideClean: false,
    resetRootTransform: true,
    canvasReplacementMap,
  });
  if (!captured) return null;

  // Capture open Graph Preferences popover if currently visible in DOM
  let popoverSnap: PopoverSnapshot | undefined = undefined;
  const containerEl = entry.getContainer();
  const popEl = entry.getPopover();
  if (containerEl && popEl) {
    const popW = popEl.offsetWidth;
    const popH = popEl.offsetHeight;
    if (popW > 0 && popH > 0) {
      const popCanvas = await captureElementToCanvas(popEl, {
        width: popW,
        height: popH,
        scale: 2,
        backgroundColor: null,
        resetRootTransform: true,
      });
      if (popCanvas) {
        const boxRect = containerEl.getBoundingClientRect();
        const popRect = popEl.getBoundingClientRect();
        const z = entry.getZoomScale() || 1;
        popoverSnap = {
          dataUrl: popCanvas.toDataURL('image/png'),
          offsetX: (popRect.left - boxRect.left) / z,
          offsetY: (popRect.top - boxRect.top) / z,
          width: popW,
          height: popH,
        };
      }
    }
  }

  const snap: CachedWidgetSnapshot = {
    dataUrl: captured.toDataURL('image/png'),
    baseWidth,
    baseHeight,
    signature,
    updatedAt: Date.now(),
    popover: popoverSnap,
  };
  const existing = desmosSnapshotCache.get(box.id) || {};
  desmosSnapshotCache.set(box.id, { ...existing, asShown: snap });
  return snap;
}

async function renderOffscreenDesmosSnapshot(
  box: DesmosBox,
  clean: boolean
): Promise<CachedWidgetSnapshot | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined' || !window.Desmos) {
    return null;
  }
  const { baseWidth, baseHeight } = getDesmosLogicalSize(box);
  const fullW = Math.round(baseWidth);
  const fullH = Math.round(baseHeight);
  const bodyH = Math.max(200, fullH - DESMOS_HEADER_HEIGHT);
  const signature = getDesmosSignature(box);

  const stageHost = document.createElement('div');
  stageHost.dataset.offscreenHost = 'true';
  stageHost.style.position = 'fixed';
  stageHost.style.left = '0px';
  stageHost.style.top = '0px';
  stageHost.style.zIndex = '-9999';
  stageHost.style.width = `${fullW}px`;
  stageHost.style.height = `${fullH}px`;
  stageHost.style.pointerEvents = 'none';
  stageHost.style.borderRadius = '12px';
  stageHost.style.overflow = 'hidden';
  stageHost.style.backgroundColor = `rgba(255, 255, 255, ${box.opacity ?? 0.98})`;

  if (!clean) {
    const header = document.createElement('div');
    header.style.boxSizing = 'border-box';
    header.style.height = `${DESMOS_HEADER_HEIGHT}px`;
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.padding = '0 14px';
    header.style.backgroundColor = '#f8fafc';
    header.style.borderBottom = '1px solid #e2e8f0';
    header.style.fontFamily = '"Plus Jakarta Sans", -apple-system, sans-serif';
    header.style.fontSize = '12px';
    header.style.fontWeight = '700';
    header.innerHTML =
      '<span style="color:#2563eb;">Desmos</span><span style="color:#1e293b;margin-left:4px;">Graphing</span>';
    stageHost.appendChild(header);
  }

  const host = document.createElement('div');
  host.style.width = `${fullW}px`;
  host.style.height = `${bodyH}px`;
  host.style.opacity = String(box.opacity ?? 0.98);
  host.style.backgroundColor = '#ffffff';
  stageHost.appendChild(host);
  document.body.appendChild(stageHost);

  let calc: DesmosCalcInstance | null = null;
  try {
    calc = window.Desmos.GraphingCalculator(host, {
      autosize: false,
      keypad: true,
      expressions: true,
      expressionsCollapsed: clean ? true : !box.isFormulaOpen,
      settingsMenu: true,
      zoomButtons: true,
      border: false,
    }) as unknown as DesmosCalcInstance;

    if (box.desmosState) {
      try {
        calc.setState(box.desmosState);
      } catch {
        box.expressions?.forEach((expr) => {
          calc!.setExpression({
            id: expr.id,
            latex: expr.latex,
            color: expr.color || '#2563eb',
            hidden: expr.hidden || false,
          });
        });
      }
    } else if (box.expressions && box.expressions.length > 0) {
      box.expressions.forEach((expr) => {
        calc!.setExpression({
          id: expr.id,
          latex: expr.latex,
          color: expr.color || '#2563eb',
          hidden: expr.hidden || false,
        });
      });
    }

    // Allow Desmos plot canvas & evaluator to settle
    await new Promise((r) => setTimeout(r, 280));

    let cardUrl: string | null = null;
    if (!clean) {
      const canvasReplacementMap = new WeakMap<HTMLCanvasElement, string>();
      const graphCanvases = Array.from(host.querySelectorAll('canvas'));
      for (const gc of graphCanvases) {
        const w = gc.clientWidth || fullW;
        const h = gc.clientHeight || bodyH;
        const isMainPlot =
          gc.classList.contains('dcg-graph-inner') ||
          gc.classList.contains('dcg-canvas') ||
          (w > 40 && h > 40);
        if (isMainPlot || isCanvasBlank(gc)) {
          if (w > 20 && h > 20) {
            const shot = await runAsyncScreenshot(calc, w, h);
            if (shot) canvasReplacementMap.set(gc, shot);
          }
        }
      }
      const domCanvas = await captureElementToCanvas(stageHost, {
        width: baseWidth,
        height: baseHeight,
        scale: 2,
        backgroundColor: null,
        hideClean: false,
        resetRootTransform: true,
        canvasReplacementMap,
      });
      if (domCanvas) {
        cardUrl = domCanvas.toDataURL('image/png');
      }
    }

    if (!cardUrl) {
      cardUrl = await composeCleanDesmosCard(calc, box, baseWidth, baseHeight);
    }
    if (!cardUrl) return null;

    const snap: CachedWidgetSnapshot = {
      dataUrl: cardUrl,
      baseWidth,
      baseHeight,
      signature,
      updatedAt: Date.now(),
    };
    const existing = desmosSnapshotCache.get(box.id) || {};
    desmosSnapshotCache.set(box.id, {
      ...existing,
      [clean ? 'clean' : 'asShown']: snap,
    });
    return snap;
  } catch {
    return null;
  } finally {
    try {
      (calc as { destroy?: () => void } | null)?.destroy?.();
    } catch {}
    stageHost.remove();
  }
}

async function captureLiveCalcInternal(
  entry: LiveCalcEntry,
  clean: boolean
): Promise<CachedWidgetSnapshot | null> {
  const stageEl = entry.getStage();
  if (!stageEl) return null;
  const box = entry.getBox();
  const signature = getCalcSignature(box);

  const captured = await captureElementToCanvas(stageEl, {
    width: CALC_LOGICAL_WIDTH,
    height: CALC_LOGICAL_HEIGHT,
    scale: 2,
    backgroundColor: null,
    hideClean: clean,
    resetRootTransform: true,
  });
  if (!captured) return null;

  const snap: CachedWidgetSnapshot = {
    dataUrl: captured.toDataURL('image/png'),
    baseWidth: CALC_LOGICAL_WIDTH,
    baseHeight: CALC_LOGICAL_HEIGHT,
    signature,
    updatedAt: Date.now(),
  };
  const existing = calcSnapshotCache.get(box.id) || {};
  calcSnapshotCache.set(box.id, {
    ...existing,
    [clean ? 'clean' : 'asShown']: snap,
  });
  return snap;
}

async function renderOffscreenCalcSnapshot(
  box: CalculatorBox,
  clean: boolean
): Promise<CachedWidgetSnapshot | null> {
  if (typeof document === 'undefined') return null;
  const host = document.createElement('div');
  host.dataset.offscreenHost = 'true';
  host.style.position = 'fixed';
  host.style.left = '0px';
  host.style.top = '0px';
  host.style.zIndex = '-9999';
  host.style.width = `${CALC_LOGICAL_WIDTH}px`;
  host.style.height = `${CALC_LOGICAL_HEIGHT}px`;
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);

  let root: ReturnType<typeof createRoot> | null = null;
  try {
    const { ScientificCalculatorBox } = await import('../components/ScientificCalculatorBox');
    root = createRoot(host);
    const fixedBox: CalculatorBox = { ...box, x: 0, y: 0, scale: 1 };
    root.render(
      React.createElement(ScientificCalculatorBox, {
        box: fixedBox,
        isActive: false,
        isReadOnly: true,
        onSelect: () => {},
        onUpdate: () => {},
        onDelete: () => {},
      })
    );

    // Wait for React commit + SVG paint
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 60)))
    );

    const stageEl = host.querySelector<HTMLElement>('.calc-logical-stage');
    if (!stageEl) return null;

    const captured = await captureElementToCanvas(stageEl, {
      width: CALC_LOGICAL_WIDTH,
      height: CALC_LOGICAL_HEIGHT,
      scale: 2,
      backgroundColor: null,
      hideClean: clean,
      resetRootTransform: true,
    });
    if (!captured) return null;

    const snap: CachedWidgetSnapshot = {
      dataUrl: captured.toDataURL('image/png'),
      baseWidth: CALC_LOGICAL_WIDTH,
      baseHeight: CALC_LOGICAL_HEIGHT,
      signature: getCalcSignature(box),
      updatedAt: Date.now(),
    };
    const existing = calcSnapshotCache.get(box.id) || {};
    calcSnapshotCache.set(box.id, {
      ...existing,
      [clean ? 'clean' : 'asShown']: snap,
    });
    return snap;
  } catch {
    return null;
  } finally {
    try {
      root?.unmount();
    } catch {}
    host.remove();
  }
}

/**
 * Returns a fresh or cached frozen image snapshot of a DesmosBox at exact logical dimensions.
 */
export async function getDesmosSnapshot(
  box: DesmosBox,
  clean: boolean
): Promise<CachedWidgetSnapshot | null> {
  const live = liveDesmosRegistry.get(box.id);
  if (live) {
    const snap = await captureLiveDesmosInternal(live, clean);
    if (snap) return snap;
  }

  const cached = desmosSnapshotCache.get(box.id)?.[clean ? 'clean' : 'asShown'];
  if (cached && cached.signature === getDesmosSignature(box)) {
    return cached;
  }

  return await renderOffscreenDesmosSnapshot(box, clean);
}

/**
 * Returns a fresh or cached frozen image snapshot of a CalculatorBox at exact 336x496 logical dimensions.
 */
export async function getCalculatorSnapshot(
  box: CalculatorBox,
  clean: boolean
): Promise<CachedWidgetSnapshot | null> {
  const live = liveCalcRegistry.get(box.id);
  if (live) {
    const snap = await captureLiveCalcInternal(live, clean);
    if (snap) return snap;
  }

  const cached = calcSnapshotCache.get(box.id)?.[clean ? 'clean' : 'asShown'];
  if (cached && cached.signature === getCalcSignature(box)) {
    return cached;
  }

  return await renderOffscreenCalcSnapshot(box, clean);
}

let inFlightCaptureAll: Promise<void> | null = null;

/**
 * Captures BOTH As-Shown and Clean snapshots of all currently mounted Desmos and Calculator widgets
 * so switching pages or opening menus preserves their exact viewport state.
 */
export async function captureAllMountedWidgets(): Promise<void> {
  if (inFlightCaptureAll) {
    await inFlightCaptureAll;
  }
  const run = async () => {
    const tasks: Promise<unknown>[] = [];
    for (const entry of liveDesmosRegistry.values()) {
      tasks.push(captureLiveDesmosInternal(entry, false));
      tasks.push(captureLiveDesmosInternal(entry, true));
    }
    for (const entry of liveCalcRegistry.values()) {
      tasks.push(captureLiveCalcInternal(entry, false));
      tasks.push(captureLiveCalcInternal(entry, true));
    }
    await Promise.allSettled(tasks);
  };
  inFlightCaptureAll = run().finally(() => {
    if (inFlightCaptureAll) {
      inFlightCaptureAll = null;
    }
  });
  await inFlightCaptureAll;
}

/**
 * Enriches serialized Desmos boxes with live unsaved state/expressions from mounted instances
 * so .noteteacher project saves never miss recent keystrokes or pan/zoom adjustments.
 */
export function syncLiveDesmosBoxes(graphs: DesmosBox[]): DesmosBox[] {
  return graphs.map((g) => {
    const entry = liveDesmosRegistry.get(g.id);
    if (!entry) return g;
    const calc = entry.getCalc();
    if (!calc) return g;
    try {
      const desmosState = calc.getState();
      const expressions =
        calc.getExpressions?.()?.map((e) => ({
          id: String(e.id),
          latex: String(e.latex || ''),
          color: e.color,
          hidden: e.hidden,
        })) || g.expressions;
      const stage = entry.getStage();
      const panelEl = stage?.querySelector('.dcg-exppanel-outer');
      const isFormulaOpen = panelEl ? getComputedStyle(panelEl).display !== 'none' : g.isFormulaOpen;
      return {
        ...g,
        desmosState,
        expressions,
        isFormulaOpen,
      };
    } catch {
      return g;
    }
  });
}
