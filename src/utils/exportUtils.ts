import { jsPDF } from 'jspdf';
import {
  CanvasStroke,
  GeometricShape,
  DesmosBox,
  CalculatorBox,
  CanvasImage,
  DictatedTextBox,
  PageData,
  SaveAsMode,
} from '../types';
import {
  CALC_LOGICAL_WIDTH,
  CALC_LOGICAL_HEIGHT,
  captureAllMountedWidgets,
  getCalculatorSnapshot,
  getDesmosSnapshot,
  getRecordedPageStageSize,
  syncLiveDesmosBoxes,
} from './widgetSnapshotCache';
import { resolvePdfPageDataUrl } from './pdfPageCache';

export interface ProjectData {
  version: string;
  timestamp: string;
  pages: PageData[];
  strokes: CanvasStroke[];
  shapes: GeometricShape[];
  graphs: DesmosBox[];
  calculators: CalculatorBox[];
  images?: CanvasImage[];
  dictatedTextBoxes?: DictatedTextBox[];
}

export async function buildProjectJsonBlob(
  pages: PageData[],
  strokes: CanvasStroke[],
  shapes: GeometricShape[],
  graphs: DesmosBox[],
  calculators: CalculatorBox[],
  images: CanvasImage[] = [],
  dictatedTextBoxes: DictatedTextBox[] = []
): Promise<Blob> {
  const syncedGraphs = syncLiveDesmosBoxes(graphs);
  const resolvedPages = await Promise.all(
    pages.map(async (p) => {
      if (p.template === 'pdf' && (!p.pdfDataUrl || p.pdfDataUrl === '__CACHED__')) {
        const resolved = await resolvePdfPageDataUrl(p);
        return resolved ? { ...p, pdfDataUrl: resolved } : p;
      }
      return p;
    })
  );

  const data: ProjectData = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    pages: resolvedPages,
    strokes,
    shapes,
    graphs: syncedGraphs,
    calculators,
    images,
    dictatedTextBoxes,
  };

  const json = JSON.stringify(data, null, 2);
  return new Blob([json], { type: 'application/json' });
}

export type SaveExecutionResult =
  | {
      status: 'saved';
      fileName: string;
      fileHandle?: FileSystemFileHandle;
      mode: SaveAsMode;
      method: 'handle_overwrite' | 'picker' | 'download';
    }
  | { status: 'cancelled' }
  | {
      status: 'needs_explorer_fallback';
      reason: 'blocked_in_iframe' | 'unsupported';
      mode: SaveAsMode;
      suggestedName: string;
    };

export function triggerDirectBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canShareFilesOnDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  if (typeof navigator.canShare !== 'function') {
    return false;
  }
  try {
    const probe = new File(['probe'], 'probe.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function shareFileWithSystemSheet(
  blob: Blob,
  fileName: string,
  mimeType: string
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported';
  }
  try {
    const file = new File([blob], fileName, { type: mimeType || blob.type || 'application/octet-stream' });
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return 'unsupported';
    }
    await navigator.share({
      files: [file],
      title: fileName,
    });
    return 'shared';
  } catch (err: unknown) {
    if ((err as Error)?.name === 'AbortError') {
      return 'cancelled';
    }
    console.warn('Web Share file failed:', err);
    return 'unsupported';
  }
}

export function getDefaultSaveFileName(
  mode: SaveAsMode,
  pages: PageData[],
  currentPageId?: string,
  existingName?: string
): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const cleanBaseFromExisting = existingName
    ? existingName.replace(/\.(noteteacher|json|pdf|png|jpg|jpeg)$/i, '')
    : '';

  if (mode === 'project_json') {
    if (existingName && /\.(noteteacher|json)$/i.test(existingName)) {
      return existingName;
    }
    const base = cleanBaseFromExisting || `NoteTeacher_Project_${dateStr}`;
    return `${base}.noteteacher`;
  }

  const isClean = mode === 'pdf_clean' || mode === 'image_clean';
  const suffix = isClean ? 'Clean' : 'AsShown';

  if (mode === 'image_as_shown' || mode === 'image_clean') {
    if (existingName && /\.png$/i.test(existingName)) {
      return existingName;
    }
    const currentPage = pages.find((p) => p.id === currentPageId) || pages[0];
    const pageTitle = (currentPage?.title || 'Page').replace(/[^a-zA-Z0-9_-]/g, '_');
    const base = cleanBaseFromExisting || `NoteTeacher_${pageTitle}_${suffix}_${dateStr}`;
    return `${base}.png`;
  }

  if (existingName && /\.pdf$/i.test(existingName)) {
    return existingName;
  }
  const firstPage = pages[0];
  const docTitle = (firstPage?.title || 'Worksheet').replace(/[^a-zA-Z0-9_-]/g, '_');
  const base = cleanBaseFromExisting || `NoteTeacher_${docTitle}_${suffix}_${dateStr}`;
  return `${base}.pdf`;
}

export function doesHandleMatchSaveMode(handleName: string, mode: SaveAsMode): boolean {
  const lower = handleName.toLowerCase();
  if (mode === 'project_json') {
    return lower.endsWith('.noteteacher') || lower.endsWith('.json');
  }
  if (mode === 'image_as_shown' || mode === 'image_clean') {
    return lower.endsWith('.png');
  }
  return lower.endsWith('.pdf');
}

function resolveSaveModeFromPickedName(pickedName: string, fallbackMode: SaveAsMode): SaveAsMode {
  const lower = pickedName.toLowerCase();
  if (lower.endsWith('.noteteacher') || lower.endsWith('.json')) {
    return 'project_json';
  }
  if (lower.endsWith('.png')) {
    return fallbackMode === 'pdf_clean' || fallbackMode === 'image_clean'
      ? 'image_clean'
      : 'image_as_shown';
  }
  if (lower.endsWith('.pdf')) {
    return fallbackMode === 'pdf_clean' || fallbackMode === 'image_clean'
      ? 'pdf_clean'
      : 'pdf_as_shown';
  }
  return fallbackMode;
}

function getSavePickerTypes(mode: SaveAsMode) {
  const pdfType = {
    description: 'PDF Document',
    accept: { 'application/pdf': ['.pdf'] },
  };
  const projectType = {
    description: 'NoteTeacher Project',
    accept: { 'application/json': ['.noteteacher', '.json'] },
  };
  const pngType = {
    description: 'PNG Image',
    accept: { 'image/png': ['.png'] },
  };

  if (mode === 'project_json') return [projectType, pdfType, pngType];
  if (mode === 'image_as_shown' || mode === 'image_clean') return [pngType, pdfType, projectType];
  return [pdfType, projectType, pngType];
}

