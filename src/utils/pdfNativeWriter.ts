import {
  PDFArray,
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFName,
  PDFPage,
  PDFRawStream,
  PDFRef,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
  degrees,
  rgb,
} from 'pdf-lib';
import {
  CalculatorBox,
  CanvasImage,
  CanvasStroke,
  DesmosBox,
  DictatedTextBox,
  GeometricShape,
  PageData,
  PdfFontFamily,
  PdfImageElement,
  PdfNativeBounds,
  PdfTextElement,
} from '../types';
import { getPdfRawBytes, resolvePdfPageDataUrl } from './pdfPageCache';
import {
  CALC_LOGICAL_HEIGHT,
  CALC_LOGICAL_WIDTH,
  getCalculatorSnapshot,
  getDesmosSnapshot,
  getRecordedPageStageSize,
} from './widgetSnapshotCache';

function parseHexRgb(hex: string | undefined): { r: number; g: number; b: number } {
  const clean = (hex || '#000000').replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
  }
  return { r: 0, g: 0, b: 0 };
}

/**
 * Replaces characters outside WinAnsiEncoding so pdf-lib StandardFonts never throw.
 */
function sanitizeWinAnsi(text: string): string {
  const map: Record<string, string> = {
    '\u2018': "'",
    '\u2019': "'",
    '\u201C': '"',
    '\u201D': '"',
    '\u2013': '-',
    '\u2014': '-',
    '\u2026': '...',
    '\u2022': '*',
    '\u2212': '-',
    '\u00D7': 'x',
    '\u00F7': '/',
    '\u2264': '<=',
    '\u2265': '>=',
    '\u2260': '!=',
    '\u2248': '~=',
    '\u03C0': 'pi',
    '\u03B8': 'theta',
    '\u00B0': '°',
    '\u00A0': ' ',
  };
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (map[ch] !== undefined) {
      out += map[ch];
      continue;
    }
    const code = ch.charCodeAt(0);
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      out += ch;
    } else if (ch === '\t') {
      out += '  ';
    } else if (ch === '\r' || ch === '\n') {
      out += ch;
    } else {
      out += '?';
    }
  }
  return out;
}

async function getStandardFont(
  doc: PDFDocument,
  cache: Map<string, PDFFont>,
  family: PdfFontFamily,
  bold: boolean,
  italic: boolean
): Promise<PDFFont> {
  const key = `${family}:${bold ? 'B' : ''}${italic ? 'I' : ''}`;
  const existing = cache.get(key);
  if (existing) return existing;

  let stdFont = StandardFonts.Helvetica;
  if (family === 'TimesRoman') {
    stdFont =
      bold && italic
        ? StandardFonts.TimesRomanBoldItalic
        : bold
        ? StandardFonts.TimesRomanBold
        : italic
        ? StandardFonts.TimesRomanItalic
        : StandardFonts.TimesRoman;
  } else if (family === 'Courier') {
    stdFont =
      bold && italic
        ? StandardFonts.CourierBoldOblique
        : bold
        ? StandardFonts.CourierBold
        : italic
        ? StandardFonts.CourierOblique
        : StandardFonts.Courier;
  } else {
    stdFont =
      bold && italic
        ? StandardFonts.HelveticaBoldOblique
        : bold
        ? StandardFonts.HelveticaBold
        : italic
        ? StandardFonts.HelveticaOblique
        : StandardFonts.Helvetica;
  }

  const font = await doc.embedFont(stdFont);
  cache.set(key, font);
  return font;
}

// ============================================================================
// Surgical PDF Content Stream Parser & Stripper
// Removes modified/deleted native text (Tj/TJ) and native images (Do) directly
// from the PDF's content stream so Adobe Acrobat & other editors see clean edits.
// ============================================================================

type Mat6 = [number, number, number, number, number, number];

function mulMat6(a: Mat6, b: Mat6): Mat6 {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function applyMat6(m: Mat6, x: number, y: number): { x: number; y: number } {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

interface PdfToken {
  raw: string;
  kind: 'op' | 'arg';
}

function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

function latin1ToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function tokenizeContentStream(src: string): PdfToken[] {
  const tokens: PdfToken[] = [];
  const len = src.length;
  let i = 0;

  const isWs = (c: string) =>
    c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\0';
  const isDelim = (c: string) =>
    c === '(' || c === ')' || c === '<' || c === '>' || c === '[' || c === ']' || c === '{' || c === '}' || c === '/' || c === '%';

  while (i < len) {
    const c = src[i];
    if (isWs(c)) {
      i++;
      continue;
    }
    if (c === '%') {
      while (i < len && src[i] !== '\n' && src[i] !== '\r') i++;
      continue;
    }
    if (c === '(') {
      const start = i;
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        if (src[i] === '\\') {
          i += 2;
        } else if (src[i] === '(') {
          depth++;
          i++;
        } else if (src[i] === ')') {
          depth--;
          i++;
        } else {
          i++;
        }
      }
      tokens.push({ raw: src.slice(start, i), kind: 'arg' });
      continue;
    }
    if (c === '<' && src[i + 1] === '<') {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < len && depth > 0) {
        if (src[i] === '<' && src[i + 1] === '<') {
          depth++;
          i += 2;
        } else if (src[i] === '>' && src[i + 1] === '>') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      tokens.push({ raw: src.slice(start, i), kind: 'arg' });
      continue;
    }
    if (c === '<') {
      const start = i;
      i++;
      while (i < len && src[i] !== '>') i++;
      if (i < len) i++;
      tokens.push({ raw: src.slice(start, i), kind: 'arg' });
      continue;
    }
    if (c === '[') {
      const start = i;
      let depth = 1;
      i++;
      while (i < len && depth > 0) {
        if (src[i] === '\\') {
          i += 2;
        } else if (src[i] === '(') {
          i++;
          let pDepth = 1;
          while (i < len && pDepth > 0) {
            if (src[i] === '\\') i += 2;
            else if (src[i] === '(') {
              pDepth++;
              i++;
            } else if (src[i] === ')') {
              pDepth--;
              i++;
            } else i++;
          }
        } else if (src[i] === '[') {
          depth++;
          i++;
        } else if (src[i] === ']') {
          depth--;
          i++;
        } else {
          i++;
        }
      }
      tokens.push({ raw: src.slice(start, i), kind: 'arg' });
      continue;
    }
    if (c === '/') {
      const start = i;
      i++;
      while (i < len && !isWs(src[i]) && !isDelim(src[i])) i++;
      tokens.push({ raw: src.slice(start, i), kind: 'arg' });
      continue;
    }
    // Regular atom (number, bool, null, or operator keyword)
    const start = i;
    while (i < len && !isWs(src[i]) && !isDelim(src[i])) i++;
    const raw = src.slice(start, i);
    const isArg =
      raw === 'true' ||
      raw === 'false' ||
      raw === 'null' ||
      /^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw);
    tokens.push({ raw, kind: isArg ? 'arg' : 'op' });
  }
  return tokens;
}

