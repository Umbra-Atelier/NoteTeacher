import * as pdfjsLib from 'pdfjs-dist';
import { PageData } from '../types';

try {
  if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '4.10.38'}/build/pdf.worker.min.mjs`;
  }
} catch (e) {
  console.warn('PDF.js worker setup warning:', e);
}

type PDFDoc = pdfjsLib.PDFDocumentProxy;

const MAX_CONCURRENT_TILE_RENDERS = 2;
const MAX_CACHED_TILES = 84;
const MAX_CACHED_FULL_PAGES = 6;

const pdfDocsBySourceId = new Map<string, PDFDoc>();
const pdfRawBytesBySourceId = new Map<string, Uint8Array>();
const imageSourcesById = new Map<string, { dataUrl: string; img?: HTMLImageElement }>();

export function getPdfRawBytes(sourceId?: string): Uint8Array | undefined {
  if (!sourceId) return undefined;
  return pdfRawBytesBySourceId.get(sourceId);
}

export function getPdfDocProxy(sourceId?: string): PDFDoc | undefined {
  if (!sourceId) return undefined;
  return pdfDocsBySourceId.get(sourceId);
}

export function hasPdfDocumentSource(sourceId?: string): boolean {
  return Boolean(sourceId && pdfDocsBySourceId.has(sourceId));
}

export function getImageSourceDataUrl(sourceId?: string): string | undefined {
  if (!sourceId) return undefined;
  return imageSourcesById.get(sourceId)?.dataUrl;
}

// Insertion-ordered Map acts as LRU cache for rendered tile blob URLs
const tileUrlCache = new Map<string, string>();
const tileKeysByPage = new Map<string, Set<string>>();
const fullPageDataUrlCache = new Map<string, string>();

// Per-page generation counter + active cancellation handles so scrolled-away pages cancel gracefully
const pageLoadGenerations = new Map<string, number>();
const activeControllersByPage = new Map<string, Set<AbortController>>();

interface QueuedTileTask {
  pageId: string;
  generation: number;
  signal?: AbortSignal;
  run: () => Promise<void>;
  cancelGracefully: () => void;
}

const pendingTileQueue: QueuedTileTask[] = [];
let runningTileCount = 0;

function getPageGeneration(pageId: string): number {
  return pageLoadGenerations.get(pageId) || 0;
}

function bumpPageGeneration(pageId: string): number {
  const next = (pageLoadGenerations.get(pageId) || 0) + 1;
  pageLoadGenerations.set(pageId, next);
  return next;
}

function registerPageController(pageId: string, ctrl: AbortController): () => void {
  let set = activeControllersByPage.get(pageId);
  if (!set) {
    set = new Set();
    activeControllersByPage.set(pageId, set);
  }
  set.add(ctrl);
  return () => {
    set?.delete(ctrl);
    if (set && set.size === 0) {
      activeControllersByPage.delete(pageId);
    }
  };
}

function pumpTileQueue(): void {
  while (runningTileCount < MAX_CONCURRENT_TILE_RENDERS && pendingTileQueue.length > 0) {
    const task = pendingTileQueue.shift()!;
    if (task.signal?.aborted || task.generation !== getPageGeneration(task.pageId)) {
      task.cancelGracefully();
      continue;
    }

    runningTileCount++;
    void task
      .run()
      .catch(() => {})
      .finally(() => {
        runningTileCount = Math.max(0, runningTileCount - 1);
        pumpTileQueue();
      });
  }
}

function enqueueTileTask(
  pageId: string,
  signal: AbortSignal | undefined,
  work: (effectiveSignal: AbortSignal) => Promise<string | null>
): Promise<string | null> {
  if (signal?.aborted) return Promise.resolve(null);
  const generation = getPageGeneration(pageId);

  return new Promise<string | null>((resolve) => {
    const taskCtrl = new AbortController();
    const unregisterCtrl = registerPageController(pageId, taskCtrl);

    let settled = false;
    const finish = (val: string | null) => {
      if (settled) return;
      settled = true;
      unregisterCtrl();
      if (signal) {
        signal.removeEventListener('abort', onExternalAbort);
      }
      resolve(val);
    };

    const onExternalAbort = () => {
      taskCtrl.abort();
      finish(null);
    };

    if (signal) {
      if (signal.aborted) {
        onExternalAbort();
        return;
      }
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    const onInternalAbort = () => {
      finish(null);
    };
    taskCtrl.signal.addEventListener('abort', onInternalAbort, { once: true });

    pendingTileQueue.push({
      pageId,
      generation,
      signal: taskCtrl.signal,
      cancelGracefully: () => {
        taskCtrl.abort();
        finish(null);
      },
      run: async () => {
        if (taskCtrl.signal.aborted || generation !== getPageGeneration(pageId)) {
          finish(null);
          return;
        }
        try {
          const result = await work(taskCtrl.signal);
          if (taskCtrl.signal.aborted || generation !== getPageGeneration(pageId)) {
            if (result) revokeUrlSafe(result);
            finish(null);
            return;
          }
          finish(result);
        } catch {
          finish(null);
        }
      },
    });

    pumpTileQueue();
  });
}

// Legacy per-source sequential helper kept for full-page background resolution
const sourceRenderQueues = new Map<string, Promise<unknown>>();

function enqueueSourceTask<T>(queueKey: string, task: () => Promise<T>): Promise<T> {
  const prev = sourceRenderQueues.get(queueKey) || Promise.resolve();
  const next = prev.then(task, task);
  const tracked = next.finally(() => {
    if (sourceRenderQueues.get(queueKey) === tracked) {
      sourceRenderQueues.delete(queueKey);
    }
  });
  sourceRenderQueues.set(queueKey, tracked);
  return next;
}

function revokeUrlSafe(url: string) {
  if (url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
}

function disposeCanvas(canvas: HTMLCanvasElement) {
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {}
}

function setTileCacheEntry(pageId: string, tileKey: string, url: string) {
  const existing = tileUrlCache.get(tileKey);
  if (existing && existing !== url) {
    revokeUrlSafe(existing);
  }
  tileUrlCache.delete(tileKey);
  tileUrlCache.set(tileKey, url);

  let pageKeys = tileKeysByPage.get(pageId);
  if (!pageKeys) {
    pageKeys = new Set();
    tileKeysByPage.set(pageId, pageKeys);
  }
  pageKeys.add(tileKey);

  // Evict oldest tiles if cache exceeds global limit
  while (tileUrlCache.size > MAX_CACHED_TILES) {
    const oldest = tileUrlCache.entries().next().value as [string, string] | undefined;
    if (!oldest) break;
    const [oldestKey, oldestUrl] = oldest;
    tileUrlCache.delete(oldestKey);
    revokeUrlSafe(oldestUrl);
    const sepIdx = oldestKey.indexOf('::');
    if (sepIdx > 0) {
      const ownerId = oldestKey.slice(0, sepIdx);
      const ownerSet = tileKeysByPage.get(ownerId);
      ownerSet?.delete(oldestKey);
      if (ownerSet && ownerSet.size === 0) {
        tileKeysByPage.delete(ownerId);
      }
    }
  }
}

async function canvasToBlobUrl(canvas: HTMLCanvasElement, signal?: AbortSignal): Promise<string | null> {
  if (signal?.aborted) return null;
  return new Promise((resolve) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (signal?.aborted) {
            resolve(null);
            return;
          }
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            resolve(canvas.toDataURL('image/jpeg', 0.9));
          }
        },
        'image/jpeg',
        0.9
      );
    } catch {
      if (signal?.aborted) resolve(null);
      else resolve(canvas.toDataURL('image/jpeg', 0.9));
    }
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * Parses an uploaded PDF (or raster image fallback) into lightweight `PageData` descriptors
 * containing ONLY exact dimensions + low-resolution blurry previews (`previewDataUrl`), keeping
 * high-resolution PDF pages unloaded until scrolled into view.
 */
export async function registerPdfDocumentSource(file: File): Promise<PageData[]> {
  const sourceId = `pdf-src-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const rawBytes = new Uint8Array(arrayBuffer);
    const loadingTask = pdfjsLib.getDocument({
      data: rawBytes.slice(),
      useSystemFonts: true,
    });

    const pdf = await loadingTask.promise;
    pdfDocsBySourceId.set(sourceId, pdf);
    pdfRawBytesBySourceId.set(sourceId, rawBytes);

    const numPages = pdf.numPages;
    const pages: PageData[] = [];
    const baseTitle = file.name.replace(/\.[^/.]+$/, '');

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const naturalViewport = page.getViewport({ scale: 1.0 });
      const thumbScale = Math.min(
        0.45,
        200 / Math.max(naturalViewport.width, naturalViewport.height, 1)
      );
      const thumbViewport = page.getViewport({ scale: Math.max(0.1, thumbScale) });

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = Math.max(24, Math.round(thumbViewport.width));
      thumbCanvas.height = Math.max(24, Math.round(thumbViewport.height));
      const thumbCtx = thumbCanvas.getContext('2d');
      let previewDataUrl: string | undefined;

      if (thumbCtx) {
        thumbCtx.fillStyle = '#ffffff';
        thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        await page.render({
          canvasContext: thumbCtx,
          canvas: null,
          viewport: thumbViewport,
          background: '#ffffff',
        }).promise;
        previewDataUrl = thumbCanvas.toDataURL('image/jpeg', 0.38);
      }
      disposeCanvas(thumbCanvas);
      try {
        (page as { cleanup?: () => void }).cleanup?.();
      } catch {}

      pages.push({
        id: `page-pdf-${Date.now()}-${pageNum}-${Math.random().toString(36).slice(2, 6)}`,
        title: numPages > 1 ? `${baseTitle} (Page ${pageNum})` : baseTitle,
        template: 'pdf',
        pdfPageNumber: pageNum,
        pdfSourceId: sourceId,
        previewDataUrl,
        pdfWidth: naturalViewport.width,
        pdfHeight: naturalViewport.height,
        aspectRatio: naturalViewport.width / Math.max(1, naturalViewport.height),
      });

      // Keep main thread responsive when importing large multi-page PDFs
      if (pageNum % 6 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (pages.length > 0) return pages;
  } catch (err) {
    console.warn('PDF.js registration fallback to image reader:', err);
  }

  // Fallback for image uploads (.png, .jpg, .webp)
  const dataUrl = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });

  const img = await loadHtmlImage(dataUrl);
  const w = img?.naturalWidth || 800;
  const h = img?.naturalHeight || 1100;

  let previewDataUrl: string | undefined;
  if (img) {
    const scale = Math.min(1, 200 / Math.max(w, h, 1));
    const tc = document.createElement('canvas');
    tc.width = Math.max(24, Math.round(w * scale));
    tc.height = Math.max(24, Math.round(h * scale));
    const tctx = tc.getContext('2d');
    if (tctx) {
      tctx.fillStyle = '#ffffff';
      tctx.fillRect(0, 0, tc.width, tc.height);
      tctx.drawImage(img, 0, 0, tc.width, tc.height);
      previewDataUrl = tc.toDataURL('image/jpeg', 0.38);
    }
    disposeCanvas(tc);
  }

  imageSourcesById.set(sourceId, { dataUrl, img: img || undefined });

  return [
    {
      id: `page-pdf-${Date.now()}-1`,
      title: file.name.replace(/\.[^/.]+$/, ''),
      template: 'pdf',
      pdfPageNumber: 1,
      pdfSourceId: sourceId,
      previewDataUrl,
      pdfWidth: w,
      pdfHeight: h,
      aspectRatio: w / Math.max(1, h),
    },
  ];
}

