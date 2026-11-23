import * as pdfjsLib from 'pdfjs-dist';
import {
  PageData,
  PdfFontFamily,
  PdfImageElement,
  PdfNativeTextSpan,
  PdfTextAlign,
  PdfTextElement,
} from '../types';
import { getPdfDocProxy } from './pdfPageCache';

type Matrix6 = [number, number, number, number, number, number];

function mulMatrix(m1: Matrix6, m2: Matrix6): Matrix6 {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyMatrix(m: Matrix6, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function rgbToHex(r: number, g: number, b: number): string {
  const norm = (v: number) => {
    const c = v <= 1 && r <= 1 && g <= 1 && b <= 1 ? Math.round(v * 255) : Math.round(v);
    return Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
  };
  return `#${norm(r)}${norm(g)}${norm(b)}`;
}

function parseColorArgs(fn: number, args: unknown[]): string | null {
  const OPS = pdfjsLib.OPS;
  if (fn === OPS.setFillRGBColor) {
    if (typeof args[0] === 'string' && args[0].startsWith('#')) {
      return args[0];
    }
    if (args.length >= 3 && typeof args[0] === 'number') {
      const r = Number(args[0]);
      const g = Number(args[1]);
      const b = Number(args[2]);
      if (r <= 1 && g <= 1 && b <= 1) {
        return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
      }
      return `#${[r, g, b]
        .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0'))
        .join('')}`;
    }
  } else if (fn === OPS.setFillGray && args.length >= 1 && typeof args[0] === 'number') {
    const g = Math.max(0, Math.min(255, Math.round(Number(args[0]) * 255)));
    const h = g.toString(16).padStart(2, '0');
    return `#${h}${h}${h}`;
  } else if (fn === OPS.setFillCMYKColor && args.length >= 4) {
    const c = Number(args[0]);
    const m = Number(args[1]);
    const y = Number(args[2]);
    const k = Number(args[3]);
    const r = Math.round(255 * (1 - c) * (1 - k));
    const g = Math.round(255 * (1 - m) * (1 - k));
    const b = Math.round(255 * (1 - y) * (1 - k));
    return `#${[r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')}`;
  }
  return null;
}

function classifyFont(
  fontName: string,
  styleFamily?: string
): { fontFamily: PdfFontFamily; bold: boolean; italic: boolean } {
  const combined = `${fontName || ''} ${styleFamily || ''}`;
  const bold = /\b(bold|black|heavy|demi|semibold|extrabold)\b|[-,]B(old)?\b|Bold/i.test(combined);
  const italic = /\b(italic|oblique|slant)\b|[-,]I(talic)?\b|Oblique|Italic/i.test(combined);
  let fontFamily: PdfFontFamily = 'Helvetica';
  if (/courier|mono|consolas|menlo|fixed|typewriter/i.test(combined)) {
    fontFamily = 'Courier';
  } else if (/times|serif|georgia|garamond|cambria|palatino|baskerville|book/i.test(combined)) {
    fontFamily = 'TimesRoman';
  }
  return { fontFamily, bold, italic };
}

async function resolvePdfObjSafe(
  objs: { has?: (id: string) => boolean; get: (id: string, cb?: (data: unknown) => void) => unknown },
  objId: string,
  timeoutMs = 350
): Promise<unknown> {
  try {
    if (typeof objs.has === 'function' && objs.has(objId)) {
      return objs.get(objId);
    }
  } catch {}
  return new Promise((resolve) => {
    let done = false;
    const timer = window.setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs);
    try {
      objs.get(objId, (data) => {
        if (!done) {
          done = true;
          window.clearTimeout(timer);
          resolve(data);
        }
      });
    } catch {
      if (!done) {
        done = true;
        window.clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

function pdfImageObjToDataUrl(
  imgObj: unknown
): { dataUrl: string; naturalWidth: number; naturalHeight: number } | null {
  if (!imgObj || typeof imgObj !== 'object') return null;
  const obj = imgObj as {
    bitmap?: ImageBitmap;
    width?: number;
    height?: number;
    data?: Uint8ClampedArray | Uint8Array;
    kind?: number;
  };

  const canvas = document.createElement('canvas');
  try {
    // 1. Modern ImageBitmap or HTMLImageElement / HTMLCanvasElement
    if (
      typeof ImageBitmap !== 'undefined' &&
      obj.bitmap instanceof ImageBitmap &&
      obj.bitmap.width > 0 &&
      obj.bitmap.height > 0
    ) {
      canvas.width = obj.bitmap.width;
      canvas.height = obj.bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(obj.bitmap, 0, 0);
      return {
        dataUrl: canvas.toDataURL('image/png'),
        naturalWidth: canvas.width,
        naturalHeight: canvas.height,
      };
    }

    if (
      (typeof HTMLImageElement !== 'undefined' && obj instanceof HTMLImageElement) ||
      (typeof HTMLCanvasElement !== 'undefined' && obj instanceof HTMLCanvasElement) ||
      (typeof ImageBitmap !== 'undefined' && obj instanceof ImageBitmap)
    ) {
      const w =
        'naturalWidth' in obj ? obj.naturalWidth : 'width' in obj ? Number(obj.width) : 0;
      const h =
        'naturalHeight' in obj ? obj.naturalHeight : 'height' in obj ? Number(obj.height) : 0;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(obj as CanvasImageSource, 0, 0);
        return {
          dataUrl: canvas.toDataURL('image/png'),
          naturalWidth: w,
          naturalHeight: h,
        };
      }
    }

    // 2. Raw pixel buffer (RGB_24BPP / RGBA_32BPP / GRAYSCALE_1BPP)
    const rawObj = obj as { width?: number; height?: number; data?: Uint8Array | Uint8ClampedArray };
    const w = Number(rawObj.width || 0);
    const h = Number(rawObj.height || 0);
    if (rawObj.data && w > 0 && h > 0) {
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const imgData = ctx.createImageData(w, h);
      const out = imgData.data;
      const src = rawObj.data;
      const totalPixels = w * h;

      if (src.length === totalPixels * 4) {
        out.set(src);
      } else if (src.length === totalPixels * 3) {
        for (let i = 0, j = 0; i < totalPixels; i++, j += 3) {
          const o = i * 4;
          out[o] = src[j];
          out[o + 1] = src[j + 1];
          out[o + 2] = src[j + 2];
          out[o + 3] = 255;
        }
      } else if (src.length === totalPixels) {
        for (let i = 0; i < totalPixels; i++) {
          const o = i * 4;
          const v = src[i];
          out[o] = v;
          out[o + 1] = v;
          out[o + 2] = v;
          out[o + 3] = 255;
        }
      } else {
        return null;
      }

      ctx.putImageData(imgData, 0, 0);
      return {
        dataUrl: canvas.toDataURL('image/png'),
        naturalWidth: w,
        naturalHeight: h,
      };
    }
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
  return null;
}

interface RawSpan {
  str: string;
  x: number;
  y: number;
  baselineY: number;
  w: number;
  h: number;
  fontSizePt: number;
  fontFamily: PdfFontFamily;
  bold: boolean;
  italic: boolean;
  color: string;
  rotation: number;
}

interface GroupedLine {
  spans: RawSpan[];
  text: string;
  x: number;
  y: number;
  baselineY: number;
  w: number;
  h: number;
  fontSizePt: number;
  fontFamily: PdfFontFamily;
  bold: boolean;
  italic: boolean;
  color: string;
  rotation: number;
}

export async function extractNativePdfPageElements(
  page: PageData
): Promise<{ texts: PdfTextElement[]; images: PdfImageElement[] }> {
  const pdfDoc = getPdfDocProxy(page.pdfSourceId);
  if (!pdfDoc || page.template !== 'pdf') {
    return { texts: [], images: [] };
  }

  try {
    const pdfPage = await pdfDoc.getPage(page.pdfPageNumber || 1);
    const viewport = pdfPage.getViewport({ scale: 1.0 });
    const pageW = Math.max(1, viewport.width);
    const pageH = Math.max(1, viewport.height);
    const vpMatrix = viewport.transform as Matrix6;

    const [textContent, opList] = await Promise.all([
      pdfPage.getTextContent({ includeMarkedContent: false }),
      pdfPage.getOperatorList(),
    ]);

    // Ensure decoded image/font objects are populated if render hasn't run on this page yet
    const OPS = pdfjsLib.OPS;
    const textColorsByPos: Array<{ x: number; y: number; color: string }> = [];
    const imageJobs: Array<{
      kind: 'obj' | 'inline';
      objId?: string;
      inlineObj?: unknown;
      nx: number;
      ny: number;
      nw: number;
      nh: number;
      rotation: number;
      isFullPageBg: boolean;
    }> = [];

    let ctm: Matrix6 = [...vpMatrix];
    const stack: Array<{ ctm: Matrix6; fillColor: string }> = [];
    let fillColor = '#000000';
    let textMatrix: Matrix6 = [1, 0, 0, 1, 0, 0];
    let textLineMatrix: Matrix6 = [1, 0, 0, 1, 0, 0];
    let textLeading = 0;

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i] || [];

      if (fn === OPS.save) {
        stack.push({ ctm: [...ctm], fillColor });
      } else if (fn === OPS.restore) {
        const prev = stack.pop();
        if (prev) {
          ctm = prev.ctm;
          fillColor = prev.fillColor;
        }
      } else if (fn === OPS.transform && args.length >= 6) {
        ctm = mulMatrix(ctm, args as Matrix6);
      } else if (
        fn === OPS.setFillRGBColor ||
        fn === OPS.setFillGray ||
        fn === OPS.setFillCMYKColor
      ) {
        const parsed = parseColorArgs(fn, args);
        if (parsed) fillColor = parsed;
      } else if (fn === OPS.beginText) {
        textMatrix = [1, 0, 0, 1, 0, 0];
        textLineMatrix = [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.setLeading && typeof args[0] === 'number') {
        textLeading = Number(args[0]);
      } else if (fn === OPS.setTextMatrix && args.length >= 6) {
        textMatrix = [...(args as Matrix6)];
        textLineMatrix = [...(args as Matrix6)];
      } else if (fn === OPS.moveText && args.length >= 2) {
        const tx = Number(args[0]) || 0;
        const ty = Number(args[1]) || 0;
        textLineMatrix = mulMatrix(textLineMatrix, [1, 0, 0, 1, tx, ty]);
        textMatrix = [...textLineMatrix];
      } else if (fn === OPS.setLeadingMoveText && args.length >= 2) {
        const tx = Number(args[0]) || 0;
        const ty = Number(args[1]) || 0;
        textLeading = -ty;
        textLineMatrix = mulMatrix(textLineMatrix, [1, 0, 0, 1, tx, ty]);
        textMatrix = [...textLineMatrix];
      } else if (fn === OPS.nextLine) {
        textLineMatrix = mulMatrix(textLineMatrix, [1, 0, 0, 1, 0, -textLeading]);
        textMatrix = [...textLineMatrix];
      } else if (
        fn === OPS.showText ||
        fn === OPS.showSpacedText ||
        fn === OPS.nextLineShowText ||
        fn === OPS.nextLineSetSpacingShowText
      ) {
        const combined = mulMatrix(ctm, textMatrix);
        textColorsByPos.push({ x: combined[4], y: combined[5], color: fillColor });
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
        const p00 = applyMatrix(ctm, 0, 0);
        const p10 = applyMatrix(ctm, 1, 0);
        const p01 = applyMatrix(ctm, 0, 1);
        const p11 = applyMatrix(ctm, 1, 1);
        const cx = (p00.x + p11.x) / 2;
        const cy = (p00.y + p11.y) / 2;
        const w = Math.hypot(p10.x - p00.x, p10.y - p00.y);
        const h = Math.hypot(p01.x - p00.x, p01.y - p00.y);
        const angleRad = Math.atan2(p11.y - p01.y, p11.x - p01.x);
        let rotDeg = Math.round(((angleRad * 180) / Math.PI) * 10) / 10;
        if (Math.abs(rotDeg) < 0.6) rotDeg = 0;

        if (w >= 10 && h >= 10 && cx > -w * 0.4 && cx < pageW + w * 0.4 && cy > -h * 0.4 && cy < pageH + h * 0.4) {
          const nw = w / pageW;
          const nh = h / pageH;
          const nx = (cx - w / 2) / pageW;
          const ny = (cy - h / 2) / pageH;
          const isFullPageBg = nw >= 0.96 && nh >= 0.96;
          if (fn === OPS.paintImageXObject && typeof args[0] === 'string') {
            imageJobs.push({
              kind: 'obj',
              objId: args[0],
              nx,
              ny,
              nw,
              nh,
              rotation: rotDeg,
              isFullPageBg,
            });
          } else if (fn === OPS.paintInlineImageXObject && args[0]) {
            imageJobs.push({
              kind: 'inline',
              inlineObj: args[0],
              nx,
              ny,
              nw,
              nh,
              rotation: rotDeg,
              isFullPageBg,
            });
          }
        }
      }
    }

    // Build RawSpans from textContent
    const rawSpans: RawSpan[] = [];
    const stylesMap = (textContent.styles || {}) as Record<
      string,
      { fontFamily?: string; ascent?: number; descent?: number }
    >;

    for (const item of textContent.items) {
      if (!('str' in item) || !item.str || !item.str.trim()) continue;
      const m = pdfjsLib.Util.transform(vpMatrix, item.transform) as Matrix6;
      const fontSizePt = Math.max(6, Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]) || item.height || 12);
      let rotDeg = Math.round(((Math.atan2(m[1], m[0]) * 180) / Math.PI) * 10) / 10;
      if (Math.abs(rotDeg) < 0.8) rotDeg = 0;

      const x = m[4];
      const baselineY = m[5];
      const w = Math.max(4, item.width || fontSizePt * item.str.length * 0.5);
      const h = Math.max(fontSizePt * 1.15, (item.height || fontSizePt) * 1.15);
      const y = baselineY - fontSizePt * 0.88;

      const styleInfo = stylesMap[item.fontName];
      let realFontName = item.fontName;
      try {
        if (pdfPage.commonObjs?.has(item.fontName)) {
          const fo = pdfPage.commonObjs.get(item.fontName) as { name?: string } | undefined;
          if (fo?.name) realFontName = `${item.fontName} ${fo.name}`;
        }
      } catch {}
      const { fontFamily, bold, italic } = classifyFont(realFontName, styleInfo?.fontFamily);

      // Find nearest recorded text fill color
      let color = '#000000';
      let bestColorDist = 28;
      for (let k = 0; k < textColorsByPos.length; k++) {
        const tc = textColorsByPos[k];
        const d = Math.hypot(tc.x - x, tc.y - baselineY);
        if (d < bestColorDist) {
          bestColorDist = d;
          color = tc.color;
        }
      }

      rawSpans.push({
        str: item.str,
        x,
        y,
        baselineY,
        w,
        h,
        fontSizePt: Math.round(fontSizePt * 10) / 10,
        fontFamily,
        bold,
        italic,
        color,
        rotation: rotDeg,
      });
    }

    // Sort top-to-bottom, left-to-right
    rawSpans.sort((a, b) => {
      if (Math.abs(a.baselineY - b.baselineY) > Math.min(a.fontSizePt, b.fontSizePt) * 0.45) {
        return a.baselineY - b.baselineY;
      }
      return a.x - b.x;
    });

    // Step 1: Merge spans into lines
    const lines: GroupedLine[] = [];
    for (const sp of rawSpans) {
      const prev = lines[lines.length - 1];
      if (
        prev &&
        Math.abs(prev.rotation - sp.rotation) < 1.5 &&
        Math.abs(prev.baselineY - sp.baselineY) <= Math.min(prev.fontSizePt, sp.fontSizePt) * 0.45 &&
        Math.abs(prev.fontSizePt - sp.fontSizePt) <= 1.8 &&
        prev.fontFamily === sp.fontFamily &&
        prev.bold === sp.bold &&
        prev.italic === sp.italic &&
        prev.color === sp.color
      ) {
        const gap = sp.x - (prev.x + prev.w);
        if (gap >= -sp.fontSizePt * 0.4 && gap <= sp.fontSizePt * 1.65) {
          const needsSpace =
            gap > sp.fontSizePt * 0.16 &&
            !prev.text.endsWith(' ') &&
            !sp.str.startsWith(' ');
          prev.text = needsSpace ? `${prev.text} ${sp.str}` : `${prev.text}${sp.str}`;
          const right = Math.max(prev.x + prev.w, sp.x + sp.w);
          const top = Math.min(prev.y, sp.y);
          const bottom = Math.max(prev.y + prev.h, sp.y + sp.h);
          prev.x = Math.min(prev.x, sp.x);
          prev.y = top;
          prev.w = right - prev.x;
          prev.h = bottom - top;
          prev.spans.push(sp);
          continue;
        }
      }

      lines.push({
        spans: [sp],
        text: sp.str,
        x: sp.x,
        y: sp.y,
        baselineY: sp.baselineY,
        w: sp.w,
        h: sp.h,
        fontSizePt: sp.fontSizePt,
        fontFamily: sp.fontFamily,
        bold: sp.bold,
        italic: sp.italic,
        color: sp.color,
        rotation: sp.rotation,
      });
    }

    // Step 2: Merge adjacent lines into paragraph blocks when aligned and tightly spaced
    const blocks: GroupedLine[][] = [];
    for (const line of lines) {
      const curBlock = blocks[blocks.length - 1];
      const prevLine = curBlock?.[curBlock.length - 1];
      if (
        prevLine &&
        Math.abs(prevLine.rotation) < 0.8 &&
        Math.abs(line.rotation) < 0.8 &&
        prevLine.fontFamily === line.fontFamily &&
        prevLine.bold === line.bold &&
        prevLine.italic === line.italic &&
        prevLine.color === line.color &&
        Math.abs(prevLine.fontSizePt - line.fontSizePt) <= 1.2
      ) {
        const vertGap = line.y - (prevLine.y + prevLine.h);
        const leftAligned = Math.abs(line.x - curBlock[0].x) <= line.fontSizePt * 1.2;
        const centerAligned =
          Math.abs(line.x + line.w / 2 - (curBlock[0].x + curBlock[0].w / 2)) <=
          line.fontSizePt * 1.2;
        if (vertGap >= -line.fontSizePt * 0.2 && vertGap <= line.fontSizePt * 0.85 && (leftAligned || centerAligned)) {
          curBlock.push(line);
          continue;
        }
      }
      blocks.push([line]);
    }

    const texts: PdfTextElement[] = blocks.map((grp, idx) => {
      const minX = Math.min(...grp.map((l) => l.x));
      const minY = Math.min(...grp.map((l) => l.y));
      const maxX = Math.max(...grp.map((l) => l.x + l.w));
      const maxY = Math.max(...grp.map((l) => l.y + l.h));
      const w = Math.max(18, maxX - minX + 4);
      const h = Math.max(grp[0].fontSizePt * 1.15, maxY - minY);
      const joinedText = grp.map((l) => l.text).join('\n');

      // Infer center/right align for multi-line blocks
      let align: PdfTextAlign = 'left';
      if (grp.length > 1) {
        const leftDiff = Math.max(...grp.map((l) => Math.abs(l.x - minX)));
        const rightDiff = Math.max(...grp.map((l) => Math.abs(l.x + l.w - maxX)));
        const centerTarget = (minX + maxX) / 2;
        const centerDiff = Math.max(...grp.map((l) => Math.abs(l.x + l.w / 2 - centerTarget)));
        if (centerDiff < leftDiff * 0.6 && centerDiff < grp[0].fontSizePt * 0.9) {
          align = 'center';
        } else if (rightDiff < leftDiff * 0.6 && rightDiff < grp[0].fontSizePt * 0.9) {
          align = 'right';
        }
      }

      const sourceSpans: PdfNativeTextSpan[] = grp.flatMap((l) =>
        l.spans.map((sp) => ({
          str: sp.str,
          nx: clamp01(sp.x / pageW),
          ny: clamp01(sp.y / pageH),
          nw: Math.max(0.004, sp.w / pageW),
          nh: Math.max(0.004, sp.h / pageH),
        }))
      );

      const nx = clamp01(minX / pageW);
      const ny = clamp01(minY / pageH);
      const nw = clamp01(w / pageW);
      const nh = clamp01(h / pageH);

      return {
        id: `native-txt-${page.id}-${idx}`,
        pageId: page.id,
        origin: 'native',
        nx,
        ny,
        nw,
        nh,
        originalBounds: { nx, ny, nw, nh },
        originalText: joinedText,
        sourceSpans,
        text: joinedText,
        fontSizePt: grp[0].fontSizePt,
        fontFamily: grp[0].fontFamily,
        bold: grp[0].bold,
        italic: grp[0].italic,
        underline: false,
        color: grp[0].color,
        align,
        rotation: grp[0].rotation,
        wrap: grp.length > 1,
        boxMode: grp.length > 1 ? 'dimensions' : 'height',
        status: 'unmodified',
      };
    });

    // Resolve PDF images (skip full-page scanned backdrop if page has NO text and it's literally the whole page, unless user explicitly wants images; actually keep non-full-page images AND keep full-page images only if <= 3000px or there are no other images)
    const images: PdfImageElement[] = [];
    const hasMultipleNonBg = imageJobs.some((j) => !j.isFullPageBg);

    for (let idx = 0; idx < imageJobs.length; idx++) {
      const job = imageJobs[idx];
      // If a page is a scanned PDF (1 giant full-page scan image) and there are text/other images on top, don't trap the whole background scan unless it's the actual standalone image
      if (job.isFullPageBg && (texts.length > 0 || hasMultipleNonBg)) {
        continue;
      }
      let rawImg: unknown = null;
      if (job.kind === 'obj' && job.objId) {
        rawImg = await resolvePdfObjSafe(pdfPage.objs, job.objId);
      } else if (job.kind === 'inline') {
        rawImg = job.inlineObj;
      }
      const encoded = pdfImageObjToDataUrl(rawImg);
      if (!encoded) continue;
      if (encoded.naturalWidth < 12 || encoded.naturalHeight < 12) continue;

      const bounds = { nx: job.nx, ny: job.ny, nw: job.nw, nh: job.nh };
      images.push({
        id: `native-img-${page.id}-${idx}`,
        pageId: page.id,
        origin: 'native',
        nx: job.nx,
        ny: job.ny,
        nw: job.nw,
        nh: job.nh,
        originalBounds: bounds,
        nativeObjId: job.objId,
        dataUrl: encoded.dataUrl,
        naturalWidth: encoded.naturalWidth,
        naturalHeight: encoded.naturalHeight,
        crop: { top: 0, right: 0, bottom: 0, left: 0 },
        rotation: job.rotation,
        status: 'unmodified',
      });
    }

    return { texts, images };
  } catch (err) {
    console.warn('Native PDF extraction warning:', err);
    return { texts: [], images: [] };
  }
}