function decodePdfLiteralString(raw: string): string {
  if (!raw.startsWith('(') || !raw.endsWith(')')) return '';
  let out = '';
  for (let i = 1; i < raw.length - 1; i++) {
    const c = raw[i];
    if (c === '\\') {
      const next = raw[i + 1];
      if (!next) break;
      if (next === 'n') {
        out += '\n';
        i++;
      } else if (next === 'r') {
        out += '\r';
        i++;
      } else if (next === 't') {
        out += '\t';
        i++;
      } else if (next === '(' || next === ')' || next === '\\') {
        out += next;
        i++;
      } else if (/[0-7]/.test(next)) {
        const oct = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] || next;
        out += String.fromCharCode(parseInt(oct, 8));
        i += oct.length;
      } else {
        out += next;
        i++;
      }
    } else {
      out += c;
    }
  }
  return out;
}

function decodePdfHexString(raw: string): string {
  if (!raw.startsWith('<') || !raw.endsWith('>')) return '';
  const hex = raw.slice(1, -1).replace(/\s+/g, '');
  let out = '';
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2).padEnd(2, '0'), 16);
    if (!isNaN(byte) && byte >= 32 && byte <= 126) {
      out += String.fromCharCode(byte);
    }
  }
  return out;
}

function decodeTextArg(raw: string): string {
  if (raw.startsWith('(')) return decodePdfLiteralString(raw);
  if (raw.startsWith('<')) return decodePdfHexString(raw);
  if (raw.startsWith('[')) {
    let out = '';
    for (let i = 1; i < raw.length - 1; i++) {
      if (raw[i] === '(') {
        const start = i;
        i++;
        let depth = 1;
        while (i < raw.length - 1 && depth > 0) {
          if (raw[i] === '\\') i += 2;
          else if (raw[i] === '(') {
            depth++;
            i++;
          } else if (raw[i] === ')') {
            depth--;
            i++;
          } else i++;
        }
        out += decodePdfLiteralString(raw.slice(start, i));
        i--;
      } else if (raw[i] === '<') {
        const start = i;
        while (i < raw.length - 1 && raw[i] !== '>') i++;
        out += decodePdfHexString(raw.slice(start, i + 1));
      }
    }
    return out;
  }
  return '';
}