export function getPdfTileCacheKey(
  pageId: string,
  col: number,
  row: number,
  cols: number,
  rows: number
): string {
  return `${pageId}::${cols}x${rows}::${col},${row}`;
}

export function getCachedPdfTileUrl(
  pageId: string,
  col: number,
  row: number,
  cols: number,
  rows: number
): string | null {
  const key = getPdfTileCacheKey(pageId, col, row, cols, rows);
  const hit = tileUrlCache.get(key) || null;
  if (hit) {
    // Refresh LRU order
    tileUrlCache.delete(key);
    tileUrlCache.set(key, hit);
  }
  return hit;
}

/**
 * Renders ONLY a single crisp spatial tile of a PDF/Image page inside the visible viewport.
 * Renders use a bounded global concurrency pool and support immediate graceful AbortSignal cancellation.
 */
export async function acquirePdfPageTile(
  page: PageData,
  col: number,
  row: number,
  cols: number,
  rows: number,
  signal?: AbortSignal
): Promise<string | null> {
  if (signal?.aborted) return null;
  const tileKey = getPdfTileCacheKey(page.id, col, row, cols, rows);
  const cached = getCachedPdfTileUrl(page.id, col, row, cols, rows);
  if (cached) return cached;

  return enqueueTileTask(page.id, signal, async (taskSignal) => {
    if (taskSignal.aborted) return null;
    const already = getCachedPdfTileUrl(page.id, col, row, cols, rows);
    if (already) return already;

    // Case 1: Live PDF.js document source -> render exact cropped region directly into tile canvas
    if (page.pdfSourceId && pdfDocsBySourceId.has(page.pdfSourceId)) {
      const pdfDoc = pdfDocsBySourceId.get(page.pdfSourceId)!;
      const canvas = document.createElement('canvas');
      try {
        const pdfPage = await pdfDoc.getPage(page.pdfPageNumber || 1);
        if (taskSignal.aborted) return null;

        const baseVp = pdfPage.getViewport({ scale: 1.0 });
        const maxNative = Math.max(baseVp.width, baseVp.height, 1);
        const renderScale = Math.min(2.0, 2200 / maxNative);
        const fullW = Math.max(1, Math.round(baseVp.width * renderScale));
        const fullH = Math.max(1, Math.round(baseVp.height * renderScale));

        const tileLeft = Math.floor((col / cols) * fullW);
        const tileTop = Math.floor((row / rows) * fullH);
        const tileRight = col === cols - 1 ? fullW : Math.ceil(((col + 1) / cols) * fullW);
        const tileBottom = row === rows - 1 ? fullH : Math.ceil(((row + 1) / rows) * fullH);
        const tileW = Math.max(1, tileRight - tileLeft);
        const tileH = Math.max(1, tileBottom - tileTop);

        const tileViewport = pdfPage.getViewport({
          scale: renderScale,
          offsetX: -tileLeft,
          offsetY: -tileTop,
        });

        canvas.width = tileW;
        canvas.height = tileH;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, tileW, tileH);

        const renderTask = pdfPage.render({
          canvasContext: ctx,
          canvas: null,
          viewport: tileViewport,
          background: '#ffffff',
        });

        const onAbort = () => {
          try {
            renderTask.cancel();
          } catch {}
        };
        if (taskSignal.aborted) {
          onAbort();
          return null;
        }
        taskSignal.addEventListener('abort', onAbort, { once: true });
        try {
          await renderTask.promise;
        } finally {
          taskSignal.removeEventListener('abort', onAbort);
        }

        if (taskSignal.aborted) return null;
        const url = await canvasToBlobUrl(canvas, taskSignal);
        if (!url || taskSignal.aborted) {
          if (url) revokeUrlSafe(url);
          return null;
        }
        setTileCacheEntry(page.id, tileKey, url);
        return url;
      } catch {
        return null;
      } finally {
        disposeCanvas(canvas);
      }
    }

    // Case 2: Single uploaded image source OR legacy inline page.pdfDataUrl -> crop exact tile
    let img: HTMLImageElement | null = null;
    if (page.pdfSourceId && imageSourcesById.has(page.pdfSourceId)) {
      const entry = imageSourcesById.get(page.pdfSourceId)!;
      if (!entry.img) {
        entry.img = (await loadHtmlImage(entry.dataUrl)) || undefined;
      }
      img = entry.img || null;
    } else if (page.pdfDataUrl && page.pdfDataUrl !== '__CACHED__') {
      img = await loadHtmlImage(page.pdfDataUrl);
    }

    if (!img || !img.naturalWidth || !img.naturalHeight || taskSignal.aborted) {
      return null;
    }

    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;
    const sx = Math.floor((col / cols) * srcW);
    const sy = Math.floor((row / rows) * srcH);
    const sRight = col === cols - 1 ? srcW : Math.ceil(((col + 1) / cols) * srcW);
    const sBottom = row === rows - 1 ? srcH : Math.ceil(((row + 1) / rows) * srcH);
    const sw = Math.max(1, sRight - sx);
    const sh = Math.max(1, sBottom - sy);

    const clampScale = Math.min(1, 1280 / Math.max(sw, sh, 1));
    const outW = Math.max(1, Math.round(sw * clampScale));
    const outH = Math.max(1, Math.round(sh * clampScale));

    const canvas = document.createElement('canvas');
    try {
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

      const url = await canvasToBlobUrl(canvas, taskSignal);
      if (!url || taskSignal.aborted) {
        if (url) revokeUrlSafe(url);
        return null;
      }
      setTileCacheEntry(page.id, tileKey, url);
      return url;
    } finally {
      disposeCanvas(canvas);
    }
  });
}