/**
 * Exports full project as a downloadable .noteteacher JSON file (or overwrites existing local handle)
 */
export async function exportProjectJson(
  pages: PageData[],
  strokes: CanvasStroke[],
  shapes: GeometricShape[],
  graphs: DesmosBox[],
  calculators: CalculatorBox[],
  images: CanvasImage[] = [],
  suggestedName?: string,
  existingHandle?: FileSystemFileHandle,
  dictatedTextBoxes: DictatedTextBox[] = []
): Promise<SaveExecutionResult> {
  const finalFilename = getDefaultSaveFileName('project_json', pages, undefined, suggestedName);

  // Overwrite directly via existing FileSystemFileHandle if available & matching extension
  if (existingHandle && doesHandleMatchSaveMode(existingHandle.name, 'project_json')) {
    try {
      // @ts-expect-error requestPermission
      const perm = await existingHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        const blob = await buildProjectJsonBlob(
          pages,
          strokes,
          shapes,
          graphs,
          calculators,
          images,
          dictatedTextBoxes
        );
        const writable = await existingHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return {
          status: 'saved',
          fileName: existingHandle.name,
          fileHandle: existingHandle,
          mode: 'project_json',
          method: 'handle_overwrite',
        };
      }
    } catch (err) {
      console.warn('Direct handle overwrite failed, falling back to Save Picker:', err);
    }
  }

  // Open native File Explorer SYNCHRONOUSLY before async blob building to keep user activation
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const pickerOpts: Record<string, unknown> = {
        suggestedName: finalFilename,
        types: getSavePickerTypes('project_json'),
      };
      if (existingHandle) {
        pickerOpts.startIn = existingHandle;
      }
      // @ts-expect-error showSaveFilePicker
      const handle: FileSystemFileHandle = await window.showSaveFilePicker(pickerOpts);
      const blob = await buildProjectJsonBlob(
        pages,
        strokes,
        shapes,
        graphs,
        calculators,
        images,
        dictatedTextBoxes
      );
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return {
        status: 'saved',
        fileName: handle.name,
        fileHandle: handle,
        mode: 'project_json',
        method: 'picker',
      };
    } catch (err: unknown) {
      const errName = (err as Error)?.name;
      if (errName === 'AbortError') return { status: 'cancelled' };
      console.warn('showSaveFilePicker failed:', err);
      return {
        status: 'needs_explorer_fallback',
        reason: errName === 'SecurityError' ? 'blocked_in_iframe' : 'unsupported',
        mode: 'project_json',
        suggestedName: finalFilename,
      };
    }
  }

  return {
    status: 'needs_explorer_fallback',
    reason: 'unsupported',
    mode: 'project_json',
    suggestedName: finalFilename,
  };
}

function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function resolvePageAspectRatio(page: PageData): number {
  if (page.aspectRatio && page.aspectRatio > 0) return page.aspectRatio;
  if (page.pdfWidth && page.pdfHeight && page.pdfHeight > 0) {
    return page.pdfWidth / page.pdfHeight;
  }
  return 8.5 / 11;
}

/**
 * Resolves the exact CSS stage coordinate space used when a given page is displayed
 * in `#document-sheet`, preventing distortion on unvisited or mixed portrait/landscape pages.
 */
function resolvePageStageDimensions(
  page: PageData,
  stageContainer: HTMLElement
): { stageWidth: number; stageHeight: number } {
  const recorded = getRecordedPageStageSize(page.id);
  if (recorded && recorded.width > 50 && recorded.height > 50) {
    return { stageWidth: recorded.width, stageHeight: recorded.height };
  }

  const aspect = resolvePageAspectRatio(page);
  const curW = stageContainer.clientWidth;
  const curH = stageContainer.clientHeight;
  if (curW > 50 && curH > 50) {
    const curAspect = curW / curH;
    if (Math.abs(curAspect - aspect) < 0.02) {
      return { stageWidth: curW, stageHeight: curH };
    }
  }

  // Replicate App.tsx page responsive sizing math cleanly
  const mainEl = stageContainer.closest('main') || stageContainer.parentElement;
  const padX = typeof window !== 'undefined' && window.innerWidth >= 640 ? 48 : 32;
  const availW = mainEl && mainEl.clientWidth > 100 ? mainEl.clientWidth - padX : 1000;
  const availH = typeof window !== 'undefined' ? Math.max(400, window.innerHeight - 110) : 900;
  const w = Math.min(availW, availH * aspect);
  const h = w / aspect;
  return {
    stageWidth: Math.max(200, Math.round(w)),
    stageHeight: Math.max(200, Math.round(h)),
  };
}

function isDesmosBoxActiveInDom(id: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector<HTMLElement>(`[data-desmos-box-id="${id}"]`);
  return el?.dataset.active === 'true';
}

function isCalcBoxActiveInDom(id: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector<HTMLElement>(`[data-calc-box-id="${id}"]`);
  return el?.dataset.active === 'true';
}