function normalizeCmp(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function normToPdfBox(
  bounds: PdfNativeBounds,
  box: { x: number; y: number; width: number; height: number }
): { x: number; y: number; w: number; h: number } {
  const x = box.x + bounds.nx * box.width;
  const w = bounds.nw * box.width;
  const h = bounds.nh * box.height;
  const y = box.y + (box.height - (bounds.ny + bounds.nh) * box.height);
  return { x, y, w, h };
}

function pointNearPdfBox(
  px: number,
  py: number,
  target: { x: number; y: number; w: number; h: number },
  tol = 28
): boolean {
  return (
    px >= target.x - tol &&
    px <= target.x + target.w + tol &&
    py >= target.y - tol &&
    py <= target.y + target.h + tol
  );
}

function boxesOverlapSubstantially(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  const ix0 = Math.max(a.x, b.x);
  const iy0 = Math.max(a.y, b.y);
  const ix1 = Math.min(a.x + a.w, b.x + b.w);
  const iy1 = Math.min(a.y + a.h, b.y + b.h);
  if (ix1 <= ix0 || iy1 <= iy0) return false;
  const inter = (ix1 - ix0) * (iy1 - iy0);
  const minArea = Math.max(1, Math.min(a.w * a.h, b.w * b.h));
  return inter / minArea >= 0.45;
}

/**
 * Strips modified/deleted native text & image operators directly from the copied page's PDF content stream.
 * Returns sets of element IDs whose native operators were cleanly matched & stripped from the stream.
 */
function stripModifiedNativeOperatorsFromPage(
  doc: PDFDocument,
  page: PDFPage,
  modifiedNativeTexts: PdfTextElement[],
  modifiedNativeImages: PdfImageElement[]
): { strippedTextIds: Set<string>; strippedImageIds: Set<string> } {
  const strippedTextIds = new Set<string>();
  const strippedImageIds = new Set<string>();
  if (modifiedNativeTexts.length === 0 && modifiedNativeImages.length === 0) {
    return { strippedTextIds, strippedImageIds };
  }

  const contentsVal = page.node.get(PDFName.of('Contents'));
  if (!contentsVal) return { strippedTextIds, strippedImageIds };

  const box = page.getCropBox() || page.getMediaBox();
  const textTargets = modifiedNativeTexts
    .filter((t) => t.originalBounds && (t.originalText || '').trim().length > 0)
    .map((t) => ({
      el: t,
      normFull: normalizeCmp(t.originalText || ''),
      pdfBox: normToPdfBox(t.originalBounds!, box),
    }));

  const imageTargets = modifiedNativeImages
    .filter((im) => im.originalBounds)
    .map((im) => ({
      el: im,
      pdfBox: normToPdfBox(im.originalBounds!, box),
    }));

  const streamEntries: Array<{ ref?: PDFRef; stream: PDFStream }> = [];
  const lookedUp = doc.context.lookup(contentsVal);
  if (lookedUp instanceof PDFRawStream || lookedUp instanceof PDFStream) {
    streamEntries.push({
      ref: contentsVal instanceof PDFRef ? contentsVal : undefined,
      stream: lookedUp,
    });
  } else if (lookedUp instanceof PDFArray) {
    for (let idx = 0; idx < lookedUp.size(); idx++) {
      const item = lookedUp.get(idx);
      const resolved = doc.context.lookup(item);
      if (resolved instanceof PDFRawStream || resolved instanceof PDFStream) {
        streamEntries.push({
          ref: item instanceof PDFRef ? item : undefined,
          stream: resolved,
        });
      }
    }
  }

  for (const entry of streamEntries) {
    let decodedBytes: Uint8Array;
    try {
      if (entry.stream instanceof PDFRawStream) {
        decodedBytes = decodePDFRawStream(entry.stream).decode();
      } else {
        continue;
      }
    } catch {
      continue;
    }

    const srcStr = bytesToLatin1(decodedBytes);
    const tokens = tokenizeContentStream(srcStr);

    let ctm: Mat6 = [1, 0, 0, 1, 0, 0];
    const ctmStack: Mat6[] = [];
    let tm: Mat6 = [1, 0, 0, 1, 0, 0];
    let tlm: Mat6 = [1, 0, 0, 1, 0, 0];
    let leading = 0;

    const outChunks: string[] = [];
    let pendingArgs: string[] = [];
    let changed = false;

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.kind === 'arg') {
        pendingArgs.push(tok.raw);
        continue;
      }

      const op = tok.raw;
      const args = pendingArgs;
      pendingArgs = [];

      if (op === 'q') {
        ctmStack.push([...ctm]);
      } else if (op === 'Q') {
        const prev = ctmStack.pop();
        if (prev) ctm = prev;
      } else if (op === 'cm' && args.length >= 6) {
        const nums = args.slice(-6).map(Number) as Mat6;
        if (nums.every((n) => !isNaN(n))) {
          ctm = mulMat6(ctm, nums);
        }
      } else if (op === 'BT') {
        tm = [1, 0, 0, 1, 0, 0];
        tlm = [1, 0, 0, 1, 0, 0];
      } else if (op === 'TL' && args.length >= 1) {
        const v = Number(args[args.length - 1]);
        if (!isNaN(v)) leading = v;
      } else if (op === 'Tm' && args.length >= 6) {
        const nums = args.slice(-6).map(Number) as Mat6;
        if (nums.every((n) => !isNaN(n))) {
          tm = nums;
          tlm = [...nums];
        }
      } else if ((op === 'Td' || op === 'TD') && args.length >= 2) {
        const tx = Number(args[args.length - 2]) || 0;
        const ty = Number(args[args.length - 1]) || 0;
        if (op === 'TD') leading = -ty;
        tlm = mulMat6(tlm, [1, 0, 0, 1, tx, ty]);
        tm = [...tlm];
      } else if (op === 'T*') {
        tlm = mulMat6(tlm, [1, 0, 0, 1, 0, -leading]);
        tm = [...tlm];
      } else if (op === 'Tj' || op === 'TJ' || op === "'" || op === '"') {
        if (op === "'") {
          tlm = mulMat6(tlm, [1, 0, 0, 1, 0, -leading]);
          tm = [...tlm];
        } else if (op === '"') {
          tlm = mulMat6(tlm, [1, 0, 0, 1, 0, -leading]);
          tm = [...tlm];
        }

        const rawTextArg = args[args.length - 1] || '';
        const decodedText = normalizeCmp(decodeTextArg(rawTextArg));
        const combined = mulMat6(ctm, tm);
        const px = combined[4];
        const py = combined[5];

        let matchedTargetId: string | null = null;
        if (decodedText.length > 0) {
          for (const tgt of textTargets) {
            if (
              pointNearPdfBox(px, py, tgt.pdfBox, 32) &&
              (tgt.normFull.includes(decodedText) || decodedText.includes(tgt.normFull))
            ) {
              matchedTargetId = tgt.el.id;
              break;
            }
          }
        }

        if (matchedTargetId) {
          strippedTextIds.add(matchedTargetId);
          changed = true;
          if (op === "'" || op === '"') {
            outChunks.push('T*');
          }
          continue;
        }
      } else if (op === 'Do' && args.length >= 1) {
        const p00 = applyMat6(ctm, 0, 0);
        const p10 = applyMat6(ctm, 1, 0);
        const p01 = applyMat6(ctm, 0, 1);
        const p11 = applyMat6(ctm, 1, 1);
        const xs = [p00.x, p10.x, p01.x, p11.x];
        const ys = [p00.y, p10.y, p01.y, p11.y];
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const doBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

        let matchedImgId: string | null = null;
        for (const tgt of imageTargets) {
          if (boxesOverlapSubstantially(doBox, tgt.pdfBox)) {
            matchedImgId = tgt.el.id;
            break;
          }
        }
        if (matchedImgId) {
          strippedImageIds.add(matchedImgId);
          changed = true;
          continue;
        }
      }

      if (args.length > 0) {
        outChunks.push(`${args.join(' ')} ${op}`);
      } else {
        outChunks.push(op);
      }
    }

    if (changed) {
      const nextBytes = latin1ToBytes(outChunks.join('\n'));
      const newStream = doc.context.flateStream(nextBytes);
      if (entry.ref) {
        doc.context.assign(entry.ref, newStream);
      } else {
        const newRef = doc.context.register(newStream);
        page.node.set(PDFName.of('Contents'), newRef);
      }
    }
  }

  return { strippedTextIds, strippedImageIds };
}