/**
 * Cancels all queued and in-flight tile renders for a page immediately without blocking.
 */
export function cancelPagePdfLoads(pageId: string): void {
  bumpPageGeneration(pageId);

  const ctrls = activeControllersByPage.get(pageId);
  if (ctrls) {
    for (const ctrl of Array.from(ctrls)) {
      try {
        ctrl.abort();
      } catch {}
    }
    ctrls.clear();
    activeControllersByPage.delete(pageId);
  }

  for (let i = pendingTileQueue.length - 1; i >= 0; i--) {
    if (pendingTileQueue[i].pageId === pageId) {
      const [removed] = pendingTileQueue.splice(i, 1);
      removed.cancelGracefully();
    }
  }
}

/**
 * Releases a single tile's decoded blob URL when it scrolls/pans completely out of the viewport.
 */
export function releasePdfTile(
  pageId: string,
  col: number,
  row: number,
  cols: number,
  rows: number
): void {
  const key = getPdfTileCacheKey(pageId, col, row, cols, rows);
  const existing = tileUrlCache.get(key);
  if (existing) {
    revokeUrlSafe(existing);
    tileUrlCache.delete(key);
  }
  const pageKeys = tileKeysByPage.get(pageId);
  if (pageKeys) {
    pageKeys.delete(key);
    if (pageKeys.size === 0) {
      tileKeysByPage.delete(pageId);
    }
  }
}

