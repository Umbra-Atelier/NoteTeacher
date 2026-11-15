import html2canvas from 'html2canvas';

interface RgbaColor {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
  a: number; // 0..1
}

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  slate: '#64748b',
  currentcolor: '#0f172a',
};

let helperCanvasCtx: CanvasRenderingContext2D | null | undefined;
function getHelperCanvasCtx(): CanvasRenderingContext2D | null {
  if (helperCanvasCtx !== undefined) return helperCanvasCtx;
  if (typeof document === 'undefined') {
    helperCanvasCtx = null;
    return null;
  }
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  helperCanvasCtx = c.getContext('2d', { willReadFrequently: true });
  return helperCanvasCtx;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clamp255(n: number): number {
  return Math.round(Math.max(0, Math.min(255, n)));
}

function linearToSrgbByte(c: number): number {
  const clamped = clamp01(c);
  const v = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return clamp255(v * 255);
}

function srgbByteToLinear(byteVal: number): number {
  const c = clamp01(byteVal / 255);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function formatRgba({ r, g, b, a }: RgbaColor): string {
  const alpha = Math.round(clamp01(a) * 10000) / 10000;
  if (alpha >= 0.9999) {
    return `rgb(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)})`;
  }
  return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${alpha})`;
}

/**
 * Inverse OKLab -> linear sRGB -> sRGB Byte RGBA
 * Using Björn Ottosson's exact OKLab matrices
 */
export function oklabValuesToRgba(L: number, a: number, b: number, alpha = 1): RgbaColor {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return {
    r: linearToSrgbByte(rLin),
    g: linearToSrgbByte(gLin),
    b: linearToSrgbByte(bLin),
    a: clamp01(alpha),
  };
}

function srgbToOklabValues(rgba: RgbaColor): { L: number; a: number; b: number } {
  const r = srgbByteToLinear(rgba.r);
  const g = srgbByteToLinear(rgba.g);
  const bl = srgbByteToLinear(rgba.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function parseAlpha(token: string | undefined): number {
  if (!token) return 1;
  const trimmed = token.trim();
  if (trimmed.endsWith('%')) {
    const num = parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(num) ? clamp01(num / 100) : 1;
  }
  const num = parseFloat(trimmed);
  return Number.isFinite(num) ? clamp01(num) : 1;
}

function parseHueRadians(token: string): number {
  const t = token.trim().toLowerCase();
  if (t.endsWith('deg')) return (parseFloat(t) * Math.PI) / 180;
  if (t.endsWith('rad')) return parseFloat(t);
  if (t.endsWith('grad')) return (parseFloat(t) * Math.PI) / 200;
  if (t.endsWith('turn')) return parseFloat(t) * Math.PI * 2;
  const num = parseFloat(t);
  return Number.isFinite(num) ? (num * Math.PI) / 180 : 0;
}

function parsePercentOrNumber(token: string, percentScale = 1): number {
  const t = token.trim();
  if (t.endsWith('%')) {
    const v = parseFloat(t.slice(0, -1));
    return Number.isFinite(v) ? (v / 100) * percentScale : 0;
  }
  const v = parseFloat(t);
  return Number.isFinite(v) ? v : 0;
}

export function parseOklabFunction(inner: string): RgbaColor | null {
  const [chanStr, alphaStr] = inner.split('/').map((s) => s.trim());
  const parts = chanStr.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const L = parsePercentOrNumber(parts[0], 1);
  const a = parsePercentOrNumber(parts[1], 0.4);
  const b = parsePercentOrNumber(parts[2], 0.4);
  const alpha = parseAlpha(alphaStr);
  return oklabValuesToRgba(L, a, b, alpha);
}

export function parseOklchFunction(inner: string): RgbaColor | null {
  const [chanStr, alphaStr] = inner.split('/').map((s) => s.trim());
  const parts = chanStr.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return null;
  const L = parsePercentOrNumber(parts[0], 1);
  const C = parsePercentOrNumber(parts[1], 0.4);
  const rad = parts[2] === 'none' ? 0 : parseHueRadians(parts[2]);
  const alpha = parseAlpha(alphaStr);
  return oklabValuesToRgba(L, C * Math.cos(rad), C * Math.sin(rad), alpha);
}

function splitTopLevelCommas(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(str.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(str.slice(start).trim());
  return parts;
}

function splitTopLevelSpaces(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') {
      if (start === -1) start = i;
      depth++;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (/\s/.test(ch) && depth === 0) {
      if (start !== -1) {
        parts.push(str.slice(start, i));
        start = -1;
      }
    } else if (start === -1) {
      start = i;
    }
  }
  if (start !== -1) parts.push(str.slice(start));
  return parts;
}

export function parseCssColorToRgba(raw: string, varMap?: Record<string, string>): RgbaColor | null {
  const resolved = sanitizeCssText(raw.trim(), varMap).trim().toLowerCase();
  if (!resolved) return null;
  if (resolved === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMED_COLORS[resolved]) {
    return parseCssColorToRgba(NAMED_COLORS[resolved]);
  }

  // Hex
  if (resolved.startsWith('#')) {
    const hex = resolved.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  // rgb(...) / rgba(...)
  const rgbMatch = resolved.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const inner = rgbMatch[1].trim();
    if (inner.includes(',')) {
      const p = inner.split(',').map((s) => s.trim());
      if (p.length >= 3) {
        return {
          r: parsePercentOrNumber(p[0], 255),
          g: parsePercentOrNumber(p[1], 255),
          b: parsePercentOrNumber(p[2], 255),
          a: p[3] !== undefined ? parseAlpha(p[3]) : 1,
        };
      }
    } else {
      const [chanStr, alphaStr] = inner.split('/').map((s) => s.trim());
      const p = chanStr.split(/\s+/).filter(Boolean);
      if (p.length >= 3) {
        return {
          r: parsePercentOrNumber(p[0], 255),
          g: parsePercentOrNumber(p[1], 255),
          b: parsePercentOrNumber(p[2], 255),
          a: parseAlpha(alphaStr),
        };
      }
    }
  }

  // Browser canvas exact fallback for any hsl(), hwb(), named color, etc.
  const ctx = getHelperCanvasCtx();
  if (ctx) {
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillStyle = resolved;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch {
      return null;
    }
  }
  return null;
}

function parseColorMixSegment(seg: string, varMap?: Record<string, string>): {
  color: RgbaColor | null;
  pct: number | null;
} {
  const parts = splitTopLevelSpaces(seg.trim());
  let pct: number | null = null;
  const colorTokens: string[] = [];

  for (const part of parts) {
    if (part.endsWith('%')) {
      const v = parseFloat(part.slice(0, -1));
      if (Number.isFinite(v)) {
        pct = clamp01(v / 100);
        continue;
      }
    }
    colorTokens.push(part);
  }
  const colorStr = colorTokens.join(' ');
  return {
    color: parseCssColorToRgba(colorStr, varMap),
    pct,
  };
}

export function resolveColorMixFunction(
  inner: string,
  varMap?: Record<string, string>
): string {
  const args = splitTopLevelCommas(inner);
  if (args.length < 3) return 'transparent';

  const method = args[0].toLowerCase();
  const s1 = parseColorMixSegment(args[1], varMap);
  const s2 = parseColorMixSegment(args[2], varMap);

  if (!s1.color || !s2.color) {
    if (s1.color && s2.color === null) return formatRgba(s1.color);
    if (s2.color && s1.color === null) return formatRgba(s2.color);
    return 'rgba(15, 23, 42, 0.2)';
  }

  let p1 = s1.pct;
  let p2 = s2.pct;
  if (p1 === null && p2 === null) {
    p1 = 0.5;
    p2 = 0.5;
  } else if (p1 !== null && p2 === null) {
    p2 = 1 - p1;
  } else if (p1 === null && p2 !== null) {
    p1 = 1 - p2;
  }

  const sum = (p1 ?? 0) + (p2 ?? 0);
  if (sum <= 0) return 'rgba(0, 0, 0, 0)';

  const alphaMultiplier = sum < 1 ? sum : 1;
  const w1 = (p1 ?? 0) / sum;
  const w2 = (p2 ?? 0) / sum;

  const c1 = s1.color;
  const c2 = s2.color;
  const mixedAlpha = clamp01((c1.a * w1 + c2.a * w2) * alphaMultiplier);
  if (mixedAlpha <= 0.0001) return 'rgba(0, 0, 0, 0)';

  // Fast path if one color is transparent (premultiplied interpolation preserves the non-transparent color's chroma/hue)
  if (c1.a <= 0.0001 && c2.a > 0) {
    return formatRgba({ r: c2.r, g: c2.g, b: c2.b, a: mixedAlpha });
  }
  if (c2.a <= 0.0001 && c1.a > 0) {
    return formatRgba({ r: c1.r, g: c1.g, b: c1.b, a: mixedAlpha });
  }

  const premulA = c1.a * w1 + c2.a * w2;
  if (method.includes('oklab') || method.includes('oklch')) {
    const lab1 = srgbToOklabValues(c1);
    const lab2 = srgbToOklabValues(c2);
    const L = (lab1.L * c1.a * w1 + lab2.L * c2.a * w2) / premulA;
    const a = (lab1.a * c1.a * w1 + lab2.a * c2.a * w2) / premulA;
    const b = (lab1.b * c1.a * w1 + lab2.b * c2.a * w2) / premulA;
    const rgb = oklabValuesToRgba(L, a, b, mixedAlpha);
    return formatRgba(rgb);
  }

  const r = (c1.r * c1.a * w1 + c2.r * c2.a * w2) / premulA;
  const g = (c1.g * c1.a * w1 + c2.g * c2.a * w2) / premulA;
  const b = (c1.b * c1.a * w1 + c2.b * c2.a * w2) / premulA;
  return formatRgba({ r, g, b, a: mixedAlpha });
}

function replaceBalancedCssFunction(
  input: string,
  fnName: string,
  replacer: (inner: string) => string
): string {
  let result = '';
  let idx = 0;
  const lower = input.toLowerCase();
  const needle = `${fnName.toLowerCase()}(`;

  while (idx < input.length) {
    const found = lower.indexOf(needle, idx);
    if (found === -1) {
      result += input.slice(idx);
      break;
    }

    // Ensure function boundary (don't match inside words like `my-oklch(`)
    if (found > 0 && /[a-z0-9_-]/i.test(input[found - 1])) {
      result += input.slice(idx, found + needle.length);
      idx = found + needle.length;
      continue;
    }

    result += input.slice(idx, found);
    const openIdx = found + needle.length - 1;
    let depth = 0;
    let closeIdx = -1;
    for (let j = openIdx; j < input.length; j++) {
      if (input[j] === '(') depth++;
      else if (input[j] === ')') {
        depth--;
        if (depth === 0) {
          closeIdx = j;
          break;
        }
      }
    }

    if (closeIdx === -1) {
      result += input.slice(found);
      break;
    }

    const inner = input.slice(openIdx + 1, closeIdx);
    result += replacer(inner);
    idx = closeIdx + 1;
  }

  return result;
}

/**
 * Resolves modern CSS Color 4/5 syntax (`oklch`, `oklab`, `color-mix`, `lab`, `lch`, `hwb`)
 * into plain `rgb(...)` / `rgba(...)` supported by html2canvas v1.4.1.
 */
export function sanitizeCssText(css: string, varMap?: Record<string, string>): string {
  if (
    !css ||
    (!css.includes('oklch') &&
      !css.includes('oklab') &&
      !css.includes('color-mix') &&
      !css.includes('lab(') &&
      !css.includes('lch(') &&
      !css.includes('hwb('))
  ) {
    return css;
  }

  let out = css;

  // Strip @supports (color: color-mix(...)) condition or resolve CSS custom properties if present
  // 1. Expand var(--color-...) inside color-mix when varMap is passed
  if (varMap && out.includes('var(')) {
    for (let pass = 0; pass < 3; pass++) {
      const next = replaceBalancedCssFunction(out, 'var', (inner) => {
        const commaIdx = inner.indexOf(',');
        const name = (commaIdx >= 0 ? inner.slice(0, commaIdx) : inner).trim();
        const fallback = commaIdx >= 0 ? inner.slice(commaIdx + 1).trim() : '';
        if (varMap[name] !== undefined && varMap[name] !== '') {
          return varMap[name];
        }
        return fallback || `var(${inner})`;
      });
      if (next === out) break;
      out = next;
    }
  }

  // 2. Replace oklab(...) & oklch(...) first (inner arguments of color-mix)
  out = replaceBalancedCssFunction(out, 'oklab', (inner) => {
    const rgba = parseOklabFunction(inner);
    return rgba ? formatRgba(rgba) : 'rgb(15, 23, 42)';
  });

  out = replaceBalancedCssFunction(out, 'oklch', (inner) => {
    const rgba = parseOklchFunction(inner);
    return rgba ? formatRgba(rgba) : 'rgb(15, 23, 42)';
  });

  // 3. Canvas fallback for lab(...) / lch(...) / hwb(...)
  for (const fn of ['lab', 'lch', 'hwb']) {
    if (out.includes(`${fn}(`)) {
      out = replaceBalancedCssFunction(out, fn, (inner) => {
        const ctx = getHelperCanvasCtx();
        if (ctx) {
          try {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = `${fn}(${inner})`;
            ctx.fillRect(0, 0, 1, 1);
            const d = ctx.getImageData(0, 0, 1, 1).data;
            return formatRgba({ r: d[0], g: d[1], b: d[2], a: d[3] / 255 });
          } catch {}
        }
        return 'rgb(15, 23, 42)';
      });
    }
  }

  // 4. Replace nested / outer color-mix(...) passes
  for (let pass = 0; pass < 3 && out.includes('color-mix('); pass++) {
    // Handle @supports (color: color-mix(in lab, red, red)) probe cleanly
    out = replaceBalancedCssFunction(out, 'color-mix', (inner) => {
      if (inner.includes('red, red')) {
        return 'red';
      }
      return resolveColorMixFunction(inner, varMap);
    });
  }

  return out;
}

export function buildDocumentCssVarMap(): Record<string, string> {
  const varMap: Record<string, string> = {};
  if (typeof document === 'undefined' || typeof window === 'undefined') return varMap;

  try {
    const rootStyle = getComputedStyle(document.documentElement);
    for (let i = 0; i < rootStyle.length; i++) {
      const prop = rootStyle[i];
      if (prop.startsWith('--')) {
        const val = rootStyle.getPropertyValue(prop).trim();
        if (val) varMap[prop] = val;
      }
    }

    // Collect stylesheet :root / :host CSS custom properties too (Tailwind v4 declares palette variables on :root, :host)
    for (let i = 0; i < document.styleSheets.length; i++) {
      const sheet = document.styleSheets[i];
      try {
        const rules = sheet.cssRules;
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j] as CSSStyleRule;
          if (rule.style && (rule.selectorText?.includes(':root') || rule.selectorText?.includes(':host'))) {
            for (let k = 0; k < rule.style.length; k++) {
              const p = rule.style[k];
              if (p.startsWith('--')) {
                const v = rule.style.getPropertyValue(p).trim();
                if (v) varMap[p] = v;
              }
            }
          }
        }
      } catch {
        // Ignore cross-origin sheets (e.g. external Google Fonts / Desmos CSS)
      }
    }

    // Resolve modern color expressions inside collected variables
    for (const k of Object.keys(varMap)) {
      varMap[k] = sanitizeCssText(varMap[k], varMap);
    }
  } catch {
    // ignore
  }
  return varMap;
}

const COLOR_COMPUTED_PROPS = [
  'color',
  'background-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'text-decoration-color',
  'fill',
  'stroke',
  'box-shadow',
];

export interface CloneSanitizeOptions {
  hideClean?: boolean;
  resetRootTransform?: boolean;
  logicalWidth?: number;
  logicalHeight?: number;
  canvasReplacementMap?: WeakMap<HTMLCanvasElement, string>;
}

/**
 * Sanitizes an html2canvas cloned document so Tailwind v4 modern colors (`oklch`, `oklab`, `color-mix`),
 * same-origin stylesheets, live `<canvas>` bitmaps, CSS transforms, and Clean-mode visibility
 * render cleanly without throwing unsupported color errors.
 */
export function sanitizeClonedDocumentForHtml2Canvas(
  clonedDoc: Document,
  origRoot: HTMLElement,
  clonedRoot: HTMLElement,
  options: CloneSanitizeOptions = {}
): void {
  const varMap = buildDocumentCssVarMap();

  // 1. Replace same-origin <link rel="stylesheet"> in clonedDoc with sanitized inline <style>
  try {
    const clonedLinks = Array.from(
      clonedDoc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    );
    for (let i = 0; i < document.styleSheets.length; i++) {
      const sheet = document.styleSheets[i];
      if (!sheet.href) continue;
      let rulesText = '';
      try {
        rulesText = Array.from(sheet.cssRules)
          .map((r) => r.cssText)
          .join('\n');
      } catch {
        // Cross-origin stylesheet (e.g. Desmos / Google Fonts)
        continue;
      }
      if (rulesText) {
        const sanitized = sanitizeCssText(rulesText, varMap);
        const matchingLink = clonedLinks.find(
          (lnk) => lnk.href === sheet.href || lnk.getAttribute('href') === sheet.href
        );
        const styleEl = clonedDoc.createElement('style');
        styleEl.textContent = sanitized;
        if (matchingLink && matchingLink.parentNode) {
          matchingLink.parentNode.insertBefore(styleEl, matchingLink);
          matchingLink.remove();
        } else {
          clonedDoc.head.appendChild(styleEl);
        }
      }
    }
  } catch {
    // ignore
  }

  // 2. Sanitize every <style> tag in clonedDoc (dev Vite <style> tags + Desmos styles)
  const clonedStyles = Array.from(clonedDoc.querySelectorAll('style'));
  for (const styleEl of clonedStyles) {
    if (styleEl.textContent) {
      styleEl.textContent = sanitizeCssText(styleEl.textContent, varMap);
    }
  }

  // 3. Hide Clean-mode export chrome & reset active menu toggles if requested
  if (options.hideClean) {
    clonedRoot.querySelectorAll<HTMLElement>('[data-export-hide-clean="true"]').forEach((el) => {
      el.style.setProperty('display', 'none', 'important');
    });
    clonedRoot.querySelectorAll<HTMLElement>('[data-calc-menu-open="true"]').forEach((el) => {
      el.style.setProperty('background-color', 'transparent', 'important');
      el.style.setProperty('color', 'rgb(203, 213, 225)', 'important');
    });
  }

  // 4. Neutralize nested CSS transforms and pin standalone widget roots to (0,0) in cloned viewport
  if (options.resetRootTransform) {
    clonedRoot.style.setProperty('transform', 'none', 'important');
    if (options.logicalWidth) {
      clonedRoot.style.setProperty('width', `${options.logicalWidth}px`, 'important');
    }
    if (options.logicalHeight) {
      clonedRoot.style.setProperty('height', `${options.logicalHeight}px`, 'important');
    }

    const isLogicalStage =
      clonedRoot.classList.contains('desmos-logical-stage') ||
      clonedRoot.classList.contains('calc-logical-stage');

    if (!isLogicalStage) {
      clonedRoot.style.setProperty('position', 'fixed', 'important');
      clonedRoot.style.setProperty('left', '0px', 'important');
      clonedRoot.style.setProperty('top', '0px', 'important');
      clonedRoot.style.setProperty('right', 'auto', 'important');
      clonedRoot.style.setProperty('bottom', 'auto', 'important');
      clonedRoot.style.setProperty('margin', '0px', 'important');
      clonedRoot.style.setProperty('z-index', '2147483647', 'important');
    }

    let parent = clonedRoot.parentElement;
    while (parent && parent !== clonedDoc.documentElement) {
      if (parent.style) {
        parent.style.setProperty('transform', 'none', 'important');
        parent.style.setProperty('filter', 'none', 'important');
        parent.style.setProperty('backdrop-filter', 'none', 'important');
        parent.style.setProperty('perspective', 'none', 'important');
        parent.style.setProperty('contain', 'none', 'important');
        parent.style.setProperty('will-change', 'auto', 'important');
        if (parent !== clonedDoc.body) {
          parent.style.setProperty('overflow', 'visible', 'important');
        }
        if (parent.parentElement === clonedDoc.body && parent.dataset?.offscreenHost === 'true') {
          parent.style.setProperty('left', '0px', 'important');
          parent.style.setProperty('top', '0px', 'important');
        }
        if (
          isLogicalStage &&
          (parent.classList.contains('desmos-box') || parent.classList.contains('calculator-box'))
        ) {
          parent.style.setProperty('position', 'fixed', 'important');
          parent.style.setProperty('left', '0px', 'important');
          parent.style.setProperty('top', '0px', 'important');
          parent.style.setProperty('right', 'auto', 'important');
          parent.style.setProperty('bottom', 'auto', 'important');
          parent.style.setProperty('margin', '0px', 'important');
          parent.style.setProperty('border-width', '0px', 'important');
          parent.style.setProperty('z-index', '2147483647', 'important');
          if (options.logicalWidth) {
            parent.style.setProperty('width', `${options.logicalWidth}px`, 'important');
          }
          if (options.logicalHeight) {
            parent.style.setProperty('height', `${options.logicalHeight}px`, 'important');
          }
        }
      }
      parent = parent.parentElement;
    }
  }

  // 5. Replace live <canvas> elements with crisp PNG <img>s preserving exact CSS layout dimensions
  const origCanvases = Array.from(origRoot.querySelectorAll('canvas'));
  const clonedCanvases = Array.from(clonedRoot.querySelectorAll('canvas'));
  const sameCanvasCount = origCanvases.length === clonedCanvases.length;
  for (let i = 0; i < clonedCanvases.length; i++) {
    const clonedC = clonedCanvases[i];
    const origC = sameCanvasCount ? origCanvases[i] : undefined;
    try {
      let dataUrl = (origC && options.canvasReplacementMap?.get(origC)) || '';
      if (!dataUrl && origC && origC.width > 0 && origC.height > 0) {
        dataUrl = origC.toDataURL('image/png');
      }
      if (!dataUrl && clonedC.width > 0 && clonedC.height > 0) {
        dataUrl = clonedC.toDataURL('image/png');
      }
      if (dataUrl && dataUrl.length > 32 && clonedC.parentNode) {
        const img = clonedDoc.createElement('img');
        img.src = dataUrl;
        img.className = (origC || clonedC).className;
        const cs = (origC ? getComputedStyle(origC) : clonedDoc.defaultView?.getComputedStyle(clonedC)) || getComputedStyle(clonedC);
        img.style.cssText = clonedC.style.cssText;
        const refEl = origC || clonedC;
        const wPx = refEl.clientWidth > 0 ? `${refEl.clientWidth}px` : refEl.style.width || `${refEl.width}px`;
        const hPx = refEl.clientHeight > 0 ? `${refEl.clientHeight}px` : refEl.style.height || `${refEl.height}px`;
        img.style.width = wPx;
        img.style.height = hPx;
        img.style.display = cs.display === 'none' ? 'none' : 'block';
        img.style.position = cs.position;
        img.style.left = cs.left;
        img.style.top = cs.top;
        img.style.pointerEvents = 'none';
        clonedC.parentNode.replaceChild(img, clonedC);
      }
    } catch {
      // Skip tainted/unavailable canvas safely
    }
  }

  // 6. Walk cloned subtree to sanitize any inline/computed modern colors independently of ignoreElements
  const view = clonedDoc.defaultView;
  const hasModernColor = (val: string) =>
    val.includes('oklch') ||
    val.includes('oklab') ||
    val.includes('color-mix') ||
    val.includes('lab(') ||
    val.includes('lch(') ||
    val.includes('hwb(');

  const sanitizeClonedElement = (clonedEl: Element) => {
    const htmlCloned = clonedEl as HTMLElement;
    if (htmlCloned.style && htmlCloned.style.cssText) {
      const sanitizedInline = sanitizeCssText(htmlCloned.style.cssText, varMap);
      if (sanitizedInline !== htmlCloned.style.cssText) {
        htmlCloned.style.cssText = sanitizedInline;
      }
    }

    if (view && typeof view.getComputedStyle === 'function') {
      const cs = view.getComputedStyle(clonedEl);
      for (const prop of COLOR_COMPUTED_PROPS) {
        const val = cs.getPropertyValue(prop);
        if (val && hasModernColor(val)) {
          htmlCloned.style?.setProperty(prop, sanitizeCssText(val, varMap), 'important');
        }
      }
      const bgImg = cs.getPropertyValue('background-image');
      if (
        bgImg &&
        bgImg !== 'none' &&
        (bgImg.includes('oklch') || bgImg.includes('oklab') || bgImg.includes('color-mix'))
      ) {
        htmlCloned.style?.setProperty(
          'background-image',
          sanitizeCssText(bgImg, varMap),
          'important'
        );
      }
    }
  };

  sanitizeClonedElement(clonedRoot);
  clonedRoot.querySelectorAll('*').forEach(sanitizeClonedElement);
}

export interface CaptureElementOptions {
  width: number;
  height: number;
  scale?: number;
  backgroundColor?: string | null;
  hideClean?: boolean;
  resetRootTransform?: boolean;
  canvasReplacementMap?: WeakMap<HTMLCanvasElement, string>;
}

/**
 * Renders any live DOM element cleanly to a high-DPI HTMLCanvasElement without failing on Tailwind v4 colors.
 */
export async function captureElementToCanvas(
  element: HTMLElement,
  opts: CaptureElementOptions
): Promise<HTMLCanvasElement | null> {
  const {
    width,
    height,
    scale = 2,
    backgroundColor = null,
    hideClean = false,
    resetRootTransform = true,
    canvasReplacementMap,
  } = opts;

  if (width <= 0 || height <= 0) return null;

  try {
    await element.ownerDocument?.fonts?.ready?.catch(() => {});
    const winW = resetRootTransform
      ? Math.max(window.innerWidth || 1280, Math.ceil(width) + 200)
      : undefined;
    const winH = resetRootTransform
      ? Math.max(window.innerHeight || 800, Math.ceil(height) + 200)
      : undefined;

    const canvas = await html2canvas(element, {
      scale,
      backgroundColor,
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: Math.round(width),
      height: Math.round(height),
      scrollX: 0,
      scrollY: 0,
      ...(winW ? { windowWidth: winW } : {}),
      ...(winH ? { windowHeight: winH } : {}),
      onclone: (clonedDoc, clonedEl) => {
        sanitizeClonedDocumentForHtml2Canvas(clonedDoc, element, clonedEl, {
          hideClean,
          resetRootTransform,
          logicalWidth: width,
          logicalHeight: height,
          canvasReplacementMap,
        });
      },
    });

    if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
    // Ensure exportability (no SecurityError taint)
    canvas.toDataURL('image/png');
    return canvas;
  } catch (err) {
    console.warn('captureElementToCanvas failed:', err);
    return null;
  }
}