function loadImgElement(src: string): Promise<HTMLImageElement | null> {
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

function dataUrlToUint8Array(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return null;
  const header = dataUrl.slice(0, comma);
  const mimeMatch = header.match(/data:([^;]+)/i);
  const mime = (mimeMatch?.[1] || 'image/png').toLowerCase();
  const base64 = dataUrl.slice(comma + 1);
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime, bytes };
  } catch {
    return null;
  }
}

async function embedPdfImageElement(
  doc: PDFDocument,
  el: PdfImageElement
): Promise<PDFImage | null> {
  const crop = el.crop || { top: 0, right: 0, bottom: 0, left: 0 };
  const hasCrop =
    crop.top > 0.002 || crop.right > 0.002 || crop.bottom > 0.002 || crop.left > 0.002;

  if (!hasCrop) {
    const parsed = dataUrlToUint8Array(el.dataUrl);
    if (parsed) {
      if (parsed.mime.includes('jpeg') || parsed.mime.includes('jpg')) {
        try {
          return await doc.embedJpg(parsed.bytes);
        } catch {}
      }
      if (parsed.mime.includes('png')) {
        try {
          return await doc.embedPng(parsed.bytes);
        } catch {}
      }
    }
  }

  // Fallback or cropped image: render cropped sub-region to clean PNG bytes
  const img = await loadImgElement(el.dataUrl);
  if (!img || !img.naturalWidth || !img.naturalHeight) return null;

  const sx = Math.max(0, Math.round(crop.left * img.naturalWidth));
  const sy = Math.max(0, Math.round(crop.top * img.naturalHeight));
  const sw = Math.max(
    1,
    Math.round((1 - crop.left - crop.right) * img.naturalWidth)
  );
  const sh = Math.max(
    1,
    Math.round((1 - crop.top - crop.bottom) * img.naturalHeight)
  );

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const pngUrl = canvas.toDataURL('image/png');
  canvas.width = 0;
  canvas.height = 0;
  const pngParsed = dataUrlToUint8Array(pngUrl);
  if (!pngParsed) return null;
  return await doc.embedPng(pngParsed.bytes);
}

function wrapParagraphLines(
  text: string,
  font: PDFFont,
  fontSizePt: number,
  maxWidthPt: number,
  wrap: boolean
): Array<{ text: string; isLastInParagraph: boolean }> {
  const safe = sanitizeWinAnsi(text);
  const paragraphs = safe.split('\n');
  const lines: Array<{ text: string; isLastInParagraph: boolean }> = [];

  for (const para of paragraphs) {
    if (!wrap) {
      lines.push({ text: para, isLastInParagraph: true });
      continue;
    }
    const words = para.split(' ');
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const test = cur ? `${cur} ${w}` : w;
      let width = 0;
      try {
        width = font.widthOfTextAtSize(test, fontSizePt);
      } catch {
        width = test.length * fontSizePt * 0.55;
      }
      if (width <= maxWidthPt || !cur) {
        cur = test;
      } else {
        lines.push({ text: cur, isLastInParagraph: false });
        cur = w;
      }
    }
    lines.push({ text: cur, isLastInParagraph: true });
  }
  return lines;
}

function drawRotatedBoxPoint(
  cx: number,
  cy: number,
  localX: number,
  localY: number,
  rad: number
): { x: number; y: number } {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cx + localX * cos - localY * sin,
    y: cy + localX * sin + localY * cos,
  };
}