/**
 * Cancels all pending/active PDF loads and releases all decoded tiles and transient bitmaps
 * when a page leaves the viewport.
 */
export function releasePagePdfResources(pageId: string): void {
  cancelPagePdfLoads(pageId);

  const pageKeys = tileKeysByPage.get(pageId);
  if (pageKeys) {
    for (const key of pageKeys) {
      const url = tileUrlCache.get(key);
      if (url) {
        revokeUrlSafe(url);
        tileUrlCache.delete(key);
      }
    }
    pageKeys.clear();
    tileKeysByPage.delete(pageId);
  }
  fullPageDataUrlCache.delete(pageId);
}

export function getCachedFullPdfPageUrl(page: PageData): string | undefined {
  if (page.pdfDataUrl && page.pdfDataUrl !== '__CACHED__') {
    return page.pdfDataUrl;
  }
  if (fullPageDataUrlCache.has(page.id)) {
    return fullPageDataUrlCache.get(page.id);
  }
  if (page.pdfSourceId && imageSourcesById.has(page.pdfSourceId)) {
    return imageSourcesById.get(page.pdfSourceId)?.dataUrl;
  }
  return undefined;
}

/**
 * Resolves a full high-resolution PNG/dataURL for a PDF page on demand
 * (used for PDF/Image/Project exports and live Audience Viewer tab active page sync),
 * supporting graceful AbortSignal cancellation.
 */
