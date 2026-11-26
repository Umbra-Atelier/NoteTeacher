import {
  CalculatorBox,
  CanvasImage,
  CanvasStroke,
  DesmosBox,
  DictatedTextBox,
  GeometricShape,
  PageData,
} from '../types';
import {
  CALC_LOGICAL_HEIGHT,
  CALC_LOGICAL_WIDTH,
  getCachedCalcPreviewUrl,
  getCachedDesmosPreviewUrl,
  getRecordedPageStageSize,
} from './widgetSnapshotCache';
import { getBrightHighlighterColor, getHighlighterDodgeColor } from './colorUtils';

interface CachedPagePreview {
  signature: string;
  dataUrl: string;
}

const pagePreviewCache = new Map<string, CachedPagePreview>();

function loadPreviewImg(src: string): Promise<HTMLImageElement | null> {
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

function getPageAspect(page: PageData): number {
  if (page.aspectRatio && page.aspectRatio > 0) return page.aspectRatio;
  if (page.pdfWidth && page.pdfHeight && page.pdfHeight > 0) {
    return page.pdfWidth / page.pdfHeight;
  }
  return 8.5 / 11;
}

function resolveLogicalStageSize(page: PageData): { stageW: number; stageH: number } {
  const rec = getRecordedPageStageSize(page.id);
  if (rec && rec.width > 50 && rec.height > 50) {
    return { stageW: rec.width, stageH: rec.height };
  }
  const aspect = getPageAspect(page);
  const availH = typeof window !== 'undefined' ? Math.max(400, window.innerHeight - 110) : 760;
  const availW = typeof window !== 'undefined' ? Math.max(320, window.innerWidth - 48) : 960;
  const w = Math.min(availW, availH * aspect);
  const h = w / aspect;
  return { stageW: Math.round(w), stageH: Math.round(h) };
}

export function computePagePreviewSignature(
  page: PageData,
  strokes: CanvasStroke[],
  shapes: GeometricShape[],
  graphs: DesmosBox[],
  calculators: CalculatorBox[],
  images: CanvasImage[],
  dictatedTextBoxes: DictatedTextBox[] = []
): string {
  const { stageW, stageH } = resolveLogicalStageSize(page);
  const sSig = strokes
    .map((s) => `${s.id}:${s.points.length}:${s.color}:${s.isGhosted ? 1 : 0}`)
    .join(',');
  const shSig = shapes
    .map((sh) => `${sh.id}:${Math.round(sh.x)},${Math.round(sh.y)},${Math.round(sh.width)},${Math.round(sh.height)},${Math.round(sh.rotation || 0)}:${sh.isGhosted ? 1 : 0}`)
    .join(',');
  const gSig = graphs
    .map((g) => {
      const snap = getCachedDesmosPreviewUrl(g.id);
      return `${g.id}:${Math.round(g.x)},${Math.round(g.y)},${Math.round(g.width)},${Math.round(g.height)},${Math.round(g.rotation || 0)}:${snap?.updatedAt || 0}:${g.expressions?.length || 0}`;
    })
    .join(',');
  const cSig = calculators
    .map((c) => {
      const snap = getCachedCalcPreviewUrl(c.id);
      return `${c.id}:${Math.round(c.x)},${Math.round(c.y)},${(c.scale || 1).toFixed(2)},${Math.round(c.rotation || 0)}:${snap?.updatedAt || 0}:${c.result}`;
    })
    .join(',');
  const iSig = images
    .map((im) => `${im.id}:${Math.round(im.x)},${Math.round(im.y)},${Math.round(im.width)},${Math.round(im.height)},${Math.round(im.rotation || 0)}`)
    .join(',');
  const dSig = dictatedTextBoxes
    .map(
      (b) =>
        `${b.id}:${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.fontSize)}:${Math.round(b.rotation)}:${b.text.length}:${b.isGhosted ? 1 : 0}`
    )
    .join(',');

  return [
    page.id,
    page.template,
    stageW,
    stageH,
    page.previewDataUrl ? page.previewDataUrl.length : 0,
    page.pdfDataUrl ? page.pdfDataUrl.length : 0,
    sSig,
    shSig,
    gSig,
    cSig,
    iSig,
    dSig,
  ].join('|');
}

export function getCachedPagePreviewSync(pageId: string): string | null {
  return pagePreviewCache.get(pageId)?.dataUrl || null;
}

export function clearCachedPagePreview(pageId: string): void {
  pagePreviewCache.delete(pageId);
}

/**
 * Generates a fast, tiny, low-resolution JPEG (~260px) snapshot of what actually lives
 * inside a page (paper template or low-res PDF preview + placed images + Desmos/Calc boxes + shapes + strokes)
 * so unloaded off-screen pages act as lightweight blurry visual placeholders of matching dimensions.
 */
export async function renderLowResPageCompositePreview(
  page: PageData,
  strokes: CanvasStroke[],
  shapes: GeometricShape[],
  graphs: DesmosBox[],
  calculators: CalculatorBox[],
  images: CanvasImage[],
  dictatedTextBoxes: DictatedTextBox[] = []
): Promise<string | null> {
  const sig = computePagePreviewSignature(
    page,
    strokes,
    shapes,
    graphs,
    calculators,
    images,
    dictatedTextBoxes
  );
  const cached = pagePreviewCache.get(page.id);
  if (cached && cached.signature === sig) {
    return cached.dataUrl;
  }

  const aspect = getPageAspect(page);
  const maxDim = 280;
  const thumbW = aspect >= 1 ? maxDim : Math.max(80, Math.round(maxDim * aspect));
  const thumbH = aspect >= 1 ? Math.max(80, Math.round(maxDim / aspect)) : maxDim;

  const canvas = document.createElement('canvas');
  canvas.width = thumbW;
  canvas.height = thumbH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { stageW, stageH } = resolveLogicalStageSize(page);
  const scaleX = thumbW / Math.max(1, stageW);
  const scaleY = thumbH / Math.max(1, stageH);
  const avgScale = (scaleX + scaleY) / 2;

  // 1. White sheet backdrop
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, thumbW, thumbH);

  // 2. Base paper template (or PDF underlay) + PDF low-res preview
  const paperPattern = page.template === 'pdf' ? page.underlayTemplate || 'blank' : page.template;
  if (paperPattern === 'lined') {
    const step = 32 * scaleY;
    ctx.strokeStyle = 'rgba(147, 197, 253, 0.45)';
    ctx.lineWidth = 1;
    for (let y = step; y < thumbH; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(thumbW, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
    ctx.beginPath();
    ctx.moveTo(96 * scaleX, 0);
    ctx.lineTo(96 * scaleX, thumbH);
    ctx.stroke();
  } else if (paperPattern === 'grid' || paperPattern === 'graph') {
    const stepX = Math.max(5, 24 * scaleX);
    const stepY = Math.max(5, 24 * scaleY);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.18)';
    ctx.lineWidth = 0.75;
    for (let x = 0; x < thumbW; x += stepX) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, thumbH);
      ctx.stroke();
    }
    for (let y = 0; y < thumbH; y += stepY) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(thumbW, y);
      ctx.stroke();
    }
  } else if (paperPattern === 'dotted') {
    const stepX = Math.max(6, 24 * scaleX);
    const stepY = Math.max(6, 24 * scaleY);
    ctx.fillStyle = 'rgba(100, 116, 139, 0.35)';
    for (let x = stepX; x < thumbW; x += stepX) {
      for (let y = stepY; y < thumbH; y += stepY) {
        ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
      }
    }
  }

  const bgSrc =
    page.template === 'pdf'
      ? page.previewDataUrl || (page.pdfDataUrl && page.pdfDataUrl !== '__CACHED__' ? page.pdfDataUrl : undefined)
      : undefined;

  if (page.template === 'pdf' && bgSrc) {
    const bgImg = await loadPreviewImg(bgSrc);
    if (bgImg && bgImg.naturalWidth > 0) {
      ctx.save();
      if (paperPattern !== 'blank') {
        ctx.globalCompositeOperation = 'multiply';
      }
      ctx.drawImage(bgImg, 0, 0, thumbW, thumbH);
      ctx.restore();
    }
  }

  // 3. Placed images
  for (const im of images) {
    if (!im.dataUrl || im.dataUrl === '__CACHED__') continue;
    const loaded = await loadPreviewImg(im.dataUrl);
    if (loaded) {
      ctx.drawImage(
        loaded,
        im.x * scaleX,
        im.y * scaleY,
        Math.max(4, im.width * scaleX),
        Math.max(4, im.height * scaleY)
      );
    }
  }

  // 4. Desmos Graph Boxes (prefer cached widget snapshot, fall back to clean miniature)
  for (const g of graphs) {
    const gx = g.x * scaleX;
    const gy = g.y * scaleY;
    const gw = Math.max(12, g.width * scaleX);
    const gh = Math.max(12, g.height * scaleY);
    const snap = getCachedDesmosPreviewUrl(g.id);
    if (snap) {
      const snapImg = await loadPreviewImg(snap.dataUrl);
      if (snapImg) {
        ctx.drawImage(snapImg, gx, gy, gw, gh);
        continue;
      }
    }
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${g.opacity ?? 0.92})`;
    ctx.fillRect(gx, gy, gw, gh);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(gx, gy, gw, Math.min(gh * 0.2, 8));
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, gy, gw, gh);
    ctx.beginPath();
    ctx.moveTo(gx + gw / 2, gy + 6);
    ctx.lineTo(gx + gw / 2, gy + gh);
    ctx.moveTo(gx, gy + gh / 2);
    ctx.lineTo(gx + gw, gy + gh / 2);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Calculator Boxes
  for (const c of calculators) {
    const cs = c.scale || 1;
    const cx = c.x * scaleX;
    const cy = c.y * scaleY;
    const cw = Math.max(12, CALC_LOGICAL_WIDTH * cs * scaleX);
    const ch = Math.max(16, CALC_LOGICAL_HEIGHT * cs * scaleY);
    const snap = getCachedCalcPreviewUrl(c.id);
    if (snap) {
      const snapImg = await loadPreviewImg(snap.dataUrl);
      if (snapImg) {
        ctx.drawImage(snapImg, cx, cy, cw, ch);
        continue;
      }
    }
    ctx.save();
    ctx.fillStyle = '#1B1F27';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.fillStyle = '#0EA5E9';
    ctx.fillRect(cx + cw * 0.78, cy + ch * 0.84, cw * 0.16, ch * 0.1);
    ctx.restore();
  }

  // 6. Geometric Shapes
  for (const sh of shapes) {
    if (sh.isGhosted) continue;
    ctx.save();
    ctx.globalAlpha = sh.opacity ?? 1;
    ctx.strokeStyle = sh.strokeColor || '#2563EB';
    ctx.lineWidth = Math.max(1, (sh.strokeWidth || 2) * avgScale);
    const sx = Math.min(sh.x, sh.x + sh.width) * scaleX;
    const sy = Math.min(sh.y, sh.y + sh.height) * scaleY;
    const sw = Math.abs(sh.width) * scaleX;
    const shh = Math.abs(sh.height) * scaleY;
    if (sh.rotation) {
      const rcx = sx + sw / 2;
      const rcy = sy + shh / 2;
      ctx.translate(rcx, rcy);
      ctx.rotate((sh.rotation * Math.PI) / 180);
      ctx.translate(-rcx, -rcy);
    }

    if (sh.type === 'rect' || sh.type === 'rounded_rect' || sh.type === 'grid') {
      ctx.strokeRect(sx, sy, sw, shh);
    } else if (sh.type === 'circle') {
      ctx.beginPath();
      ctx.ellipse(sx + sw / 2, sy + shh / 2, sw / 2, shh / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (sh.type === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(sx + sw / 2, sy);
      ctx.lineTo(sx + sw, sy + shh);
      ctx.lineTo(sx, sy + shh);
      ctx.closePath();
      ctx.stroke();
    } else if (sh.type === 'line' || sh.type === 'arrow' || sh.type === 'double_arrow') {
      ctx.beginPath();
      ctx.moveTo(sh.x * scaleX, sh.y * scaleY);
      ctx.lineTo((sh.x + sh.width) * scaleX, (sh.y + sh.height) * scaleY);
      ctx.stroke();
    } else if (sh.type === 'polyline' && sh.points && sh.points.length > 0) {
      ctx.beginPath();
      ctx.moveTo(sh.points[0].x * scaleX, sh.points[0].y * scaleY);
      for (let i = 1; i < sh.points.length; i++) {
        ctx.lineTo(sh.points[i].x * scaleX, sh.points[i].y * scaleY);
      }
      ctx.stroke();
    } else if (sh.type === 'arc' && sh.centerX !== undefined && sh.centerY !== undefined && sh.radius) {
      ctx.beginPath();
      ctx.arc(sh.centerX * scaleX, sh.centerY * scaleY, sh.radius * avgScale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 7. Pen / Highlighter Strokes
  for (const st of strokes) {
    if (st.isGhosted || !st.points || st.points.length < 2) continue;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(0.8, st.width * avgScale);
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(st.points[0].x * scaleX, st.points[0].y * scaleY);
      for (let i = 1; i < st.points.length; i++) {
        ctx.lineTo(st.points[i].x * scaleX, st.points[i].y * scaleY);
      }
      ctx.stroke();
    };
    if (st.tool === 'highlighter') {
      const brightHex = getBrightHighlighterColor(st.color);
      const dodgeHex = getHighlighterDodgeColor(brightHex);
      ctx.globalCompositeOperation = 'color-dodge';
      ctx.globalAlpha = 0.88;
      ctx.strokeStyle = dodgeHex;
      trace();
      ctx.globalCompositeOperation = 'color-burn';
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = brightHex;
      trace();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = st.opacity || 0.52;
      ctx.strokeStyle = brightHex;
      trace();
    } else {
      ctx.strokeStyle = st.color;
      ctx.globalAlpha = 0.95;
      trace();
    }
    ctx.restore();
  }

  // 8. Dictated Text Boxes
  for (const box of dictatedTextBoxes) {
    if (box.isGhosted) continue;
    const content = box.text || '';
    if (!content) continue;
    ctx.save();
    const bx = box.x * scaleX;
    const by = box.y * scaleY;
    const bw = Math.max(8, box.width * scaleX);
    const bh = Math.max(8, box.height * scaleY);
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    if (box.rotation) {
      ctx.translate(cx, cy);
      ctx.rotate((box.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }
    const scaledFont = Math.max(3, box.fontSize * avgScale);
    ctx.font = `${scaledFont}px "Inter", "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = box.color || '#0F172A';
    ctx.textBaseline = 'top';
    ctx.fillText(content.slice(0, 60), bx, by, box.wrap ? bw : undefined);
    ctx.restore();
  }

  const outUrl = canvas.toDataURL('image/jpeg', 0.42);
  pagePreviewCache.set(page.id, { signature: sig, dataUrl: outUrl });
  return outUrl;
}