async function drawNativePdfTextElement(
  doc: PDFDocument,
  page: PDFPage,
  el: PdfTextElement,
  fontCache: Map<string, PDFFont>,
  box: { x: number; y: number; width: number; height: number }
): Promise<void> {
  if (!el.text.trim()) return;
  const font = await getStandardFont(doc, fontCache, el.fontFamily, el.bold, el.italic);
  const { r, g, b } = parseHexRgb(el.color);
  const textColor = rgb(r, g, b);

  const wPt = Math.max(24, el.nw * box.width);
  const hPt = Math.max(12, el.nh * box.height);
  const xPt = box.x + el.nx * box.width;
  const yBottomPt = box.y + (box.height - (el.ny + el.nh) * box.height);
  const cxPt = xPt + wPt / 2;
  const cyPt = yBottomPt + hPt / 2;

  // Scale fontSize proportionally if stage width differed slightly from PDF page width (points are native, stored in fontSizePt)
  const fontSizePt = Math.max(6, Math.min(240, el.fontSizePt || 14));
  const lineH = fontSizePt * 1.15;
  const padX = 2;
  const maxTextW = Math.max(12, wPt - padX * 2);
  const lines = wrapParagraphLines(el.text, font, fontSizePt, maxTextW, el.wrap);
  const screenRot = el.rotation || 0;
  const pdfDeg = -screenRot;
  const rad = (pdfDeg * Math.PI) / 180;

  for (let i = 0; i < lines.length; i++) {
    const lineInfo = lines[i];
    const lineText = lineInfo.text;
    if (!lineText) continue;

    let lineWidth = 0;
    try {
      lineWidth = font.widthOfTextAtSize(lineText, fontSizePt);
    } catch {
      lineWidth = lineText.length * fontSizePt * 0.55;
    }

    const localBaselineY = hPt / 2 - fontSizePt * 0.88 - i * lineH;

    if (el.align === 'justify' && el.wrap && !lineInfo.isLastInParagraph && lineText.includes(' ')) {
      const words = lineText.split(' ').filter(Boolean);
      if (words.length > 1) {
        const wordsW = words.reduce((sum, wd) => {
          try {
            return sum + font.widthOfTextAtSize(wd, fontSizePt);
          } catch {
            return sum + wd.length * fontSizePt * 0.55;
          }
        }, 0);
        const gap = Math.max(fontSizePt * 0.2, (maxTextW - wordsW) / (words.length - 1));
        let curLocalX = -wPt / 2 + padX;
        for (let wi = 0; wi < words.length; wi++) {
          const wd = words[wi];
          const pt = drawRotatedBoxPoint(cxPt, cyPt, curLocalX, localBaselineY, rad);
          page.drawText(wd, {
            x: pt.x,
            y: pt.y,
            size: fontSizePt,
            font,
            color: textColor,
            rotate: degrees(pdfDeg),
          });
          let wdW = 0;
          try {
            wdW = font.widthOfTextAtSize(wd, fontSizePt);
          } catch {
            wdW = wd.length * fontSizePt * 0.55;
          }
          curLocalX += wdW + gap;
        }
        if (el.underline) {
          const ulY = localBaselineY - fontSizePt * 0.14;
          const pStart = drawRotatedBoxPoint(cxPt, cyPt, -wPt / 2 + padX, ulY, rad);
          const pEnd = drawRotatedBoxPoint(cxPt, cyPt, wPt / 2 - padX, ulY, rad);
          page.drawLine({
            start: pStart,
            end: pEnd,
            thickness: Math.max(0.6, fontSizePt * 0.065),
            color: textColor,
          });
        }
        continue;
      }
    }

    let localX = -wPt / 2 + padX;
    if (el.align === 'center') {
      localX = -lineWidth / 2;
    } else if (el.align === 'right') {
      localX = wPt / 2 - padX - lineWidth;
    }

    const pt = drawRotatedBoxPoint(cxPt, cyPt, localX, localBaselineY, rad);
    page.drawText(lineText, {
      x: pt.x,
      y: pt.y,
      size: fontSizePt,
      font,
      color: textColor,
      rotate: degrees(pdfDeg),
    });

    if (el.underline) {
      const ulY = localBaselineY - fontSizePt * 0.14;
      const pStart = drawRotatedBoxPoint(cxPt, cyPt, localX, ulY, rad);
      const pEnd = drawRotatedBoxPoint(cxPt, cyPt, localX + lineWidth, ulY, rad);
      page.drawLine({
        start: pStart,
        end: pEnd,
        thickness: Math.max(0.6, fontSizePt * 0.065),
        color: textColor,
      });
    }
  }
}

async function drawNativePdfImageElement(
  doc: PDFDocument,
  page: PDFPage,
  el: PdfImageElement,
  box: { x: number; y: number; width: number; height: number }
): Promise<void> {
  const embedded = await embedPdfImageElement(doc, el);
  if (!embedded) return;

  const wPt = Math.max(8, el.nw * box.width);
  const hPt = Math.max(8, el.nh * box.height);
  const xPt = box.x + el.nx * box.width;
  const yBottomPt = box.y + (box.height - (el.ny + el.nh) * box.height);
  const cxPt = xPt + wPt / 2;
  const cyPt = yBottomPt + hPt / 2;

  const pdfDeg = -(el.rotation || 0);
  const rad = (pdfDeg * Math.PI) / 180;
  const origin = drawRotatedBoxPoint(cxPt, cyPt, -wPt / 2, -hPt / 2, rad);

  page.drawImage(embedded, {
    x: origin.x,
    y: origin.y,
    width: wPt,
    height: hPt,
    rotate: degrees(pdfDeg),
  });
}