function drawCornerLGrabHandles(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
  strokeColor: string,
  dotColor: string,
  badgeBg: string
) {
  const s = Math.max(0.5, scale);
  const boxSize = 20 * s;
  const offset = 4 * s;

  // Top-Right L-Grab
  ctx.save();
  const trLeft = x + w - boxSize + offset;
  const trTop = y - offset;
  ctx.fillStyle = badgeBg;
  ctx.beginPath();
  ctx.roundRect(trLeft, trTop, boxSize, boxSize, [0, 6 * s, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(trLeft, trTop);
  ctx.lineTo(trLeft + boxSize, trTop);
  ctx.lineTo(trLeft + boxSize, trTop + boxSize);
  ctx.stroke();
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(trLeft + boxSize / 2, trTop + boxSize / 2, 3 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bottom-Left L-Grab
  ctx.save();
  const blLeft = x - offset;
  const blTop = y + h - boxSize + offset;
  ctx.fillStyle = badgeBg;
  ctx.beginPath();
  ctx.roundRect(blLeft, blTop, boxSize, boxSize, [0, 0, 0, 6 * s]);
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(blLeft, blTop);
  ctx.lineTo(blLeft, blTop + boxSize);
  ctx.lineTo(blLeft + boxSize, blTop + boxSize);
  ctx.stroke();
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(blLeft + boxSize / 2, blTop + boxSize / 2, 3 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGridShape(
  ctx: CanvasRenderingContext2D,
  sh: GeometricShape,
  scaleX: number,
  scaleY: number,
  avgScale: number,
  isClean: boolean
) {
  if (isClean && sh.isGhosted) return;

  const x = Math.min(sh.x, sh.x + sh.width) * scaleX;
  const y = Math.min(sh.y, sh.y + sh.height) * scaleY;
  const w = Math.max(20, Math.abs(sh.width)) * scaleX;
  const h = Math.max(20, Math.abs(sh.height)) * scaleY;
  const rows = sh.gridRows || Math.max(2, Math.round(Math.abs(sh.height) / 28));
  const cols = sh.gridCols || Math.max(2, Math.round(Math.abs(sh.width) / 28));
  const strokeColor = sh.isGhosted ? '#EF4444' : sh.strokeColor || '#2563EB';
  const baseW = (sh.strokeWidth || 1.5) * avgScale;

  ctx.save();
  if (sh.rotation) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((sh.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  if (sh.isGhosted) ctx.globalAlpha = 0.3;

  if (sh.fillColor && sh.fillColor !== 'transparent') {
    ctx.fillStyle = sh.fillColor;
    ctx.fillRect(x, y, w, h);
  }

  const applyDash = (enabled: boolean) => {
    if (!enabled) {
      ctx.setLineDash([]);
      return;
    }
    if (sh.strokeStyle === 'dashed') ctx.setLineDash([6 * avgScale, 4 * avgScale]);
    else if (sh.strokeStyle === 'dotted') ctx.setLineDash([2 * avgScale, 3 * avgScale]);
    else ctx.setLineDash([]);
  };

  // Outer border
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = baseW;
  applyDash(true);
  ctx.strokeRect(x, y, w, h);

  // Vertical lines
  for (let i = 1; i < cols; i++) {
    const lx = x + (i / cols) * w;
    const isCenter = Math.abs(i - cols / 2) < 0.5;
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = baseW * (isCenter ? 1.2 : 0.75);
    ctx.globalAlpha = (sh.isGhosted ? 0.3 : 1) * (isCenter ? 0.9 : 0.65);
    applyDash(!isCenter);
    ctx.beginPath();
    ctx.moveTo(lx, y);
    ctx.lineTo(lx, y + h);
    ctx.stroke();
    ctx.restore();
  }

  // Horizontal lines
  for (let j = 1; j < rows; j++) {
    const ly = y + (j / rows) * h;
    const isCenter = Math.abs(j - rows / 2) < 0.5;
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = baseW * (isCenter ? 1.2 : 0.75);
    ctx.globalAlpha = (sh.isGhosted ? 0.3 : 1) * (isCenter ? 0.9 : 0.65);
    applyDash(!isCenter);
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + w, ly);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawVectorShape(
  ctx: CanvasRenderingContext2D,
  sh: GeometricShape,
  scaleX: number,
  scaleY: number,
  avgScale: number,
  isClean: boolean
) {
  if (sh.type === 'grid') return;
  if (isClean && sh.isGhosted) return;

  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = sh.strokeWidth * avgScale;

  if (sh.isGhosted) {
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#EF4444';
    ctx.setLineDash([8 * avgScale, 6 * avgScale]);
  } else {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = sh.strokeColor;
    if (sh.strokeStyle === 'dashed') ctx.setLineDash([8 * avgScale, 6 * avgScale]);
    else if (sh.strokeStyle === 'dotted') ctx.setLineDash([3 * avgScale, 4 * avgScale]);
    else ctx.setLineDash([]);
  }

  const x = Math.min(sh.x, sh.x + sh.width) * scaleX;
  const y = Math.min(sh.y, sh.y + sh.height) * scaleY;
  const w = Math.abs(sh.width) * scaleX;
  const h = Math.abs(sh.height) * scaleY;
  if (
    sh.rotation &&
    (sh.type === 'rect' || sh.type === 'rounded_rect' || sh.type === 'circle' || sh.type === 'triangle')
  ) {
    const rcx = x + w / 2;
    const rcy = y + h / 2;
    ctx.translate(rcx, rcy);
    ctx.rotate((sh.rotation * Math.PI) / 180);
    ctx.translate(-rcx, -rcy);
  }

  if (sh.type === 'arc') {
    const cx = (sh.centerX ?? sh.x + sh.width / 2) * scaleX;
    const cy = (sh.centerY ?? sh.y + sh.height / 2) * scaleY;
    const r = (sh.radius ?? Math.min(Math.abs(sh.width), Math.abs(sh.height)) / 2) * avgScale;
    const a1 = sh.startAngle ?? 0;
    const a2 = sh.endAngle ?? Math.PI / 2;
    const isAcute = sh.arcSweep !== 'obtuse';

    let diff = (a2 - a1) % (2 * Math.PI);
    if (diff < 0) diff += 2 * Math.PI;
    const acuteSpan = diff <= Math.PI ? diff : 2 * Math.PI - diff;
    const obtuseSpan = 2 * Math.PI - acuteSpan;
    const span = isAcute ? acuteSpan : obtuseSpan;
    const deg = sh.angleDegrees ?? Math.round((span * 180) / Math.PI);

    let clockwise = diff <= Math.PI;
    if (!isAcute) clockwise = !clockwise;
    const anticlockwise = !clockwise;

    if (sh.fillColor && sh.fillColor !== 'transparent') {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a1, a2, anticlockwise);
      ctx.closePath();
      ctx.fillStyle = sh.fillColor;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.lineCap = 'round';
    ctx.arc(cx, cy, r, a1, a2, anticlockwise);
    ctx.stroke();

    const midAngle = clockwise ? a1 + span / 2 : a1 - span / 2;
    const badgeR = Math.max(16 * avgScale, r * 0.7);
    const badgeX = cx + badgeR * Math.cos(midAngle);
    const badgeY = cy + badgeR * Math.sin(midAngle);

    const bw = 32 * avgScale;
    const bh = 20 * avgScale;
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(badgeX - bw / 2, badgeY - bh / 2, bw, bh, 6 * avgScale);
    ctx.fill();
    ctx.strokeStyle = sh.isGhosted ? '#EF4444' : sh.strokeColor;
    ctx.lineWidth = 1 * avgScale;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(10 * avgScale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${deg}°`, badgeX, badgeY);

    ctx.restore();
    return;
  }

  if (sh.type === 'rect') {
    if (sh.fillColor && sh.fillColor !== 'transparent') {
      ctx.fillStyle = sh.fillColor;
      ctx.fillRect(x, y, w, h);
    }
    ctx.strokeRect(x, y, w, h);
  } else if (sh.type === 'rounded_rect') {
    const rad = Math.min(16 * avgScale, w / 4, h / 4);
    ctx.roundRect(x, y, w, h, rad);
    if (sh.fillColor && sh.fillColor !== 'transparent') {
      ctx.fillStyle = sh.fillColor;
      ctx.fill();
    }
    ctx.stroke();
  } else if (sh.type === 'circle') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    if (sh.fillColor && sh.fillColor !== 'transparent') {
      ctx.fillStyle = sh.fillColor;
      ctx.fill();
    }
    ctx.stroke();
  } else if (sh.type === 'triangle') {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    if (sh.fillColor && sh.fillColor !== 'transparent') {
      ctx.fillStyle = sh.fillColor;
      ctx.fill();
    }
    ctx.stroke();
  } else if (sh.type === 'polyline' && sh.points && sh.points.length > 0) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (sh.points.length === 1) {
      const p0 = sh.points[0];
      ctx.moveTo(p0.x * scaleX, p0.y * scaleY);
      ctx.lineTo(p0.x * scaleX + 0.1, p0.y * scaleY + 0.1);
    } else {
      ctx.moveTo(sh.points[0].x * scaleX, sh.points[0].y * scaleY);
      for (let i = 1; i < sh.points.length; i++) {
        ctx.lineTo(sh.points[i].x * scaleX, sh.points[i].y * scaleY);
      }
    }
    ctx.stroke();
  } else if (sh.type === 'line' || sh.type === 'arrow' || sh.type === 'double_arrow') {
    const fromX = sh.x * scaleX;
    const fromY = sh.y * scaleY;
    const toX = (sh.x + sh.width) * scaleX;
    const toY = (sh.y + sh.height) * scaleY;
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    if (sh.type === 'arrow' || sh.type === 'double_arrow') {
      const angle = Math.atan2(toY - fromY, toX - fromX);
      const headLen = 14 * avgScale;
      ctx.setLineDash([]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(
        toX - headLen * Math.cos(angle - Math.PI / 6),
        toY - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(toX, toY);
      ctx.lineTo(
        toX - headLen * Math.cos(angle + Math.PI / 6),
        toY - headLen * Math.sin(angle + Math.PI / 6)
      );
      if (sh.type === 'double_arrow') {
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(
          fromX + headLen * Math.cos(angle - Math.PI / 6),
          fromY + headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(
          fromX + headLen * Math.cos(angle + Math.PI / 6),
          fromY + headLen * Math.sin(angle + Math.PI / 6)
        );
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawFreehandStroke(
  ctx: CanvasRenderingContext2D,
  s: CanvasStroke,
  scaleX: number,
  scaleY: number,
  avgScale: number,
  isClean: boolean
) {
  if (isClean && s.isGhosted) return;
  if (!s.points || s.points.length < 2) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (s.isGhosted) {
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#DC2626';
    ctx.setLineDash([4 * avgScale, 4 * avgScale]);
  } else if (s.tool === 'highlighter') {
    ctx.globalAlpha = s.opacity || 0.35;
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = s.color;
  } else if (s.tool === 'pencil') {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = s.color;
  } else {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = s.color;
  }

  ctx.lineWidth = s.width * avgScale;

  ctx.beginPath();
  ctx.moveTo(s.points[0].x * scaleX, s.points[0].y * scaleY);
  for (let i = 1; i < s.points.length; i++) {
    const p1 = s.points[i - 1];
    const p2 = s.points[i];
    const midX = ((p1.x + p2.x) / 2) * scaleX;
    const midY = ((p1.y + p2.y) / 2) * scaleY;
    ctx.quadraticCurveTo(p1.x * scaleX, p1.y * scaleY, midX, midY);
  }
  const lastP = s.points[s.points.length - 1];
  ctx.lineTo(lastP.x * scaleX, lastP.y * scaleY);
  ctx.stroke();
  ctx.restore();
}

async function drawPlacedImageBox(
  ctx: CanvasRenderingContext2D,
  imgData: CanvasImage,
  scaleX: number,
  scaleY: number,
  avgScale: number,
  isClean: boolean
) {
  const x = imgData.x * scaleX;
  const y = imgData.y * scaleY;
  const w = imgData.width * scaleX;
  const h = imgData.height * scaleY;
  const img = await loadImageSafe(imgData.dataUrl);

  ctx.save();
  if (imgData.rotation) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((imgData.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12 * avgScale);
  ctx.fill();
  ctx.clip();

  if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
    // Match CSS `object-contain` inside the image card
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const boxAspect = w / Math.max(1, h);
    let drawW = w;
    let drawH = h;
    if (imgAspect > boxAspect) {
      drawH = w / imgAspect;
    } else {
      drawW = h * imgAspect;
    }
    const drawX = x + (w - drawW) / 2;
    const drawY = y + (h - drawH) / 2;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }
  ctx.restore();

  ctx.save();
  if (imgData.rotation) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((imgData.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  ctx.strokeStyle = isClean ? '#E2E8F0' : '#CBD5E1';
  ctx.lineWidth = 1 * avgScale;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12 * avgScale);
  ctx.stroke();

  if (!isClean) {
    drawCornerLGrabHandles(ctx, x, y, w, h, avgScale, '#6366F1', '#6366F1', '#FFFFFF');
  }
  ctx.restore();
}

/**
 * Fallback Desmos renderer only if Desmos API & live snapshot were unavailable
 */
function drawEmergencyDesmosFallback(
  ctx: CanvasRenderingContext2D,
  g: DesmosBox,
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  avgScale: number,
  isClean: boolean
) {
  const opacity = g.opacity ?? 0.98;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(gx, gy, gw, gh, 12 * avgScale);
  ctx.clip();

  ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
  ctx.fillRect(gx, gy, gw, gh);

  const headerH = Math.min(gh * 0.25, 38 * avgScale);
  ctx.fillStyle = `rgba(248, 250, 252, ${opacity})`;
  ctx.fillRect(gx, gy, gw, headerH);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1 * avgScale;
  ctx.beginPath();
  ctx.moveTo(gx, gy + headerH);
  ctx.lineTo(gx + gw, gy + headerH);
  ctx.stroke();

  ctx.font = `700 ${Math.max(8, Math.round(12 * avgScale))}px "Plus Jakarta Sans", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2563EB';
  ctx.fillText('Desmos', gx + 12 * avgScale, gy + headerH / 2);

  const plotY = gy + headerH;
  const plotH = Math.max(10, gh - headerH);
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1 * avgScale;
  for (let i = 1; i < 6; i++) {
    const lx = gx + (gw / 6) * i;
    ctx.beginPath();
    ctx.moveTo(lx, plotY);
    ctx.lineTo(lx, plotY + plotH);
    ctx.stroke();
    const ly = plotY + (plotH / 6) * i;
    ctx.beginPath();
    ctx.moveTo(gx, ly);
    ctx.lineTo(gx + gw, ly);
    ctx.stroke();
  }
  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 1.5 * avgScale;
  ctx.beginPath();
  ctx.moveTo(gx + gw / 2, plotY);
  ctx.lineTo(gx + gw / 2, plotY + plotH);
  ctx.moveTo(gx, plotY + plotH / 2);
  ctx.lineTo(gx + gw, plotY + plotH / 2);
  ctx.stroke();

  if (!isClean && g.expressions && g.expressions.length > 0) {
    const panelW = Math.min(gw * 0.42, 160 * avgScale);
    ctx.fillStyle = 'rgba(248, 250, 252, 0.96)';
    ctx.fillRect(gx, plotY, panelW, plotH);
    ctx.strokeStyle = '#CBD5E1';
    ctx.strokeRect(gx, plotY, panelW, plotH);
    g.expressions.slice(0, 4).forEach((expr, idx) => {
      const ey = plotY + (18 + idx * 24) * avgScale;
      if (ey > plotY + plotH - 6) return;
      ctx.fillStyle = expr.color || '#2563EB';
      ctx.beginPath();
      ctx.arc(gx + 10 * avgScale, ey, 3.5 * avgScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0F172A';
      ctx.font = `600 ${Math.max(7, Math.round(10 * avgScale))}px "IBM Plex Mono", monospace`;
      ctx.fillText(expr.latex || '', gx + 18 * avgScale, ey);
    });
  }

  ctx.restore();
}

/**
 * Fallback Calculator renderer preserving exact 336x496 scaled layout
 */
function drawEmergencyCalculatorFallback(
  ctx: CanvasRenderingContext2D,
  c: CalculatorBox,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
  avgScale: number,
  isClean: boolean
) {
  const s = (c.scale || 1) * avgScale;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 16 * s);
  ctx.clip();

  ctx.fillStyle = '#1B1F27';
  ctx.fillRect(cx, cy, cw, ch);

  const headerH = 34 * s;
  ctx.fillStyle = '#14171D';
  ctx.fillRect(cx, cy, cw, headerH);
  ctx.fillStyle = '#E2E8F0';
  ctx.font = `600 ${Math.round(12 * s)}px "Plus Jakarta Sans", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Scientific', cx + (isClean ? 12 : 68) * s, cy + headerH / 2);

  // Breadcrumb + Main Result
  ctx.textAlign = 'right';
  ctx.fillStyle = '#94A3B8';
  ctx.font = `400 ${Math.round(11 * s)}px "IBM Plex Mono", monospace`;
  ctx.fillText(c.expression || '', cx + cw - 12 * s, cy + 52 * s);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `600 ${Math.round(24 * s)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillText(c.result || '0', cx + cw - 12 * s, cy + 82 * s);
  ctx.textAlign = 'left';

  // Angle + F-E + Memory labels
  ctx.fillStyle = '#E2E8F0';
  ctx.font = `600 ${Math.round(11 * s)}px "Plus Jakarta Sans", sans-serif`;
  const angleLabel = c.angleMode ?? (c.isRad ? 'RAD' : 'DEG');
  ctx.fillText(angleLabel, cx + 14 * s, cy + 114 * s);
  ctx.fillStyle = c.isFeMode ? '#10B981' : '#CBD5E1';
  ctx.fillText('F-E', cx + 54 * s, cy + 114 * s);

  // 5x7 Key grid matching Windows Scientific layout
  const keys = [
    ['2nd', 'π', 'e', 'CE', '⌫'],
    ['x²', '1/x', '|x|', 'exp', 'mod'],
    ['√x', '(', ')', 'n!', '÷'],
    ['xʸ', '7', '8', '9', '×'],
    ['10ˣ', '4', '5', '6', '−'],
    ['log', '1', '2', '3', '+'],
    ['ln', '+/−', '0', '.', '='],
  ];
  const gridTop = cy + 178 * s;
  const padX = 8 * s;
  const gap = 4 * s;
  const colW = (cw - padX * 2 - gap * 4) / 5;
  const rowH = (ch - (gridTop - cy) - 8 * s - gap * 6) / 7;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  keys.forEach((row, rIdx) => {
    row.forEach((label, cIdx) => {
      const kx = cx + padX + cIdx * (colW + gap);
      const ky = gridTop + rIdx * (rowH + gap);
      const isEquals = rIdx === 6 && cIdx === 4;
      const isDigit = /^[0-9.]$/.test(label) || label === '+/−';
      ctx.fillStyle = isEquals ? '#0EA5E9' : isDigit ? '#343B4A' : '#2A303D';
      ctx.beginPath();
      ctx.roundRect(kx, ky, colW, rowH, 6 * s);
      ctx.fill();
      ctx.fillStyle = isEquals ? '#090D16' : '#FFFFFF';
      ctx.font = `600 ${Math.round(12 * s)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(label, kx + colW / 2, ky + rowH / 2);
    });
  });

  ctx.restore();
}

async function drawDesmosBox(
  ctx: CanvasRenderingContext2D,
  g: DesmosBox,
  scaleX: number,
  scaleY: number,
  avgScale: number,
  isClean: boolean
) {
  const gx = g.x * scaleX;
  const gy = g.y * scaleY;
  const gw = g.width * scaleX;
  const gh = g.height * scaleY;
  const activeInDom = !isClean && isDesmosBoxActiveInDom(g.id);

  ctx.save();
  if (g.rotation) {
    const gcx = gx + gw / 2;
    const gcy = gy + gh / 2;
    ctx.translate(gcx, gcy);
    ctx.rotate((g.rotation * Math.PI) / 180);
    ctx.translate(-gcx, -gcy);
  }

  const snap = await getDesmosSnapshot(g, isClean);
  let drewRealSnapshot = false;

  if (snap) {
    const snapImg = await loadImageSafe(snap.dataUrl);
    if (snapImg && snapImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(gx, gy, gw, gh, 12 * avgScale);
      ctx.clip();
      ctx.drawImage(snapImg, gx, gy, gw, gh);
      ctx.restore();
      drewRealSnapshot = true;
    }
  }

  if (!drewRealSnapshot) {
    drawEmergencyDesmosFallback(ctx, g, gx, gy, gw, gh, avgScale, isClean);
  }

  // Card frame ring
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(gx, gy, gw, gh, 12 * avgScale);
  if (!isClean && activeInDom) {
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2 * avgScale;
  } else {
    ctx.strokeStyle = isClean ? 'rgba(203, 213, 225, 0.9)' : '#CBD5E1';
    ctx.lineWidth = 1 * avgScale;
  }
  ctx.stroke();
  ctx.restore();

  // In As-Shown mode, draw open Graph Preferences popover + L-grab resize handles
  if (!isClean) {
    if (snap?.popover) {
      const popImg = await loadImageSafe(snap.popover.dataUrl);
      if (popImg) {
        const px = gx + snap.popover.offsetX * scaleX;
        const py = gy + snap.popover.offsetY * scaleY;
        const pw = snap.popover.width * scaleX;
        const ph = snap.popover.height * scaleY;
        ctx.save();
        ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
        ctx.shadowBlur = 16 * avgScale;
        ctx.drawImage(popImg, px, py, pw, ph);
        ctx.restore();
      }
    }

    drawCornerLGrabHandles(ctx, gx, gy, gw, gh, avgScale, '#3B82F6', '#2563EB', '#FFFFFF');
  }
  ctx.restore();
}

async function drawCalculatorBox(
  ctx: CanvasRenderingContext2D,
  c: CalculatorBox,
  scaleX: number,
  scaleY: number,
  avgScale: number,
  isClean: boolean
) {
  const calcScale = Math.max(0.2, Math.min(2.8, c.scale || 1));
  const cx = c.x * scaleX;
  const cy = c.y * scaleY;
  const cw = CALC_LOGICAL_WIDTH * calcScale * scaleX;
  const ch = CALC_LOGICAL_HEIGHT * calcScale * scaleY;
  const activeInDom = !isClean && isCalcBoxActiveInDom(c.id);

  ctx.save();
  if (c.rotation) {
    const ccx = cx + cw / 2;
    const ccy = cy + ch / 2;
    ctx.translate(ccx, ccy);
    ctx.rotate((c.rotation * Math.PI) / 180);
    ctx.translate(-ccx, -ccy);
  }

  const snap = await getCalculatorSnapshot(c, isClean);
  let drewRealSnapshot = false;

  if (snap) {
    const snapImg = await loadImageSafe(snap.dataUrl);
    if (snapImg && snapImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cx, cy, cw, ch, 16 * avgScale);
      ctx.clip();
      ctx.drawImage(snapImg, cx, cy, cw, ch);
      ctx.restore();
      drewRealSnapshot = true;
    }
  }

  if (!drewRealSnapshot) {
    drawEmergencyCalculatorFallback(ctx, c, cx, cy, cw, ch, avgScale, isClean);
  }

  // Outer frame border
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 16 * avgScale);
  if (!isClean && activeInDom) {
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 2 * avgScale;
  } else {
    ctx.strokeStyle = isClean ? 'rgba(51, 65, 85, 0.85)' : '#475569';
    ctx.lineWidth = 1 * avgScale;
  }
  ctx.stroke();
  ctx.restore();

  if (!isClean) {
    drawCornerLGrabHandles(ctx, cx, cy, cw, ch, avgScale, '#34D399', '#34D399', '#0F172A');
  }
  ctx.restore();
}

function drawDictatedTextBox(
  ctx: CanvasRenderingContext2D,
  box: DictatedTextBox,
  scaleX: number,
  scaleY: number,
  avgScale: number,
  isClean: boolean = false
) {
  if (isClean && box.isGhosted) return;
  const content = box.text || '';
  if (!content.trim()) return;

  const x = box.x * scaleX;
  const y = box.y * scaleY;
  const w = Math.max(20, box.width * scaleX);
  const h = Math.max(16, box.height * scaleY);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const fontSize = Math.max(8, box.fontSize * avgScale);
  const lineHeight = fontSize * 1.18;
  const padX = 4 * scaleX;
  const padY = 2 * scaleY;

  ctx.save();
  if (box.isGhosted) {
    ctx.globalAlpha = 0.35;
  }
  if (box.rotation) {
    ctx.translate(cx, cy);
    ctx.rotate((box.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  ctx.font = `500 ${fontSize}px "Inter", "Plus Jakarta Sans", -apple-system, sans-serif`;
  ctx.fillStyle = box.isGhosted ? '#DC2626' : box.color || '#0F172A';
  ctx.textBaseline = 'top';

  if (!box.wrap) {
    const paragraphs = content.split('\n');
    paragraphs.forEach((para, idx) => {
      ctx.fillText(para, x + padX, y + padY + idx * lineHeight);
    });
  } else {
    const maxLineW = Math.max(12, w - padX * 2);
    const paragraphs = content.split('\n');
    let curY = y + padY;

    for (const para of paragraphs) {
      const words = para.split(' ');
      let line = '';
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const testLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(testLine).width <= maxLineW) {
          line = testLine;
        } else {
          if (line) {
            ctx.fillText(line, x + padX, curY);
            curY += lineHeight;
            line = word;
          } else {
            // Break single long word character by character
            let chunk = '';
            for (const ch of word) {
              if (ctx.measureText(chunk + ch).width <= maxLineW) {
                chunk += ch;
              } else {
                if (chunk) {
                  ctx.fillText(chunk, x + padX, curY);
                  curY += lineHeight;
                }
                chunk = ch;
              }
            }
            line = chunk;
          }
        }
      }
      if (line) {
        ctx.fillText(line, x + padX, curY);
        curY += lineHeight;
      } else {
        curY += lineHeight;
      }
    }
  }

  ctx.restore();
}

/**
 * Renders a single page onto an offscreen canvas at high resolution,
 * guaranteeing exact per-page aspect ratio, paper/PDF background, placed images,
 * real frozen Desmos & Calculator snapshots, geometric shapes, dictated text, and ink strokes.
 */
async function renderPageToCanvas(
  page: PageData,
  stageContainer: HTMLElement,
  strokes: CanvasStroke[],
  shapes: GeometricShape[],
  graphs: DesmosBox[],
  calculators: CalculatorBox[],
  images: CanvasImage[],
  isClean: boolean,
  dictatedTextBoxes: DictatedTextBox[] = []
): Promise<HTMLCanvasElement> {
  const { stageWidth, stageHeight } = resolvePageStageDimensions(page, stageContainer);

  const exportScale = 2;
  let targetWidth: number;
  let targetHeight: number;

  if (page.pdfWidth && page.pdfHeight && page.pdfWidth > 0 && page.pdfHeight > 0) {
    const rawW = page.pdfWidth * exportScale;
    const rawH = page.pdfHeight * exportScale;
    const maxDim = 2800;
    const clampFactor = Math.min(1, maxDim / Math.max(rawW, rawH));
    targetWidth = Math.round(rawW * clampFactor);
    targetHeight = Math.round(rawH * clampFactor);
  } else {
    targetWidth = Math.round(stageWidth * exportScale);
    targetHeight = Math.round(stageHeight * exportScale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1. Fill solid white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  // Scale factors from CSS stage coordinates to target export pixels
  const scaleX = targetWidth / stageWidth;
  const scaleY = targetHeight / stageHeight;
  const avgScale = (scaleX + scaleY) / 2;

  // 2. Draw Background (PDF Document resolved on demand or Paper Template)
  const resolvedPdfUrl = page.template === 'pdf' ? await resolvePdfPageDataUrl(page) : undefined;
  if (page.template === 'pdf' && resolvedPdfUrl) {
    const img = await loadImageSafe(resolvedPdfUrl);
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const boxAspect = targetWidth / targetHeight;
      let drawW = targetWidth;
      let drawH = targetHeight;
      if (imgAspect > boxAspect) {
        drawH = targetWidth / imgAspect;
      } else {
        drawW = targetHeight * imgAspect;
      }
      const drawX = (targetWidth - drawW) / 2;
      const drawY = (targetHeight - drawH) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }
  } else if (page.template === 'lined') {
    const lineHeight = 32 * scaleY;
    ctx.save();
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.35)';
    ctx.lineWidth = Math.max(1, scaleY);
    for (let y = lineHeight; y < targetHeight; y += lineHeight) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(targetWidth, y);
      ctx.stroke();
    }
    // Red margin line at x = 96 in stage coords
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.6)';
    ctx.lineWidth = Math.max(1.5, 1.5 * scaleX);
    ctx.beginPath();
    ctx.moveTo(96 * scaleX, 0);
    ctx.lineTo(96 * scaleX, targetHeight);
    ctx.stroke();
    ctx.restore();
  } else if (page.template === 'grid' || page.template === 'graph') {
    const stepX = 24 * scaleX;
    const stepY = 24 * scaleY;
    ctx.save();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
    ctx.lineWidth = Math.max(1, avgScale);
    for (let x = 0; x < targetWidth; x += stepX) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, targetHeight);
      ctx.stroke();
    }
    for (let y = 0; y < targetHeight; y += stepY) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(targetWidth, y);
      ctx.stroke();
    }
    ctx.restore();
  } else if (page.template === 'dotted') {
    const stepX = 24 * scaleX;
    const stepY = 24 * scaleY;
    ctx.save();
    ctx.fillStyle = 'rgba(100, 116, 139, 0.3)';
    for (let x = stepX; x < targetWidth; x += stepX) {
      for (let y = stepY; y < targetHeight; y += stepY) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5 * avgScale, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  const pageImages = images.filter((img) => img.pageId === page.id);
  const pageShapes = shapes.filter((sh) => sh.pageId === page.id);
  const pageStrokes = strokes.filter((s) => s.pageId === page.id);
  const pageGraphs = graphs.filter((g) => g.pageId === page.id);
  const pageCalculators = calculators.filter((c) => c.pageId === page.id);
  const pageDictated = dictatedTextBoxes.filter((b) => b.pageId === page.id);

  // 3. Draw Placed Images (`z-30`) & Interactive Grid Shapes (`z-30`)
  for (const imgItem of pageImages) {
    await drawPlacedImageBox(ctx, imgItem, scaleX, scaleY, avgScale, isClean);
  }
  for (const sh of pageShapes) {
    if (sh.type === 'grid') {
      drawGridShape(ctx, sh, scaleX, scaleY, avgScale, isClean);
    }
  }

  // 4. Draw Unselected (or all in Clean mode) Desmos Graph Boxes & Calculators (`z-30`)
  const activeGraphs: DesmosBox[] = [];
  for (const g of pageGraphs) {
    if (!isClean && isDesmosBoxActiveInDom(g.id)) {
      activeGraphs.push(g);
    } else {
      await drawDesmosBox(ctx, g, scaleX, scaleY, avgScale, isClean);
    }
  }

  const activeCalcs: CalculatorBox[] = [];
  for (const c of pageCalculators) {
    if (!isClean && isCalcBoxActiveInDom(c.id)) {
      activeCalcs.push(c);
    } else {
      await drawCalculatorBox(ctx, c, scaleX, scaleY, avgScale, isClean);
    }
  }

  // 5. Draw Vector Geometric Shapes (including angle arcs) & Ink Strokes (`z-35`)
  for (const sh of pageShapes) {
    drawVectorShape(ctx, sh, scaleX, scaleY, avgScale, isClean);
  }
  for (const s of pageStrokes) {
    drawFreehandStroke(ctx, s, scaleX, scaleY, avgScale, isClean);
  }
  for (const box of pageDictated) {
    drawDictatedTextBox(ctx, box, scaleX, scaleY, avgScale, isClean);
  }

  // 6. Draw Active Selected Desmos/Calculator Boxes on top (`z-40`) in As-Shown mode
  for (const g of activeGraphs) {
    await drawDesmosBox(ctx, g, scaleX, scaleY, avgScale, false);
  }
  for (const c of activeCalcs) {
    await drawCalculatorBox(ctx, c, scaleX, scaleY, avgScale, false);
  }

  return canvas;
}

/**
 * Captures and saves the document as a PDF, PNG Image, or .noteteacher Project.
 * Opens the system File Explorer (showSaveFilePicker) synchronously on click before rendering,
 * or reports needs_explorer_fallback so the in-app File Explorer Save modal can open.
 */
export async function executeSaveAs(
  mode: SaveAsMode,
  containerElement: HTMLElement,
  graphs: DesmosBox[],
  _onSetGraphs: (graphs: DesmosBox[]) => void,
  pages: PageData[],
  strokes: CanvasStroke[],
  shapes: GeometricShape[],
  calculators: CalculatorBox[],
  currentPageId?: string,
  images: CanvasImage[] = [],
  suggestedFilename?: string,
  existingHandle?: FileSystemFileHandle,
  dictatedTextBoxes: DictatedTextBox[] = []
): Promise<SaveExecutionResult> {
  const defaultFileName = getDefaultSaveFileName(mode, pages, currentPageId, suggestedFilename);

  // 1. Overwrite directly via existing FileSystemFileHandle if available & type matches
  if (existingHandle && doesHandleMatchSaveMode(existingHandle.name, mode)) {
    try {
      // @ts-expect-error requestPermission
      const perm = await existingHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        const { blob } = await buildSaveAsBlob(
          mode,
          containerElement,
          graphs,
          pages,
          strokes,
          shapes,
          calculators,
          currentPageId,
          images,
          existingHandle.name,
          dictatedTextBoxes
        );
        const writable = await existingHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return {
          status: 'saved',
          fileName: existingHandle.name,
          fileHandle: existingHandle,
          mode,
          method: 'handle_overwrite',
        };
      }
    } catch (err) {
      console.warn('Direct handle overwrite failed, falling back to Save Picker:', err);
    }
  }

  // 2. Open native OS File Explorer SYNCHRONOUSLY before async rendering so user activation is preserved
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const pickerOpts: Record<string, unknown> = {
        suggestedName: defaultFileName,
        types: getSavePickerTypes(mode),
      };
      if (existingHandle) {
        pickerOpts.startIn = existingHandle;
      }
      // @ts-expect-error showSaveFilePicker
      const handle: FileSystemFileHandle = await window.showSaveFilePicker(pickerOpts);
      const resolvedMode = resolveSaveModeFromPickedName(handle.name, mode);
      const { blob } = await buildSaveAsBlob(
        resolvedMode,
        containerElement,
        graphs,
        pages,
        strokes,
        shapes,
        calculators,
        currentPageId,
        images,
        handle.name,
        dictatedTextBoxes
      );
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return {
        status: 'saved',
        fileName: handle.name,
        fileHandle: handle,
        mode: resolvedMode,
        method: 'picker',
      };
    } catch (err: unknown) {
      const errName = (err as Error)?.name;
      if (errName === 'AbortError') {
        return { status: 'cancelled' };
      }
      console.warn('showSaveFilePicker failed or blocked:', err);
      return {
        status: 'needs_explorer_fallback',
        reason: errName === 'SecurityError' ? 'blocked_in_iframe' : 'unsupported',
        mode,
        suggestedName: defaultFileName,
      };
    }
  }

  return {
    status: 'needs_explorer_fallback',
    reason: 'unsupported',
    mode,
    suggestedName: defaultFileName,
  };
}

/**
 * Generates an in-memory Blob & mimeType for saving locally.
 */
export async function buildSaveAsBlob(
  mode: SaveAsMode,
  containerElement: HTMLElement,
  graphs: DesmosBox[],
  pages: PageData[],
  strokes: CanvasStroke[],
  shapes: GeometricShape[],
  calculators: CalculatorBox[],
  currentPageId?: string,
  images: CanvasImage[] = [],
  existingFileName?: string,
  dictatedTextBoxes: DictatedTextBox[] = []
): Promise<{ blob: Blob; fileName: string; mimeType: string }> {
  const dateStr = new Date().toISOString().slice(0, 10);
  if (mode === 'project_json') {
    const blob = await buildProjectJsonBlob(
      pages,
      strokes,
      shapes,
      graphs,
      calculators,
      images,
      dictatedTextBoxes
    );
    const fileName = existingFileName || `NoteTeacher_Project_${dateStr}.noteteacher`;
    return { blob, fileName, mimeType: 'application/json' };
  }

  const isClean = mode === 'pdf_clean' || mode === 'image_clean';
  const suffix = isClean ? 'Clean' : 'AsShown';
  await captureAllMountedWidgets();

  if (mode === 'image_as_shown' || mode === 'image_clean') {
    const currentPage = pages.find((p) => p.id === currentPageId) || pages[0];
    const canvas = await renderPageToCanvas(
      currentPage,
      containerElement,
      strokes,
      shapes,
      graphs,
      calculators,
      images,
      isClean,
      dictatedTextBoxes
    );
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to render PNG blob'))),
        'image/png'
      );
    });
    const fileName =
      existingFileName && existingFileName.toLowerCase().endsWith('.png')
        ? existingFileName
        : `NoteTeacher_${currentPage.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${suffix}_${dateStr}.png`;
    return { blob, fileName, mimeType: 'image/png' };
  }

  const firstPage = pages[0];
  const firstCanvas = await renderPageToCanvas(
    firstPage,
    containerElement,
    strokes,
    shapes,
    graphs,
    calculators,
    images,
    isClean,
    dictatedTextBoxes
  );

  const pdfWidthPt = (firstCanvas.width / 2) * 0.75;
  const pdfHeightPt = (firstCanvas.height / 2) * 0.75;

  const pdf = new jsPDF({
    orientation: firstCanvas.width > firstCanvas.height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [pdfWidthPt, pdfHeightPt],
  });

  pdf.addImage(firstCanvas.toDataURL('image/png'), 'PNG', 0, 0, pdfWidthPt, pdfHeightPt);

  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];
    const pageCanvas = await renderPageToCanvas(
      page,
      containerElement,
      strokes,
      shapes,
      graphs,
      calculators,
      images,
      isClean,
      dictatedTextBoxes
    );
    const pageW = (pageCanvas.width / 2) * 0.75;
    const pageH = (pageCanvas.height / 2) * 0.75;
    pdf.addPage([pageW, pageH], pageCanvas.width > pageCanvas.height ? 'landscape' : 'portrait');
    pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH);
  }

  const pdfBlob = pdf.output('blob');
  const docTitle = (firstPage.title || 'Worksheet').replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName =
    existingFileName && existingFileName.toLowerCase().endsWith('.pdf')
      ? existingFileName
      : `NoteTeacher_${docTitle}_${suffix}_${dateStr}.pdf`;

  return { blob: pdfBlob, fileName, mimeType: 'application/pdf' };
}