export async function resolvePdfPageDataUrl(
  page: PageData,
  signal?: AbortSignal
): Promise<string | undefined> {
  if (signal?.aborted) return undefined;
  const syncUrl = getCachedFullPdfPageUrl(page);
  if (syncUrl) return syncUrl;

  if (page.pdfSourceId && pdfDocsBySourceId.has(page.pdfSourceId)) {
    const pdfDoc = pdfDocsBySourceId.get(page.pdfSourceId)!;
    const queueKey = `full:${page.pdfSourceId}:${page.pdfPageNumber || 1}`;
    const url = await enqueueSourceTask(queueKey, async () => {
      if (signal?.aborted) return undefined;
      const canvas = document.createElement('canvas');
      try {
        const pdfPage = await pdfDoc.getPage(page.pdfPageNumber || 1);
        if (signal?.aborted) return undefined;
        const baseVp = pdfPage.getViewport({ scale: 1.0 });
        const maxNative = Math.max(baseVp.width, baseVp.height, 1);
        const renderScale = Math.min(2.0, 2200 / maxNative);
        const vp = pdfPage.getViewport({ scale: renderScale });

        canvas.width = Math.max(1, Math.round(vp.width));
        canvas.height = Math.max(1, Math.round(vp.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderTask = pdfPage.render({
          canvasContext: ctx,
          canvas: null,
          viewport: vp,
          background: '#ffffff',
        });

        if (signal) {
          const onAbort = () => {
            try {
              renderTask.cancel();
            } catch {}
          };
          signal.addEventListener('abort', onAbort, { once: true });
          try {
            await renderTask.promise;
          } finally {
            signal.removeEventListener('abort', onAbort);
          }
        } else {
          await renderTask.promise;
        }

        if (signal?.aborted) return undefined;
        return canvas.toDataURL('image/png');
      } catch {
        return undefined;
      } finally {
        disposeCanvas(canvas);
      }
    });
    if (url && !signal?.aborted) {
      fullPageDataUrlCache.delete(page.id);
      fullPageDataUrlCache.set(page.id, url);
      while (fullPageDataUrlCache.size > MAX_CACHED_FULL_PAGES) {
        const oldestKey = fullPageDataUrlCache.keys().next().value as string | undefined;
        if (!oldestKey) break;
        fullPageDataUrlCache.delete(oldestKey);
      }
      return url;
    }
  }
  return page.previewDataUrl;
}