function drawPaperTemplateVectors(
  page: PDFPage,
  pattern: string,
  box: { x: number; y: number; width: number; height: number },
  stageW: number,
  stageH: number
) {
  const sx = box.width / Math.max(1, stageW);
  const sy = box.height / Math.max(1, stageH);

  if (pattern === 'lined') {
    const step = 32 * sy;
    const blue = rgb(147 / 255, 197 / 255, 253 / 255);
    for (let dy = step; dy < box.height; dy += step) {
      const py = box.y + box.height - dy;
      page.drawLine({
        start: { x: box.x, y: py },
        end: { x: box.x + box.width, y: py },
        thickness: 0.75,
        color: blue,
        opacity: 0.4,
      });
    }
    page.drawLine({
      start: { x: box.x + 96 * sx, y: box.y },
      end: { x: box.x + 96 * sx, y: box.y + box.height },
      thickness: 1.2,
      color: rgb(244 / 255, 63 / 255, 94 / 255),
      opacity: 0.55,
    });
  } else if (pattern === 'grid' || pattern === 'graph') {
    const stepX = 24 * sx;
    const stepY = 24 * sy;
    const c = rgb(59 / 255, 130 / 255, 246 / 255);
    for (let dx = 0; dx < box.width; dx += stepX) {
      page.drawLine({
        start: { x: box.x + dx, y: box.y },
        end: { x: box.x + dx, y: box.y + box.height },
        thickness: 0.5,
        color: c,
        opacity: 0.16,
      });
    }
    for (let dy = 0; dy < box.height; dy += stepY) {
      const py = box.y + box.height - dy;
      page.drawLine({
        start: { x: box.x, y: py },
        end: { x: box.x + box.width, y: py },
        thickness: 0.5,
        color: c,
        opacity: 0.16,
      });
    }
  } else if (pattern === 'dotted') {
    const stepX = 24 * sx;
    const stepY = 24 * sy;
    const c = rgb(100 / 255, 116 / 255, 139 / 255);
    for (let dx = stepX; dx < box.width; dx += stepX) {
      for (let dy = stepY; dy < box.height; dy += stepY) {
        page.drawCircle({
          x: box.x + dx,
          y: box.y + box.height - dy,
          size: 1.1,
          color: c,
          opacity: 0.3,
        });
      }
    }
  }
}

function drawNoteTeacherVectorOverlays(
  page: PDFPage,
  box: { x: number; y: number; width: number; height: number },
  stageW: number,
  stageH: number,
  pageStrokes: CanvasStroke[],
  pageShapes: GeometricShape[]
) {
  const sx = box.width / Math.max(1, stageW);
  const sy = box.height / Math.max(1, stageH);
  const avgScale = (sx + sy) / 2;
  const toPt = (x: number, y: number) => ({
    x: box.x + x * sx,
    y: box.y + box.height - y * sy,
  });

  // Shapes
  for (const sh of pageShapes) {
    if (sh.isGhosted) continue;
    const { r, g, b } = parseHexRgb(sh.strokeColor || '#2563EB');
    const strokeCol = rgb(r, g, b);
    const lineW = Math.max(0.6, (sh.strokeWidth || 2) * avgScale);
    const fillParsed =
      sh.fillColor && sh.fillColor !== 'transparent' ? parseHexRgb(sh.fillColor) : undefined;
    const fillCol = fillParsed ? rgb(fillParsed.r, fillParsed.g, fillParsed.b) : undefined;

    if (sh.type === 'rect' || sh.type === 'rounded_rect') {
      const rx = Math.min(sh.x, sh.x + sh.width);
      const ry = Math.min(sh.y, sh.y + sh.height);
      const rw = Math.abs(sh.width) * sx;
      const rh = Math.abs(sh.height) * sy;
      const bl = toPt(rx, ry + Math.abs(sh.height));
      page.drawRectangle({
        x: bl.x,
        y: bl.y,
        width: rw,
        height: rh,
        borderColor: strokeCol,
        borderWidth: lineW,
        color: fillCol,
      });
    } else if (sh.type === 'circle') {
      const rx = Math.min(sh.x, sh.x + sh.width);
      const ry = Math.min(sh.y, sh.y + sh.height);
      const cx = (rx + Math.abs(sh.width) / 2) * sx + box.x;
      const cy = box.y + box.height - (ry + Math.abs(sh.height) / 2) * sy;
      page.drawEllipse({
        x: cx,
        y: cy,
        xScale: (Math.abs(sh.width) * sx) / 2,
        yScale: (Math.abs(sh.height) * sy) / 2,
        borderColor: strokeCol,
        borderWidth: lineW,
        color: fillCol,
      });
    } else if (sh.type === 'line' || sh.type === 'arrow' || sh.type === 'double_arrow') {
      const p1 = toPt(sh.x, sh.y);
      const p2 = toPt(sh.x + sh.width, sh.y + sh.height);
      page.drawLine({ start: p1, end: p2, thickness: lineW, color: strokeCol });
    } else if (sh.type === 'polyline' && sh.points && sh.points.length > 1) {
      for (let i = 1; i < sh.points.length; i++) {
        page.drawLine({
          start: toPt(sh.points[i - 1].x, sh.points[i - 1].y),
          end: toPt(sh.points[i].x, sh.points[i].y),
          thickness: lineW,
          color: strokeCol,
        });
      }
    }
  }

  // Ink strokes
  for (const s of pageStrokes) {
    if (s.isGhosted || !s.points || s.points.length === 0) continue;
    const { r, g, b } = parseHexRgb(s.color);
    const col = rgb(r, g, b);
    const op = s.tool === 'highlighter' ? s.opacity || 0.35 : s.tool === 'pencil' ? 0.85 : 1;
    const thick = Math.max(0.6, s.width * avgScale);
    if (s.points.length === 1) {
      const pt = toPt(s.points[0].x, s.points[0].y);
      page.drawCircle({ x: pt.x, y: pt.y, size: thick / 2, color: col, opacity: op });
      continue;
    }
    for (let i = 1; i < s.points.length; i++) {
      page.drawLine({
        start: toPt(s.points[i - 1].x, s.points[i - 1].y),
        end: toPt(s.points[i].x, s.points[i].y),
        thickness: thick,
        color: col,
        opacity: op,
      });
    }
  }
}

/**
 * Builds a real Adobe-Acrobat-compatible native PDF using pdf-lib:
 * - Preserves original PDF pages & vectors where untouched
 * - Strips deleted/modified native text & image operators directly from the content stream
 * - Writes edited/added text as real selectable/editable PDF text (Helvetica/Times/Courier, B/I/U, size, color, align, rotation)
 * - Writes added/edited/cropped/rotated images as real native PDF Image XObjects
 * - Optionally renders NoteTeacher annotations cleanly on top when isClean === false
 */
export async function buildNativeEditedPdfBlob(params: {
  pages: PageData[];
  pdfTextElements: PdfTextElement[];
  pdfImageElements: PdfImageElement[];
  strokes: CanvasStroke[];
  shapes: GeometricShape[];
  graphs: DesmosBox[];
  calculators: CalculatorBox[];
  images: CanvasImage[];
  dictatedTextBoxes: DictatedTextBox[];
  stageContainer: HTMLElement;
  isClean: boolean;
}): Promise<Blob> {
  const {
    pages,
    pdfTextElements,
    pdfImageElements,
    strokes,
    shapes,
    graphs,
    calculators,
    images,
    dictatedTextBoxes,
    stageContainer,
    isClean,
  } = params;

  const outDoc = await PDFDocument.create();
  const srcDocCache = new Map<string, PDFDocument>();
  const fontCache = new Map<string, PDFFont>();

  const resolveStageSize = (page: PageData) => {
    const rec = getRecordedPageStageSize(page.id);
    if (rec && rec.width > 50 && rec.height > 50) return rec;
    const aspect =
      page.aspectRatio && page.aspectRatio > 0
        ? page.aspectRatio
        : page.pdfWidth && page.pdfHeight && page.pdfHeight > 0
        ? page.pdfWidth / page.pdfHeight
        : 8.5 / 11;
    const w = stageContainer.clientWidth > 100 ? stageContainer.clientWidth : 800;
    return { width: w, height: Math.round(w / aspect) };
  };

  for (const page of pages) {
    let outPage: PDFPage;
    const rawBytes = page.pdfSourceId ? getPdfRawBytes(page.pdfSourceId) : undefined;
    const stageDims = resolveStageSize(page);

    if (page.template === 'pdf' && rawBytes && page.pdfSourceId) {
      let srcDoc = srcDocCache.get(page.pdfSourceId);
      if (!srcDoc) {
        srcDoc = await PDFDocument.load(rawBytes, { ignoreEncryption: true });
        srcDocCache.set(page.pdfSourceId, srcDoc);
      }
      const pageIdx = Math.max(0, Math.min(srcDoc.getPageCount() - 1, (page.pdfPageNumber || 1) - 1));
      const [copied] = await outDoc.copyPages(srcDoc, [pageIdx]);
      outPage = outDoc.addPage(copied);
    } else {
      const aspect =
        page.aspectRatio && page.aspectRatio > 0
          ? page.aspectRatio
          : page.pdfWidth && page.pdfHeight && page.pdfHeight > 0
          ? page.pdfWidth / page.pdfHeight
          : 8.5 / 11;
      const wPt = page.pdfWidth && page.pdfWidth > 0 ? page.pdfWidth : 612;
      const hPt = page.pdfHeight && page.pdfHeight > 0 ? page.pdfHeight : wPt / aspect;
      outPage = outDoc.addPage([wPt, hPt]);
      const box = outPage.getMediaBox();

      const pattern = page.template === 'pdf' ? page.underlayTemplate || 'blank' : page.template;
      drawPaperTemplateVectors(outPage, pattern, box, stageDims.width, stageDims.height);

      if (page.template === 'pdf') {
        const fallbackUrl = await resolvePdfPageDataUrl(page);
        if (fallbackUrl) {
          const img = await embedPdfImageElement(outDoc, {
            id: `bg-${page.id}`,
            pageId: page.id,
            origin: 'native',
            nx: 0,
            ny: 0,
            nw: 1,
            nh: 1,
            dataUrl: fallbackUrl,
            naturalWidth: wPt,
            naturalHeight: hPt,
            crop: { top: 0, right: 0, bottom: 0, left: 0 },
            rotation: 0,
            status: 'unmodified',
          });
          if (img) {
            outPage.drawImage(img, { x: box.x, y: box.y, width: box.width, height: box.height });
          }
        }
      }
    }

    const box = outPage.getCropBox() || outPage.getMediaBox();
    const pagePdfTexts = pdfTextElements.filter((t) => t.pageId === page.id);
    const pagePdfImages = pdfImageElements.filter((im) => im.pageId === page.id);

    const modifiedNativeTexts = pagePdfTexts.filter(
      (t) => t.origin === 'native' && (t.status === 'edited' || t.status === 'deleted')
    );
    const modifiedNativeImages = pagePdfImages.filter(
      (im) => im.origin === 'native' && (im.status === 'edited' || im.status === 'deleted')
    );

    // 1. Surgically strip modified/deleted native operators from PDF content stream
    const { strippedTextIds, strippedImageIds } = stripModifiedNativeOperatorsFromPage(
      outDoc,
      outPage,
      modifiedNativeTexts,
      modifiedNativeImages
    );

    // 2. Patch fallback ONLY for native elements that lived inside CID-encoded fonts or nested Form XObjects
    for (const t of modifiedNativeTexts) {
      if (!strippedTextIds.has(t.id) && t.originalBounds) {
        const b = normToPdfBox(t.originalBounds, box);
        outPage.drawRectangle({
          x: Math.max(box.x, b.x - 1.5),
          y: Math.max(box.y, b.y - 1.5),
          width: b.w + 3,
          height: b.h + 3,
          color: rgb(1, 1, 1),
        });
      }
    }
    for (const im of modifiedNativeImages) {
      if (!strippedImageIds.has(im.id) && im.originalBounds) {
        const b = normToPdfBox(im.originalBounds, box);
        outPage.drawRectangle({
          x: Math.max(box.x, b.x - 1),
          y: Math.max(box.y, b.y - 1),
          width: b.w + 2,
          height: b.h + 2,
          color: rgb(1, 1, 1),
        });
      }
    }

    // 3. Draw active PDF Images (added OR edited native) as real PDF Image XObjects
    for (const im of pagePdfImages) {
      if (im.status === 'deleted') continue;
      if (im.origin === 'native' && im.status === 'unmodified') continue;
      await drawNativePdfImageElement(outDoc, outPage, im, box);
    }

    // 4. Draw active PDF Text Boxes (added OR edited native) as real PDF Text operators
    for (const t of pagePdfTexts) {
      if (t.status === 'deleted') continue;
      if (t.origin === 'native' && t.status === 'unmodified') continue;
      await drawNativePdfTextElement(outDoc, outPage, t, fontCache, box);
    }

    // 5. Optional NoteTeacher Annotations (As Shown mode) drawn cleanly without obscuring native PDF text/images
    if (!isClean) {
      const pageStrokes = strokes.filter((s) => s.pageId === page.id);
      const pageShapes = shapes.filter((sh) => sh.pageId === page.id);
      const pageImages = images.filter((im) => im.pageId === page.id);
      const pageGraphs = graphs.filter((g) => g.pageId === page.id);
      const pageCalcs = calculators.filter((c) => c.pageId === page.id);
      const pageDictated = dictatedTextBoxes.filter((d) => d.pageId === page.id);

      const sx = box.width / Math.max(1, stageDims.width);
      const sy = box.height / Math.max(1, stageDims.height);

      for (const ci of pageImages) {
        const embedded = await embedPdfImageElement(outDoc, {
          id: ci.id,
          pageId: page.id,
          origin: 'added',
          nx: ci.x / stageDims.width,
          ny: ci.y / stageDims.height,
          nw: ci.width / stageDims.width,
          nh: ci.height / stageDims.height,
          dataUrl: ci.dataUrl,
          naturalWidth: ci.width,
          naturalHeight: ci.height,
          crop: { top: 0, right: 0, bottom: 0, left: 0 },
          rotation: ci.rotation || 0,
          status: 'edited',
        });
        if (embedded) {
          const wPt = ci.width * sx;
          const hPt = ci.height * sy;
          const cxPt = box.x + (ci.x + ci.width / 2) * sx;
          const cyPt = box.y + box.height - (ci.y + ci.height / 2) * sy;
          const pdfDeg = -(ci.rotation || 0);
          const rad = (pdfDeg * Math.PI) / 180;
          const origin = drawRotatedBoxPoint(cxPt, cyPt, -wPt / 2, -hPt / 2, rad);
          outPage.drawImage(embedded, {
            x: origin.x,
            y: origin.y,
            width: wPt,
            height: hPt,
            rotate: degrees(pdfDeg),
          });
        }
      }

      for (const g of pageGraphs) {
        const snap = await getDesmosSnapshot(g, false);
        if (snap?.dataUrl) {
          const parsed = dataUrlToUint8Array(snap.dataUrl);
          if (parsed) {
            try {
              const emb = await outDoc.embedPng(parsed.bytes);
              outPage.drawImage(emb, {
                x: box.x + g.x * sx,
                y: box.y + box.height - (g.y + g.height) * sy,
                width: g.width * sx,
                height: g.height * sy,
              });
            } catch {}
          }
        }
      }

      for (const c of pageCalcs) {
        const calcScale = Math.max(0.2, Math.min(2.8, c.scale || 1));
        const cw = CALC_LOGICAL_WIDTH * calcScale;
        const ch = CALC_LOGICAL_HEIGHT * calcScale;
        const snap = await getCalculatorSnapshot(c, false);
        if (snap?.dataUrl) {
          const parsed = dataUrlToUint8Array(snap.dataUrl);
          if (parsed) {
            try {
              const emb = await outDoc.embedPng(parsed.bytes);
              outPage.drawImage(emb, {
                x: box.x + c.x * sx,
                y: box.y + box.height - (c.y + ch) * sy,
                width: cw * sx,
                height: ch * sy,
              });
            } catch {}
          }
        }
      }

      drawNoteTeacherVectorOverlays(
        outPage,
        box,
        stageDims.width,
        stageDims.height,
        pageStrokes,
        pageShapes
      );

      for (const d of pageDictated) {
        if (!d.text.trim() || d.isGhosted) continue;
        await drawNativePdfTextElement(
          outDoc,
          outPage,
          {
            id: d.id,
            pageId: d.pageId,
            origin: 'added',
            nx: d.x / stageDims.width,
            ny: d.y / stageDims.height,
            nw: d.width / stageDims.width,
            nh: d.height / stageDims.height,
            text: d.text,
            fontSizePt: d.fontSize * ((sx + sy) / 2),
            fontFamily: 'Helvetica',
            bold: false,
            italic: false,
            underline: false,
            color: d.color || '#0F172A',
            align: 'left',
            rotation: d.rotation || 0,
            wrap: d.wrap,
            status: 'edited',
          },
          fontCache,
          box
        );
      }
    }
  }

  const savedBytes = await outDoc.save();
  const outputBuffer = new Uint8Array(savedBytes.length);
  outputBuffer.set(savedBytes);
  return new Blob([outputBuffer], { type: 'application/pdf' });
}
